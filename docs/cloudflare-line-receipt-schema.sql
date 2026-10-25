-- 仙加味 LINE Webhook 備援收件箱；備份 D1、確認 Access 權限後才執行。
-- 每筆可能含顧客個資與 replyToken，不提供任何公開讀取端點。
CREATE TABLE IF NOT EXISTS xjw_line_receipt_inbox (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  event_json TEXT NOT NULL,
  received_at TEXT NOT NULL,
  handled_at TEXT,
  handling_status TEXT NOT NULL DEFAULT 'unhandled'
);
CREATE INDEX IF NOT EXISTS idx_xjw_line_receipt_status_time
  ON xjw_line_receipt_inbox(handling_status,received_at);
