-- 仙加味 Meta 回覆：真正原子化的對話層唯一權利，2026-10-25。
-- Existing comment PK / reply PK remain untouched. Preserve all historical rows.
-- No platform enabled flag, transport credentials or outbound send is changed.
-- The script is additive and idempotent when prior rows can be mapped.
-- Rollback on missing historical thread IDs rather than silently discard data.
BEGIN;
ALTER TABLE xjw_social.reply_ledger ADD COLUMN IF NOT EXISTS thread_id text;
UPDATE xjw_social.reply_ledger AS r
 SET thread_id = c.thread_id
 FROM xjw_social.comment_ledger AS c
 WHERE r.platform=c.platform AND r.account_id=c.account_id
  AND r.post_id=c.post_id AND r.comment_id=c.comment_id
  AND r.conversation_version=c.conversation_version
  AND r.thread_id IS NULL;
ALTER TABLE xjw_social.reply_ledger ALTER COLUMN thread_id SET NOT NULL;
-- The existing per-comment PK is insufficient when two different comments
-- from one thread reserve concurrently. Unique B-tree conflict arbitration
-- is atomic and prevents both transactions from obtaining a send reservation.
-- A confirmed cancelled reservation is not active; unknown/manual still block.
CREATE UNIQUE INDEX IF NOT EXISTS reply_ledger_one_active_per_thread_uq
 ON xjw_social.reply_ledger (platform,account_id,post_id,thread_id)
 WHERE state IN ('reserved','sending','sent','unknown','manual');
COMMIT;
