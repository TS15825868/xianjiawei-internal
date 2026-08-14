import fs from 'node:fs';

const BANK_PATH = new URL('../assets/data/guilu-content-topic-bank-v20260814.json', import.meta.url);
const bank = JSON.parse(fs.readFileSync(BANK_PATH, 'utf8'));
const SEED_CREATED_BY = process.env.XJW_CONTENT_SEED_CREATED_BY || 'tung314069@gmail.com';
const rows = Array.isArray(bank?.topics)
  ? bank.topics.filter(topic => topic?.seedToReview !== true && topic?.imageMode === 'context_required')
  : [];

const BLOCKED = [
  '治療','治癒','療效','改善疾病','預防疾病','保證功效','保證改善','藥到病除',
  '關節','卡卡','疲勞','精神不濟','補氣','生津','膠原蛋白','鈣質'
];
const ids = new Set();
const sqlString = value => `'${String(value ?? '').replaceAll("'", "''")}'`;
const jsonString = value => sqlString(JSON.stringify(value ?? []));
const safeId = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');

if (!rows.length) throw new Error('目前沒有需要配情境圖的龜鹿題目');

for (const topic of rows) {
  const id = safeId(topic.id);
  if (!id) throw new Error(`題目缺少合法 id：${topic.title || 'unknown'}`);
  if (ids.has(id)) throw new Error(`題目 id 重複：${id}`);
  ids.add(id);
  const text = [topic.title,topic.headline,topic.copy,topic.category].join(' ');
  const hit = BLOCKED.find(term => text.includes(term));
  if (hit) throw new Error(`題目 ${id} 含禁止公開字詞：${hit}`);
  if (!String(topic.copy || '').trim()) throw new Error(`題目 ${id} 缺少文案`);
  if (String(topic.imageUrl || '').trim()) throw new Error(`題目 ${id} 標示 context_required 卻已帶 imageUrl，請先釐清媒體角色`);
}

const statements = [];
for (const topic of rows) {
  const slug = safeId(topic.id);
  const postId = `XJW-GUILU-${slug}`;
  const auditId = `AUD-GUILU-DRAFT-${slug}`;
  const platforms = Array.isArray(topic.platforms) && topic.platforms.length ? topic.platforms : ['Facebook','Instagram'];
  const source = `待依文案配對既有正式情境圖或重新生成|題庫:${slug}|${bank.version || ''}`;
  statements.push(`INSERT INTO social_posts(
    id,title,headline,copy,category,platforms_json,status,scheduled_at,proposed_scheduled_at,approved_by,approved_at,published_at,
    image_url,image_alt,image_source,image_approved,image_width,image_height,image_bytes,image_quality_status,created_by,created_at,updated_at
  ) VALUES(
    ${sqlString(postId)},${sqlString(topic.title)},${sqlString(topic.headline)},${sqlString(topic.copy)},${sqlString(topic.category || '龜鹿知識')},
    ${jsonString(platforms)},'draft',NULL,NULL,NULL,NULL,NULL,
    '',${sqlString(topic.imageAlt || topic.title)},${sqlString(source)},0,0,0,0,'unknown',
    ${sqlString(SEED_CREATED_BY)},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
  )
  ON CONFLICT(id) DO UPDATE SET
    title=excluded.title,headline=excluded.headline,copy=excluded.copy,category=excluded.category,platforms_json=excluded.platforms_json,
    image_alt=CASE WHEN trim(social_posts.image_alt)='' THEN excluded.image_alt ELSE social_posts.image_alt END,
    updated_at=CURRENT_TIMESTAMP
  WHERE social_posts.status='draft';`);
  statements.push(`INSERT OR IGNORE INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip)
    VALUES(${sqlString(auditId)},'github-actions-content-bank','龜鹿母庫建立待配圖草稿','貼文',${sqlString(postId)},NULL,${sqlString(JSON.stringify({topic_id:slug,bank_version:bank.version || '',status:'draft',image_required:true}))},'');`);
}

statements.push(`SELECT status,COUNT(*) AS count FROM social_posts WHERE id LIKE 'XJW-GUILU-%' GROUP BY status ORDER BY status;`);
process.stdout.write(statements.join('\n\n') + '\n');
console.error(`PASS: ${rows.length} 篇目前缺情境圖的龜鹿題目可安全建立為草稿；不自動配錯圖、不核准、不排程、不發布。`);
