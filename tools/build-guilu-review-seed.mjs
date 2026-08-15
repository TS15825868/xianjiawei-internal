import fs from 'node:fs';

const BANK_PATH = new URL('../assets/data/guilu-content-topic-bank-v20260814.json', import.meta.url);
const CONTEXT_MEDIA_PATH = new URL('../assets/data/guilu-context-media-v20260815.json', import.meta.url);
const bank = JSON.parse(fs.readFileSync(BANK_PATH, 'utf8'));
const contextMedia = fs.existsSync(CONTEXT_MEDIA_PATH) ? JSON.parse(fs.readFileSync(CONTEXT_MEDIA_PATH, 'utf8')) : {overrides:{}};
const contextOverrides = contextMedia?.overrides && typeof contextMedia.overrides === 'object' ? contextMedia.overrides : {};
const BLOCKED = [
  '不是每個人都一定需要','治療','治癒','療效','改善疾病','預防疾病',
  '保證功效','保證改善','藥到病除','關節','卡卡','疲勞','精神不濟','補氣','生津','膠原蛋白','鈣質'
];
const SITE = 'https://ts15825868.github.io/xianjiawei';
const MEDIA_VERSION = '20260815-context-media-v3-svg-render-integrity';
const CURRENT_PRODUCT_MEDIA = Object.freeze({
  'guilu-gao': `${SITE}/images/customer-display-v20260812/guilu-gao.avif?v=${MEDIA_VERSION}`,
  'guilu-drink-30': `${SITE}/images/customer-display-v20260812/guilu-drink-30cc.avif?v=${MEDIA_VERSION}`,
  'guilu-drink-180': `${SITE}/images/customer-display-v20260812/guilu-drink-180cc-product.jpg?v=${MEDIA_VERSION}`,
  'guilu-tangkuai': `${SITE}/images/customer-display-v20260812/guilu-tangkuai.avif?v=${MEDIA_VERSION}`,
  'guilu-jiao': `${SITE}/images/customer-display-v20260812/guilu-jiao.avif?v=${MEDIA_VERSION}`,
  'luerong-fen': `${SITE}/images/customer-display-v20260812/luerong-fen.avif?v=${MEDIA_VERSION}`,
});
const CURRENT_TRIAL_MEDIA = `${SITE}/images/trial/trial-poster-small-boss-official-v20260814.jpg?v=${MEDIA_VERSION}`;
const REQUIRED_IMAGE_PREFIX = `${SITE}/images/`;
const SEED_CREATED_BY = process.env.XJW_CONTENT_SEED_CREATED_BY || 'tung314069@gmail.com';
const hasContextOverride = topic => contextOverrides?.[String(topic?.id||'')]?.action === 'replace';
const rows = Array.isArray(bank?.topics) ? bank.topics.filter(topic => topic?.queueEnabled !== false && (topic?.seedToReview === true || hasContextOverride(topic))) : [];

