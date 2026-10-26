import app from './authority-entry.js';
import { publishPostById, publisherConfiguration } from './social-publisher.js';
import { validatePostPayload } from './product-authority.js';

const FLEX_VERSION='2026-10-26-v7-line-5minute-keepwarm';
const LINE_HEALTH_URL='https://ts-line.onrender.com/healthz';
const HEADERS={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store',
  'x-content-type-options':'nosniff',
  'x-xianjiawei-flex-publish':FLEX_VERSION
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
    // A status-only legacy entry without a platform-issued remote ID is
    // unresolved, not evidence that customers saw a published post.
    published_platforms:platforms.filter((item)=>item.status==='published'&&clean(item.remote_id)).map((item)=>item.platform),
    manual_required_platforms:platforms.filter((item)=>
      item.status==='manual_required'||(item.status==='published'&&!clean(item.remote_id))).map((item)=>item.platform),
    unresolved_platforms:platforms.filter((item)=>
      !['published','manual_required'].includes(item.status)).map((item)=>item.platform)
  });
}
// The former markManualDelivery/completeManualDeliveries helpers could
// overwrite earlier remote receipts or manufacture a published status without
// an official platform receipt. The canonical social-publisher now owns all
// D1 per-platform delivery mutations and atomic claim/retry safety.
async function audit(env,request,profile,id,before,after,action='彈性立即發布'){
  try{
    await env.DB.prepare('INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) VALUES(?,?,?,?,?,?,?,?)')
      .bind(`AUD-${crypto.randomUUID()}`,profile?.email||'',action,'貼文',id,JSON.stringify(before||{}),JSON.stringify(after||{}),request.headers.get('cf-connecting-ip')||'').run();
  }catch(error){console.warn('flex publish audit failed',clean(error?.message||error));}
}
function platformReady(configuration,platform){
  return configuration?.platforms?.[platform]?.ready===true;
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
  if(next==='published')return json({error:'禁止沒有正式平台遠端 ID 的人工補登。請先在平台後台核對並保留官方貼文網址／回執；此入口不會假裝發送成功。'},409);
  if(next!=='draft')return json({error:'目前只允許安全退回草稿；人工已發布需走獨立官方回執核對流程'},400);
  const now=new Date().toISOString();
  // A partially sent or ambiguous attempt must not be re-opened as a new
  // draft. That can create a second identical publication even if the first
  // remote platform accepted the message before the connection failed.
  const deliveries=await deliveryRows(env,id);
  const anyRemoteEvidence=before.published_at||deliveries.some(d=>
    ['sending','retry','published'].includes(d.status)||
    Number(d.attempt_count||0)>0||d.last_attempt_at||
    d.published_at||clean(d.remote_id));
  if(anyRemoteEvidence)
    return json({error:'此篇已有發送紀錄或發送結果不明，不能退回草稿造成重複發布。請先人工核對平台官方回執。'},409);
  const changed=await env.DB.prepare(`UPDATE social_posts SET
    status='draft',scheduled_at=NULL,approved_by=NULL,approved_at=NULL,
    image_approved=0,updated_at=? WHERE id=? AND status='manual_required'
    AND published_at IS NULL AND NOT EXISTS (
      SELECT 1 FROM social_publish_deliveries d WHERE d.post_id=social_posts.id
      AND (d.status IN ('sending','retry','published')
        OR COALESCE(d.attempt_count,0)>0 OR d.last_attempt_at IS NOT NULL
        OR d.published_at IS NOT NULL
        OR (d.remote_id IS NOT NULL AND TRIM(d.remote_id)<>'')))`)
    .bind(now,id).run();
  if(changed?.success!==true||Number(changed?.meta?.changes)!==1)
    return json({error:'貼文或平台發送狀態已變更；未退回草稿，請重新核對'},409);
  const after=await getPostRow(env,id);
  const confirmed=await deliveryRows(env,id);
  await audit(env,request,profile,id,before,{post:after,deliveries:confirmed},'待人工核對退回草稿');
  return json({...after,manual_deliveries_completed:0,deliveries:confirmed});
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
  if(!publishableImageUrl(before.image_url))return json({error:'正式發布圖片必須是已審核的 JPG、PNG 或 WebP；SVG／候選圖請先在貼文審核發佈系統轉成正式發布圖，或上傳 JPG、PNG、WebP。'},409);

  const originalPlatforms=parsePlatforms(before.platforms_json);
  if(!originalPlatforms.length)return json({error:'尚未指定發布平台'},409);

  // ONE production sender: the same approved post/platform pair must be
  // atomically reserved in D1 by social-publisher before any external POST.
  // Never overwrite platforms_json to a "ready" subset. An overlapping
  // one-minute cron or instant-publish request could otherwise publish the
  // wrong partial audience or duplicate a platform delivery.
  const result=await publishPostById(env,id,new Date());
  const after=await getPostRow(env,id);
  const deliveries=await deliveryRows(env,id);
  const automaticPlatforms=(result?.results||[])
    .filter(item=>item.ok===true||(item.skipped===true&&item.reason==='published'))
    .map(item=>item.platform);
  const manualPlatforms=(result?.results||[])
    .filter(item=>item.manual_required===true)
    .map(item=>item.platform);
  await audit(env,request,profile,id,before,
    {post:after,result,deliveries,automatic_platforms:automaticPlatforms,manual_platforms:manualPlatforms});
  if(!result?.ok){
    const manual=Boolean(result?.manual_required||manualPlatforms.length);
    return json({
      ok:false,id,status:after?.status||before.status,
      error:manual
        ?'有平台需要人工查核正式發送回執。結果不明時不能重發，也不能直接補登已發布。'
        :result?.blocked
        ?'正式發布守門阻止本次對外發送；請先確認圖文審核及完整平台設定。'
        :'各平台發布未全部完成；只允許原發布器依經驗證的重試規則處理，請查看逐平台紀錄。',
      automatic_platforms:automaticPlatforms,
      manual_platforms:manualPlatforms,
      manual_required:manual,
      deliveries,result
    },manual?409:502);
  }
  return json({
    ok:true,partially_published:false,automatic_published:true,manual_required:false,
    id,status:after?.status||'published',
    automatic_platforms:automaticPlatforms,manual_platforms:[],
    deliveries,message:'已取得全部指定平台可採信的正式發布回執。',result
  });
}

