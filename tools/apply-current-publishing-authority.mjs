import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const write=(path,value)=>fs.writeFileSync(path,value,'utf8');
const replaceRequired=(source,from,to,label)=>{
  if(source.includes(to))return source;
  if(!source.includes(from))throw new Error(`找不到必要修改點：${label}`);
  return source.replace(from,to);
};

function updateContentBank(){
  const path='assets/data/guilu-content-topic-bank-v20260814.json';
  const bank=JSON.parse(read(path));
  bank.version='2026-08-15-guilu-publishing-v3-current-product-authority';
  bank.rules=bank.rules||{};
  bank.rules.imagePriority='符合文案的目前正式素材優先；official_product 一律使用 customer-display 正式顧客產品圖，products-v3 只作實物身份與比例校正；沒有合格情境圖才重新生成。正式產品本體不得AI重畫、裁切、拉伸或改比例。';
  bank.rules.pendingReviewRule='只有文案與圖片都完整、且圖片來源可確認時才進待審核；既有 draft／pending_review 可同步最新正式文案與媒體，已核准、已排程或已發布內容不自動覆寫；所有貼文仍需人工16項圖文審核後才能核准。';
  const media={
    'guilu-gao':'https://ts15825868.github.io/xianjiawei/images/customer-display-v20260812/guilu-gao.avif?v=20260814-product-modal-media-v3',
    'guilu-drink-30':'https://ts15825868.github.io/xianjiawei/images/customer-display-v20260812/guilu-drink-30cc.avif?v=20260814-product-modal-media-v3',
    'guilu-drink-180':'https://ts15825868.github.io/xianjiawei/images/customer-display-v20260812/guilu-drink-180cc-product.jpg?v=20260814-product-modal-media-v3',
    'guilu-tangkuai':'https://ts15825868.github.io/xianjiawei/images/customer-display-v20260812/guilu-tangkuai.avif?v=20260814-product-modal-media-v3',
    'guilu-jiao':'https://ts15825868.github.io/xianjiawei/images/customer-display-v20260812/guilu-jiao.avif?v=20260814-product-modal-media-v3',
    'luerong-fen':'https://ts15825868.github.io/xianjiawei/images/customer-display-v20260812/luerong-fen.avif?v=20260814-product-modal-media-v3',
  };
  const normalize=(value)=>{
    if(typeof value!=='string')return value;
    return value
      .replaceAll('75g／盒、8塊裝','75g （2兩）／盒｜8塊裝')
      .replaceAll('75g／盒｜8塊裝','75g （2兩）／盒｜8塊裝')
      .replaceAll('75g／盒','75g （2兩）／盒')
      .replaceAll('600g（1斤）／盒、32塊裝','600g （1斤）／盒｜32塊裝')
      .replaceAll('600g（1斤）／盒｜32塊裝','600g （1斤）／盒｜32塊裝')
      .replaceAll('600g（1斤）大盒、32塊裝','600g （1斤）／盒｜32塊裝')
      .replaceAll('600g（1斤）','600g （1斤）')
      .replaceAll('每塊約18.75g','每塊約18.75 g');
  };
  const byId=new Map((bank.topics||[]).map((topic)=>[topic.id,topic]));
  for(const topic of bank.topics||[]){
    for(const key of ['title','headline','copy','category','imageAlt','imageSource'])if(key in topic)topic[key]=normalize(topic[key]);
    if(topic.imageMode==='official_product'){
      const ids=(topic.productIds||[]).filter(Boolean);
      if(ids.length===1&&media[ids[0]]){
        topic.imageUrl=media[ids[0]];
        topic.imageSource=`仙加味目前正式顧客產品圖:${ids[0]}`;
      }
    }
  }
  const slogan='\n\n仙加味｜補養，是一種節奏。';
  const setCopy=(id,copy)=>{const topic=byId.get(id);if(topic)topic.copy=copy;};
  setCopy('guilu-forms','想方便即飲，可以比較龜鹿飲；喜歡小匙取用或用溫熱水化開，可以了解龜鹿膏；喜歡熱湯與家常料理，可以從龜鹿湯塊或龜鹿膠開始。先看產品型態與生活情境，再比較規格會更容易。'+slogan);
  setCopy('soup-block-vs-jiao','龜鹿湯塊是75g （2兩）／盒｜8塊裝，每塊約9.375g；龜鹿膠是600g （1斤）／盒｜32塊裝，每塊約18.75 g。兩者都能從溫熱料理情境理解，差別先看盒裝規格、每次取用與家庭使用方式。'+slogan);
  setCopy('gao-routine','龜鹿膏食用時間可依個人使用習慣與作息時間安排；初次可先從半匙開始。可以直接取用，也可以用約100～300mL溫熱水化開。'+slogan);
  setCopy('gao-first-half','龜鹿膏初次可以先從半匙開始；後續食用時間可依個人使用習慣與作息時間安排。這一篇只整理產品取用方式與日常安排。'+slogan);
  setCopy('tangkuai-75g','龜鹿湯塊正式規格為75g （2兩）／盒｜8塊裝，每塊約9.375g。把總重量、盒裝數量與每塊約重一起看，會更容易理解實際規格，也不會和舊的300g或600g資料混在一起。'+slogan);
  setCopy('tangkuai-hot-water','龜鹿湯塊除了料理，也可以依正式使用方式搭配熱水或保溫壺。不同情境都維持同一個正式規格：75g （2兩）／盒｜8塊裝，每塊約9.375g。'+slogan);
  setCopy('tangkuai-detail-weight','龜鹿湯塊規格為75g （2兩）／盒｜8塊裝，每塊約9.375g。把總重量、塊數與單塊約重一起看，可以更清楚理解每次取用的份量。'+slogan);
  setCopy('jiao-600g','龜鹿膠正式規格為600g （1斤）／盒｜32塊裝，每塊約18.75 g。產品本體維持淡紫色正式盒裝，不與龜鹿湯塊混用。'+slogan);
  setCopy('jiao-family','龜鹿膠是600g （1斤）／盒｜32塊裝，每塊約18.75 g。可以從家庭料理、分塊取用與固定備用的角度理解，先看包裝與使用方式，不把大盒產品誤畫成75g龜鹿湯塊。'+slogan);
  setCopy('jiao-detail-weight','龜鹿膠規格為600g （1斤）／盒｜32塊裝，每塊約18.75 g。把總重量、塊數與單塊約重一起看，可以更清楚理解家庭使用與分塊取用。'+slogan);
  if(byId.has('gao-routine'))byId.get('gao-routine').headline='依自己的使用習慣與作息安排，更容易維持日常節奏';
  if(byId.has('tangkuai-75g'))byId.get('tangkuai-75g').title='龜鹿湯塊75g （2兩）／盒，8塊裝代表什麼？';
  if(byId.has('tangkuai-detail-weight')){
    byId.get('tangkuai-detail-weight').title='龜鹿湯塊每塊約9.375g，怎麼看這個數字？';
    byId.get('tangkuai-detail-weight').headline='75g （2兩）／盒、8塊裝，換算每塊約9.375g';
  }
  if(byId.has('jiao-600g'))byId.get('jiao-600g').title='龜鹿膠600g （1斤）／盒，怎麼看這個規格？';
  if(byId.has('jiao-detail-weight')){
    byId.get('jiao-detail-weight').title='龜鹿膠每塊約18.75 g，怎麼看這個數字？';
    byId.get('jiao-detail-weight').headline='600g （1斤）／盒、32塊裝，換算每塊約18.75 g';
  }
  write(path,JSON.stringify(bank)+'\n');
}

