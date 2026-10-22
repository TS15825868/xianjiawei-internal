// Server-side integration for the existing policy and PostgreSQL store.
// Platform adapters must fetch official, complete thread history themselves.
// No send operation, customer payload trust flag or credential is accepted here.
const {createPgCommentStore}=require('./comment-pg-store.cjs');
const {processComment}=require('./comment-policy.cjs');
const {createCommentErpView}=require('./comment-erp-view.cjs');
function createCommentWorkflow({db,adapter,catalog,allowedAccounts}){
 if(typeof adapter?.loadThread!=='function')throw Error('Official thread adapter required');
 const store=createPgCommentStore(db);
 const guardedAdapter={async loadThread(event){
  const thread=await adapter.loadThread(event);
  const control=await store.conversationControl(event);
  if(!thread)return thread;
  // Read durable ownership again on the policy's final history refresh.
  // Human takeover applies across conversation versions and restarts.
  return {...thread,...(control.humanTakeover?{replyOwnership:'human'}:
   control.replyReserved?{replyOwnership:'ledger'}:{})};
 }};
 return Object.freeze({
  execute:event=>processComment(event,{adapter:guardedAdapter,store,catalog,allowedAccounts}),
  // Server-side ERP binding only; do not expose without existing ERP auth.
  erp:createCommentErpView({db,allowedAccounts}),
  recover:options=>store.recoverStaleProcessing(options)
 });
}
module.exports={createCommentWorkflow};
