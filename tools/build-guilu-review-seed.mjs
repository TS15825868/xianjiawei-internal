import fs from 'node:fs';

const BANK_PATH = new URL('../assets/data/guilu-content-topic-bank-v20260814.json', import.meta.url);
const bank = JSON.parse(fs.readFileSync(BANK_PATH, 'utf8'));
const BLOCKED = [
  '台興山產','不是每個人都一定需要','治療','治癒','療效','改善疾病','預防疾病',
  '保證功效','保證改善','藥到病除','關節','卡卡','疲勞','精神不濟','補氣','生津','膠原蛋白','鈣質'
];
const REQUIRED_IMAGE_PREFIX = 'https://ts15825868.github.io/xianjiawei/images/';
const rows = Array.isArray(bank?.topics) ? bank.topics.filter(topic => topic?.seedToReview === true) : [];

const ids = new Set();
const sqlString = value => `'${String(value ?? '').replaceAll("'", "''")}'`;
const jsonString = value => sqlString(JSON.stringify(value ?? []));
const safeId = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');

if (!rows.length) throw new Error('沒有 seedToReview=true 的龜鹿題目');
for (const topic of rows) {
  const id = safeId(topic.id);
  if (!id) throw new Error(`題目缺少合法 id：${topic.title || 'unknown'}`);
  if (ids.has(id)) throw new Error(`題目 id 重複：${id}`);
  ids.add(id);
  const text = [topic.title, topic.headline, topic.copy, topic.category].join(' ');
  const hit = BLOCKED.find(term => text.includes(term));
  if (hit) throw new Error(`題目 ${id} 含禁止公開字詞：${hit}`);
  if (!String(topic.imageUrl || '').startsWith(REQUIRED_IMAGE_PREFIX)) throw new Error(`題目 ${id} 沒有正式網站圖片來源`);
  if (!String(topic.copy || '').trim()) throw new Error(`題目 ${id} 缺少文案`);
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

for (const topic of rows) {
  const slug = safeId(topic.id);
  const postId = `XJW-GUILU-${slug}`;
  const auditId = `AUD-GUILU-${slug}`;
  const platforms = Array.isArray(topic.platforms) && topic.platforms.length ? topic.platforms : ['Facebook','Instagram'];
  const imageSource = `${topic.imageSource || '仙加味正式素材'}|題庫:${slug}|${bank.version || ''}`;
  statements.push(`INSERT OR IGNORE INTO social_posts(
    id,title,headline,copy,category,platforms_json,status,scheduled_at,proposed_scheduled_at,approved_by,approved_at,published_at,
    image_url,image_alt,image_source,image_approved,image_width,image_height,image_bytes,image_quality_status,created_by,created_at,updated_at
  ) VALUES(
    ${sqlString(postId)},${sqlString(topic.title)},${sqlString(topic.headline)},${sqlString(topic.copy)},${sqlString(topic.category || '龜鹿知識')},
    ${jsonString(platforms)},'pending_review',NULL,NULL,NULL,NULL,NULL,
    ${sqlString(topic.imageUrl)},${sqlString(topic.imageAlt || topic.title)},${sqlString(imageSource)},0,0,0,0,'unknown',
    'github-actions-content-bank',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
  );`);
  statements.push(`INSERT OR IGNORE INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip)
    VALUES(${sqlString(auditId)},'github-actions-content-bank','龜鹿母庫建立待審核','貼文',${sqlString(postId)},NULL,${sqlString(JSON.stringify({topic_id: slug, bank_version: bank.version || '', status: 'pending_review'}))},'');`);
}

statements.push(`SELECT status,COUNT(*) AS count FROM social_posts WHERE id LIKE 'XJW-GUILU-%' GROUP BY status ORDER BY status;`);
process.stdout.write(statements.join('\n\n') + '\n');
console.error(`PASS: ${rows.length} 篇龜鹿母庫貼文可安全建立為待審核；使用正式圖片且不自動核准、不排程、不發布。`);
