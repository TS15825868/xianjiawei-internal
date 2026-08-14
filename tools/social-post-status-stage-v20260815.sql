DROP TABLE IF EXISTS social_posts_status_v2;
CREATE TABLE social_posts_status_v2(
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  headline TEXT NOT NULL DEFAULT '',
  copy TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '日常節奏',
  platforms_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_review','approved','scheduled','published','manual_required','failed','archived')),
  scheduled_at TEXT,
  approved_by TEXT,
  approved_at TEXT,
  published_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  image_url TEXT NOT NULL DEFAULT '',
  image_alt TEXT NOT NULL DEFAULT '',
  image_source TEXT NOT NULL DEFAULT '官方素材',
  image_approved INTEGER NOT NULL DEFAULT 0 CHECK (image_approved IN (0,1)),
  image_width INTEGER NOT NULL DEFAULT 0,
  image_height INTEGER NOT NULL DEFAULT 0,
  image_bytes INTEGER NOT NULL DEFAULT 0,
  image_quality_status TEXT NOT NULL DEFAULT 'unknown',
  media_id TEXT,
  review_note TEXT NOT NULL DEFAULT '',
  brand_check_json TEXT NOT NULL DEFAULT '{}',
  rejection_reason TEXT NOT NULL DEFAULT '',
  proposed_scheduled_at TEXT,
  FOREIGN KEY (created_by) REFERENCES profiles(email),
  FOREIGN KEY (approved_by) REFERENCES profiles(email)
);
INSERT INTO social_posts_status_v2(
  id,title,headline,copy,category,platforms_json,status,scheduled_at,approved_by,approved_at,published_at,created_by,created_at,updated_at,
  image_url,image_alt,image_source,image_approved,image_width,image_height,image_bytes,image_quality_status,media_id,review_note,brand_check_json,rejection_reason,proposed_scheduled_at
)
SELECT
  id,title,headline,copy,category,platforms_json,status,scheduled_at,approved_by,approved_at,published_at,created_by,created_at,updated_at,
  image_url,image_alt,image_source,image_approved,image_width,image_height,image_bytes,image_quality_status,media_id,review_note,brand_check_json,rejection_reason,proposed_scheduled_at
FROM social_posts;
