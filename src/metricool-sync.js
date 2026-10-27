// Free plan: Work's official connector transfers approved posts. Workers never
// invoke Metricool's paid API or a browser session. External results need evidence.
const BRAND='6889683';
const clean=x=>String(x??'').trim();
export function requiresDatedSchedule(row){return /(元旦|除夕|元宵|春節|過年|走春|農曆年|中秋|端午|聖誕|冬至)/.test([row?.title,row?.headline,row?.category,row?.copy].join(' '))}
function hasExplicitFutureDate(row,now){return [row?.scheduled_at,row?.proposed_scheduled_at].some(x=>Date.parse(x)>now.getTime())}
export const metricoolConfiguration=()=>({version:'2026-10-13-metricool-free-ai-v3',brandId:BRAND,mode:'free_work_handoff',enabled:false,paidApiRequired:false,serverApiEnabled:false,connectorExecution:'Work 執行期間',externalScheduling:'Metricool 免費排程器',monthlyPublishedPlatformLimit:20,perThreePlatformPostCost:3,backgroundResultSync:false,timezone:'Asia/Taipei',defaultPolicy:'週一／週三／週五09:00；保留既有明確日期',humanReviewRequired:false,evidenceApprovalRequired:true,approvalModes:['HUMAN_APPROVED','AI_APPROVED'],uncertainContentRequiresHuman:true,message:'低風險貼文可依完整AI證據自動核准，符合安全條件才排入待Work佇列；外部發布仍需正式排程及平台回執驗證。'});
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
// Metricool Free counts one publication PER connected network; 3-network posts
// cost three slots, and uncertain states reserve quota until verified.
// This checks the local linked records only: Work must still read the actual
// external planner/counter before creating or updating any remote UUID.
const localDay=value=>{const t=Date.parse(value);return Number.isFinite(t)?new Date(t+8*3600000).toISOString().slice(0,10):null};
export function metricoolScheduleCapacity(links,at,{monthlyLimit=20,postCost=3}={}){
 const target=localDay(at);
 if(!target)return {ok:false,reason:'invalid_schedule_time',localEvidenceOnly:true};
 if(!Array.isArray(links)||!Number.isSafeInteger(monthlyLimit)||monthlyLimit<1||
    !Number.isSafeInteger(postCost)||postCost<1)return{ok:false,reason:'invalid_quota_evidence',localEvidenceOnly:true};
 const active=new Set(['awaiting_work','queued','scheduled','blocked_config','awaiting_verification','published','unknown','cancel_required']);
 let count=0,slotConflict=false;
 for(const item of links){
  if(item?.state&&!active.has(item.state))continue;
  const day=localDay(typeof item==='string'?item:item?.publication_at);
  if(!day)return{ok:false,reason:'invalid_existing_schedule',localEvidenceOnly:true};
  // Historical network counts are not proven by this local index: reserve
  // three per historical post until Metricool's external receipt is reconciled.
  // Candidate cost is separately calculated from its approved network list.
  if(day.slice(0,7)===target.slice(0,7))count+=3;
  if(day===target)slotConflict=true;
 }
 return {ok:count+postCost<=monthlyLimit,reason:count+postCost<=monthlyLimit?'local_capacity_available':'local_free_quota_exceeded',
  usedKnown:count,withCandidate:count+postCost,monthlyLimit,slotConflict,localEvidenceOnly:true};
}
// An AI review is valid for only 24 hours. Never hand an older unverified
// approval to an external scheduler that could publish after it expires.
// Human-reviewed posts retain their existing scheduling policy.
export function aiScheduleFresh(row,reviewedAt,publicationAt){
  if(!String(row?.approved_by||'').startsWith('ai:'))return{ok:true};
  const reviewed=Date.parse(reviewedAt||''),published=Date.parse(publicationAt||'');
  if(!Number.isFinite(reviewed)||!Number.isFinite(published)||published<=reviewed||
     published>reviewed+23*3600000)
    return{ok:false,reason:'AI審核憑證在預定發文前可能過期；請於發文前23小時內重新完成AI審核，再進行外部排程'};
  return{ok:true};
}
// Preserve the exact approved audience. In particular, a one-network
// approval must never become a three-network Metricool post.
const METRICOOL_CHANNELS=new Set(['facebook','instagram','threads']);
export function metricoolChannels(row){
  try{
    const raw=JSON.parse(row?.platforms_json||'[]');
    if(!Array.isArray(raw)||raw.length<1||raw.length>METRICOOL_CHANNELS.size)return null;
    const items=raw.map(x=>String(x||'').trim().toLowerCase());
    if(items.some(x=>!METRICOOL_CHANNELS.has(x))||new Set(items).size!==items.length)return null;
    return items;
  }catch{return null}
}
export function metricoolBody(row,link,at){
  const channels=metricoolChannels(row);
  if(!channels)throw Error('貼文指定平台含未授權項目、重複平台或無有效平台，不能移交 Metricool');
  const prior=JSON.parse(link?.template_json||'{}');
  if(!prior||typeof prior!=='object'||Array.isArray(prior))throw Error('既有 Metricool 範本格式不合法');
  // A historical draft may contain stale settings for other networks.
  // Remove ALL non-authorized platform fields, not merely twitterData:
  // providers is overwritten below but nested provider-specific payloads
  // must never accidentally target an additional account.
  const providerFields=['facebookData','instagramData','threadsData','twitterData','linkedinData',
    'tiktokData','pinterestData','youtubeData','googleData','gmbData','blueskyData',
    'twitchData','mastodonData'];
  for(const key of providerFields){
    if(!channels.includes(key.replace(/Data$/,'').toLowerCase()))delete prior[key];
  }
  if(!Number.isFinite(Date.parse(at)))throw Error('Metricool 排程日期不合法');
  const dateTime=new Date(Date.parse(at)+8*3600000).toISOString().slice(0,19);
  const body={...prior,id:link?.metricool_id||undefined,uuid:link?.uuid||undefined,publicationDate:{dateTime,timezone:'Asia/Taipei'},text:row.copy,providers:channels.map(network=>({network})),media:[row.image_url],mediaAltText:[row.image_alt],saveExternalMediaFiles:true,draft:false,autoPublish:true};
  if(channels.includes('facebook'))body.facebookData={...(prior.facebookData||{}),type:'POST'};
  if(channels.includes('instagram'))body.instagramData={...(prior.instagramData||{}),type:'POST',autoPublish:true};
  if(channels.includes('threads'))body.threadsData={...(prior.threadsData||{}),type:'POST'};
  return body;
}
export async function enqueueMetricool(env,row,{gateState,fingerprint},now=new Date(),{immediate=false}={}){
  if(!row||!['approved','scheduled'].includes(row.status))return{ok:false,error:'只有已完成有效核准、尚未發布的貼文能排程'};
  if(!metricoolChannels(row))return{ok:false,error:'Metricool 只接受貼文原始審核指定的 Facebook／Instagram／Threads；不允許自動增加平台或轉為 LINE OA'};
  const gate=await gateState(env,row);if(!gate.ok)return{ok:false,error:gate.reason};
  await ensureMetricoolSchema(env);
  const link=await env.DB.prepare('SELECT * FROM social_metricool_sync WHERE post_id=?').bind(row.id).first();
  if(['published','unknown','failed','awaiting_verification','cancel_required'].includes(link?.state))return{ok:false,error:'已發布或存在未釐清結果；須先查證既有貼文，禁止重建'};
  const fp=await fingerprint(row);
  if(link?.state==='scheduled'&&link.content_fingerprint===fp&&link.metricool_id&&link.uuid)return{ok:true,alreadyScheduled:true,metricoolId:link.metricool_id};
  if(link?.state==='scheduled'&&(!link.metricool_id||!link.uuid))return{ok:false,error:'本地標記已排程，但缺少可信的 Metricool ID／UUID，禁止視為外部排程成功'};
  if(link?.state==='scheduled')return{ok:false,error:'既有外部排程版本已變更；請先透過Work取消／更新原UUID'};
  if(requiresDatedSchedule(row)&&!hasExplicitFutureDate(row,now))return{ok:false,error:'節慶內容需先指定符合節日的日期，禁止自動套用一般週間時段'};
  // Existing human approval cannot authorize a second identical post created
  // after the original review. Recheck before creating a new remote UUID.
  const norm=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'');
  const copy=norm(row.copy),image=clean(row.image_url).split(/[?#]/)[0];
  const siblings=await env.DB.prepare("SELECT id,copy,image_url FROM social_posts WHERE id<>? AND status IN ('approved','scheduled','published')").bind(row.id).all();
  const duplicate=(siblings.results||[]).find(other=>
    (copy.length>=20&&copy===norm(other.copy))||
    (image&&image===clean(other.image_url).split(/[?#]/)[0]));
  if(duplicate)return{ok:false,error:'文案或主圖與現有已核准、已排程、已發布貼文重複；不得建立另一筆外部排程'};
  const reserved=await env.DB.prepare("SELECT publication_at,state FROM social_metricool_sync WHERE state IN ('awaiting_work','queued','scheduled','blocked_config','awaiting_verification','published','unknown','cancel_required') AND post_id<>?").bind(row.id).all();
  const linked=reserved.results||[];
  const preferred=row.scheduled_at||row.proposed_scheduled_at||link?.publication_at;
  const at=immediate?new Date(now.getTime()+60000).toISOString():
    Date.parse(preferred)>now.getTime()?preferred:nextMetricoolSlot(now,linked.map(x=>x.publication_at));
  const freshness=aiScheduleFresh(row,gate.reviewed_at,at);
  if(!freshness.ok)return{ok:false,code:'AI_REVIEW_WILL_EXPIRE',error:freshness.reason};
  // Reserve only the candidate's authorized networks. Keep unknown historical
  // reservations at the conservative three-network cost until reconciled.
  const capacity=metricoolScheduleCapacity(linked,at,{postCost:metricoolChannels(row).length});
  if(!capacity.ok)return{ok:false,code:capacity.reason,error:'Metricool 免費額度已滿或本地排程狀態無法確認；必須先由Work核對正式計數器與既有UUID',quota:capacity};
  if(!immediate&&Date.parse(preferred)>now.getTime()&&capacity.slotConflict)
    return{ok:false,code:'local_schedule_collision',error:'同一天已有排程；請先核對Metricool現有UUID與安排，避免一日多篇',quota:capacity};
  await env.DB.prepare(`INSERT INTO social_metricool_sync(post_id,uuid,publication_at,content_fingerprint,state) VALUES(?,?,?,?,?) ON CONFLICT(post_id) DO UPDATE SET publication_at=excluded.publication_at,content_fingerprint=excluded.content_fingerprint,state=excluded.state,attempts=0,last_error='',updated_at=datetime('now')`).bind(row.id,link?.uuid||crypto.randomUUID(),at,fp,'awaiting_work').run();
  return{ok:true,queued:true,state:'awaiting_work',scheduledAt:at,externalScheduled:false,message:'已完成有效核准並加入待Work排程；尚未送入Metricool，不代表已正式排程。'};
}
export async function syncMetricool(env,checks,now=new Date()){
  await ensureMetricoolSchema(env);
  const initialized=await env.DB.prepare("SELECT setting_value FROM social_metricool_control WHERE setting_key='initialized'").first();
  if(initialized?.setting_value!=='20261013-eight-recovery')return{ok:false,blocked:'METRICOOL_EXISTING_UUID_BOOTSTRAP_REQUIRED'};
  const approved=await env.DB.prepare("SELECT p.* FROM social_posts p LEFT JOIN social_metricool_sync m ON p.id=m.post_id WHERE p.status='approved' AND (m.post_id IS NULL OR m.state IN ('pending_review','blocked_context')) ORDER BY p.approved_at LIMIT 20").all();
  for(const row of approved.results||[]){if((await checks.gateState(env,row)).ok)await enqueueMetricool(env,row,checks,now)}
  const result=await env.DB.prepare("SELECT * FROM social_metricool_sync WHERE state IN ('awaiting_work','queued','blocked_config','scheduled','expired') ORDER BY publication_at LIMIT 100").all();
  for(const link of result.results||[]){
    const row=await env.DB.prepare('SELECT * FROM social_posts WHERE id=?').bind(link.post_id).first();
    const valid=row&&['approved','scheduled'].includes(row.status)&&(await checks.gateState(env,row)).ok&&(await checks.fingerprint(row))===link.content_fingerprint;
    let state=link.state,error='';
    if(!valid){state=link.metricool_id&&link.state==='scheduled'?'cancel_required':'pending_review';error=state==='cancel_required'?'人工審核或圖文版本已失效；需Work立即處理既有Metricool排程，Worker不能取消外部排程。':'未取得有效的人工或AI核准，禁止送出';}
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
  const queued=await enqueueMetricool(env,row,checks,new Date(),{immediate:true});if(!queued.ok)return queued;
  // Existing external UUID returns alreadyScheduled without scheduledAt.
  // Immediate release must keep a valid new target and update THAT UUID.
  const at=Date.parse(queued.scheduledAt)>Date.now()?queued.scheduledAt:new Date(Date.now()+60000).toISOString();
  await env.DB.prepare("UPDATE social_metricool_sync SET publication_at=?,state='awaiting_work',attempts=0,last_error='' WHERE post_id=? AND state IN ('scheduled','awaiting_work')").bind(at,row.id).run();
  return{ok:true,immediateRequested:true,queued:true,externalScheduled:false,scheduledAt:at,message:'已加入立即發布待Work佇列，不受固定時段限制；Work須更新原UUID並查證保存，尚未實際發布。'};
}