const CUSTOMER_INTERNAL=['待審核','人工審核','16項','核准','不自動排程','不自動發布','貼文中心','發布中心','ERP','products-v3','守門員','母庫','資料庫','D1','Worker','GitHub','Workflow','候選圖','回填','重新生成','ChatGPT','不重畫','圖片呈現時','看圖片時','產品圖片','版面效果','產品本體','誤畫','正式原圖','正式產品原圖','正式比例','正式包裝','目前正式','最新確認','此類貼文需確認','舊的300g','舊版','debug','TODO','placeholder','假資料','Cloudflare','API Token','Secret','Repository','Repo','commit','deploy','部署','快取版本','測試資料','內部檢查','客戶實際會看到的文案','產品原圖','正式資訊','正式說明'];
const ids = new Set();
const sqlString = value => `'${String(value ?? '').replaceAll("'", "''")}'`;
const jsonString = value => sqlString(JSON.stringify(value ?? []));
const safeId = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
const normalizeImage = value => String(value || '').trim().split('#')[0].split('?')[0].toLowerCase();
const fixedReusable = value => {
  const url=normalizeImage(value);
  return /\/images\/trial\//.test(url)||/\/images\/customer-display-v20260812\//.test(url)||/\/images\/dm-final\//.test(url)||/\/images\/brand\/approved-v405\/product-/.test(url);
};
const visuallyIncompleteSvg = value => /(?:\/images\/posts\/current-v20260815\/|\/images\/publishing\/generated-v20260815\/)[^/]+\.svg$/.test(normalizeImage(value));
const VISUAL_HOLD_REASON='SVG合成圖在貼文中心實際顯示不完整，會出現空白產品框、加號、只有文字或缺少完整情境；需重新製作完整情境圖或改用正式產品圖';
const resolveMedia = topic => {
  const override=contextOverrides?.[String(topic?.id||'')];
  if(override?.action==='replace'){
    const url=String(override.imageUrl||'').trim();
    return url?{url,source:String(override.imageSource||'龜鹿專屬情境圖'),alt:String(override.imageAlt||topic?.imageAlt||topic?.title||'')}:null;
  }
  if (topic?.imageMode === 'official_trial') return { url: CURRENT_TRIAL_MEDIA, source: '仙加味目前正式試喝主圖', alt:String(topic?.imageAlt||topic?.title||'') };
  if (topic?.imageMode === 'official_product') {
    const productIds = Array.isArray(topic?.productIds) ? topic.productIds.filter(Boolean) : [];
    if (productIds.length !== 1) throw new Error(`題目 ${topic?.id || 'unknown'} 的正式產品圖必須只對應一項產品`);
    const url = CURRENT_PRODUCT_MEDIA[productIds[0]];
    if (!url) throw new Error(`題目 ${topic?.id || 'unknown'} 找不到目前正式產品圖：${productIds[0]}`);
    return { url, source: `仙加味目前正式產品圖:${productIds[0]}`, alt:String(topic?.imageAlt||topic?.title||'') };
  }
  const fallback = String(topic?.imageUrl || '').trim();
  return fallback ? { url: fallback, source: topic?.imageSource || '仙加味正式素材', alt:String(topic?.imageAlt||topic?.title||'') } : null;
};

