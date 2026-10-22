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
  if(suggestion.action!=='suggest'||dryRun)return {...suggestion,sent:false};
  if(releaseApproved!==true)return manual('release_not_approved');
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
   // Last official read after reservation catches human/platform replies.
   const last=await adapter.loadThread(event);
   if(!scoped(last,event)||digest(last.messages)!==suggestion.conversationVersion||
      decide(event,last,catalog).action!=='suggest'||!await store.begin(event,claim)){
    await store.finish(event,claim,'manual');return manual('final_ownership_changed');
   }
   attempted=true;
   const receipt=await adapter.sendReply(event,decision.reply,suggestion.conversationVersion);
   if(typeof receipt?.id!=='string'||!receipt.id)throw Error('Unconfirmed receipt');
   await store.finish(event,claim,'sent',receipt.id);
   return {action:'sent',sent:true,remoteReplyId:receipt.id,retryAutomatically:false};
  }catch{
   if(claim){try{await store.finish(event,claim,attempted?'unknown':'manual');}catch{/* Durable reservation still blocks replay. */}}
   return manual(attempted?'send_outcome_unknown':'preflight_unavailable');
  }
 }});
}
module.exports={createCommentSender};
