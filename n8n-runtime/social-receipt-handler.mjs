import {socialTlsOptions} from './social-tls.mjs';
import {receiveWebhook,verifiedSubscriptionChallenge} from './social-webhook.mjs';

// One pool and one in-flight database statement per isolate. The database role's
// connection limit remains the cross-isolate bound; overload is never ACKed.
export function createReceiptHandler({readEnv,createPool}){
 let pool;
 let busy=false;
 const db={async query(sql,values){
  if(busy)throw Error('receipt_busy');
  busy=true;
  try{
   if(!pool){
    const options=socialTlsOptions(JSON.parse(readEnv('XJW_SOCIAL_DB_CONFIG')||'null'));
    pool=createPool(options);
    // pg emits idle connection errors outside query promises. Do not log raw
    // errors or turn transient disconnects into an isolate-wide uncaught error.
    pool.on('error',()=>{});
   }
   return await pool.query(sql,values);
  }finally{busy=false;}
 }};
 return async request=>{
  try{
   if(readEnv('XJW_RECEIPT_ENABLED')!=='true'){
    // Explicitly permit Meta's GET-only Callback URL handshake before live
    // account/PG E2E. POST stays disabled even if correctly HMAC-signed.
    // This opt-in never constructs a DB pool and never opens a send path.
    if(request.method==='GET'&&readEnv('XJW_META_VERIFY_ONLY_ENABLED')==='true'){
     const challenge=verifiedSubscriptionChallenge(request,readEnv('XJW_META_VERIFY_TOKEN'));
     return new Response(challenge,{headers:{'cache-control':'no-store','content-type':'text/plain; charset=utf-8'}});
    }
    return response({accepted:false,ready:false,code:'receipt_disabled',sent:false},503);
   }
   // Enabling a receipt flag alone must never bypass independent Meta
   // authorization and primary/fallback overlap verification. These gates
   // apply to durable receipt-only POSTs, not only to customer reply sending.
   if(readEnv('XJW_META_E2E_VERIFIED')!=='true'||
      readEnv('XJW_PRIMARY_OVERLAP_VERIFIED')!=='true')
    return response({accepted:false,code:'verification_required',sent:false},503);
   const allowedAccounts=JSON.parse(readEnv('XJW_SOCIAL_ALLOWED_ACCOUNTS')||'null');
   if(!allowedAccounts)throw Error('configuration_missing');
   return await receiveWebhook(request,{allowedAccounts,appSecret:readEnv('XJW_META_APP_SECRET'),verifyToken:readEnv('XJW_META_VERIFY_TOKEN')},db);
  }catch(error){
   const code=['signature_rejected','account_rejected','verification_rejected','format_rejected','payload_too_large','method_rejected'].includes(error?.message)?error.message:error?.message==='receipt_busy'?'receipt_busy':'receipt_unavailable';
   return response({accepted:false,code,sent:false},['receipt_busy','receipt_unavailable'].includes(code)?503:400);
  }
 };
}
function response(body,status){return Response.json(body,{status,headers:{'cache-control':'no-store',...(status===503?{'retry-after':'5'}:{})}});}
