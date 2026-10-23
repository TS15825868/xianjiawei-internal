// Optional Cloudflare Worker fallback: receipt-only, never sends messages.
// Deploy only after configuring D1 binding and completing overlap verification.
import {verifiedEnvelope} from '../n8n-runtime/social-webhook.mjs';

export default {
 async fetch(request,env){
  if(env.XJW_CF_RECEIPT_ENABLED!=='true')return Response.json({accepted:false,code:'disabled',sent:false},{status:503});
  // Fail closed until operators explicitly verify the Meta subscription and cross-provider overlap.
  if(env.XJW_META_E2E_VERIFIED!=='true'||env.XJW_PRIMARY_OVERLAP_VERIFIED!=='true')return Response.json({accepted:false,code:'verification_required',sent:false},{status:503});
  if(!env.XJW_RECEIPT_D1 || !env.XJW_META_APP_SECRET || !env.XJW_META_VERIFY_TOKEN)return Response.json({accepted:false,code:'unconfigured',sent:false},{status:503});
  try{
   const accounts=JSON.parse(env.XJW_SOCIAL_ALLOWED_ACCOUNTS||'null');
   const e=await verifiedEnvelope(request,{allowedAccounts:accounts,appSecret:env.XJW_META_APP_SECRET,verifyToken:env.XJW_META_VERIFY_TOKEN});
   if(e.challenge)return new Response(e.challenge,{headers:{'cache-control':'no-store'}});
   // Store only verified events. No processing, publishing, or customer replies.
   const stmt=env.XJW_RECEIPT_D1.prepare('INSERT OR IGNORE INTO xjw_webhook_receipts(event_hash,platform,account_id,payload_json,received_at) VALUES(?,?,?,?,?)');
   // D1 batch is transactional: never acknowledge a partially persisted multi-account event.
   const receivedAt=new Date().toISOString();
   const written=await env.XJW_RECEIPT_D1.batch(e.accounts.map(id=>stmt.bind(e.digest,e.platform,id,JSON.stringify(e.payload),receivedAt)));
   // D1 INSERT OR IGNORE: 0 changes means an already received event, 1
   // confirms a new receipt. A malformed, partial or failed batch must not
   // become an accepted webhook, even if the Promise itself resolved.
   if(!Array.isArray(written)||written.length!==e.accounts.length||
      !written.every(r=>r?.success===true&&
        Number.isSafeInteger(r?.meta?.changes)&&r.meta.changes>=0&&r.meta.changes<=1))
     throw Error('storage_unavailable');
   return Response.json({accepted:true,mode:'manual_receipt_only',sent:false},{headers:{'cache-control':'no-store'}});
  }catch(error){
   const rejected=['signature_rejected','account_rejected','verification_rejected','format_rejected','payload_too_large','method_rejected'].includes(error?.message);
   return Response.json({accepted:false,code:rejected?'invalid_event':'storage_unavailable',sent:false},{status:rejected?400:503,headers:{'cache-control':'no-store'}});
  }
 }
};