function updateSeedTool(){
  const path='tools/build-guilu-review-seed.mjs';
  let source=read(path);
  if(!source.includes('XJW_CONTENT_SEED_CREATED_BY')){
    source=replaceRequired(source,"const REQUIRED_IMAGE_PREFIX = `${SITE}/images/`;","const REQUIRED_IMAGE_PREFIX = `${SITE}/images/`;\nconst SEED_CREATED_BY = process.env.XJW_CONTENT_SEED_CREATED_BY || 'tung314069@gmail.com';",'seed created_by');
  }
  source=source.replaceAll('statements.push(`INSERT OR IGNORE INTO social_posts(','statements.push(`INSERT INTO social_posts(');
  const oldEnd="    'github-actions-content-bank',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP\n  );`);";
  const newEnd="    ${sqlString(SEED_CREATED_BY)},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP\n  )\n  ON CONFLICT(id) DO UPDATE SET\n    title=excluded.title,headline=excluded.headline,copy=excluded.copy,category=excluded.category,platforms_json=excluded.platforms_json,\n    status='pending_review',scheduled_at=NULL,proposed_scheduled_at=NULL,approved_by=NULL,approved_at=NULL,published_at=NULL,\n    image_url=excluded.image_url,image_alt=excluded.image_alt,image_source=excluded.image_source,image_approved=0,\n    image_width=excluded.image_width,image_height=excluded.image_height,image_bytes=excluded.image_bytes,image_quality_status=excluded.image_quality_status,\n    updated_at=CURRENT_TIMESTAMP\n  WHERE social_posts.status IN ('draft','pending_review');`);";
  source=replaceRequired(source,oldEnd,newEnd,'seed safe upsert');
  write(path,source);
}

