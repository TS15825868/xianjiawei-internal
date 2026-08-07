const PLATFORM_CONFIG = Object.freeze({
  Facebook:{direct:'facebook',url:'FACEBOOK_PUBLISH_WEBHOOK_URL',token:'FACEBOOK_PUBLISH_WEBHOOK_TOKEN'},
  Instagram:{direct:'instagram',url:'INSTAGRAM_PUBLISH_WEBHOOK_URL',token:'INSTAGRAM_PUBLISH_WEBHOOK_TOKEN'},
  'LINE OA':{direct:'line_oa',url:'LINE_OA_PUBLISH_WEBHOOK_URL',token:'LINE_OA_PUBLISH_WEBHOOK_TOKEN'},
  'LINE OA 廣播':{direct:'line_oa',url:'LINE_OA_PUBLISH_WEBHOOK_URL',token:'LINE_OA_PUBLISH_WEBHOOK_TOKEN'},
  'LINE VOOM':{manual:true,manualReason:'LINE VOOM 目前沒有提供官方帳號建立貼文的公開 API，需在 LINE Official Account Manager 人工發布。'},
  'Google 商家':{direct:'google_business',url:'GOOGLE_BUSINESS_PUBLISH_WEBHOOK_URL',token:'GOOGLE_BUSINESS_PUBLISH_WEBHOOK_TOKEN'}
});
const REQUEST_TIMEOUT_MS=20000;
const MAX_RETRY_ATTEMPTS=8;
const RETRY_DELAYS_MINUTES=[5,15,30,60,180,360,720,1440];
const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
const clean=(value)=>String(value||'').trim();

function parsePlatforms(value){
  try{
    const parsed=Array.isArray(value)?value:JSON.parse(value||'[]');
    return Array.isArray(parsed)?[...new Set(parsed.map(clean).filter((item)=>PLATFORM_CONFIG[item]))]:[];
  }catch{return[];}
}
function postText(post){
  return [post.headline,post.copy].map(clean).filter((value,index,values)=>value&&values.indexOf(value)===index).join('\n\n');
}
function withTimeout(){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort('timeout'),REQUEST_TIMEOUT_MS);
  return {controller,done:()=>clearTimeout(timer)};
}
async function responseResult(response,platform){
  const responseText=(await response.text()).slice(0,8000);
  let responseData=null;
  try{responseData=responseText?JSON.parse(responseText):{};}catch{}
  if(!response.ok){
    return {platform,ok:false,retryable:[408,409,425,429].includes(response.status)||response.status>=500,status:response.status,error:responseData?.error?.message||responseData?.error_description||responseText||response.statusText,response:responseData||responseText};
  }
  return {platform,ok:true,status:response.status,remote_id:responseData?.id||responseData?.post_id||responseData?.name||response.headers.get('x-remote-post-id')||response.headers.get('x-line-request-id')||'',response:responseData||responseText};
}
function graphVersion(env){return clean(env.META_GRAPH_VERSION||'v25.0').replace(/^\/+|\/+$/g,'');}
function directReadiness(env,direct){
  if(direct==='facebook') return Boolean(clean(env.META_PAGE_ID)&&clean(env.META_PAGE_ACCESS_TOKEN));
  if(direct==='instagram') return Boolean(clean(env.META_INSTAGRAM_USER_ID)&&clean(env.META_PAGE_ACCESS_TOKEN));
  if(direct==='line_oa') return Boolean(clean(env.LINE_CHANNEL_ACCESS_TOKEN));
  if(direct==='google_business') return ['GOOGLE_OAUTH_CLIENT_ID','GOOGLE_OAUTH_CLIENT_SECRET','GOOGLE_OAUTH_REFRESH_TOKEN','GOOGLE_BUSINESS_ACCOUNT_ID','GOOGLE_BUSINESS_LOCATION_ID'].every((name)=>Boolean(clean(env[name])));
  return false;
}
function webhookReady(env,config){return Boolean(clean(env[config.url])&&clean(env[config.token]));}
function payloadFor(post,platform){
  return {event:'publish_social_post',idempotency_key:`${post.id}:${platform}`,platform,post:{id:post.id,title:post.title||'',headline:post.headline||'',copy:post.copy||'',category:post.category||'',image_url:post.image_url||'',image_alt:post.image_alt||'',scheduled_at:post.scheduled_at||'',approved_by:post.approved_by||'',approved_at:post.approved_at||''}};
}

