// Parameterized PostgreSQL adapter; inject a trusted server-side pool/query.
// Never pass a credential or raw customer content into logs.
const {createHash}=require('node:crypto');
function createPgCommentStore(db){
 if(typeof db?.query!=='function')throw Error('Durable PostgreSQL query binding required');
 const scope=e=>[e.platform,e.accountId,e.postId,e.commentId];
 return {
  async conversationControl(e){
   const r=await db.query(`SELECT
    EXISTS(SELECT 1 FROM xjw_social.comment_ledger WHERE platform=$1 AND account_id=$2
     AND post_id=$3 AND thread_id=$4 AND human_takeover=true) AS human_takeover,
    EXISTS(SELECT 1 FROM xjw_social.reply_ledger WHERE platform=$1 AND account_id=$2
     AND post_id=$3 AND comment_id=$5 AND state IN ('reserved','sending','sent','unknown','manual')) AS reply_reserved`,
    [e.platform,e.accountId,e.postId,e.threadId,e.commentId]);
   const row=r.rows?.[0];
   if(typeof row?.human_takeover!=='boolean'||typeof row?.reply_reserved!=='boolean')
    throw Error('Conversation ownership not confirmed');
   return {humanTakeover:row.human_takeover,replyReserved:row.reply_reserved};
  },
  async recoverStaleProcessing({olderThanSeconds=900,limit=100}={}){
   if(!Number.isInteger(olderThanSeconds)||olderThanSeconds<300||olderThanSeconds>86400||
      !Number.isInteger(limit)||limit<1||limit>1000)throw Error('Invalid recovery bounds');
   // An interrupted claim is uncertain. Never replay or send automatically.
   // Skip locked rows so simultaneous recovery workers cannot claim each other.
   const r=await db.query(`WITH stale AS (
    SELECT platform,account_id,post_id,comment_id,conversation_version
    FROM xjw_social.comment_ledger
    WHERE status='processing' AND updated_at < now()-($1 * interval '1 second')
    ORDER BY updated_at LIMIT $2 FOR UPDATE SKIP LOCKED
   ) UPDATE xjw_social.comment_ledger AS c SET status='manual',
    error_code='interrupted_processing',retry_state='never',
    decision='{"action":"manual","reason":"interrupted_processing","sent":false}'::jsonb,
    updated_at=now() FROM stale s
    WHERE c.platform=s.platform AND c.account_id=s.account_id AND c.post_id=s.post_id
    AND c.comment_id=s.comment_id AND c.conversation_version=s.conversation_version
    AND c.status='processing' RETURNING c.comment_id`,[olderThanSeconds,limit]);
   if(!Number.isInteger(r.rowCount)||r.rowCount<0)throw Error('Recovery not confirmed');
   return {recovered:r.rowCount,action:'manual',sent:false};
  },
  async claim(key,e,version){
   const r=await db.query(`INSERT INTO xjw_social.comment_ledger
    (platform,account_id,post_id,comment_id,conversation_version,thread_id,parent_comment_id)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING comment_id`,
    [...scope(e),version,e.threadId,e.parentCommentId||null]);
   // Opaque policy idempotency key is resolved by the caller's durable scope;
   // finish requires the same event/version, never a process-local map.
   if(!Number.isSafeInteger(r?.rowCount)||r.rowCount<0||r.rowCount>1)
    throw Error('PostgreSQL claim not confirmed');
   return r.rowCount===1;
  },
  async finish(key,decision,e,version){
   if(!e||!version||typeof e.threadId!=='string'||!e.threadId)
    throw Error('Durable scope required');
   if(!['suggest','skip','manual'].includes(decision.action)||decision.sent||decision.remoteReplyId)
    throw Error('Suggestion finish cannot mark a sent reply');
   const r=await db.query(`UPDATE xjw_social.comment_ledger SET status=$6,decision=$7::jsonb,
    updated_at=now() WHERE platform=$1 AND account_id=$2 AND post_id=$3 AND comment_id=$4
    AND conversation_version=$5 AND thread_id=$8 AND status='processing' RETURNING comment_id`,
    [...scope(e),version,decision.action,JSON.stringify(decision),e.threadId]);
   if(r.rowCount!==1)throw Error('Ledger state changed');
  },
  async recordError(e,decision){
   // API outages and cold-start failures can be reported repeatedly for
   // the SAME comment. Use a stable error scope and UPSERT rather than a new
   // random conversation_version on every failed poll: bounded storage and
   // repeat-safe audit, with no raw error body, token or customer text.
   const reason=decision?.reason;
   if(typeof reason!=='string'||!/^[a-z_]{1,64}$/.test(reason)||
      typeof e?.threadId!=='string'||!e.threadId)throw Error('Invalid error audit scope');
   const v='error-'+createHash('sha256').update(JSON.stringify([...scope(e),e.threadId,reason])).digest('hex');
   const r=await db.query(`INSERT INTO xjw_social.comment_ledger
    (platform,account_id,post_id,comment_id,conversation_version,thread_id,status,error_code)
    VALUES($1,$2,$3,$4,$5,$6,'manual',$7)
    ON CONFLICT (platform,account_id,post_id,comment_id,conversation_version)
    DO UPDATE SET updated_at=now(),error_code=EXCLUDED.error_code
    RETURNING comment_id`,[...scope(e),v,e.threadId,reason]);
   // The worker has only limited UPDATE columns. This query intentionally
   // never resets human_takeover, decision, reply ownership or send state.
   if(r?.rowCount!==1)throw Error('PostgreSQL error audit not persisted');
  }
 };
}
module.exports={createPgCommentStore};

