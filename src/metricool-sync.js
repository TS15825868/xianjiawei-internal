// Metricool owns these deliveries. Never publish them through a second provider route.
const BRAND='6889683', USER='5306293', MAX_ATTEMPTS=4;
const clean=x=>String(x??'').trim();
export const metricoolConfiguration=env=>({version:'2026-10-13-metricool-human-review-v1',brandId:BRAND,userId:clean(env.METRICOOL_USER_ID)||USER,tokenConfigured:Boolean(env.METRICOOL_USER_TOKEN||env.METRICOOL_API_TOKEN),enabled:Boolean(env.METRICOOL_USER_TOKEN||env.METRICOOL_API_TOKEN),maximumAttempts:MAX_ATTEMPTS,timezone:'Asia/Taipei',defaultPolicy:'週一／週三／週五09:00；保留既有明確日期',humanReviewRequired:true,ambiguousWriteNeverBlindlyRetried:true});
export async function ensureMetricoolSchema(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS social_metricool_sync(post_id TEXT PRIMARY KEY,metricool_id INTEGER,uuid TEXT UNIQUE,publication_at TEXT,content_fingerprint TEXT NOT NULL DEFAULT '',state TEXT NOT NULL DEFAULT 'pending_review',attempts INTEGER NOT NULL DEFAULT 0,last_error TEXT NOT NULL DEFAULT '',template_json TEXT NOT NULL DEFAULT '{}',lease_until TEXT,last_sync_at TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS social_metricool_control(setting_key TEXT PRIMARY KEY,setting_value TEXT NOT NULL DEFAULT '')`).run();
}
export async function metricoolOwns(env,id){
  try{return Boolean(await env.DB.prepare('SELECT post_id FROM social_metricool_sync WHERE post_id=?').bind(id).first())}catch(error){if(/no such table/.test(String(error)))return false;throw error}
}
export function nextMetricoolSlot(now=new Date(),reserved=[]){
  const occupied=new Set(reserved.filter(Boolean).map(x=>new Date(Date.parse(x)+8*3600000).toISOString().slice(0,10)));
  const local=new Date(now.getTime()+8*3600000);
  for(let d=0;d<366;d++){
    const day=new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate()+d,9));
    const date=day.toISOString().slice(0,10),at=new Date(day.getTime()-8*3600000);
    if([1,3,5].includes(day.getUTCDay())&&at>now&&!occupied.has(date))return at.toISOString();
  }
  throw new Error('找不到可用正式時段');
}
export function metricoolBody(row,link,at){
  const prior=JSON.parse(link.template_json||'{}');
  const dateTime=new Date(Date.parse(at)+8*3600000).toISOString().slice(0,19);
  delete prior.twitterData;
  return{...prior,id:link.metricool_id||undefined,uuid:link.uuid||undefined,publicationDate:{dateTime,timezone:'Asia/Taipei'},text:row.copy,providers:['facebook','instagram','threads'].map(network=>({network})),media:[row.image_url],mediaAltText:[row.image_alt],saveExternalMediaFiles:true,draft:false,autoPublish:true,facebookData:{...(prior.facebookData||{}),type:'POST'},instagramData:{...(prior.instagramData||{}),type:'POST',autoPublish:true},threadsData:{...(prior.threadsData||{}),type:'POST'}};
}
async function requestMetricool(env,path,{method='GET',body}={}){
  const config=metricoolConfiguration(env);
  if(!config.enabled)throw new Error('METRICOOL_SERVER_CREDENTIAL_NOT_CONFIGURED');
  const url=new URL('https://app.metricool.com/api'+path);url.searchParams.set('blogId',BRAND);url.searchParams.set('userId',config.userId);
  const response=await fetch(url,{method,headers:{'X-Mc-Auth':env.METRICOOL_USER_TOKEN||env.METRICOOL_API_TOKEN,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error(`METRICOOL_HTTP_${response.status}`);
  const data=await response.json();return data?.data??data;
}
export async function enqueueMetricool(env,row,{gateState,fingerprint},now=new Date()){
  if(!row||!['approved','scheduled'].includes(row.status))return{ok:false,error:'只有已人工核准、尚未發布的貼文能排程'};
  const gate=await gateState(env,row);if(!gate.ok)return{ok:false,error:gate.reason};
  await ensureMetricoolSchema(env);
  let link=await env.DB.prepare('SELECT * FROM social_metricool_sync WHERE post_id=?').bind(row.id).first();
  if(['published','unknown','failed'].includes(link?.state))return{ok:false,error:'已發布或存在未釐清結果；禁止自動重排'};
  // A scheduled mapping with identical content is already owned; do not schedule twice.
  const fp=await fingerprint(row);
  if(link?.state==='scheduled'&&link.content_fingerprint===fp)return{ok:true,alreadyScheduled:true,metricoolId:link.metricool_id};
  const reserved=await env.DB.prepare("SELECT publication_at FROM social_metricool_sync WHERE state IN ('queued','scheduled','blocked_config') AND post_id<>?").bind(row.id).all();
  const preferred=link?.publication_at||row.proposed_scheduled_at;
  const at=Date.parse(preferred)>now.getTime()?preferred:nextMetricoolSlot(now,(reserved.results||[]).map(x=>x.publication_at));
  const state=metricoolConfiguration(env).enabled?'queued':'blocked_config';
  await env.DB.prepare(`INSERT INTO social_metricool_sync(post_id,uuid,publication_at,content_fingerprint,state) VALUES(?,?,?,?,?) ON CONFLICT(post_id) DO UPDATE SET publication_at=excluded.publication_at,content_fingerprint=excluded.content_fingerprint,state=excluded.state,attempts=0,last_error='',updated_at=datetime('now')`).bind(row.id,link?.uuid||crypto.randomUUID(),at,fp,state).run();
  return{ok:true,queued:true,state,scheduledAt:at};
}
async function markError(env,id,state,error){await env.DB.prepare("UPDATE social_metricool_sync SET state=?,last_error=?,lease_until=NULL,updated_at=datetime('now') WHERE post_id=?").bind(state,String(error?.message||error).slice(0,500),id).run();console.error('Metricool同步失敗',id,state,String(error?.message||error));}
async function recordRemote(env,row,link,remote){
  if(clean(remote.uuid)!==clean(link.uuid))throw new Error('METRICOOL_UUID_MISMATCH');
  const providers=remote.providers||[];const required=['facebook','instagram','threads'];
  if(!required.every(name=>providers.some(p=>p.network===name)))throw new Error('METRICOOL_PROVIDER_MISSING');
  const statuses={facebook:'Facebook',instagram:'Instagram',threads:'Threads'};
  for(const p of providers.filter(p=>required.includes(p.network))){
    const status=p.status==='PUBLISHED'?'published':p.status==='ERROR'?'failed':'pending';
    await env.DB.prepare(`INSERT INTO social_publish_deliveries(post_id,platform,status,remote_id,response_json,error_text,published_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(post_id,platform) DO UPDATE SET status=excluded.status,remote_id=excluded.remote_id,response_json=excluded.response_json,error_text=excluded.error_text,published_at=excluded.published_at,updated_at=datetime('now')`).bind(row.id,statuses[p.network],status,clean(p.id||remote.id),JSON.stringify({network:p.network,status:p.status,publicUrl:p.publicUrl||'',metricoolId:remote.id,uuid:remote.uuid}),status==='failed'?clean(p.detailedStatus):'',status==='published'?new Date().toISOString():null).run();
  }
  if(required.every(n=>providers.find(p=>p.network===n)?.status==='PUBLISHED')){
    await env.DB.prepare("UPDATE social_posts SET status='published',published_at=COALESCE(published_at,datetime('now')),scheduled_at=NULL,updated_at=datetime('now') WHERE id=? AND status IN ('approved','scheduled','manual_required')").bind(row.id).run();
    await env.DB.prepare("UPDATE social_metricool_sync SET state='published',last_sync_at=datetime('now'),lease_until=NULL WHERE post_id=?").bind(row.id).run();return;
  }
  if(providers.some(p=>p.status==='ERROR')){
    await env.DB.prepare("UPDATE social_posts SET status='manual_required',updated_at=datetime('now') WHERE id=? AND status IN ('approved','scheduled')").bind(row.id).run();
    await markError(env,row.id,'failed','平台發布失敗；保留逐平台結果，不重新建立貼文');return;
  }
  // Never overwrite human approval or the reviewed content during status synchronization.
  await env.DB.prepare("UPDATE social_metricool_sync SET last_sync_at=datetime('now'),lease_until=NULL WHERE post_id=?").bind(row.id).run();
}
export async function syncMetricool(env,checks,now=new Date()){
  await ensureMetricoolSchema(env);
  // Bind the eight existing external UUIDs before discovering anything. This
  // prevents a deployment cron from creating copies of already scheduled posts.
  const initialized=await env.DB.prepare("SELECT setting_value FROM social_metricool_control WHERE setting_key='initialized'").first();
  if(initialized?.setting_value!=='20261013-eight-recovery')return{ok:false,blocked:'METRICOOL_EXISTING_UUID_BOOTSTRAP_REQUIRED'};
  // Discover newly approved posts; AI/invalid review records cannot enter this outbox.
  const approved=await env.DB.prepare("SELECT p.* FROM social_posts p LEFT JOIN social_metricool_sync m ON p.id=m.post_id WHERE p.status='approved' AND (m.post_id IS NULL OR m.state='pending_review') ORDER BY p.approved_at LIMIT 20").all();
  for(const row of approved.results||[]){if((await checks.gateState(env,row)).ok)await enqueueMetricool(env,row,checks,now)}
  if(!metricoolConfiguration(env).enabled)return{ok:false,blocked:'METRICOOL_SERVER_CREDENTIAL_NOT_CONFIGURED',configuration:metricoolConfiguration(env)};
  const pending=await env.DB.prepare("SELECT * FROM social_metricool_sync WHERE state IN ('queued','blocked_config','scheduled','unknown') AND attempts<4 AND (lease_until IS NULL OR datetime(lease_until)<datetime('now')) ORDER BY last_sync_at LIMIT 10").all();
  for(const link of pending.results||[]){
    const lease=await env.DB.prepare("UPDATE social_metricool_sync SET lease_until=datetime('now','+2 minutes') WHERE post_id=? AND (lease_until IS NULL OR datetime(lease_until)<datetime('now'))").bind(link.post_id).run();if(!lease.meta?.changes)continue;
    const row=await env.DB.prepare('SELECT * FROM social_posts WHERE id=?').bind(link.post_id).first();
    if(!row){await markError(env,link.post_id,'failed','找不到D1貼文');continue;}
    try{
      const gate=await checks.gateState(env,row);const fp=await checks.fingerprint(row);
      if(!gate.ok||fp!==link.content_fingerprint||!['approved','scheduled','manual_required'].includes(row.status)){
        if(link.metricool_id){const old=await requestMetricool(env,`/v2/scheduler/posts/${link.metricool_id}`);if(['facebook','instagram','threads'].every(n=>(old.providers||[]).find(p=>p.network===n)?.status==='PUBLISHED')){await recordRemote(env,row,link,old);continue;}const paused={...old,draft:true,autoPublish:false,instagramData:{...(old.instagramData||{}),autoPublish:false}};delete paused.twitterData;await requestMetricool(env,`/v2/scheduler/posts/${link.metricool_id}`,{method:'PUT',body:paused});}
        await markError(env,row.id,'pending_review',gate.reason||'圖文版本已變更，外部排程退回草稿');continue;
      }
      if(link.state==='scheduled'&&link.metricool_id){const remote=await requestMetricool(env,`/v2/scheduler/posts/${link.metricool_id}`);if(!(remote.providers||[]).some(p=>p.status==='PUBLISHED')&&(remote.text!==row.copy||remote.draft!==false||remote.autoPublish!==true))throw new Error('METRICOOL_EXTERNAL_STATE_CHANGED');await recordRemote(env,row,link,remote);continue;}
      // Resolve the stable UUID before any write, including after an ambiguous timeout.
      const found=await requestMetricool(env,'/v2/scheduler/posts?filter='+encodeURIComponent(JSON.stringify({uuid:link.uuid})));
      const matches=Array.isArray(found)?found:[];
      if(matches.length>1)throw new Error('DUPLICATE_METRICOOL_UUID');
      if(matches[0]){link.metricool_id=matches[0].id;if((matches[0].providers||[]).some(p=>p.status==='PUBLISHED')){await recordRemote(env,row,link,matches[0]);continue;}if(link.state==='unknown'){await markError(env,row.id,'failed','先前寫入結果不明；找到原UUID，需核對後更新，不自動重試');continue;}}
      else if(link.state==='unknown'){await markError(env,row.id,'failed','先前寫入結果不明；禁止盲目建立第二篇');continue;}
      if(Date.parse(link.publication_at)<=now.getTime())throw new Error('EXPIRED_METRICOOL_SCHEDULE');
      const media=await fetch(row.image_url,{method:'GET',signal:AbortSignal.timeout(15000)});if(!media.ok||!/^image\/(png|jpeg|webp)/i.test(media.headers.get('content-type')||''))throw new Error('IMAGE_URL_UNREADABLE');await media.body?.cancel();
      await env.DB.prepare("UPDATE social_metricool_sync SET attempts=attempts+1,state='unknown' WHERE post_id=?").bind(row.id).run();
      const body=metricoolBody(row,link,link.publication_at);
      const remote=await requestMetricool(env,link.metricool_id?`/v2/scheduler/posts/${link.metricool_id}`:'/v2/scheduler/posts',{method:link.metricool_id?'PUT':'POST',body});
      if(remote.uuid!==link.uuid||remote.text!==row.copy||remote.draft!==false||remote.autoPublish!==true||remote.instagramData?.autoPublish!==true||!remote.media?.length)throw new Error('METRICOOL_SAVED_STATE_MISMATCH');
      await env.DB.prepare("UPDATE social_metricool_sync SET metricool_id=?,state='scheduled',template_json=?,last_error='',last_sync_at=datetime('now'),lease_until=NULL WHERE post_id=?").bind(remote.id,JSON.stringify(remote),row.id).run();
      await env.DB.prepare("UPDATE social_posts SET status='scheduled',scheduled_at=?,proposed_scheduled_at=?,updated_at=datetime('now') WHERE id=? AND status='approved'").bind(link.publication_at,link.publication_at,row.id).run();
      await recordRemote(env,row,{...link,metricool_id:remote.id},remote);
    }catch(error){await markError(env,link.post_id,/Timeout|Abort|SAVED_STATE/.test(String(error))?'unknown':'failed',error)}
  }
  return{ok:true,checked:(pending.results||[]).length};
}
export async function metricoolImmediate(env,row,checks){
  if(!['approved','scheduled'].includes(row?.status))return{ok:false,error:'已發布、未核准或異常的貼文不可重複立即發布'};
  const gate=await checks.gateState(env,row);if(!gate.ok)return{ok:false,error:gate.reason};
  if(!metricoolConfiguration(env).enabled)return{ok:false,error:'Metricool伺服器憑證尚未設定；不可改走第二個發布路徑'};
  const queued=await enqueueMetricool(env,row,checks);if(!queued.ok)return queued;
  const at=new Date(Date.now()+60000).toISOString();
  await env.DB.prepare("UPDATE social_metricool_sync SET publication_at=?,state='queued',attempts=0 WHERE post_id=? AND state<>'published'").bind(at,row.id).run();
  await syncMetricool(env,checks);const saved=await env.DB.prepare('SELECT * FROM social_metricool_sync WHERE post_id=?').bind(row.id).first();return{ok:saved?.state==='scheduled',immediateRequested:true,scheduledAt:at,error:saved?.last_error||undefined};
}