async function dispatchFacebook(env,post){
  const platform='Facebook',timeout=withTimeout();
  try{
    const response=await fetch(`https://graph.facebook.com/${graphVersion(env)}/${encodeURIComponent(clean(env.META_PAGE_ID))}/photos`,{method:'POST',signal:timeout.controller.signal,headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({url:clean(post.image_url),caption:postText(post),access_token:clean(env.META_PAGE_ACCESS_TOKEN)})});
    return responseResult(response,platform);
  }catch(error){return{platform,ok:false,retryable:true,error:String(error?.message||error)};}finally{timeout.done();}
}
async function dispatchInstagram(env,post){
  const platform='Instagram',timeout=withTimeout();
  try{
    const base=`https://graph.facebook.com/${graphVersion(env)}/${encodeURIComponent(clean(env.META_INSTAGRAM_USER_ID))}`;
    const token=clean(env.META_PAGE_ACCESS_TOKEN);
    const createResponse=await fetch(`${base}/media`,{method:'POST',signal:timeout.controller.signal,headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({image_url:clean(post.image_url),caption:postText(post),access_token:token})});
    const created=await responseResult(createResponse,platform);
    if(!created.ok) return created;
    const creationId=clean(created.remote_id);
    if(!creationId) return{platform,ok:false,retryable:true,error:'Instagram 未回傳媒體容器 ID'};
    for(let attempt=0;attempt<8;attempt+=1){
      await sleep(attempt===0?1000:1800);
      const statusResponse=await fetch(`https://graph.facebook.com/${graphVersion(env)}/${encodeURIComponent(creationId)}?fields=status_code,status&access_token=${encodeURIComponent(token)}`,{signal:timeout.controller.signal});
      const statusData=await statusResponse.json().catch(()=>({}));
      if(statusData.status_code==='FINISHED') break;
      if(['ERROR','EXPIRED'].includes(statusData.status_code)) return{platform,ok:false,retryable:false,error:statusData.status||`Instagram 容器狀態：${statusData.status_code}`};
      if(attempt===7) return{platform,ok:false,retryable:true,error:'Instagram 圖片處理尚未完成，稍後會自動重試'};
    }
    const publishResponse=await fetch(`${base}/media_publish`,{method:'POST',signal:timeout.controller.signal,headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({creation_id:creationId,access_token:token})});
    return responseResult(publishResponse,platform);
  }catch(error){return{platform,ok:false,retryable:true,error:String(error?.message||error)};}finally{timeout.done();}
}
async function dispatchLineOfficialAccount(env,post,platform){
  const timeout=withTimeout();
  try{
    const messages=[];
    const text=postText(post).slice(0,5000); if(text) messages.push({type:'text',text});
    const image=clean(post.image_url); if(image&&/^https:\/\//i.test(image)) messages.push({type:'image',originalContentUrl:image,previewImageUrl:image});
    if(!messages.length) return{platform,ok:false,retryable:false,error:'LINE OA 貼文沒有可發布內容'};
    const response=await fetch('https://api.line.me/v2/bot/message/broadcast',{method:'POST',signal:timeout.controller.signal,headers:{authorization:`Bearer ${clean(env.LINE_CHANNEL_ACCESS_TOKEN)}`,'content-type':'application/json; charset=utf-8','x-line-retry-key':crypto.randomUUID()},body:JSON.stringify({messages:messages.slice(0,5),notificationDisabled:false})});
    return responseResult(response,platform);
  }catch(error){return{platform,ok:false,retryable:true,error:String(error?.message||error)};}finally{timeout.done();}
}
async function googleAccessToken(env){
  const timeout=withTimeout();
  try{
    const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',signal:timeout.controller.signal,headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clean(env.GOOGLE_OAUTH_CLIENT_ID),client_secret:clean(env.GOOGLE_OAUTH_CLIENT_SECRET),refresh_token:clean(env.GOOGLE_OAUTH_REFRESH_TOKEN),grant_type:'refresh_token'})});
    const text=await response.text(); let data={}; try{data=JSON.parse(text);}catch{}
    if(!response.ok||!data.access_token) return{ok:false,retryable:response.status>=500||response.status===429,error:data.error_description||data.error||text||'Google OAuth 失敗'};
    return{ok:true,token:data.access_token};
  }catch(error){return{ok:false,retryable:true,error:String(error?.message||error)};}finally{timeout.done();}
}
async function dispatchGoogleBusiness(env,post){
  const platform='Google 商家';
  const tokenResult=await googleAccessToken(env); if(!tokenResult.ok) return{platform,...tokenResult};
  const timeout=withTimeout();
  try{
    const accountId=encodeURIComponent(clean(env.GOOGLE_BUSINESS_ACCOUNT_ID));
    const locationId=encodeURIComponent(clean(env.GOOGLE_BUSINESS_LOCATION_ID));
    const body={languageCode:'zh-TW',summary:postText(post).slice(0,1500),topicType:'STANDARD',media:[{mediaFormat:'PHOTO',sourceUrl:clean(post.image_url)}]};
    const response=await fetch(`https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/localPosts`,{method:'POST',signal:timeout.controller.signal,headers:{authorization:`Bearer ${tokenResult.token}`,'content-type':'application/json; charset=utf-8'},body:JSON.stringify(body)});
    return responseResult(response,platform);
  }catch(error){return{platform,ok:false,retryable:true,error:String(error?.message||error)};}finally{timeout.done();}
}
async function dispatchWebhook(env,post,platform,config){
  const timeout=withTimeout();
  try{
    const response=await fetch(clean(env[config.url]),{method:'POST',signal:timeout.controller.signal,headers:{'content-type':'application/json; charset=utf-8',authorization:`Bearer ${clean(env[config.token])}`,'idempotency-key':`${post.id}:${platform}`,'x-xianjiawei-post-id':post.id,'x-xianjiawei-platform':encodeURIComponent(platform)},body:JSON.stringify(payloadFor(post,platform))});
    return responseResult(response,platform);
  }catch(error){return{platform,ok:false,retryable:true,error:String(error?.message||error)};}finally{timeout.done();}
}
async function dispatchPlatform(env,post,platform){
  const config=PLATFORM_CONFIG[platform];
  if(!config) return{platform,ok:false,retryable:false,error:'不支援的發布平台'};
  if(config.manual) return{platform,ok:false,retryable:false,manual_required:true,error:config.manualReason};
  if(config.direct&&directReadiness(env,config.direct)){
    if(config.direct==='facebook') return dispatchFacebook(env,post);
    if(config.direct==='instagram') return dispatchInstagram(env,post);
    if(config.direct==='line_oa') return dispatchLineOfficialAccount(env,post,platform);
    if(config.direct==='google_business') return dispatchGoogleBusiness(env,post);
  }
  if(webhookReady(env,config)) return dispatchWebhook(env,post,platform,config);
  return{platform,ok:false,retryable:false,error:`尚未設定 ${platform} 官方 API 或 Webhook`};
}

function retryDelayMs(attemptCount){const index=Math.min(Math.max(Number(attemptCount||1)-1,0),RETRY_DELAYS_MINUTES.length-1);return RETRY_DELAYS_MINUTES[index]*60000;}
function retryAllowed(prior,now){
  if(!prior) return{allowed:true};
  if(['published','manual_required','permanent_failed'].includes(prior.status)) return{allowed:false,reason:prior.status};
  const attempts=Number(prior.attempt_count||0); if(attempts>=MAX_RETRY_ATTEMPTS) return{allowed:false,reason:'max_attempts'};
  const last=Date.parse(prior.last_attempt_at||''); if(!Number.isFinite(last)) return{allowed:true};
  const next=last+retryDelayMs(attempts); if(now.getTime()<next) return{allowed:false,reason:'backoff',next_retry_at:new Date(next).toISOString()};
  return{allowed:true};
}
async function deliveryRecord(env,postId,platform){return env.DB.prepare('SELECT * FROM social_publish_deliveries WHERE post_id=? AND platform=? LIMIT 1').bind(postId,platform).first();}
async function saveDelivery(env,postId,platform,result,now){
  const status=result.manual_required?'manual_required':result.ok?'published':result.retryable?'retry':'permanent_failed';
  const remoteId=clean(result.remote_id).slice(0,500),responseJson=JSON.stringify(result).slice(0,12000),errorText=result.ok?'':clean(result.error||'發布失敗').slice(0,2000);
  await env.DB.prepare(`INSERT INTO social_publish_deliveries(post_id,platform,status,attempt_count,last_attempt_at,published_at,remote_id,response_json,error_text,created_at,updated_at) VALUES(?,?,?,1,?,?,?,?,?,?,?) ON CONFLICT(post_id,platform) DO UPDATE SET status=excluded.status,attempt_count=CASE WHEN excluded.status='manual_required' THEN social_publish_deliveries.attempt_count ELSE social_publish_deliveries.attempt_count+1 END,last_attempt_at=excluded.last_attempt_at,published_at=CASE WHEN excluded.status='published' THEN excluded.published_at ELSE social_publish_deliveries.published_at END,remote_id=CASE WHEN excluded.status='published' THEN excluded.remote_id ELSE social_publish_deliveries.remote_id END,response_json=excluded.response_json,error_text=excluded.error_text,updated_at=excluded.updated_at`).bind(postId,platform,status,now,result.ok?now:null,remoteId,responseJson,errorText,now,now).run();
}
async function publishOne(env,post,now){
  const platforms=parsePlatforms(post.platforms_json);
  const results=[];
  for(const platform of platforms){
    const prior=await deliveryRecord(env,post.id,platform);
    const allowed=retryAllowed(prior,now);
    if(!allowed.allowed){results.push({platform,skipped:true,reason:allowed.reason,status:prior?.status||''});continue;}
    const result=await dispatchPlatform(env,post,platform);
    await saveDelivery(env,post.id,platform,result,now.toISOString());
    results.push(result);
  }
  const automatic=results.filter((item)=>!item.manual_required&&item.reason!=='manual_required');
  const failed=automatic.filter((item)=>item.ok===false&&!item.skipped);
  const manual=results.filter((item)=>item.manual_required||item.reason==='manual_required');
  const allAutomaticDone=failed.length===0;
  if(allAutomaticDone){
    await env.DB.prepare("UPDATE social_posts SET status='published',published_at=COALESCE(NULLIF(published_at,''),?),scheduled_at=NULL,updated_at=? WHERE id=?").bind(now.toISOString(),now.toISOString(),post.id).run();
  }
  return{id:post.id,ok:allAutomaticDone,manual_required:manual.length>0,results};
}

export function publisherConfiguration(env){
  const platforms={};
  for(const [name,config] of Object.entries(PLATFORM_CONFIG)){
    if(config.manual){platforms[name]={mode:'manual',ready:false,manualRequired:true,reason:config.manualReason};continue;}
    const directConfigured=config.direct&&directReadiness(env,config.direct);
    const webhookConfigured=webhookReady(env,config);
    platforms[name]={mode:directConfigured?'official_api':webhookConfigured?'webhook':'unconfigured',directConfigured,webhookConfigured,tokenConfigured:directConfigured||webhookConfigured,ready:directConfigured||webhookConfigured,manualRequired:false,reason:directConfigured?'官方 API 必要設定已存在。':webhookConfigured?'Webhook 備援設定已存在。':'尚未完成伺服器端設定。'};
  }
  return{cronEnabled:true,approvalGate:true,onlyScheduledDuePosts:true,idempotencyProtection:true,perPlatformDeliveryTracking:true,retryBackoffEnabled:true,maximumRetryAttempts:MAX_RETRY_ATTEMPTS,requestTimeoutSeconds:REQUEST_TIMEOUT_MS/1000,officialApiPreferred:true,webhookFallbackEnabled:true,lineVoomManualOnly:true,platforms,fullyConfigured:Object.values(platforms).filter((item)=>!item.manualRequired).every((item)=>item.ready)};
}
export async function publishPostById(env,postId,now=new Date()){
  const post=await env.DB.prepare("SELECT * FROM social_posts WHERE id=? AND status IN ('approved','scheduled') LIMIT 1").bind(postId).first();
  if(!post) return{ok:false,error:'找不到已核准或已排程貼文',id:postId};
  return publishOne(env,post,now);
}
export async function publishDuePosts(env,now=new Date()){
  const rows=await env.DB.prepare("SELECT * FROM social_posts WHERE status='scheduled' AND scheduled_at IS NOT NULL AND datetime(scheduled_at)<=datetime(?) ORDER BY datetime(scheduled_at) ASC LIMIT 20").bind(now.toISOString()).all();
  const results=[];
  for(const post of rows.results||[]) results.push(await publishOne(env,post,now));
  return{checked_at:now.toISOString(),due_count:(rows.results||[]).length,results};
}
