-- Private signed-notification inbox. Customer payload never enters public APIs or logs.
CREATE TABLE xjw_social.webhook_inbox (
 event_hash text NOT NULL CHECK(event_hash ~ '^[a-f0-9]{64}$'),
 platform text NOT NULL CHECK(platform IN ('facebook','instagram','threads')),
 account_id text NOT NULL CHECK(account_id ~ '^[0-9]+$'),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 status text NOT NULL DEFAULT 'manual' CHECK(status IN ('manual','reviewed')),
 source text NOT NULL DEFAULT 'supabase_edge' CHECK(source='supabase_edge'),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(event_hash,platform,account_id)
);
ALTER TABLE xjw_social.webhook_inbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON xjw_social.webhook_inbox FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON xjw_social.webhook_inbox TO xjw_social_worker;
CREATE POLICY worker_read_inbox ON xjw_social.webhook_inbox FOR SELECT TO xjw_social_worker USING(true);
CREATE POLICY worker_insert_inbox ON xjw_social.webhook_inbox FOR INSERT TO xjw_social_worker WITH CHECK(true);
