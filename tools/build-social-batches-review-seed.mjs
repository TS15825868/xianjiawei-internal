import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const DATA_DIR = path.join(ROOT, 'assets', 'data');
const SITE = 'https://ts15825868.github.io/xianjiawei';
const REQUIRED_IMAGE_PREFIX = `${SITE}/images/`;
const SEED_CREATED_BY = process.env.XJW_CONTENT_SEED_CREATED_BY || 'tung314069@gmail.com';
const BLOCKED = [
  '不是每個人都一定需要','治療','治癒','療效','改善疾病','預防疾病','保證功效','保證改善','藥到病除',
  '關節','卡卡','疲勞','精神不濟','補氣','生津','膠原蛋白','鈣質'
];
const CUSTOMER_INTERNAL=['待審核','人工審核','16項','核准','不自動排程','不自動發布','貼文中心','發布中心','ERP','products-v3','守門員','母庫','資料庫','D1','Worker','GitHub','Workflow','候選圖','回填','重新生成','ChatGPT','不重畫','圖片呈現時','看圖片時','產品圖片','版面效果','產品本體','誤畫','正式原圖','正式產品原圖','正式比例','正式包裝','目前正式','最新確認','此類貼文需確認','舊的300g','舊版','debug','TODO','placeholder','假資料','Cloudflare','API Token','Secret','Repository','Repo','commit','deploy','部署','快取版本','測試資料','內部檢查','客戶實際會看到的文案','產品原圖','正式資訊','正式說明'];
const normPublic=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/仙加味[｜|]?補養，是一種節奏。?/g,'').replace(/[^\p{L}\p{N}]+/gu,'');
const bigrams=s=>{const out=new Map();for(let i=0;i<s.length-1;i++){const k=s.slice(i,i+2);out.set(k,(out.get(k)||0)+1)}return out};
const dice=(a,b)=>{if(!a||!b)return 0;if(a===b)return 1;const A=bigrams(a),B=bigrams(b);let hit=0,ai=0,bi=0;for(const n of A.values())ai+=n;for(const n of B.values())bi+=n;for(const [k,n] of A)hit+=Math.min(n,B.get(k)||0);return ai+bi?2*hit/(ai+bi):0};
const qualitySeen=[];
const ALLOWED_PLATFORMS = new Set(['Facebook','Instagram','LINE OA','LINE OA 廣播','LINE VOOM','Google 商家']);

const files = fs.readdirSync(DATA_DIR)
  .filter(name => /^social-batch-\d{8}-\d{2}\.json$/.test(name))
  .sort();
if (!files.length) throw new Error('找不到 social-batch-YYYYMMDD-NN.json');

const sqlString = value => `'${String(value ?? '').replaceAll("'", "''")}'`;
const jsonString = value => sqlString(JSON.stringify(value ?? []));
const safeId = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
const rows = [];
const seen = new Set();

