const FIRST_POST_ID='XJW-SOCIAL-20260904-0900-FIRST';
const FIRST_POST_SCHEDULED_AT='2026-09-04T01:00:00.000Z';
const FIRST_POST_IMAGE_URL='https://ts15825868.github.io/xianjiawei/images/posts/formal-v20260904/first-post-work-rest-qmascot.webp';
const FIRST_POST={
  id:FIRST_POST_ID,
  title:'週五早上，先把今天想問的整理好',
  headline:'週五早上，先把今天想問的整理好',
  copy:'週五早上，把今天想問仙加味的事先記在手機裡。出門前或早上有空時，再從 LINE 找我們慢慢聊；從不同產品型態、攜帶方式到日常安排，都可以依自己的生活節奏慢慢確認。補養，是一種節奏。',
  category:'生活情境',
  platforms:['Facebook','Instagram'],
  scheduled_at:FIRST_POST_SCHEDULED_AT,
  image_url:FIRST_POST_IMAGE_URL,
  image_alt:'仙加味Q版小男生小老闆與分開的Q版小鹿、Q版小烏龜，在早晨店內一起看手機準備LINE諮詢',
  image_source:'使用者人工指定｜identity-approved｜2026-09-04正式Q版小男生完整單一情境圖',
  image_width:1122,
  image_height:1402,
  image_bytes:317077,
  image_quality_status:'clear'
};
const INVALID_UNPUBLISHED_IDS=Object.freeze([
  'XJW-GUILU-drink30-work-break',
  'XJW-GUILU-drink180-home',
  'XJW-GUILU-gao-storage',
  'XJW-GUILU-tangkuai-soup',
  'XJW-GUILU-jiao-600g',
  'XJW-GUILU-luerong-75g',
  'XJW-SOCIAL-20260815-02-line-consult-and-trial',
  'XJW-GUILU-choose-by-place',
  'XJW-SOCIAL-20260815-03-storage-basics',
  'XJW-SOCIAL-20260815-01-warm-drink-moment',
  'POST-AUDIENCE-NEEDS'
]);
const REVIEW_CHECKLIST=Object.freeze({
  brand:true,
  product:true,
  specification:true,
  pricing_activity:true,
  season:true,
  weather:true,
  occasion:true,
  location:true,
  scene_environment:true,
  temperature:true,
  expression:true,
  action:true,
  mascot_companions:true,
  physical_scale:true,
  duplicate:true,
  compliance_final:true
});
const clean=value=>String(value??'').trim();

