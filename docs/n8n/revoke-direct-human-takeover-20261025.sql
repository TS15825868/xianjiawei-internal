-- Supabase/仙加味：限縮客服工作帳號人工接手權限（保留既有資料、RLS）。
-- Exact human takeover is carried out by the scoped protected function:
-- xjw_social.mark_human_takeover(text,text,text,text), granted only to worker.
-- The worker does not need direct UPDATE(human_takeover), which can reverse takeover.
-- No customer send switches are changed, no new resources or billing.
BEGIN;
DO $check$
BEGIN
 IF NOT has_function_privilege('xjw_social_worker',
      'xjw_social.mark_human_takeover(text,text,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'Dedicated takeover RPC not accessible';
 END IF;
END
$check$;
REVOKE UPDATE (human_takeover) ON xjw_social.comment_ledger FROM xjw_social_worker;
DO $check$
BEGIN
 IF has_column_privilege('xjw_social_worker','xjw_social.comment_ledger',
     'human_takeover','UPDATE')
 THEN RAISE EXCEPTION 'Direct takeover override remains accessible';
 END IF;
 IF NOT has_function_privilege('xjw_social_worker',
     'xjw_social.mark_human_takeover(text,text,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'Dedicated takeover RPC grant missing';
 END IF;
END
$check$;
COMMIT;
