// Free plan: Work's official connector transfers approved posts. Workers never
// invoke Metricool's paid API or a browser session. External results need evidence.
const BRAND='6889683';
const clean=x=>String(x??'').trim();
export function requiresDatedSchedule(row){return /(元旦|除夕|元宵|春節|過年|走春|農曆年|中秋|端午|聖誕|冬至)/.test([row?.title,row?.headline,row?.category,row?.copy].join(' '))}
function hasExplicitFutureDate(row,now){return [row?.scheduled_at,row?.proposed_scheduled_at].some(x=>Date.parse(x)>now.getTime())}
export const metricoolConfiguration=()=>({version:'2026-10-13-metricool-free-ai-v3',brandId:BRAND,mode:'free_work_handoff',enabled:false,paidApiRequired:false,serverApiEnabled:false,connectorExecution:'Work 執行期間',externalScheduling:'Metricool 免費排程器',monthlyPublishedPlatformLimit:20,perThreePlatformPostCost:3,backgroundResultSync:false,timezone:'Asia/Taipei',defaultPolicy:'週一／週三／週五09:00；保留既有明確日期',humanReviewRequired:false,evidenceApprovalRequired:true,approvalModes:['HUMAN_APPROVED','AI_APPROVED'],uncertainContentRequiresHuman:true,message:'完整AI證據或人工核准後進待Work排程；外部設定重新查詢成功才算正式排程，發布後仍需查證。'});
export async function ensureMetricoolSchema(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS social_metricool_sync(post_id TEXT PRIMARY KEY,metricool_id INTEGER,uuid TEXT UNIQUE,publication_at TEXT,content_fingerprint TEXT NOT NULL DEFAULT '',state TEXT NOT NULL DEFAULT 'pending_review',attempts INTEGER NOT NULL DEFAULT 0,last_error TEXT NOT NULL DEFAULT '',template_json TEXT NOT NULL DEFAULT '{}',lease_until TEXT,last_sync_at TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS social_metricool_control(setting_key TEXT PRIMARY KEY,setting_value TEXT NOT NULL DEFAULT '')`).run();
}
export async function metricoolOwns(env,id){
  try{return Boolean(await env.DB.prepare('SELECT post_id FROM social_metricool_sync WHERE post_id=?').bind(id).first())}catch(error){if(/no such table/.test(String(error)))return false;throw error}
}
export function nextMetricoolSlot(now=new Date(),reserved=[]){
  const occupied=new Set(reserved.filter(x=>Number.isFinite(Date.parse(x))).map(x=>new Date(Date.parse(x)+8*3600000).toISOString().slice(0,10)));
  const local=new Date(now.getTime()+8*3600000);
  for(let d=0;d<366;d++){
    const day=new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate()+d,9));
    const date=day.toISOString().slice(0,10),at=new Date(day.getTime()-8*3600000);
    if([1,3,5].includes(day.getUTCDay())&&at>now&&!occupied.has(date))return at.toISOString();
  }
  throw new Error('找不到可用正式時段');
}
export function metricoolBody(row,link,at){
  const prior=JSON.parse(link.template_json||'{}');delete prior.twitterData;
  const dateTime=new Date(Date.parse(at)+8*3600000).toISOString().slice(0,19);
  return{...prior,id:link.metricool_id||undefined,uuid:link.uuid||undefined,publicationDate:{dateTime,timezone:'Asia/Taipei'},text:row.copy,providers:['facebook','instagram','threads'].map(network=>({network})),media:[row.image_url],mediaAltText:[row.image_alt],saveExternalMediaFiles:true,draft:false,autoPublish:true,facebookData:{...(prior.facebookData||{}),type:'POST'},instagramData:{...(prior.instagramData||{}),type:'POST',autoPublish:true},threadsData:{...(prior.threadsData||{}),type:'POST'}};
}
export async function enqueueMetricool(env,row,{gateState,fingerprint},now=new Date()){
  if(!row||!['approved','scheduled'].includes(row.status))return{ok:false,error:'只有已人工核准、尚未發布的貼文能排程'};
  const gate=await gateState(env,row);if(!gate.ok)return{ok:false,error:gate.reason};
  await ensureMetricoolSchema(env);
  const link=await env.DB.prepare('SELECT * FROM social_metricool_sync WHERE post_id=?').bind(row.id).first();
  if(['published','unknown','failed','awaiting_verification','cancel_required'].includes(link?.state))return{ok:false,error:'已發布或存在未釐清結果；須先查證既有貼文，禁止重建'};
  const fp=await fingerprint(row);
  if(link?.state==='scheduled'&&link.content_fingerprint===fp)return{ok:true,alreadyScheduled:true,metricoolId:link.metricool_id};
  if(link?.state==='scheduled')return{ok:false,error:'既有外部排程版本已變更；請先透過Work取消／更新原UUID'};
  if(requiresDatedSchedule(row)&&!hasExplicitFutureDate(row,now))return{ok:false,error:'節慶內容需先指定符合節日的日期，禁止自動套用一般週間時段'};
  const reserved=await env.DB.prepare("SELECT publication_at FROM social_metricool_sync WHERE state IN ('awaiting_work','queued','scheduled','blocked_config','awaiting_verification') AND post_id<>?").bind(row.id).all();
  const preferred=link?.publication_at||row.scheduled_at||row.proposed_scheduled_at;
  const at=Date.parse(preferred)>now.getTime()?preferred:nextMetricoolSlot(now,(reserved.results||[]).map(x=>x.publication_at));
  await env.DB.prepare(`INSERT INTO social_metricool_sync(post_id,uuid,publication_at,content_fingerprint,state) VALUES(?,?,?,?,?) ON CONFLICT(post_id) DO UPDATE SET publication_at=excluded.publication_at,content_fingerprint=excluded.content_fingerprint,state=excluded.state,attempts=0,last_error='',updated_at=datetime('now')`).bind(row.id,link?.uuid||crypto.randomUUID(),at,fp,'awaiting_work').run();
  return{ok:true,queued:true,state:'awaiting_work',scheduledAt:at,externalScheduled:false,message:'已人工核准並加入待Work排程；尚未送入Metricool，不代表已正式排程。'};
}
export async function syncMetricool(env,checks,now=new Date()){
  await ensureMetricoolSchema(env);
  const initialized=await env.DB.prepare("SELECT setting_value FROM social_metricool_control WHERE setting_key='initialized'").first();
  if(initialized?.setting_value!=='20261013-eight-recovery')return{ok:false,blocked:'METRICOOL_EXISTING_UUID_BOOTSTRAP_REQUIRED'};
  const approved=await env.DB.prepare("SELECT p.* FROM social_posts p LEFT JOIN social_metricool_sync m ON p.id=m.post_id WHERE p.status='approved' AND (m.post_id IS NULL OR m.state IN ('pending_review','blocked_context')) ORDER BY p.approved_at LIMIT 20").all();
  for(const row of approved.results||[]){if((await checks.gateState(env,row)).ok)await enqueueMetricool(env,row,checks,now)}
  const result=await env.DB.prepare("SELECT * FROM social_metricool_sync WHERE state IN ('awaiting_work','queued','blocked_config','scheduled') ORDER BY publication_at LIMIT 100").all();
  for(const link of result.results||[]){
    const row=await env.DB.prepare('SELECT * FROM social_posts WHERE id=?').bind(link.post_id).first();
    const valid=row&&['approved','scheduled'].includes(row.status)&&(await checks.gateState(env,row)).ok&&(await checks.fingerprint(row))===link.content_fingerprint;
    let state=link.state,error='';
    if(!valid){state=link.metricool_id&&link.state==='scheduled'?'cancel_required':'pending_review';error=state==='cancel_required'?'人工審核或圖文版本已失效；需Work立即處理既有Metricool排程，Worker不能取消外部排程。':'未取得有效人工核准，禁止送出';}
    else if(!link.metricool_id&&requiresDatedSchedule(row)&&!hasExplicitFutureDate(row,now)){state='blocked_context';error='節慶內容未指定符合節日的日期；禁止使用一般週間自動時段，等待日期核對。';}
    else if(Date.parse(link.publication_at)<=now.getTime()){state=link.metricool_id?'awaiting_verification':'expired';error=link.metricool_id?'排程時間已到；尚未查證平台結果，不標記成功，不重發。':'待Work排程已過期；先查是否已發布，再決定補排。';}
    else if(['queued','blocked_config'].includes(state))state='awaiting_work';
    if(state!==link.state)await env.DB.prepare("UPDATE social_metricool_sync SET state=?,last_error=?,lease_until=NULL,updated_at=datetime('now') WHERE post_id=? AND state=?").bind(state,error,link.post_id,link.state).run();
  }
  return{ok:true,mode:'free_work_handoff',externalRequests:0,checked:(result.results||[]).length};
}
export async function metricoolImmediate(env,row,checks){
  if(!['approved','scheduled'].includes(row?.status))return{ok:false,error:'已發布、未核准或異常的貼文不可重複立即發布'};
  const gate=await checks.gateState(env,row);if(!gate.ok)return{ok:false,error:gate.reason};
  const queued=await enqueueMetricool(env,row,checks);if(!queued.ok)return queued;
  const at=new Date(Date.now()+60000).toISOString();
  await env.DB.prepare("UPDATE social_metricool_sync SET publication_at=?,state='awaiting_work',attempts=0,last_error='' WHERE post_id=? AND state IN ('scheduled','awaiting_work')").bind(at,row.id).run();
  return{ok:true,immediateRequested:true,queued:true,externalScheduled:false,scheduledAt:at,message:'已加入立即發布待Work佇列，不受固定時段限制；Work須更新原UUID並查證保存，尚未實際發布。'};
}
