// Adapter for the application-owned SQLite / D1 ledger. Schema is installed
// separately from docs/n8n/comment-suggestions-schema.sql, never in n8n tables.
const {randomUUID}=require('node:crypto');
function createCommentStore(db) {
  if(!db?.prepare)throw Error('Durable database binding required');
  return {
    async claim(key,e,version) {
      const r=await db.prepare(`INSERT OR IGNORE INTO social_comment_suggestions
        (idempotency_key,platform,account_id,post_id,thread_id,comment_id,conversation_version)
        VALUES(?,?,?,?,?,?,?)`).bind(key,e.platform,e.accountId,e.postId,e.threadId,e.commentId,version).run();
      const changes=Number(r?.meta?.changes??r?.changes);
      if(!Number.isFinite(changes))throw Error('Database did not confirm atomic claim');
      return changes===1;
    },
    async finish(key,decision) {
      if(!['suggest','skip','manual'].includes(decision.action)||decision.sent===true||decision.remoteReplyId)
        throw Error('Suggestion ledger cannot record a sent reply');
      await db.prepare(`UPDATE social_comment_suggestions SET status=?,decision_json=?,
        updated_at=CURRENT_TIMESTAMP WHERE idempotency_key=? AND status='processing'`)
        .bind(decision.action,JSON.stringify(decision),key).run();
    },
    async recordError(e,decision) {
      // A sanitized failure is retained; no raw API body, credential or customer
      // message is copied into the error log. This entry does not claim success.
      await db.prepare(`INSERT INTO social_comment_suggestions
        (idempotency_key,platform,account_id,post_id,thread_id,comment_id,conversation_version,status,decision_json)
        VALUES(?,?,?,?,?,?,?,'manual',?)`).bind('error-'+randomUUID(),e.platform,e.accountId,e.postId,e.threadId,e.commentId,'unavailable',JSON.stringify(decision)).run();
    }
  };
}
module.exports={createCommentStore};