function updateReviewGate(){
  const path='src/publishing-review-gate-entry.js';
  let source=read(path);
  source=source.replaceAll('2026-08-14-publishing-review-gate-v4-draft-pending-approved','2026-08-15-publishing-review-gate-v5-current-product-authority');
  source=source.replaceAll("if(/每塊約?\\s*9\\.375\\s*g/i.test(segment))errors.push('龜鹿湯塊每塊約9.375g只留產品詳細／內部資料，不放貼文主規格')",'');
  source=source.replaceAll("if(/每塊約?\\s*18\\.75\\s*g/i.test(segment))errors.push('龜鹿膠每塊約18.75 g只留產品詳細／內部資料，不放貼文主規格')",'');
  source=source.replaceAll('/(一天一次一小匙|每日一次一小匙|早晚各一小匙)/','/(一天一次一小匙|每日一次一小匙|早晚各一小匙|每日早上及下午各一小匙)/');
  source=source.replaceAll('龜鹿膏目前正式使用方式為每日早上及下午各一小匙','龜鹿膏不設定固定早上／下午時段；食用時間可依個人使用習慣與作息時間安排');
  write(path,source);
}

function updateWorker(){
  const path='src/worker.js';
  let source=read(path);
  if(!source.includes("from './social-post-schema-migration.js'")){
    source="import { ensureSocialPostStatusSchema } from './social-post-schema-migration.js';\n"+source;
  }
  source=source.replaceAll("status TEXT NOT NULL DEFAULT 'draft',scheduled_at TEXT","status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_review','approved','scheduled','published','manual_required','failed','archived')),scheduled_at TEXT");
  const oldCols="[\"proposed_scheduled_at TEXT\",\"image_alt TEXT NOT NULL DEFAULT ''\",\"image_source TEXT NOT NULL DEFAULT '官方素材'\",\"image_approved INTEGER NOT NULL DEFAULT 0\",\"image_width INTEGER NOT NULL DEFAULT 0\",\"image_height INTEGER NOT NULL DEFAULT 0\",\"image_bytes INTEGER NOT NULL DEFAULT 0\",\"image_quality_status TEXT NOT NULL DEFAULT 'unknown'\",\"approved_by TEXT\",\"approved_at TEXT\",\"published_at TEXT\"]";
  const newCols="[\"proposed_scheduled_at TEXT\",\"image_alt TEXT NOT NULL DEFAULT ''\",\"image_source TEXT NOT NULL DEFAULT '官方素材'\",\"image_approved INTEGER NOT NULL DEFAULT 0\",\"image_width INTEGER NOT NULL DEFAULT 0\",\"image_height INTEGER NOT NULL DEFAULT 0\",\"image_bytes INTEGER NOT NULL DEFAULT 0\",\"image_quality_status TEXT NOT NULL DEFAULT 'unknown'\",\"approved_by TEXT\",\"approved_at TEXT\",\"published_at TEXT\",\"media_id TEXT\",\"review_note TEXT NOT NULL DEFAULT ''\",\"brand_check_json TEXT NOT NULL DEFAULT '{}'\",\"rejection_reason TEXT NOT NULL DEFAULT ''\"]";
  if(source.includes(oldCols))source=source.replace(oldCols,newCols);
  if(!source.includes('await ensureSocialPostStatusSchema(env);')){
    const re=/(for\(const definition of \["attempt_count INTEGER NOT NULL DEFAULT 0"[\s\S]*?\]\)\{await addColumn\(env,'social_publish_deliveries',definition\);\})/;
    if(!re.test(source))throw new Error('找不到 worker schema migration call 插入點');
    source=source.replace(re,"$1\n    await ensureSocialPostStatusSchema(env);");
  }
  write(path,source);
}

function updatePackage(){
  const path='package.json';
  const pkg=JSON.parse(read(path));
  const validator='node tools/validate-social-post-status-schema.mjs';
  if(!pkg.scripts['guard:full'].includes(validator))pkg.scripts['guard:full']=`${validator} && ${pkg.scripts['guard:full']}`;
  if(!pkg.scripts.check.includes('src/social-post-schema-migration.js'))pkg.scripts.check=pkg.scripts.check.replace('node --check src/worker.js', 'node --check src/social-post-schema-migration.js && node --check src/worker.js');
  write(path,JSON.stringify(pkg,null,2)+'\n');
}

updateContentBank();
updateSeedTool();
updateReviewGate();
updateWorker();
updatePackage();
console.log('PASS：目前正式貼文權威修補已套用到工作樹。');
