const {exactAllowedAccount}=require('./account-allowlist.cjs');
// Trusted server-side bindings only. Never pass webhook-supplied decisions,
// credentials, approval flags or adapter implementations into this factory.
const {createHash}=require('node:crypto');
const {decide,scoped}=require('./comment-policy.cjs');
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function createCommentSender({workflow,adapter,store,catalog,allowedAccounts,releaseApproved=false}){
 for(const name of ['loadThread','authorize','sendReply'])if(typeof adapter?.[name]!=='function')throw Error('Official adapter incomplete');
 const manual=reason=>({action:'manual',reason,sent:false,retryAutomatically:false});
 return Object.freeze({async execute(event,{dryRun=true}={}){
  if(!['facebook','instagram','threads'].includes(event?.platform)||
     !exactAllowedAccount(allowedAccounts,event.platform,event.accountId))return manual('unverified_account');
  let suggestion;
  try{suggestion=await workflow.execute(event);}catch{return manual('suggestion_unavailable');}
  // A malformed workflow result must never become a public send or throw.
  if(!suggestion||typeof suggestion!=='object'||Array.isArray(suggestion))return manual('suggestion_unavailable');
  if(suggestion.action!=='suggest'||dryRun)return {...suggestion,sent:false};
  if(releaseApproved!==true)return manual('release_not_approved');
  // Validate the generated payload before any official API or database I/O.
  if(typeof suggestion.reply!=='string'||!suggestion.reply.trim()||
     typeof suggestion.conversationVersion!=='string'||
     !/^[0-9a-f]{64}$/.test(suggestion.conversationVersion))return manual('suggestion_unavailable');
  let claim,attempted=false;
  try{
   // authorize MUST perform official identity/scope/expiry checks on each run.
   if(await adapter.authorize(event)!==true)return manual('permission_unverified');
   const fresh=await adapter.loadThread(event);
   if(!scoped(fresh,event)||digest(fresh.messages)!==suggestion.conversationVersion)return manual('conversation_changed');
   const decision=decide(event,fresh,catalog);
   if(decision.action!=='suggest'||decision.reply!==suggestion.reply)return manual('final_policy_rejected');
   claim=await store.reserve(event,suggestion.conversationVersion,decision.reply);
   if(!claim)return {action:'skip',reason:'disabled_or_reserved',sent:false};
   // Last official read must revalidate the EXACT reply, not merely its
   // eligibility. Product facts may change after the reservation was made.
   const last=await adapter.loadThread(event);
   const lastDecision=scoped(last,event)&&digest(last.messages)===suggestion.conversationVersion
     ? decide(event,last,catalog):null;
   if(lastDecision?.action!=='suggest'||lastDecision.reply!==decision.reply||
      lastDecision.reply!==suggestion.reply||!await store.begin(event,claim,decision.reply)){
    await store.finish(event,claim,'manual');return manual('final_ownership_changed');
   }
   attempted=true;
   const receipt=await adapter.sendReply(event,decision.reply,suggestion.conversationVersion);
   // Only a usable official receipt can be persisted as sent. Match the
   // durable ledger's receipt rules before making the success transition.
   if(typeof receipt?.id!=='string'||!receipt.id.trim()||receipt.id.length>256||
      /[\u0000-\u001f\u007f]/u.test(receipt.id))throw Error('Unconfirmed receipt');
   await store.finish(event,claim,'sent',receipt.id);
   return {action:'sent',sent:true,remoteReplyId:receipt.id,retryAutomatically:false};
  }catch{
   if(claim){try{await store.finish(event,claim,attempted?'unknown':'manual');}catch{/* Durable reservation still blocks replay. */}}
   return manual(attempted?'send_outcome_unknown':'preflight_unavailable');
  }
 }});
}
module.exports={createCommentSender};
