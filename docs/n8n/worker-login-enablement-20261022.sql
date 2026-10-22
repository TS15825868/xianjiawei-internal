-- Applied using existing Supabase migration xjw_enable_worker_login_only.
-- Existing minimum privileges and seven RLS policies are retained.
-- This does not provision a password or establish an n8n connection.
-- Password provisioning must use a protected operator interface.
ALTER ROLE xjw_social_worker LOGIN;
