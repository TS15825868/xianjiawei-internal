-- Private application ledger in the existing Supabase database.
-- No API exposure, new service, n8n system-table change, or automatic sending.
CREATE SCHEMA xjw_social;
REVOKE ALL ON SCHEMA xjw_social FROM PUBLIC, anon, authenticated;
CREATE TABLE xjw_social.platform_control (
 platform text PRIMARY KEY CHECK (platform IN ('facebook','instagram','threads')),
 enabled boolean NOT NULL DEFAULT false,
 e2e_verified boolean NOT NULL DEFAULT false,
 overlap_verified boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (NOT enabled OR (e2e_verified AND overlap_verified))
);
INSERT INTO xjw_social.platform_control(platform) VALUES ('facebook'),('instagram'),('threads');
CREATE TABLE xjw_social.comment_ledger (
 platform text NOT NULL REFERENCES xjw_social.platform_control(platform),
 account_id text NOT NULL, post_id text NOT NULL, thread_id text NOT NULL,
 comment_id text NOT NULL, parent_comment_id text,
 conversation_version text NOT NULL,
 status text NOT NULL DEFAULT 'processing' CHECK(status IN ('processing','suggest','skip','manual')),
 decision jsonb NOT NULL DEFAULT '{}',
 human_takeover boolean NOT NULL DEFAULT false,
 human_reply_ids jsonb NOT NULL DEFAULT '[]',
 ai_reply_ids jsonb NOT NULL DEFAULT '[]',
 error_code text, retry_state text NOT NULL DEFAULT 'never',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(platform,account_id,post_id,comment_id,conversation_version)
);
CREATE TABLE xjw_social.reply_ledger (
 platform text NOT NULL, account_id text NOT NULL, post_id text NOT NULL,
 comment_id text NOT NULL, conversation_version text NOT NULL,
 claim_id uuid NOT NULL,
 state text NOT NULL CHECK(state IN ('reserved','sending','sent','unknown','manual','cancelled')),
 remote_reply_id text, sent_at timestamptz,
 error_code text, retry_state text NOT NULL DEFAULT 'never',
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(platform,account_id,post_id,comment_id),
 FOREIGN KEY(platform,account_id,post_id,comment_id,conversation_version)
 REFERENCES xjw_social.comment_ledger(platform,account_id,post_id,comment_id,conversation_version),
 CHECK ((state='sent' AND remote_reply_id IS NOT NULL AND sent_at IS NOT NULL)
 OR (state<>'sent' AND remote_reply_id IS NULL AND sent_at IS NULL))
);
-- Deny REST/client roles even if the schema is accidentally exposed later.
ALTER TABLE xjw_social.platform_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE xjw_social.comment_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE xjw_social.reply_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA xjw_social FROM PUBLIC,anon,authenticated;
COMMENT ON SCHEMA xjw_social IS 'Private social comment deduplication; all platform send switches default off';
