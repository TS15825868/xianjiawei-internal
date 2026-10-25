-- Dedicated private ledger worker. Password is never generated or stored here.
-- Keep NOLOGIN until an operator provisions its password through a protected interface.
CREATE ROLE xjw_social_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS CONNECTION LIMIT 3;
ALTER ROLE xjw_social_worker SET search_path = xjw_social, pg_catalog;
ALTER ROLE xjw_social_worker SET statement_timeout = '15s';
ALTER ROLE xjw_social_worker SET lock_timeout = '5s';
ALTER ROLE xjw_social_worker SET idle_in_transaction_session_timeout = '15s';
GRANT USAGE ON SCHEMA xjw_social TO xjw_social_worker;
GRANT SELECT ON xjw_social.platform_control TO xjw_social_worker;
GRANT SELECT, INSERT ON xjw_social.comment_ledger, xjw_social.reply_ledger TO xjw_social_worker;
-- Human takeover is only writable through the scoped xjw_social.mark_human_takeover RPC.
GRANT UPDATE (status,decision,human_reply_ids,ai_reply_ids,error_code,retry_state,updated_at) ON xjw_social.comment_ledger TO xjw_social_worker;
GRANT UPDATE (state,remote_reply_id,sent_at,error_code,retry_state,updated_at) ON xjw_social.reply_ledger TO xjw_social_worker;
CREATE POLICY worker_read_control ON xjw_social.platform_control FOR SELECT TO xjw_social_worker USING (true);
CREATE POLICY worker_read_comments ON xjw_social.comment_ledger FOR SELECT TO xjw_social_worker USING (true);
CREATE POLICY worker_insert_comments ON xjw_social.comment_ledger FOR INSERT TO xjw_social_worker WITH CHECK (true);
CREATE POLICY worker_update_comments ON xjw_social.comment_ledger FOR UPDATE TO xjw_social_worker USING (true) WITH CHECK (true);
CREATE POLICY worker_read_replies ON xjw_social.reply_ledger FOR SELECT TO xjw_social_worker USING (true);
CREATE POLICY worker_insert_replies ON xjw_social.reply_ledger FOR INSERT TO xjw_social_worker WITH CHECK (true);
CREATE POLICY worker_update_replies ON xjw_social.reply_ledger FOR UPDATE TO xjw_social_worker USING (true) WITH CHECK (true);
-- No control UPDATE, delete/truncate, DDL, n8n metadata, public API grants or role memberships.