for (const file of files) {
  const full = path.join(DATA_DIR, file);
  const batch = JSON.parse(fs.readFileSync(full, 'utf8'));
  if (String(batch.status || '') !== 'pending_review') throw new Error(`${file} status 必須是 pending_review`);
  if (!Array.isArray(batch.posts) || !batch.posts.length) throw new Error(`${file} 沒有 posts`);
  for (const post of batch.posts) {
    const slug = safeId(post.id);
    if (!slug) throw new Error(`${file} 有貼文缺少合法 id`);
    const key = `${file}:${slug}`;
    if (seen.has(key)) throw new Error(`${file} 貼文 id 重複：${slug}`);
    seen.add(key);
    const text = [post.title, post.headline, post.copy, post.imageAlt, post.category].join(' ');
    const hit = BLOCKED.find(term => text.includes(term));
    if (hit) throw new Error(`${file}/${slug} 含禁止公開字詞：${hit}`);
    const internalHit=CUSTOMER_INTERNAL.find(term=>text.toLowerCase().includes(term.toLowerCase()));
    if(internalHit)throw new Error(`${file}/${slug} 含不應公開的內部用語：${internalHit}`);
    const titleKey=normPublic(post.title),copyKey=normPublic(post.copy);
    for(const prior of qualitySeen){if(titleKey&&titleKey===prior.titleKey)throw new Error(`${file}/${slug} 標題與既有批次重複：${prior.ref}`);if(copyKey.length>=40&&prior.copyKey.length>=40&&dice(copyKey,prior.copyKey)>=0.90)throw new Error(`${file}/${slug} 文案與既有批次過度相似：${prior.ref}`)}
    qualitySeen.push({titleKey,copyKey,ref:`${file}/${slug}`});
    const imageUrl = String(post.imageUrl || '').trim();
    if (!imageUrl.startsWith(REQUIRED_IMAGE_PREFIX)) throw new Error(`${file}/${slug} 圖片必須來自仙加味正式官網 images 路徑`);
    if (/\/images\/products-v3\//.test(imageUrl)) throw new Error(`${file}/${slug} 不得直接使用 products-v3 作一般貼文主圖`);
    if (/trial-small-boss\.webp|\/trial\.webp|trial-clean-v4\.svg/.test(imageUrl)) throw new Error(`${file}/${slug} 使用退役試喝圖`);
    if (!String(post.copy || '').trim()) throw new Error(`${file}/${slug} 缺少文案`);
    const platforms = [...new Set((Array.isArray(post.platforms) ? post.platforms : ['Facebook','Instagram'])
      .map(v => String(v || '').trim()).filter(v => ALLOWED_PLATFORMS.has(v)))];
    if (!platforms.length) throw new Error(`${file}/${slug} 沒有合法發布平台`);
    rows.push({
      file,
      batchVersion: String(batch.version || file.replace(/\.json$/,'')),
      slug,
      post,
      imageUrl,
      platforms,
    });
  }
}

const statements = [];
statements.push(`CREATE TABLE IF NOT EXISTS social_posts(
  id TEXT PRIMARY KEY,title TEXT NOT NULL DEFAULT '',headline TEXT NOT NULL DEFAULT '',copy TEXT NOT NULL DEFAULT '',category TEXT NOT NULL DEFAULT '日常節奏',
  platforms_json TEXT NOT NULL DEFAULT '[]',status TEXT NOT NULL DEFAULT 'draft',scheduled_at TEXT,proposed_scheduled_at TEXT,approved_by TEXT,approved_at TEXT,published_at TEXT,
  image_url TEXT NOT NULL DEFAULT '',image_alt TEXT NOT NULL DEFAULT '',image_source TEXT NOT NULL DEFAULT '官方素材',image_approved INTEGER NOT NULL DEFAULT 0,
  image_width INTEGER NOT NULL DEFAULT 0,image_height INTEGER NOT NULL DEFAULT 0,image_bytes INTEGER NOT NULL DEFAULT 0,image_quality_status TEXT NOT NULL DEFAULT 'unknown',
  created_by TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);`);
statements.push(`CREATE TABLE IF NOT EXISTS audit_logs(
  id TEXT PRIMARY KEY,actor_email TEXT NOT NULL DEFAULT '',action TEXT NOT NULL DEFAULT '',entity_type TEXT NOT NULL DEFAULT '',entity_id TEXT NOT NULL DEFAULT '',
  before_json TEXT,after_json TEXT,ip TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);`);

for (const row of rows) {
  const { file, batchVersion, slug, post, imageUrl, platforms } = row;
  const batchSlug = safeId(file.replace(/^social-batch-|\.json$/g, ''));
  const postId = `XJW-SOCIAL-${batchSlug}-${slug}`;
  const auditId = `AUD-SOCIAL-${batchSlug}-${slug}`;
  const imageSource = `${String(post.imageSource || '仙加味正式素材').trim()}|batch:${batchVersion}|file:${file}`;
  statements.push(`INSERT INTO social_posts(
    id,title,headline,copy,category,platforms_json,status,scheduled_at,proposed_scheduled_at,approved_by,approved_at,published_at,
    image_url,image_alt,image_source,image_approved,image_width,image_height,image_bytes,image_quality_status,created_by,created_at,updated_at
  ) VALUES(
    ${sqlString(postId)},${sqlString(post.title)},${sqlString(post.headline)},${sqlString(post.copy)},${sqlString(post.category || '日常節奏')},
    ${jsonString(platforms)},'pending_review',NULL,NULL,NULL,NULL,NULL,
    ${sqlString(imageUrl)},${sqlString(post.imageAlt || post.title)},${sqlString(imageSource)},0,0,0,0,'unknown',
    ${sqlString(SEED_CREATED_BY)},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
  )
  ON CONFLICT(id) DO UPDATE SET
    title=excluded.title,headline=excluded.headline,copy=excluded.copy,category=excluded.category,platforms_json=excluded.platforms_json,
    status='pending_review',scheduled_at=NULL,proposed_scheduled_at=NULL,approved_by=NULL,approved_at=NULL,published_at=NULL,
    image_url=excluded.image_url,image_alt=excluded.image_alt,image_source=excluded.image_source,image_approved=0,
    image_width=excluded.image_width,image_height=excluded.image_height,image_bytes=excluded.image_bytes,image_quality_status=excluded.image_quality_status,
    updated_at=CURRENT_TIMESTAMP
  WHERE social_posts.status IN ('draft','pending_review');`);
  statements.push(`INSERT OR IGNORE INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip)
    VALUES(${sqlString(auditId)},'github-actions-social-batch','社群批次建立待審核','貼文',${sqlString(postId)},NULL,${sqlString(JSON.stringify({batch: batchVersion, file, status:'pending_review'}))},'');`);
}

statements.push(`SELECT status,COUNT(*) AS count FROM social_posts WHERE id LIKE 'XJW-SOCIAL-%' GROUP BY status ORDER BY status;`);
process.stdout.write(statements.join('\n\n') + '\n');
console.error(`PASS: ${files.length} 個社群批次共 ${rows.length} 篇文案＋正式配圖可安全建立為 pending_review；不自動核准、不排程、不發布。`);
