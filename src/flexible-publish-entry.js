import app from './authority-entry.js';
import { publishPostById, publisherConfiguration } from './social-publisher.js';
import { validatePostPayload } from './product-authority.js';

const HEADERS={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store',
  'x-content-type-options':'nosniff',
  'x-xianjiawei-flex-publish':'2026-08-08-v4-delivery-state'
};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});
const clean=(value)=>String(value??'').trim();

async function authorize(request,env,ctx){
  const url=new URL('/api/me',request.url);
  return app.fetch(new Request(url,{method:'GET',headers:request.headers}),env,ctx);
}
async function readJsonClone(request){
  try{return await request.clone().json();}catch{return null;}
}
function parsePlatforms(value){
  try{const parsed=JSON.parse(value||'[]');return Array.isArray(parsed)?parsed.map(clean).filter(Boolean):[];}catch{return[];}
}
function publishableImageUrl(value){
  const url=clean(value);
  if(!/^https:\/\//i.test(url))return false;
  if(/\.svg(?:[?#]|$)/i.test(url))return false;
  if(/\/media\/IMG-[A-Za-z0-9-]+(?:[?#]|$)/i.test(url))return true;
  return /\.(?:jpe?g|png|webp)(?:[?#]|$)/i.test(url);
}
async function getPostRow(env,id){
  if(!env?.DB)return null;
  return env.DB.prepare('SELECT * FROM social_posts WHERE id=? LIMIT 1').bind(id).first();
}
async function deliveryRows(env,id){
  if(!env?.DB)return[];
  const result=await env.DB.prepare('SELECT platform,status,attempt_count,last_attempt_at,published_at,remote_id,error_text,updated_at FROM social_publish_deliveries WHERE post_id=? ORDER BY platform').bind(id).all();
  return result.results||[];
}
async function deliveryState(request,env,ctx,id){
  const authorization=await authorize(request,env,ctx);
  if(!authorization.ok)return authorization;
  const post=await getPostRow(env,id);
  if(!post)return json({error:'找不到貼文'},404);
  const deliveries=await deliveryRows(env,id);
  const configured=parsePlatforms(post.platforms_json);
  const byPlatform=new Map(deliveries.map((item)=>[item.platform,item]));
  const platforms=configured.map((platform)=>byPlatform.get(platform)||{platform,status:'pending',attempt_count:0,last_attempt_at:null,published_at:null,remote_id:'',error_text:'',updated_at:null});
  return json({
    id,
    post_status:post.status,
    platforms,
    published_platforms:platforms.filter((item)=>item.status==='published').map((item)=>item.platform),
    manual_required_platforms:platforms.filter((item)=>item.status==='manual_required').map((item)=>item.platform),
    unresolved_platforms:platforms.filter((item)=>!['published','manual_required'].includes(item.status)).map((item)=>item.platform)
  });
}
async function markManualDelivery(env,id,platform,reason){
  const now=new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO social_publish_deliveries(post_id,platform,status,attempt_count,last_attempt_at,published_at,remote_id,response_json,error_text,created_at,updated_at)
    VALUES(?,?,'manual_required',0,NULL,NULL,'','',?,?,?)
    ON CONFLICT(post_id,platform) DO UPDATE SET
      status='manual_required',
      error_text=excluded.error_text,
      updated_at=excluded.updated_at
  `).bind(id,platform,reason,now,now).run();
}
async function audit(env,request,profile,id,before,after,action='彈性立即發布'){
  try{
    await env.DB.prepare('INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) VALUES(?,?,?,?,?,?,?,?)')
      .bind(`AUD-${crypto.randomUUID()}`,profile?.email||'',action,'貼文',id,JSON.stringify(before||{}),JSON.stringify(after||{}),request.headers.get('cf-connecting-ip')||'').run();
  }catch(error){console.warn('flex publish audit failed',clean(error?.message||error));}
}
function platformReady(configuration,platform){
  return configuration?.platforms?.[platform]?.ready===true;
}
async function setManualRequired(env,id){
  const now=new Date().toISOString();
  await env.DB.prepare("UPDATE social_posts SET status='manual_required',scheduled_at=NULL,published_at=NULL,updated_at=? WHERE id=?").bind(now,id).run();
}

async function changeManualRequiredStatus(request,env,ctx,id){
  const before=await getPostRow(env,id);
  if(!before||before.status!=='manual_required')return null;
  const authorization=await authorize(request,env,ctx);
  if(!authorization.ok)return authorization;
  const profile=await authorization.json();
  if(!['owner','admin','content'].includes(profile?.role))return json({error:'沒有修改貼文狀態權限'},403);
  const body=await readJsonClone(request);
  const next=clean(body?.status);
  if(!['published','draft'].includes(next))return json({error:'需人工發布的貼文只能補登為已發布，或退回草稿'},400);
  const now=new Date().toISOString();
  if(next==='published'){
    await env.DB.prepare("UPDATE social_posts SET status='published',published_at=?,scheduled_at=NULL,updated_at=? WHERE id=?").bind(now,now,id).run();
  }else{
    await env.DB.prepare("UPDATE social_posts SET status='draft',scheduled_at=NULL,published_at=NULL,approved_by=NULL,approved_at=NULL,image_approved=0,updated_at=? WHERE id=?").bind(now,id).run();
  }
  const after=await getPostRow(env,id);
  await audit(env,request,profile,id,before,after,next==='published'?'手動補登已發布':'人工發布退回草稿');
  return json(after);
}

async function flexiblePublishNow(request,env,ctx,id){
  const authorization=await authorize(request,env,ctx);
  if(!authorization.ok)return authorization;
  const profile=await authorization.json();
  if(!['owner','admin','content'].includes(profile?.role))return json({error:'沒有發布貼文權限'},403);

  const before=await getPostRow(env,id);
  if(!before)return json({error:'找不到貼文'},404);
  if(!['approved','scheduled'].includes(before.status))return json({error:'貼文必須先審核通過，才能立即發布'},409);

  const authorityErrors=validatePostPayload(before);
  if(authorityErrors.length)return json({error:'貼文仍含不符合正式產品母本的內容，不能發布',details:authorityErrors},409);

  if(!before.image_url||Number(before.image_approved||0)!==1)return json({error:'貼文圖片尚未完成審核，不能立即發布'},409);
  if(!publishableImageUrl(before.image_url))return json({error:'正式發布圖片必須是已審核的 JPG、PNG 或 WebP；SVG／候選圖請先在 ERP 轉成發布圖'},409);

  const originalPlatforms=parsePlatforms(before.platforms_json);
  if(!originalPlatforms.length)return json({error:'尚未指定發布平台'},409);
  const configuration=publisherConfiguration(env);
  const automaticPlatforms=originalPlatforms.filter((platform)=>platformReady(configuration,platform));
  const manualPlatforms=originalPlatforms.filter((platform)=>!automaticPlatforms.includes(platform));
  const reason='此平台尚未完成官方自動發布授權，或目前採人工發布流程；請使用ERP手動發布包，完成後補登已發布。';

  for(const platform of manualPlatforms)await markManualDelivery(env,id,platform,reason);

  if(!automaticPlatforms.length){
    await setManualRequired(env,id);
    const after=await getPostRow(env,id);
    const deliveries=await deliveryRows(env,id);
    await audit(env,request,profile,id,before,{post:after,deliveries,manual_platforms:manualPlatforms});
    return json({
      ok:true,
      partially_published:false,
      automatic_published:false,
      manual_required:true,
      id,
      status:'manual_required',
      manual_platforms:manualPlatforms,
      message:`目前沒有可自動發布的平台；已轉為人工發布：${manualPlatforms.join('、')}。請使用「手動發布包」，完成後補登已發布。`,
      publisher:configuration
    });
  }

  const now=new Date().toISOString();
  await env.DB.prepare("UPDATE social_posts SET platforms_json=?,status='scheduled',scheduled_at=?,updated_at=? WHERE id=?")
    .bind(JSON.stringify(automaticPlatforms),now,now,id).run();

  let result;
  try{
    result=await publishPostById(env,id,new Date());
  }finally{
    await env.DB.prepare('UPDATE social_posts SET platforms_json=?,updated_at=? WHERE id=?')
      .bind(JSON.stringify(originalPlatforms),new Date().toISOString(),id).run();
  }

  if(result?.ok&&manualPlatforms.length)await setManualRequired(env,id);
  const after=await getPostRow(env,id);
  const deliveries=await deliveryRows(env,id);
  await audit(env,request,profile,id,before,{post:after,result,deliveries,automatic_platforms:automaticPlatforms,manual_platforms:manualPlatforms});

  if(!result?.ok){
    return json({
      error:'可自動發布的平台未全部完成；系統不會盲目重複補發。請先查看發布結果，再人工處理失敗平台。',
      id,
      automatic_platforms:automaticPlatforms,
      manual_platforms:manualPlatforms,
      manual_required:manualPlatforms.length>0,
      deliveries,
      result
    },502);
  }

  return json({
    ok:true,
    partially_published:manualPlatforms.length>0,
    automatic_published:true,
    manual_required:manualPlatforms.length>0,
    id,
    status:after?.status||(manualPlatforms.length?'manual_required':'published'),
    automatic_platforms:automaticPlatforms,
    manual_platforms:manualPlatforms,
    deliveries,
    message:manualPlatforms.length
      ? `已完成可自動發布平台：${automaticPlatforms.join('、')}；仍需人工發布：${manualPlatforms.join('、')}。`
      : `立即發布完成：${automaticPlatforms.join('、')}。`,
    result
  });
}

export default{
  async fetch(request,env,ctx){
    const path=new URL(request.url).pathname;
    const publishMatch=path.match(/^\/api\/posts\/([^/]+)\/publish-now$/);
    if(request.method==='POST'&&publishMatch){
      try{return await flexiblePublishNow(request,env,ctx,decodeURIComponent(publishMatch[1]));}
      catch(error){return json({error:clean(error?.message||error)||'立即發布失敗'},500);}
    }
    const deliveryMatch=path.match(/^\/api\/posts\/([^/]+)\/deliveries$/);
    if(request.method==='GET'&&deliveryMatch){
      try{return await deliveryState(request,env,ctx,decodeURIComponent(deliveryMatch[1]));}
      catch(error){return json({error:clean(error?.message||error)||'發布狀態讀取失敗'},500);}
    }
    const statusMatch=path.match(/^\/api\/posts\/([^/]+)\/status$/);
    if(request.method==='POST'&&statusMatch){
      try{
        const handled=await changeManualRequiredStatus(request,env,ctx,decodeURIComponent(statusMatch[1]));
        if(handled)return handled;
      }catch(error){return json({error:clean(error?.message||error)||'狀態更新失敗'},500);}
    }
    return app.fetch(request,env,ctx);
  },
  async scheduled(controller,env,ctx){
    if(typeof app.scheduled==='function')return app.scheduled(controller,env,ctx);
  }
};

export { flexiblePublishNow, changeManualRequiredStatus, deliveryState, platformReady, publishableImageUrl };