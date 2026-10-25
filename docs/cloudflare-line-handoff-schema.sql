-- LINE 人工接手紀錄：獨立狀態表，不能包含顧客訊息或回覆 Token。
-- 每次人工接手有獨立 claim_id；只允許同一筆事件有一位 active 受理者。
-- 不更新既有收件／ERP／客戶／訂單表，不刪除歷史紀錄。
CREATE TABLE IF NOT EXISTS xjw_line_handoff_claims (
  claim_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES xjw_line_receipt_inbox(event_id),
  actor_email TEXT NOT NULL,
  claimed_at TEXT NOT NULL,
  released_at TEXT,
  status TEXT NOT NULL DEFAULT 'claimed' CHECK(status IN ('claimed','released'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_xjw_line_handoff_one_active
  ON xjw_line_handoff_claims(event_id) WHERE status='claimed';
CREATE INDEX IF NOT EXISTS idx_xjw_line_handoff_claimed_at
  ON xjw_line_handoff_claims(claimed_at);
