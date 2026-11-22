"""Offline regression for full-export B2B isolated restore. No Cloudflare access."""
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "tools/verify-business-inquiry-d1-restore.py"
NODE_CODE = (
    'import {businessInquirySchema} from "./edge/business-inquiries.mjs";'
    'import {businessInquiryCrmSchema} from "./edge/business-inquiry-crm.mjs";'
    'process.stdout.write(businessInquirySchema+"\\n"+businessInquiryCrmSchema)'
)
BOOKMARK = "12345678-12345678-12345678-1234567890abcdef1234567890abcdef"


class IsolatedB2BRestore(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        result = subprocess.run(
            ["node", "--input-type=module", "-e", NODE_CODE],
            cwd=ROOT, check=True, capture_output=True, text=True
        )
        cls.schema = result.stdout
        assert cls.schema.count("CREATE TABLE IF NOT EXISTS") == 3

    def receipt(self, presence=("business_inquiry_drafts", "business_inquiries", "business_inquiry_crm_delivery"),
                altered=False, corrupt=False, changed_literal=False):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            schema_file = base / "three-tables.sql"
            schema_file.write_text(self.schema, encoding="utf-8")
            bookmark_file = base / "private-bookmark.json"
            bookmark_file.write_text(json.dumps({"bookmark": BOOKMARK}), encoding="utf-8")
            backup_file = base / "realistic-isolated-backup.sql"
            output = base / "sanitized-receipt.json"
            conn = sqlite3.connect(":memory:")
            try:
                conn.execute("CREATE TABLE unrelated_erp_customer (id TEXT PRIMARY KEY)")
                conn.execute("INSERT INTO unrelated_erp_customer VALUES (?)", ("private-customer-not-for-output",))
                parts = self.schema.split("CREATE TABLE IF NOT EXISTS")
                for stmt in parts[1:]:
                    name = stmt.split("(", 1)[0].strip()
                    if name in presence:
                        sql = "CREATE TABLE IF NOT EXISTS " + stmt.split(";", 1)[0] + ";"
                        if altered and name == "business_inquiries":
                            sql = "CREATE TABLE business_inquiries (id TEXT PRIMARY KEY)"
                        elif changed_literal and name == "business_inquiries":
                            sql = sql.replace("source = 'LINE'", "source = 'line'")
                            if "source = 'line'" not in sql:
                                raise AssertionError("Expected quoted constraint literal")
                        conn.execute(sql)
                if "business_inquiries" in presence and not altered:
                    conn.execute(
                        "INSERT INTO business_inquiries "
                        "(id,source,received_at,category,business_contact,details) VALUES (?,?,?,?,?,?)",
                        ("B2B-isolated", "line" if changed_literal else "LINE", "2026-01-01T00:00:00.000Z",
                         "經銷", "private-contact-test", "private-details-test"),
                    )
                conn.commit()
                backup_file.write_text("\n".join(conn.iterdump()) if not corrupt else
                    "CREATE TABLE business_inquiries (bad unfinished;", encoding="utf-8")
            finally:
                conn.close()
            result = subprocess.run(
                [sys.executable, str(SCRIPT), str(backup_file), str(schema_file),
                 str(bookmark_file), str(output)], cwd=ROOT,
                capture_output=True, text=True
            )
            return result, json.loads(output.read_text()) if output.exists() else None

    def test_already_existing_all_three_is_noop(self):
        result, receipt = self.receipt()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(receipt["isolatedRestoreAndSchemaRehearsal"], "passed")
        self.assertEqual(receipt["missingB2bTableCount"], 0)
        self.assertEqual(receipt["existingB2bTableCount"], 3)
        self.assertFalse(receipt["requiresProductionSchemaApply"])
        self.assertEqual(receipt["b2bRowCountsBeforeMigration"]["business_inquiries"], 1)
        self.assertNotIn("private-contact-test", result.stdout + json.dumps(receipt))

    def test_only_missing_crm_table_would_require_explicit_migration(self):
        result, receipt = self.receipt(presence=("business_inquiry_drafts", "business_inquiries"))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(receipt["requiresProductionSchemaApply"])
        self.assertEqual(receipt["missingB2bTableNames"], ["business_inquiry_crm_delivery"])
        self.assertEqual(receipt["existingB2bTableCount"], 2)

    def test_structurally_different_existing_table_fails_closed(self):
        result, receipt = self.receipt(altered=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIsNone(receipt)
        self.assertIn("Unexpected existing schema for business_inquiries", result.stderr)
        self.assertNotIn("private-customer-not-for-output", result.stderr)

    def test_sensitive_quoted_constraint_literal_mismatch_fails_closed(self):
        result, receipt = self.receipt(changed_literal=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIsNone(receipt)
        self.assertIn("Unexpected existing schema for business_inquiries", result.stderr)

    def test_corrupt_or_nonrestorable_backup_fails_closed(self):
        result, receipt = self.receipt(corrupt=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIsNone(receipt)
        self.assertIn("could not be restored", result.stderr)


if __name__ == "__main__":
    unittest.main()
