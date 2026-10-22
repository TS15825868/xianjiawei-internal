-- Cloudflare D1 optional receipt-only fallback.
-- Do not apply to the live ERP database until migration reviewed and backup verified.
-- No customer reply or post publication is performed by this table.
CREATE TABLE IF NOT EXISTS xjw_webhook_receipts (
 event_hash TEXT NOT NULL,
 platform TEXT NOT NULL CHECK(platform IN ('facebook','instagram','threads')),
 account_id TEXT NOT NULL,
 payload_json TEXT NOT NULL,
 received_at TEXT NOT NULL,
 PRIMARY KEY (event_hash, platform, account_id)
);
CREATE INDEX IF NOT EXISTS idx_xjw_webhook_receipts_received_at ON xjw_webhook_receipts(received_at);
