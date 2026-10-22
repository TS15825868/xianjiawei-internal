import pg from 'npm:pg@8.16.3';
import {socialTlsOptions} from '../../../n8n-runtime/social-tls.mjs';
import {receiveWebhook} from '../../../n8n-runtime/social-webhook.mjs';
// No service-role key, administrator connection, send method or automatic retry.
Deno.serve(async(request:Request)=>{
 let pool;
 try{
  if(Deno.env.get('XJW_RECEIPT_ENABLED')!=='true')return Response.json({ready:false,code:'receipt_disabled',sent:false},{status:503});
  const config=JSON.parse(Deno.env.get('XJW_SOCIAL_DB_CONFIG')||'null');
  const options=socialTlsOptions(config);
  const allowedAccounts=JSON.parse(Deno.env.get('XJW_SOCIAL_ALLOWED_ACCOUNTS')||'null');
  if(!allowedAccounts)throw Error('configuration_missing');
  pool=new pg.Pool(options);
  return await receiveWebhook(request,{allowedAccounts,appSecret:Deno.env.get('XJW_META_APP_SECRET'),verifyToken:Deno.env.get('XJW_META_VERIFY_TOKEN')},pool);
 }catch(error){
  const code=['signature_rejected','account_rejected','verification_rejected','format_rejected','payload_too_large','method_rejected'].includes(error.message)?error.message:'receipt_unavailable';
  return Response.json({accepted:false,code,sent:false},{status:code==='receipt_unavailable'?503:400});
 }finally{if(pool)await pool.end().catch(()=>{});}
});
