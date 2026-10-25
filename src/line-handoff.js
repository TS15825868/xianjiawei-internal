// LINE OA 人工接手：既有 Cloudflare Access + D1 的最低權限操作。
// 永不查詢 event_json、顧客姓名／電話／訊息，也不使用 LINE Reply API。
const NO_STORE={'cache-control':'no-store','content-type':'application/json; charset=utf-8',
 'x-content-type-options':'nosniff'};
const STAFF=new Set(['owner','admin','sales']);
const idPattern=/^[A-Za-z0-9_-]{8,128}$/;
const out=(x,status=200)=>Response.json(x,{status,headers:NO_STORE});
const denied=(code,status)=>out({ok:false,code,sent:false,customerMessagesExposed:false},status);
function numeric(value,fallback,max){
 const parsed=Number(value);return Number.isSafeInteger(parsed)&&parsed>=0?Math.min(parsed,max):fallback;
}
async function boundedConfirmation(request){
 if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))return null;
 const header=Number(request.headers.get('content-length'));
 if(Number.isFinite(header)&&header>256)return null;
 if(!request.body)return null;
 const reader=request.body.getReader();let bytes=0;
 const parts=[];
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;
   bytes+=value.byteLength;
   if(bytes>256){await reader.cancel();return null;}
   parts.push(value);
  }
 }finally{try{reader.releaseLock()}catch{}}
 const raw=new Uint8Array(bytes);let offset=0;
 for(const part of parts){raw.set(part,offset);offset+=part.byteLength;}
 try{
  const obj=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  return obj&&typeof obj==='object'&&!Array.isArray(obj)&&obj.confirmManual===true&&
   Object.keys(obj).length===1?obj:null;
 }catch{return null;}
}
export async function lineHandoffApi(request,env,{authenticate}={}){
 const u=new URL(request.url),pathname=u.pathname;
 const match=pathname.match(/^\/api\/line-handoff\/([A-Za-z0-9_-]{8,128})\/(claim|release)$/);
 if(pathname!=='/api/line-handoff'&&!match)return denied('route_not_found',404);
 if(typeof authenticate!=='function')return denied('authentication_unavailable',503);
 let profile;
 try{profile=await authenticate(request,env)}catch{return denied('access_required',401)}
 if(!STAFF.has(profile?.role)||Number(profile?.active)!==1)return denied('role_denied',403);
 if(!env?.DB?.prepare)return denied('d1_unavailable',503);
 if(!match){
  if(request.method!=='GET')return denied('method_not_allowed',405);
  const limit=numeric(u.searchParams.get('limit'),20,30)||20;
  const offset=numeric(u.searchParams.get('offset'),0,1000);
  try{
   // Contract: never SELECT event_json, source.userId, replyToken or customer text.
   const sql="SELECT r.event_id,r.event_type,r.received_at,r.handling_status,c.claim_id,c.actor_email AS claimed_by,c.claimed_at FROM xjw_line_receipt_inbox r LEFT JOIN xjw_line_handoff_claims c ON c.event_id=r.event_id AND c.status='claimed' WHERE r.handling_status='unhandled' ORDER BY r.received_at DESC,r.event_id DESC LIMIT ? OFFSET ?";
   const result=await env.DB.prepare(sql).bind(limit,offset).all();
   if(!Array.isArray(result?.results))throw Error('invalid rows');
   const entries=result.results.map(row=>{
    if(!idPattern.test(row.event_id))throw Error('invalid event id');
    return {
     eventId:row.event_id,
     eventType:String(row.event_type||'other').slice(0,64),
     receivedAt:String(row.received_at||'').slice(0,40),
     assigned:typeof row.claim_id==='string'&&row.claim_id.length>0,
     claimOwner:row.claim_id?String(row.claimed_by||'').slice(0,180):'',
     claimedAt:row.claim_id?String(row.claimed_at||'').slice(0,40):''
    };
   });
   return out({ok:true,items:entries,limit,offset,readOnly:true,
    externalRepliesVerified:false,containsCustomerMessage:false,sent:false});
  }catch{return denied('inbox_query_unavailable',503)}
 }
 if(request.method!=='POST')return denied('method_not_allowed',405);
 if(request.headers.get('origin')!==u.origin)return denied('same_origin_required',403);
 const confirmed=await boundedConfirmation(request);
 if(!confirmed)return denied('manual_confirmation_required',400);
 const [,eventId,action]=match,now=new Date().toISOString();
 try{
  let query;
  if(action==='claim'){
   const claimId=crypto.randomUUID();
   query=env.DB.prepare(
    "INSERT OR IGNORE INTO xjw_line_handoff_claims(claim_id,event_id,actor_email,claimed_at,status) "+
    "SELECT ?,r.event_id,?,?,'claimed' FROM xjw_line_receipt_inbox r "+
    "WHERE r.event_id=? AND r.handling_status='unhandled' "+
    "AND NOT EXISTS(SELECT 1 FROM xjw_line_handoff_claims c WHERE c.event_id=r.event_id AND c.status='claimed')"
   ).bind(claimId,String(profile.email||''),now,eventId);
  }else{
   query=env.DB.prepare(
    "UPDATE xjw_line_handoff_claims SET status='released',released_at=? "+
    "WHERE event_id=? AND status='claimed' AND (actor_email=? OR ? IN ('owner','admin'))"
   ).bind(now,eventId,String(profile.email||''),profile.role);
  }
  const result=await query.run();
  if(result?.success===false)return denied('handoff_storage_unavailable',503);
  if(result?.meta?.changes!==1)return denied('event_already_claimed_or_not_found',409);
  return out({ok:true,eventId,action,operatorReviewRequired:true,
   customerReplySent:false,customerMessageViewed:false,sent:false,
   state:action==='claim'?'claimed':'unassigned'});
 }catch{return denied('handoff_storage_unavailable',503)}
}