if (!rows.length) throw new Error('沒有可處理的龜鹿題目');
const genericImageGroups=new Map();
for (const topic of rows) {
  const id = safeId(topic.id);
  if (!id) throw new Error(`題目缺少合法 id：${topic.title || 'unknown'}`);
  if (ids.has(id)) throw new Error(`題目 id 重複：${id}`);
  ids.add(id);
  const media = resolveMedia(topic);
  const text = [topic.title, topic.headline, topic.copy, media?.alt||topic.imageAlt, topic.category].join(' ');
  const lower=text.toLowerCase();
  const hit = [...BLOCKED,...CUSTOMER_INTERNAL].find(term => lower.includes(term.toLowerCase()));
  if (hit) throw new Error(`題目 ${id} 含禁止公開字詞：${hit}`);
  if ([topic.title,topic.headline,topic.copy,media?.alt||topic.imageAlt].filter(Boolean).some(value=>/仙加味\s*仙加味/.test(String(value)))) throw new Error(`題目 ${id} 顧客文字含重複品牌字樣「仙加味仙加味」`);
  if (!media?.url?.startsWith(REQUIRED_IMAGE_PREFIX)) throw new Error(`題目 ${id} 沒有目前正式網站圖片來源`);
  if (/\/images\/products-v3\//.test(media.url)) throw new Error(`題目 ${id} 不得把 products-v3 身份參考直接當目前一般貼文主圖`);
  if (/trial-small-boss\.webp|\/trial\.webp|trial-clean-v4\.svg/.test(media.url)) throw new Error(`題目 ${id} 使用退役試喝圖`);
  if (!String(topic.copy || '').trim()) throw new Error(`題目 ${id} 缺少文案`);
  if(!fixedReusable(media.url)&&!visuallyIncompleteSvg(media.url)){
    const imageKey=normalizeImage(media.url);
    if(!genericImageGroups.has(imageKey))genericImageGroups.set(imageKey,[]);
    genericImageGroups.get(imageKey).push({id,title:topic.title});
  }
}
for(const [image,group] of genericImageGroups){
  if(group.length>1)throw new Error(`龜鹿母庫有泛用圖片重複配給不同主題：${image} → ${group.map(item=>`${item.id}:${item.title}`).join('｜')}`);
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

let pendingCount=0,draftCount=0;
for (const topic of rows) {
  const slug = safeId(topic.id);
  const postId = `XJW-GUILU-${slug}`;
  const auditId = `AUD-GUILU-${slug}`;
  const platforms = Array.isArray(topic.platforms) && topic.platforms.length ? topic.platforms : ['Facebook','Instagram'];
  const media = resolveMedia(topic);
  const held=visuallyIncompleteSvg(media.url);
  const status=held?'draft':'pending_review';
  if(held)draftCount++;else pendingCount++;
  const visibleAlt=held?String(topic.title||'').trim():(media.alt || topic.imageAlt || topic.title);
  const imageSource = held
    ? `圖文完整檢查：${VISUAL_HOLD_REASON}|原圖:${media.url}|題庫:${slug}|${bank.version || ''}|context-media:${contextMedia.version||'none'}|media:${MEDIA_VERSION}`
    : `${media.source}|題庫:${slug}|${bank.version || ''}|context-media:${contextMedia.version||'none'}|media:${MEDIA_VERSION}`;
  statements.push(`INSERT INTO social_posts(
    id,title,headline,copy,category,platforms_json,status,scheduled_at,proposed_scheduled_at,approved_by,approved_at,published_at,
    image_url,image_alt,image_source,image_approved,image_width,image_height,image_bytes,image_quality_status,created_by,created_at,updated_at
  ) VALUES(
    ${sqlString(postId)},${sqlString(topic.title)},${sqlString(topic.headline)},${sqlString(topic.copy)},${sqlString(topic.category || '龜鹿知識')},
    ${jsonString(platforms)},${sqlString(status)},NULL,NULL,NULL,NULL,NULL,
    ${sqlString(media.url)},${sqlString(visibleAlt)},${sqlString(imageSource)},0,0,0,0,'unknown',
    ${sqlString(SEED_CREATED_BY)},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
  )
  ON CONFLICT(id) DO UPDATE SET
    title=excluded.title,headline=excluded.headline,copy=excluded.copy,category=excluded.category,platforms_json=excluded.platforms_json,
    status=excluded.status,scheduled_at=NULL,proposed_scheduled_at=NULL,approved_by=NULL,approved_at=NULL,published_at=NULL,
    image_url=excluded.image_url,image_alt=excluded.image_alt,image_source=excluded.image_source,image_approved=0,
    image_width=excluded.image_width,image_height=excluded.image_height,image_bytes=excluded.image_bytes,image_quality_status=excluded.image_quality_status,
    updated_at=CURRENT_TIMESTAMP
  WHERE social_posts.status IN ('draft','pending_review');`);
  statements.push(`INSERT OR IGNORE INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip)
    VALUES(${sqlString(auditId)},'github-actions-content-bank','龜鹿母庫圖文完整檢查同步','貼文',${sqlString(postId)},NULL,${sqlString(JSON.stringify({topic_id: slug, bank_version: bank.version || '', context_media:contextMedia.version||'', media_version: MEDIA_VERSION, status, visual_hold:held}))},'');`);
}

statements.push(`SELECT status,COUNT(*) AS count FROM social_posts WHERE id LIKE 'XJW-GUILU-%' GROUP BY status ORDER BY status;`);
process.stdout.write(statements.join('\n\n') + '\n');
console.error(`PASS: ${rows.length} 篇龜鹿母庫完成圖文完整檢查；${pendingCount} 篇可進待審核，${draftCount} 篇因SVG實際顯示不完整保留草稿；不自動核准、不排程、不發布。`);
