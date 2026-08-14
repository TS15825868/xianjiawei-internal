const REQUIRED_STATUS_LITERALS=Object.freeze(["'pending_review'","'manual_required'","'failed'"]);

const countOf=(row)=>Number(row?.count||0);

async function tableSql(db){
  const row=await db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='social_posts' LIMIT 1").first();
  return String(row?.sql||'');
}

async function assertNoOrphanProfileReferences(db){
  const created=await db.prepare("SELECT COUNT(*) AS count FROM social_posts p LEFT JOIN profiles x ON p.created_by=x.email WHERE p.created_by<>'' AND x.email IS NULL").first();
  const approved=await db.prepare("SELECT COUNT(*) AS count FROM social_posts p LEFT JOIN profiles x ON p.approved_by=x.email WHERE p.approved_by IS NOT NULL AND p.approved_by<>'' AND x.email IS NULL").first();
  if(countOf(created)||countOf(approved)){
    throw new Error(`social_posts 狀態遷移前發現孤兒使用者關聯：created=${countOf(created)}, approved=${countOf(approved)}`);
  }
}

export async function ensureSocialPostStatusSchema(env){
  const db=env?.DB;
  if(!db)throw new Error('D1 資料庫尚未綁定');
  const currentSql=await tableSql(db);
  if(!currentSql)return {migrated:false,reason:'table-missing'};
  if(REQUIRED_STATUS_LITERALS.every((value)=>currentSql.includes(value))){
    return {migrated:false,reason:'already-current'};
  }

  await assertNoOrphanProfileReferences(db);
  const before=await db.prepare('SELECT COUNT(*) AS count FROM social_posts').first();

  await db.exec(`
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
  `);

  const staged=await db.prepare('SELECT COUNT(*) AS count FROM social_posts_status_v2').first();
  if(countOf(staged)!==countOf(before)){
    throw new Error(`social_posts staging 筆數不一致：before=${countOf(before)}, staged=${countOf(staged)}`);
  }

  await db.exec(`
    DROP TABLE social_posts;
    ALTER TABLE social_posts_status_v2 RENAME TO social_posts;
    CREATE INDEX IF NOT EXISTS idx_social_posts_status ON social_posts(status);
    CREATE INDEX IF NOT EXISTS idx_social_posts_schedule ON social_posts(scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_posts_status ON social_posts(status,scheduled_at);
  `);

  const after=await db.prepare('SELECT COUNT(*) AS count FROM social_posts').first();
  const migratedSql=await tableSql(db);
  const foreignKeys=await db.prepare('PRAGMA foreign_key_check').all();
  if(countOf(after)!==countOf(before))throw new Error('social_posts 狀態遷移後筆數不一致');
  if(!REQUIRED_STATUS_LITERALS.every((value)=>migratedSql.includes(value)))throw new Error('social_posts 新狀態 CHECK 未生效');
  if((foreignKeys.results||[]).length)throw new Error('social_posts 狀態遷移後 foreign_key_check 未通過');
  return {migrated:true,count:countOf(after)};
}

export {REQUIRED_STATUS_LITERALS,assertNoOrphanProfileReferences};
