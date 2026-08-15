import fs from 'node:fs';
import path from 'node:path';

const ROOT=path.resolve(new URL('..',import.meta.url).pathname);
const DATA_DIR=path.join(ROOT,'assets','data');
const SITE='https://ts15825868.github.io/xianjiawei';
const REQUIRED_IMAGE_PREFIX=`${SITE}/images/`;
const SEED_CREATED_BY=process.env.XJW_CONTENT_SEED_CREATED_BY||'tung314069@gmail.com';
const IMAGE_AUDIT_PATH=path.join(DATA_DIR,'social-image-audit-v20260815.json');
const imageAudit=fs.existsSync(IMAGE_AUDIT_PATH)?JSON.parse(fs.readFileSync(IMAGE_AUDIT_PATH,'utf8')):{overrides:{}};
const overrides=imageAudit?.overrides&&typeof imageAudit.overrides==='object'?imageAudit.overrides:{};
const BLOCKED=['不是每個人都一定需要','治療','治癒','療效','改善疾病','預防疾病','保證功效','保證改善','藥到病除','關節','卡卡','疲勞','精神不濟','補氣','生津','膠原蛋白','鈣質'];
const CUSTOMER_INTERNAL=['待審核','人工審核','16項','核准','不自動排程','不自動發布','貼文中心','發布中心','ERP','products-v3','守門員','母庫','資料庫','D1','Worker','GitHub','Workflow','候選圖','回填','重新生成','ChatGPT','不重畫','圖片呈現時','看圖片時','產品圖片','版面效果','產品本體','誤畫','正式原圖','正式產品原圖','正式比例','正式包裝','目前正式','最新確認','此類貼文需確認','舊的300g','舊版','debug','TODO','placeholder','假資料','Cloudflare','API Token','Secret','Repository','Repo','commit','deploy','部署','快取版本','測試資料','內部檢查','客戶實際會看到的文案','產品原圖','正式資訊','正式說明'];
const ALLOWED_PLATFORMS=new Set(['Facebook','Instagram','LINE OA','LINE OA 廣播','LINE VOOM','Google 商家']);
const normPublic=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/仙加味[｜|]?補養，是一種節奏。?/g,'').replace(/[^\p{L}\p{N}]+/gu,'');
const bigrams=s=>{const out=new Map();for(let i=0;i<s.length-1;i++){const k=s.slice(i,i+2);out.set(k,(out.get(k)||0)+1)}return out};
const dice=(a,b)=>{if(!a||!b)return 0;if(a===b)return 1;const A=bigrams(a),B=bigrams(b);let hit=0,ai=0,bi=0;for(const n of A.values())ai+=n;for(const n of B.values())bi+=n;for(const [k,n] of A)hit+=Math.min(n,B.get(k)||0);return ai+bi?2*hit/(ai+bi):0};
const safeId=value=>String(value||'').trim().toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'');
const sqlString=value=>`'${String(value??'').replaceAll("'","''")}'`;
const jsonString=value=>sqlString(JSON.stringify(value??[]));
const normalizeImage=value=>String(value||'').trim().split('#')[0].split('?')[0].toLowerCase();
const fixedReusable=value=>{const url=normalizeImage(value);return /\/images\/trial\//.test(url)||/\/images\/customer-display-v20260812\//.test(url)||/\/images\/dm-final\//.test(url)||/\/images\/brand\/approved-v405\/product-/.test(url)};
const visuallyIncompleteSvg=value=>/(?:\/images\/posts\/current-v20260815\/|\/images\/publishing\/generated-v20260815\/)[^/]+\.svg$/.test(normalizeImage(value));
const VISUAL_HOLD_REASON='SVG合成圖在貼文中心實際顯示不完整，會出現空白產品框、加號、只有文字或缺少完整情境；需重新製作完整情境圖或改用正式產品圖';
const genericMismatch=(post,imageUrl)=>{
  const image=String(imageUrl||'').toLowerCase(),topic=[post.title,post.headline,post.category].join(' ').toLowerCase();
  if(/products-all|all-products/.test(image)&&!/產品總覽|六項產品|一次認識|系列介紹/.test(topic))return'全系列／產品總覽圖只保留給真正的產品總覽主題';
  if(/brand-story/.test(image)&&!/品牌故事|萬華|四代|傳承/.test(topic))return'品牌故事圖不可代替工序或其他主題';
  if(/guide-how-to-use/.test(image)&&!/使用方式|怎麼使用|使用|熬製|火候|工序|傳統工藝/.test(topic))return'使用方式／工序圖不可代替其他日常主題';
  if(/\/faq\./.test(image)&&!/faq|常見問題|問答/.test(topic))return'FAQ圖不可代替保存或其他主題';
  if(/recipes/.test(image)&&!/料理|燉湯|雞湯|排骨湯/.test(topic))return'料理圖只用於料理主題';
  return'';
};

const files=fs.readdirSync(DATA_DIR).filter(name=>/^social-batch-\d{8}-\d{2}\.json$/.test(name)).sort();
if(!files.length)throw new Error('找不到 social-batch-YYYYMMDD-NN.json');
const rows=[],seen=new Set(),qualitySeen=[];

for(const file of files){
  const batch=JSON.parse(fs.readFileSync(path.join(DATA_DIR,file),'utf8'));
  if(String(batch.status||'')!=='pending_review')throw new Error(`${file} status 必須是 pending_review`);
  if(!Array.isArray(batch.posts)||!batch.posts.length)throw new Error(`${file} 沒有 posts`);
  for(const post of batch.posts){
    const slug=safeId(post.id);if(!slug)throw new Error(`${file} 有貼文缺少合法 id`);
    const key=`${file}:${slug}`;if(seen.has(key))throw new Error(`${file} 貼文 id 重複：${slug}`);seen.add(key);
    const text=[post.title,post.headline,post.copy,post.imageAlt,post.category].join(' '),lower=text.toLowerCase();
    const blocked=BLOCKED.find(term=>text.includes(term));if(blocked)throw new Error(`${file}/${slug} 含禁止公開字詞：${blocked}`);
    const internal=CUSTOMER_INTERNAL.find(term=>lower.includes(term.toLowerCase()));if(internal)throw new Error(`${file}/${slug} 含不應公開的內部用語：${internal}`);
    const titleKey=normPublic(post.title),copyKey=normPublic(post.copy);
    for(const prior of qualitySeen){if(titleKey&&titleKey===prior.titleKey)throw new Error(`${file}/${slug} 標題與既有批次重複：${prior.ref}`);if(copyKey.length>=40&&prior.copyKey.length>=40&&dice(copyKey,prior.copyKey)>=0.90)throw new Error(`${file}/${slug} 文案與既有批次過度相似：${prior.ref}`)}
    qualitySeen.push({titleKey,copyKey,ref:`${file}/${slug}`});
    const platforms=[...new Set((Array.isArray(post.platforms)?post.platforms:['Facebook','Instagram']).map(v=>String(v||'').trim()).filter(v=>ALLOWED_PLATFORMS.has(v)))];
    if(!platforms.length)throw new Error(`${file}/${slug} 沒有合法發布平台`);
    const override=overrides[slug]||null;
    let imageUrl=String(post.imageUrl||'').trim(),imageAlt=String(post.imageAlt||post.title||'').trim(),imageSource=String(post.imageSource||'仙加味正式素材').trim(),status='pending_review',reviewReason='';
    if(override?.action==='replace'){
      imageUrl=String(override.imageUrl||'').trim();imageAlt=String(override.imageAlt||imageAlt).trim();imageSource=String(override.imageSource||imageSource).trim();reviewReason=String(override.reason||'').trim();
    }else if(override?.action==='regenerate'){
      imageUrl='';imageAlt=String(post.title||'').trim();imageSource=`圖文完整檢查：${String(override.reason||'需重新製作符合文案圖片').trim()}`;status='draft';reviewReason=String(override.reason||'').trim();
    }
    if(imageUrl){
      if(!imageUrl.startsWith(REQUIRED_IMAGE_PREFIX))throw new Error(`${file}/${slug} 圖片必須來自仙加味正式官網 images 路徑`);
      if(/\/images\/products-v3\//.test(imageUrl))throw new Error(`${file}/${slug} 不得直接使用 products-v3 作一般貼文主圖`);
      if(/trial-small-boss\.webp|\/trial\.webp|trial-clean-v4\.svg/.test(imageUrl))throw new Error(`${file}/${slug} 使用退役試喝圖`);
      if(visuallyIncompleteSvg(imageUrl)){
        status='draft';
        reviewReason=VISUAL_HOLD_REASON;
        imageAlt=String(post.title||'').trim();
        imageSource=`圖文完整檢查：${VISUAL_HOLD_REASON}|原圖:${imageUrl}`;
      }else{
        const mismatch=genericMismatch(post,imageUrl);if(mismatch){status='draft';reviewReason=mismatch;imageUrl='';imageAlt=String(post.title||'').trim();imageSource=`圖文完整檢查：${mismatch}`;}
      }
    }
    if(!String(post.copy||'').trim())throw new Error(`${file}/${slug} 缺少文案`);
    rows.push({file,batchVersion:String(batch.version||file.replace(/\.json$/,'')),slug,post,imageUrl,imageAlt,imageSource,platforms,status,reviewReason,override});
  }
}

const imageGroups=new Map();
for(const row of rows){if(!row.imageUrl||row.status==='draft')continue;const key=normalizeImage(row.imageUrl);if(!imageGroups.has(key))imageGroups.set(key,[]);imageGroups.get(key).push(row)}
for(const group of imageGroups.values()){
  if(group.length<2)continue;
  for(const row of group.slice(1)){
    row.status='draft';row.reviewReason=`泛用情境圖與「${group[0].post.title}」重複使用，需改成本篇專屬圖片`;row.imageUrl='';row.imageAlt=String(row.post.title||'').trim();row.imageSource=`圖文完整檢查：${row.reviewReason}`;
  }
}

const statements=[];
statements.push(`CREATE TABLE IF NOT EXISTS social_posts(
  id TEXT PRIMARY KEY,title TEXT NOT NULL DEFAULT '',headline TEXT NOT NULL DEFAULT '',copy TEXT NOT NULL DEFAULT '',category TEXT NOT NULL DEFAULT '日常節奏',
  platforms_json TEXT NOT NULL DEFAULT '[]',status TEXT NOT NULL DEFAULT 'draft',scheduled_at TEXT,proposed_scheduled_at TEXT,approved_by TEXT,approved_at TEXT,published_at TEXT,
  image_url TEXT NOT NULL DEFAULT '',image_alt TEXT NOT NULL DEFAULT '',image_source TEXT NOT NULL DEFAULT '官方素材',image_approved INTEGER NOT NULL DEFAULT 0,
  image_width INTEGER NOT NULL DEFAULT 0,image_height INTEGER NOT NULL DEFAULT 0,image_bytes INTEGER NOT NULL DEFAULT 0,image_quality_status TEXT NOT NULL DEFAULT 'unknown',
  created_by TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);`);
statements.push(`CREATE TABLE IF NOT EXISTS audit_logs(
  id TEXT PRIMARY KEY,actor_email TEXT NOT NULL DEFAULT '',action TEXT NOT NULL DEFAULT '',entity_type TEXT NOT NULL DEFAULT '',entity_id TEXT NOT NULL DEFAULT '',before_json TEXT,after_json TEXT,ip TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);`);

for(const row of rows){
  const {file,batchVersion,slug,post,imageUrl,imageAlt,imageSource,platforms,status,reviewReason}=row;
  const batchSlug=safeId(file.replace(/^social-batch-|\.json$/g,'')),postId=`XJW-SOCIAL-${batchSlug}-${slug}`,auditId=`AUD-SOCIAL-${batchSlug}-${slug}`;
  const finalSource=`${imageSource}|batch:${batchVersion}|file:${file}|image-audit:${imageAudit.version||'none'}`;
  statements.push(`INSERT INTO social_posts(
    id,title,headline,copy,category,platforms_json,status,scheduled_at,proposed_scheduled_at,approved_by,approved_at,published_at,
    image_url,image_alt,image_source,image_approved,image_width,image_height,image_bytes,image_quality_status,created_by,created_at,updated_at
  ) VALUES(
    ${sqlString(postId)},${sqlString(post.title)},${sqlString(post.headline)},${sqlString(post.copy)},${sqlString(post.category||'日常節奏')},${jsonString(platforms)},${sqlString(status)},NULL,NULL,NULL,NULL,NULL,
    ${sqlString(imageUrl)},${sqlString(imageAlt)},${sqlString(finalSource)},0,0,0,0,'unknown',${sqlString(SEED_CREATED_BY)},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
  )
  ON CONFLICT(id) DO UPDATE SET
    title=excluded.title,headline=excluded.headline,copy=excluded.copy,category=excluded.category,platforms_json=excluded.platforms_json,
    status=excluded.status,scheduled_at=NULL,proposed_scheduled_at=NULL,approved_by=NULL,approved_at=NULL,published_at=NULL,
    image_url=excluded.image_url,image_alt=excluded.image_alt,image_source=excluded.image_source,image_approved=0,
    image_width=excluded.image_width,image_height=excluded.image_height,image_bytes=excluded.image_bytes,image_quality_status=excluded.image_quality_status,updated_at=CURRENT_TIMESTAMP
  WHERE social_posts.status IN ('draft','pending_review');`);
  statements.push(`INSERT OR IGNORE INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip)
    VALUES(${sqlString(auditId)},'github-actions-social-batch','社群批次圖文完整檢查同步','貼文',${sqlString(postId)},NULL,${sqlString(JSON.stringify({batch:batchVersion,file,status,image_ready:status==='pending_review'&&!!imageUrl,review_reason:reviewReason,image_audit:imageAudit.version||''}))},'');`);
}

statements.push(`SELECT status,COUNT(*) AS count FROM social_posts WHERE id LIKE 'XJW-SOCIAL-%' GROUP BY status ORDER BY status;`);
process.stdout.write(statements.join('\n\n')+'\n');
const pending=rows.filter(row=>row.status==='pending_review').length,draft=rows.length-pending;
console.error(`PASS: ${files.length} 個社群批次共 ${rows.length} 篇完成圖文完整檢查；${pending} 篇有匹配圖片進待審核，${draft} 篇重複／不符／顯示不完整圖片已退回草稿，不自動核准、不排程、不發布。`);
