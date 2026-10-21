-- Application-owned suggestion ledger; do not place in n8n's management schema.
-- SQLite / Cloudflare D1. An adapter must bind values and use INSERT OR IGNORE
-- with meta.changes = 1 for claim(); ambiguous/API failures are never resent.
CREATE TABLE IF NOT EXISTS social_comment_suggestions (
  idempotency_key TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  account_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  comment_id TEXT NOT NULL,
  conversation_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK(status IN ('processing','suggest','skip','manual')),
  decision_json TEXT NOT NULL DEFAULT '{}',
  remote_reply_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS social_comment_scope ON social_comment_suggestions(platform,account_id,thread_id,comment_id);
