import fs from 'node:fs';

const BANK_PATH = new URL('../assets/data/guilu-content-topic-bank-v20260814.json', import.meta.url);
const CONTEXT_MEDIA_PATH = new URL('../assets/data/guilu-context-media-v20260815.json', import.meta.url);
const bank = JSON.parse(fs.readFileSync(BANK_PATH, 'utf8'));
const contextMedia = fs.existsSync(CONTEXT_MEDIA_PATH) ? JSON.parse(fs.readFileSync(CONTEXT_MEDIA_PATH, 'utf8')) : {overrides:{}};
const contextOverrides = contextMedia?.overrides && typeof contextMedia.overrides === 'object' ? contextMedia.overrides : {};
const SEED_CREATED_BY = process.env.XJW_CONTENT_SEED_CREATED_BY || 'tung314069@gmail.com';
const hasContextOverride = topic => contextOverrides?.[String(topic?.id||'')]?.action === 'replace';
const rows = Array.isArray(bank?.topics)
  ? bank.topics.filter(topic => topic?.queueEnabled !== false && topic?.seedToReview !== true && topic?.imageMode === 'context_required' && !hasContextOverride(topic))
  : [];

const BLOCKED = [
  '治療','治癒','療效','改善疾病','預防疾病','保證功效','保證改善','藥到病除',
  '關節','卡卡','疲勞','精神不濟','補氣','生津','膠原蛋白','鈣質'
];
const CUSTOMER_INTERNAL=['待審核','人工審核','16項','核准','不自動排程','不自動發布','貼文中心','發布中心','ERP','products-v3','守門員','母庫','資料庫','D1','Worker','GitHub','Workflow','候選圖','回填','重新生成','ChatGPT','不重畫','圖片呈現時','看圖片時','產品圖片','版面效果','產品本體','誤畫','正式原圖','正式產品原圖','正式比例','正式包裝','目前正式','最新確認','此類貼文需確認','舊的300g','舊版','debug','TODO','placeholder','假資料','Cloudflare','API Token','Secret','Repository','Repo','commit','deploy','部署','快取版本','測試資料','內部檢查','客戶實際會看到的文案','產品原圖','正式資訊','正式說明'];
const ids = new Set();
const sqlString = value => `'${String(value ?? '').replaceAll("'", "''")}'`;
const jsonString = value => sqlString(JSON.stringify(value ?? []));
const safeId = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');

if (!rows.length) {
  console.error('PASS: 目前沒有仍缺情境圖的啟用中龜鹿題目。');
  process.stdout.write("SELECT status,COUNT(*) AS count FROM social_posts WHERE id LIKE 'XJW-GUILU-%' GROUP BY status ORDER BY status;\n");
  process.exit(0);
}

for (const topic of rows) {
  const id = safeId(topic.id);
  if (!id) throw new Error(`題目缺少合法 id：${topic.title || 'unknown'}`);
  if (ids.has(id)) throw new Error(`題目 id 重複：${id}`);
  ids.add(id);
  const text = [topic.title,topic.headline,topic.copy,topic.imageAlt,topic.category].join(' ');
  const lower=text.toLowerCase();
  const hit = [...BLOCKED,...CUSTOMER_INTERNAL].find(term => lower.includes(term.toLowerCase()));
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
console.error(`PASS: ${rows.length} 篇目前仍缺情境圖的龜鹿題目保留草稿；不自動配錯圖、不核准、不排程、不發布。`);
