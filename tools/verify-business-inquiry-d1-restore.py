"""Verify a full exported D1 SQL snapshot and rehearse B2B changes in isolated SQLite.

Never prints customer rows, secrets, a Time Travel bookmark, or SQL backup content.
"""
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import sys

if len(sys.argv) != 6:
    raise SystemExit("Expected five file paths for isolated D1 and live table inventory verification")
backup_path, schema_path, bookmark_path, receipt_path, inventory_path = map(Path, sys.argv[1:])
bookmark = json.loads(bookmark_path.read_text(encoding="utf-8")).get("bookmark", "")
if not isinstance(bookmark, str) or not re.fullmatch(
    r"[a-f0-9]{8}-[a-f0-9]{8}-[a-f0-9]{8}-[a-f0-9]{32}", bookmark, re.I
):
    raise SystemExit("Unable to parse a D1 recovery bookmark")

backup = backup_path.read_bytes()
schema = schema_path.read_text(encoding="utf-8")
if not backup or not schema:
    raise SystemExit("Missing complete D1 export or B2B schema source")
try:
    inventory = json.loads(inventory_path.read_text(encoding="utf-8"))
except (ValueError, OSError):
    raise SystemExit("Live table inventory missing or invalid") from None
live_names = inventory.get("table_names") if isinstance(inventory, dict) else None
if (
    not isinstance(inventory, dict)
    or inventory.get("schema") != "xjw-private-live-d1-table-inventory-v1"
    or not isinstance(live_names, list)
    or not (1 <= len(live_names) <= 500)
    or any(not isinstance(name, str) or
           not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name) for name in live_names)
    or len(set(live_names)) != len(live_names)
    or inventory.get("table_count") != len(live_names)
    or inventory.get("rows_written") != 0
):
    raise SystemExit("Live table inventory untrusted or incomplete")


def canonical(sql):
    """Normalize only SQLite's harmless CREATE IF NOT EXISTS/spacing differences."""
    # SQL string literals (including CHECK constraints and defaults) are case-
    # and whitespace-sensitive. Normalize syntax outside quotes only.
    parts = re.split(r"('(?:''|[^'])*')", sql)
    for i in range(0, len(parts), 2):
        part = re.sub(r"\bIF\s+NOT\s+EXISTS\b", "", parts[i], flags=re.I)
        part = re.sub(r"\s+", " ", part)
        part = re.sub(r"\s*([(),=])\s*", r"\1", part)
        parts[i] = part.casefold()
    return "".join(parts).rstrip(";").strip()


def catalog(db):
    return {
        name: (kind, canonical(sql))
        for kind, name, sql in db.execute(
            "SELECT type, name, sql FROM sqlite_schema WHERE sql IS NOT NULL"
        )
    }


with sqlite3.connect(":memory:") as restored, sqlite3.connect(":memory:") as expected:
    try:
        restored.executescript(backup.decode("utf-8"))
    except (UnicodeDecodeError, sqlite3.Error) as error:
        raise SystemExit("D1 snapshot could not be restored as a valid SQL export") from None
    if restored.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
        raise SystemExit("Restored D1 snapshot failed SQLite integrity check")
    expected.executescript(schema)
    snapshot_names = sorted(name for (name,) in restored.execute(
        "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ))
    if snapshot_names != sorted(live_names):
        raise SystemExit("Full D1 backup table inventory does not match live database")
    before = catalog(restored)
    if not before:
        raise SystemExit("The D1 snapshot did not contain the production schema")
    desired = catalog(expected)
    required_tables = {
        "business_inquiries", "business_inquiry_drafts", "business_inquiry_crm_delivery"
    }
    if not required_tables.issubset(desired) or len(desired) != len(required_tables):
        raise SystemExit("B2B source must contain exactly the three required tables")
    for name, definition in desired.items():
        if name in before and before[name] != definition:
            raise SystemExit("Unexpected existing schema for " + name)
    missing = sorted(set(desired) - set(before))
    baseline = {}
    for name in desired:
        safe_name = '"' + name.replace('"', '""') + '"'
        baseline[name] = (
            restored.execute(f"SELECT COUNT(*) FROM {safe_name}").fetchone()[0]
            if name in before else None
        )
    restored.executescript(schema)
    if restored.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
        raise SystemExit("Migration rehearsal failed integrity check")
    for name in desired:
        expected_indexes = expected.execute(
            "SELECT * FROM pragma_index_list(?)", (name,)
        ).fetchall()
        restored_indexes = restored.execute(
            "SELECT * FROM pragma_index_list(?)", (name,)
        ).fetchall()
        if restored_indexes != expected_indexes:
            raise SystemExit("Unexpected indexes for " + name)
        safe_name = '"' + name.replace('"', '""') + '"'
        updated_count = restored.execute(
            f"SELECT COUNT(*) FROM {safe_name}"
        ).fetchone()[0]
        if baseline[name] is not None and updated_count != baseline[name]:
            raise SystemExit("B2B table row count changed in isolated rehearsal")
    if catalog(restored) != (before | desired):
        raise SystemExit("Migration rehearsal produced unexpected schema changes")
    receipt_path.write_text(json.dumps({
        "bookmark": bookmark,
        "backupSha256": hashlib.sha256(backup).hexdigest(),
        "backupBytes": len(backup),
        "schemaSha256": hashlib.sha256(schema.encode("utf-8")).hexdigest(),
        "restoredObjectCount": len(before),
        "fullLiveTableInventoryMatchesSnapshot": True,
        "liveTableCount": len(live_names),
        "snapshotTableCount": len(snapshot_names),
        "liveTableNamesSha256": hashlib.sha256(
            json.dumps(sorted(live_names), separators=(",", ":")).encode("utf-8")
        ).hexdigest(),
        "b2bRowCountsBeforeMigration": baseline,
        "existingB2bTableCount": len(desired) - len(missing),
        "missingB2bTableCount": len(missing),
        "missingB2bTableNames": missing,
        "requiresProductionSchemaApply": bool(missing),
        "isolatedRestoreAndSchemaRehearsal": "passed"
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
