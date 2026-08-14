DROP TABLE social_posts;
ALTER TABLE social_posts_status_v2 RENAME TO social_posts;
CREATE INDEX IF NOT EXISTS idx_social_posts_status ON social_posts(status);
CREATE INDEX IF NOT EXISTS idx_social_posts_schedule ON social_posts(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_posts_status ON social_posts(status,scheduled_at);
