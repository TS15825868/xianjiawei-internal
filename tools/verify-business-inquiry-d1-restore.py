"""Verify the exported D1 snapshot and rehearse B2B schema changes offline."""
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import sys

backup_path, schema_path, bookmark_path, receipt_path = map(Path, sys.argv[1:])
bookmark = json.loads(bookmark_path.read_text()).get("bookmark", "")
if not re.fullmatch(r"[a-f0-9]{8}-[a-f0-9]{8}-[a-f0-9]{8}-[a-f0-9]{32}", bookmark, re.I):
    raise SystemExit("Unable to parse a D1 recovery bookmark")

backup = backup_path.read_bytes()
schema = schema_path.read_text()


def catalog(db):
    return {
        name: (kind, " ".join(sql.split()))
        for kind, name, sql in db.execute(
            "SELECT type, name, sql FROM sqlite_schema WHERE sql IS NOT NULL"
        )
    }


with sqlite3.connect(":memory:") as restored, sqlite3.connect(":memory:") as expected:
    try:
        restored.executescript(backup.decode())
    except sqlite3.Error as error:
        raise SystemExit(f"D1 snapshot could not be restored: {error.sqlite_errorname}") from None
    if restored.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
        raise SystemExit("Restored D1 snapshot failed SQLite integrity check")
    expected.executescript(schema)
    before = catalog(restored)
    if not before:
        raise SystemExit("The D1 snapshot did not contain the production schema")
    desired = catalog(expected)
    for name, definition in desired.items():
        if name in before and before[name] != definition:
            raise SystemExit(f"Unexpected existing schema for {name}")
    baseline = {}
    for name in desired:
        quoted_name = '"' + name.replace('"', '""') + '"'
        baseline[name] = (
            restored.execute(f"SELECT COUNT(*) FROM {quoted_name}").fetchone()[0]
            if name in before else None
        )
    restored.executescript(schema)
    for name in baseline:
        expected_indexes = expected.execute("SELECT * FROM pragma_index_list(?)", (name,)).fetchall()
        restored_indexes = restored.execute("SELECT * FROM pragma_index_list(?)", (name,)).fetchall()
        if restored_indexes != expected_indexes:
            raise SystemExit(f"Unexpected indexes for {name}")
    after = catalog(restored)
    if after != before | desired:
        raise SystemExit("Migration rehearsal produced unexpected schema changes")
    receipt_path.write_text(json.dumps({
        "bookmark": bookmark,
        "backupSha256": hashlib.sha256(backup).hexdigest(),
        "backupBytes": len(backup),
        "schemaSha256": hashlib.sha256(schema.encode()).hexdigest(),
        "restoredObjectCount": len(before),
        "b2bRowCountsBeforeMigration": baseline,
        "isolatedRestoreAndSchemaRehearsal": "passed",
    }, indent=2) + "\n")