async function ensureGateTable(db){
  await db.exec(`CREATE TABLE IF NOT EXISTS social_post_review_gates(
    post_id TEXT PRIMARY KEY,
    content_fingerprint TEXT NOT NULL,
    checklist_json TEXT NOT NULL DEFAULT '{}',
    copy_image_match INTEGER NOT NULL DEFAULT 0,
    reviewed_by TEXT NOT NULL DEFAULT '',
    reviewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`);
}
async function safeDelete(db,sql,id){try{await db.prepare(sql).bind(id).run();}catch{}}
async function deleteInvalidUnpublished(db){
  const removed=[];
  for(const id of INVALID_UNPUBLISHED_IDS){
    const row=await db.prepare('SELECT id,status FROM social_posts WHERE id=? LIMIT 1').bind(id).first();
    if(!row||row.status==='published')continue;
    await safeDelete(db,'DELETE FROM social_post_review_gates WHERE post_id=?',id);
    await safeDelete(db,'DELETE FROM social_publish_deliveries WHERE post_id=?',id);
    await safeDelete(db,'DELETE FROM social_repost_queue WHERE post_id=?',id);
    await db.prepare("DELETE FROM social_posts WHERE id=? AND status<>'published'").bind(id).run();
    removed.push(id);
  }
  return removed;
}
function postMaterial(row){
  return{
    title:clean(row?.title),
    headline:clean(row?.headline),
    copy:clean(row?.copy),
    category:clean(row?.category),
    image_url:clean(row?.image_url),
    image_alt:clean(row?.image_alt),
    image_source:clean(row?.image_source),
    image_width:Number(row?.image_width||0),
    image_height:Number(row?.image_height||0),
    image_quality_status:clean(row?.image_quality_status)
  };
}
async function fingerprint(row){
  const bytes=new TextEncoder().encode(JSON.stringify(postMaterial(row)));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
async function activeReviewer(db){
  return db.prepare("SELECT email,role FROM profiles WHERE active=1 ORDER BY CASE WHEN role='owner' THEN 0 WHEN role='admin' THEN 1 WHEN role='content' THEN 2 ELSE 3 END,email LIMIT 1").first();
}
async function upsertFirstPost(db,reviewer){
  const existing=await db.prepare('SELECT * FROM social_posts WHERE id=? LIMIT 1').bind(FIRST_POST_ID).first();
  if(existing&&existing.status==='published')return existing;
  const now=new Date().toISOString();
  const reviewNote='使用者於對話中確認開始動作；固定Q版小男生小老闆、Q版小鹿與Q版小烏龜，圖文一致後排入2026-09-04 09:00正式首篇。';
  const brandCheck=JSON.stringify({brand:'仙加味',mascot:'Q版小男生',companions:['Q版小鹿','Q版小烏龜'],single_scene:true,product_visual:false,medical_claims:false});
  const platformsJson=JSON.stringify(FIRST_POST.platforms);
  await db.prepare(`INSERT INTO social_posts(
      id,title,headline,copy,category,platforms_json,status,scheduled_at,approved_by,approved_at,published_at,created_by,created_at,updated_at,
      image_url,image_alt,image_source,image_approved,image_width,image_height,image_bytes,image_quality_status,media_id,review_note,brand_check_json,rejection_reason,proposed_scheduled_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title,headline=excluded.headline,copy=excluded.copy,category=excluded.category,platforms_json=excluded.platforms_json,
      status=excluded.status,scheduled_at=excluded.scheduled_at,approved_by=excluded.approved_by,approved_at=excluded.approved_at,published_at=NULL,
      updated_at=excluded.updated_at,image_url=excluded.image_url,image_alt=excluded.image_alt,image_source=excluded.image_source,image_approved=excluded.image_approved,
      image_width=excluded.image_width,image_height=excluded.image_height,image_bytes=excluded.image_bytes,image_quality_status=excluded.image_quality_status,
      media_id=NULL,review_note=excluded.review_note,brand_check_json=excluded.brand_check_json,rejection_reason='',proposed_scheduled_at=excluded.proposed_scheduled_at
    WHERE social_posts.status<>'published'`)
    .bind(
      FIRST_POST.id,FIRST_POST.title,FIRST_POST.headline,FIRST_POST.copy,FIRST_POST.category,platformsJson,'scheduled',FIRST_POST.scheduled_at,
      reviewer.email,now,null,reviewer.email,now,now,FIRST_POST.image_url,FIRST_POST.image_alt,FIRST_POST.image_source,1,FIRST_POST.image_width,FIRST_POST.image_height,
      FIRST_POST.image_bytes,FIRST_POST.image_quality_status,null,reviewNote,brandCheck,'',FIRST_POST.scheduled_at
    ).run();
  const row=await db.prepare('SELECT * FROM social_posts WHERE id=? LIMIT 1').bind(FIRST_POST_ID).first();
  const fp=await fingerprint(row);
  await db.prepare(`INSERT INTO social_post_review_gates(post_id,content_fingerprint,checklist_json,copy_image_match,reviewed_by,reviewed_at)
    VALUES(?,?,?,?,?,?)
    ON CONFLICT(post_id) DO UPDATE SET content_fingerprint=excluded.content_fingerprint,checklist_json=excluded.checklist_json,
      copy_image_match=excluded.copy_image_match,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at`)
    .bind(FIRST_POST_ID,fp,JSON.stringify(REVIEW_CHECKLIST),1,reviewer.email,now).run();
  return db.prepare('SELECT * FROM social_posts WHERE id=? LIMIT 1').bind(FIRST_POST_ID).first();
}

export async function ensureFormalFirstPost(env){
  if(!env?.DB)return{ok:false,error:'D1 資料庫尚未綁定'};
  const db=env.DB;
  try{
    await ensureGateTable(db);
    const reviewer=await activeReviewer(db);
    if(!reviewer?.email)return{ok:false,error:'找不到可用的正式審核帳號'};
    const removed=await deleteInvalidUnpublished(db);
    const post=await upsertFirstPost(db,reviewer);
    const gate=await db.prepare('SELECT content_fingerprint,copy_image_match,reviewed_by,reviewed_at FROM social_post_review_gates WHERE post_id=? LIMIT 1').bind(FIRST_POST_ID).first();
    return{ok:true,removed,post:{id:post?.id||'',title:post?.title||'',headline:post?.headline||'',copy:post?.copy||'',status:post?.status||'',scheduled_at:post?.scheduled_at||'',platforms_json:post?.platforms_json||'[]',image_url:post?.image_url||'',image_alt:post?.image_alt||'',image_source:post?.image_source||'',image_approved:Number(post?.image_approved||0),image_width:Number(post?.image_width||0),image_height:Number(post?.image_height||0),image_bytes:Number(post?.image_bytes||0),image_quality_status:post?.image_quality_status||'',approved_at:post?.approved_at||'',updated_at:post?.updated_at||''},gate:{ready:Boolean(gate&&Number(gate.copy_image_match)===1),reviewed_by:gate?.reviewed_by||'',reviewed_at:gate?.reviewed_at||'',content_fingerprint:gate?.content_fingerprint||''}};
  }catch(error){return{ok:false,error:String(error?.message||error)};}
}

export {FIRST_POST_ID,FIRST_POST_SCHEDULED_AT,FIRST_POST_IMAGE_URL,INVALID_UNPUBLISHED_IDS};
