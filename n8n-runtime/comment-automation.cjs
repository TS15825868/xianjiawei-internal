'use strict';
// Protected server-side orchestration only. Never accept caller-supplied release
// flags, platform adapters, account allowlists or database credentials.
const {exactAllowedAccount}=require('./account-allowlist.cjs');
const {createMetaHistoryReader}=require('./comment-meta-history.cjs');
const {createMetaReplyAdapter}=require('./comment-meta-replies.cjs');
const {createCommentWorkflow}=require('./comment-workflow.cjs');
const {createSendStore}=require('./comment-send-store.cjs');
const {createCommentSender}=require('./comment-sender.cjs');

function createCommentAutomation({
  db,platform,accountId,username,request,verifyPost,permissionEvidence,
  catalog,allowedAccounts,releaseApproved=false
}={}){
  if(!['facebook','instagram','threads'].includes(platform)||
     typeof accountId!=='string'||!/^\d+$/.test(accountId)||
     !exactAllowedAccount(allowedAccounts,platform,accountId)||
     typeof username!=='string'||!username||
     typeof db?.query!=='function'||typeof request!=='function'||
     typeof verifyPost!=='function'||typeof permissionEvidence!=='function'||
     typeof releaseApproved!=='boolean')
    throw Error('Protected social automation binding required');
  const reader=createMetaHistoryReader({
    platform,accountId,username,request,verifyPost
  });
  const workflow=createCommentWorkflow({db,adapter:reader,catalog,allowedAccounts});
  const transport=createMetaReplyAdapter({
    platform,accountId,request,
    loadThread:event=>reader.loadThread(event),permissionEvidence,catalog
  });
  const sendStore=createSendStore(db);
  const sender=createCommentSender({
    workflow,adapter:transport,store:sendStore,catalog,allowedAccounts,releaseApproved
  });
  // Signed inbound envelopes still need strict bounded IDs: avoid saving
  // malformed or oversized webhook identifiers to the durable ledger.
  const validId=id=>typeof id==='string'&&/^\d{1,64}(?:_\d{1,64})?$/.test(id);
  const validEvent=event=>event?.platform===platform&&event.accountId===accountId&&
    ['postId','threadId','commentId'].every(k=>validId(event[k]));
  const invalid=()=>({action:'manual',reason:'unverified_account',sent:false,retryAutomatically:false});
  return Object.freeze({
    // Eligible exact-fact questions are processed end-to-end only when the
    // trusted deployment explicitly releases sending, official access is live,
    // and every durable platform_control gate is true. Defaults to dry-run.
    handle:event=>validEvent(event)?sender.execute(event,{dryRun:!releaseApproved}):Promise.resolve(invalid()),
    // Always suggestion-only, regardless of any release setting.
    suggest:event=>validEvent(event)?sender.execute(event,{dryRun:true}):Promise.resolve(invalid()),
    // Private ERP server routes must separately enforce Cloudflare Access roles.
    list:scope=>workflow.erp.list(scope),
    takeover:scope=>workflow.erp.takeover(scope),
    // A restart never causes a replay. Uncertain reservations are quarantined.
    recover:async()=>Object.freeze({
      suggestions:await workflow.recover(),
      sends:await sendStore.recover(),
      sent:false
    })
  });
}
module.exports={createCommentAutomation};
