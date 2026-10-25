// 仙加味 LINE OA 零費用安全備援：只收件，不回覆、不發布、不更動訂單。
// 預設關閉；舊 Render LINE OA 維持正式唯一 Webhook。
const maxBytes=65536,maxEvents=100;
const headers={'cache-control':'no-store','content-type':'application/json; charset=utf-8','x-content-type-options':'nosniff'};
const json=(x,status=200)=>Response.json(x,{status,headers});
const deny=(code,status=503)=>json({ok:false,accepted:false,sent:false,code},status);
async function rawBody(request){
 const size=Number(request.headers.get('content-length'));
 if(Number.isFinite(size)&&size>maxBytes)return null;
 if(!request.body)return new Uint8Array();
 const reader=request.body.getReader(),chunks=[];let len=0;
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;
   len+=value.byteLength;
   if(len>maxBytes){await reader.cancel();return null;}
   chunks.push(value);
  }
 }finally{try{reader.releaseLock()}catch{}}
 const out=new Uint8Array(len);let i=0;
 for(const c of chunks){out.set(c,i);i+=c.byteLength}
 return out;
}
async function signatureValid(bytes,secret,signature){
 if(typeof secret!=='string'||secret.length<8||typeof signature!=='string'||signature.length!==44)return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signed=new Uint8Array(await crypto.subtle.sign('HMAC',key,bytes));
 const expected=btoa(String.fromCharCode(...signed));
 let diff=0;for(let i=0;i<44;i++)diff|=signature.charCodeAt(i)^expected.charCodeAt(i);
 return diff===0;
}
const idValid=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{8,128}$/.test(id);
export default{
 async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(path==='/healthz'&&request.method==='GET')
   return json({ok:true,service:'仙加味 LINE 安全收件備援',receiptEnabled:env.XJW_LINE_RECEIPT_ENABLED==='true',
    customerReplies:false,handlesOrders:false,productionWebhookUnchanged:true});
  if(path!=='/webhook')return deny('not_found',404);
  if(request.method!=='POST')return deny('method_not_allowed',405);
  const enabled=env.XJW_LINE_RECEIPT_ENABLED==='true';
  if(!enabled&&env.XJW_LINE_VERIFY_ONLY_ENABLED!=='true')return deny('standby_disabled');
  const secret=env.XJW_LINE_CHANNEL_SECRET,destination=env.XJW_LINE_DESTINATION;
  if(typeof secret!=='string'||secret.length<8||typeof destination!=='string'||!destination)
   return deny('configuration_missing');
  let bytes;try{bytes=await rawBody(request)}catch{return deny('invalid_body',400)}
  if(bytes===null)return deny('payload_too_large',413);
  if(!await signatureValid(bytes,secret,request.headers.get('x-line-signature')))
   return deny('signature_rejected',401);
  let data;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}
  catch{return deny('invalid_json',400)}
  if(!data||typeof data!=='object'||Array.isArray(data)||data.destination!==destination||
     !Array.isArray(data.events)||data.events.length>maxEvents)return deny('invalid_event',400);
  // LINE 官方 Verify 會傳送空 events。僅允許已驗證簽章的空事件在待命時 200。
  if(data.events.length===0)return json({ok:true,accepted:true,mode:'signed_empty_probe',stored:0,sent:false});
  if(!enabled)return deny('verify_only_no_customer_receipt');
  if(env.XJW_LINE_E2E_VERIFIED!=='true'||env.XJW_LINE_EXCLUSIVE_CALLBACK_CONFIRMED!=='true')
   return deny('handover_not_verified');
  if(!env.XJW_LINE_RECEIPT_D1||typeof env.XJW_LINE_RECEIPT_D1.batch!=='function')
   return deny('database_not_configured');
  if(!data.events.every(e=>e&&typeof e==='object'&&!Array.isArray(e)&&idValid(e.webhookEventId)&&
     typeof e.type==='string'&&e.type.length<=64))return deny('invalid_event',400);
  try{
   const stmt=env.XJW_LINE_RECEIPT_D1.prepare('INSERT OR IGNORE INTO xjw_line_receipt_inbox(event_id,event_type,event_json,received_at) VALUES(?,?,?,?)');
   const now=new Date().toISOString();
   const result=await env.XJW_LINE_RECEIPT_D1.batch(data.events.map(e=>stmt.bind(e.webhookEventId,e.type,JSON.stringify(e),now)));
   if(!Array.isArray(result)||result.length!==data.events.length||
      !result.every(r=>r?.success===true&&Number.isSafeInteger(r?.meta?.changes)&&r.meta.changes>=0&&r.meta.changes<=1))
    return deny('storage_unconfirmed');
   return json({ok:true,accepted:true,mode:'verified_receipt_only',
     received:data.events.length,stored:result.reduce((n,r)=>n+r.meta.changes,0),sent:false});
  }catch{return deny('storage_unavailable')}
 }
};
