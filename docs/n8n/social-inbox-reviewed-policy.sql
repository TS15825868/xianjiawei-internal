-- 仙加味社群事件收件匣：僅允許既有專用 worker 將成功處理的事件
-- 從 manual 改為 reviewed。reviewed 表示已由建議工作流寫入持久紀錄，
-- 不等於真人審核，不等於對客發送，不代表 Meta 端對端驗證完成。
-- 沒有賦予 webhook_inbox DELETE 或任何平台開關 UPDATE 權限。
-- 只供受保護的私有工作流程使用，禁止 Data API 公開此 schema。
BEGIN;
GRANT UPDATE (status) ON xjw_social.webhook_inbox TO xjw_social_worker;
DROP POLICY IF EXISTS worker_mark_verified_inbox_reviewed ON xjw_social.webhook_inbox;
CREATE POLICY worker_mark_verified_inbox_reviewed
 ON xjw_social.webhook_inbox FOR UPDATE TO xjw_social_worker
 USING (status='manual') WITH CHECK (status='reviewed');
COMMIT;