async function keepLineWarm(){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),15000);
  try{
    const response=await fetch(LINE_HEALTH_URL,{
      signal:ctl.signal,
      headers:{'user-agent':'xianjiawei-publishing-keepwarm/2.0','cache-control':'no-cache'},
      cf:{cacheTtl:0}
    });
    if(!response.ok)console.warn('仙加味 LINE 健康檢查未通過',response.status);
    return response.ok;
  }catch{
    console.warn('仙加味 LINE 健康檢查無法連線或已逾時');
    return false;
  }finally{clearTimeout(timer)}
}

async function currentHealth(request,env,ctx){
  const response=await app.fetch(request,env,ctx);
  const text=await response.text();
  let payload={};
  try{payload=text?JSON.parse(text):{};}catch{return new Response(text,{status:response.status,headers:response.headers});}
  return json({
    ...payload,
    runtimeEntry:'src/flexible-publish-entry.js',
    flexiblePublishingVersion:FLEX_VERSION,
    fixedPostingFrequency:'每週 3 篇（週一／週三／週五 09:00，Asia/Taipei）',
    immediatePublishingBypassesFixedSchedule:true,
    unreadyPlatformFallsBackToManual:true,
    manualDeliveryReconciliation:true,
    manualCompletionRequiresOfficialReceipt:true,
    oldStatusOnlyManualCompletionDisabled:true,
    blindRetryAfterImmediateFailure:false,
    lineRenderFreeKeepWarm:true,
    lineKeepWarmIntervalMinutes:5,
    freeRenderSharedHoursStillCount:true,
    lineHealthUrl:LINE_HEALTH_URL,
    uiRuntime:'20260808-canonical-facts-12'
  },response.status);
}

export default{
  async fetch(request,env,ctx){
    const path=new URL(request.url).pathname;
    if(request.method==='GET'&&path==='/healthz'){
      try{return await currentHealth(request,env,ctx);}
      catch(error){return json({ok:false,error:clean(error?.message||error)||'健康檢查失敗',flexiblePublishingVersion:FLEX_VERSION},500);}
    }
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
    // Production-entry owns the one LINE keep-warm for this call chain.
    // This wrapper must not issue a duplicate outbound request each minute.
    if(typeof app.scheduled==='function')return app.scheduled(controller,env,ctx);
  }
};

export { flexiblePublishNow, changeManualRequiredStatus, deliveryState, platformReady, publishableImageUrl, currentHealth, keepLineWarm };