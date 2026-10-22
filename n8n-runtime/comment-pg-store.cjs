// Parameterized PostgreSQL adapter; inject a trusted server-side pool/query.
// Never pass a credential or raw customer content into logs.
const {randomUUID}=require('node:crypto');
function createPgCommentStore(db){
 if(typeof db?.query!=='function')throw Error('Durable PostgreSQL query binding required');
 const scope=e=>[e.platform,e.accountId,e.postId,e.commentId];
 return {
  async claim(key,e,version){
   const r=await db.query(`INSERT INTO xjw_social.comment_ledger
    (platform,account_id,post_id,comment_id,conversation_version,thread_id,parent_comment_id)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING comment_id`,
    [...scope(e),version,e.threadId,e.parentCommentId||null]);
   // Opaque policy idempotency key is resolved by the caller's durable scope;
   // finish requires the same event/version, never a process-local map.
   return r.rowCount===1;
  },
  async finish(key,decision,e,version){
   if(!e||!version)throw Error('Durable scope required');
   if(!['suggest','skip','manual'].includes(decision.action)||decision.sent||decision.remoteReplyId)
    throw Error('Suggestion finish cannot mark a sent reply');
   const r=await db.query(`UPDATE xjw_social.comment_ledger SET status=$6,decision=$7::jsonb,
    updated_at=now() WHERE platform=$1 AND account_id=$2 AND post_id=$3 AND comment_id=$4
    AND conversation_version=$5 AND status='processing' RETURNING comment_id`,
    [...scope(e),version,decision.action,JSON.stringify(decision)]);
   if(r.rowCount!==1)throw Error('Ledger state changed');
  },
  async recordError(e,decision){
   // No raw API error body or token. A fresh error scope does not retry sends.
   const v='error-'+randomUUID();
   await db.query(`INSERT INTO xjw_social.comment_ledger
    (platform,account_id,post_id,comment_id,conversation_version,thread_id,status,error_code)
    VALUES($1,$2,$3,$4,$5,$6,'manual',$7)`,[...scope(e),v,e.threadId,decision.reason]);
  }
 };
}
module.exports={createPgCommentStore};
