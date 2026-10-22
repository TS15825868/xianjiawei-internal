import {socialTlsOptions} from './social-tls.mjs';
import {receiveWebhook} from './social-webhook.mjs';

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
   if(readEnv('XJW_RECEIPT_ENABLED')!=='true')return response({ready:false,code:'receipt_disabled',sent:false},503);
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
