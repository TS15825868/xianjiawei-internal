const {exactAllowedAccount}=require('./account-allowlist.cjs');
// Private ERP read model over the existing ledgers. No public route, new table,
// customer text, token or raw API error is exposed. Bind only behind ERP auth.
function createCommentErpView({db,allowedAccounts}){
 if(typeof db?.query!=='function')throw Error('Private database binding required');
 const authorized=(platform,accountId)=>['facebook','instagram','threads'].includes(platform)&&exactAllowedAccount(allowedAccounts,platform,accountId);
 return Object.freeze({async takeover({platform,accountId,postId,threadId}){
  if(!authorized(platform,accountId)||![postId,threadId].every(v=>typeof v==='string'&&v))throw Error('Invalid ERP scope');
  const r=await db.query(`UPDATE xjw_social.comment_ledger SET human_takeover=true,
   updated_at=now() WHERE platform=$1 AND account_id=$2 AND post_id=$3 AND thread_id=$4
   RETURNING comment_id`,[platform,accountId,postId,threadId]);
  if(!Number.isInteger(r.rowCount)||r.rowCount<1)throw Error('Human takeover not persisted');
  return {humanTakeover:true,updated:r.rowCount,sent:false};
 },async list({platform,accountId,limit=50}){
  if(!['facebook','instagram','threads'].includes(platform)||!exactAllowedAccount(allowedAccounts,platform,accountId)||
     !Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid ERP scope');
  const result=await db.query(`SELECT c.platform,c.account_id,c.post_id,c.thread_id,c.comment_id,
   c.conversation_version,c.status,c.human_takeover,c.decision->>'reply' AS suggestion,
   COALESCE(r.error_code,c.error_code) AS error_code,r.state AS reply_state,r.remote_reply_id,r.sent_at,
   GREATEST(c.updated_at,COALESCE(r.updated_at,c.updated_at)) AS updated_at
   FROM xjw_social.comment_ledger c LEFT JOIN xjw_social.reply_ledger r
   ON r.platform=c.platform AND r.account_id=c.account_id AND r.post_id=c.post_id
   AND r.comment_id=c.comment_id AND r.conversation_version=c.conversation_version
   WHERE c.platform=$1 AND c.account_id=$2 ORDER BY updated_at DESC,
   c.post_id,c.comment_id,c.conversation_version LIMIT $3`,[platform,accountId,limit]);
  if(!Array.isArray(result.rows))throw Error('ERP read unconfirmed');
  return result.rows.map(r=>({platform:r.platform,accountId:r.account_id,postId:r.post_id,
   threadId:r.thread_id,commentId:r.comment_id,version:r.conversation_version,status:r.status,
   humanTakeover:r.human_takeover===true,suggestion:r.suggestion||null,
   replyState:r.reply_state||null,remoteReplyId:r.remote_reply_id||null,sentAt:r.sent_at||null,
   errorCode:/^[a-z_]{1,64}$/.test(r.error_code||'')?r.error_code:null,updatedAt:r.updated_at}));
 }});
}
module.exports={createCommentErpView};
