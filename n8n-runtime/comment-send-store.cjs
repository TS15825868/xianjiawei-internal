// Separate send ledger: existing suggestion policy/store are unchanged.
const {randomUUID}=require('node:crypto');
function createSendStore(db){
 if(typeof db?.query!=='function')throw Error('PostgreSQL binding required');
 const scope=e=>[e.platform,e.accountId,e.postId,e.commentId];
 return Object.freeze({
  async reserve(e,version,reply){
   const claim=randomUUID();
   const r=await db.query(`INSERT INTO xjw_social.reply_ledger
    (platform,account_id,post_id,comment_id,conversation_version,claim_id,state)
    SELECT c.platform,c.account_id,c.post_id,c.comment_id,c.conversation_version,$6,'reserved'
    FROM xjw_social.comment_ledger c JOIN xjw_social.platform_control p USING(platform)
    WHERE c.platform=$1 AND c.account_id=$2 AND c.post_id=$3 AND c.comment_id=$4
    AND c.conversation_version=$5 AND c.status='suggest' AND c.thread_id=$7
    AND c.decision->>'reply'=$8 AND NOT c.human_takeover
    AND p.enabled AND p.e2e_verified AND p.overlap_verified
    AND NOT EXISTS(SELECT 1 FROM xjw_social.comment_ledger h WHERE h.platform=c.platform
     AND h.account_id=c.account_id AND h.post_id=c.post_id AND h.thread_id=c.thread_id AND h.human_takeover)
    ON CONFLICT DO NOTHING RETURNING claim_id`,[...scope(e),version,claim,e.threadId,reply]);
   // 0 = platform disabled, duplicate or an existing reservation; only that
   // confirmed result is a normal skip. Malformed database acknowledgments
   // must not be disguised as 'disabled_or_reserved'.
   if(!Number.isSafeInteger(r?.rowCount)||r.rowCount<0||r.rowCount>1)
    throw Error('Reply reservation not confirmed');
   return r.rowCount===1?claim:null;
  },
  async begin(e,claim,reply){
   const r=await db.query(`UPDATE xjw_social.reply_ledger r SET state='sending',updated_at=now()
    FROM xjw_social.platform_control p WHERE r.platform=$1 AND r.account_id=$2
    AND r.post_id=$3 AND r.comment_id=$4 AND r.claim_id=$5 AND r.state='reserved'
    AND p.platform=r.platform AND p.enabled AND p.e2e_verified AND p.overlap_verified
    AND EXISTS(SELECT 1 FROM xjw_social.comment_ledger c
     WHERE c.platform=r.platform AND c.account_id=r.account_id AND c.post_id=r.post_id
     AND c.comment_id=r.comment_id AND c.conversation_version=r.conversation_version
     AND c.status='suggest' AND c.decision->>'reply'=$6 AND NOT c.human_takeover
     AND NOT EXISTS(SELECT 1 FROM xjw_social.comment_ledger h
      WHERE h.platform=c.platform AND h.account_id=c.account_id AND h.post_id=c.post_id
      AND h.thread_id=c.thread_id AND h.human_takeover))
    RETURNING r.claim_id`,[...scope(e),claim,reply]);
   if(!Number.isSafeInteger(r?.rowCount)||r.rowCount<0||r.rowCount>1)
    throw Error('Reply send transition not confirmed');
   return r.rowCount===1;
  },
  async finish(e,claim,state,id=null){
   // A sent status requires a genuine, nonblank platform receipt identifier.
   // Any non-sent state must carry no remote ID; NEVER fabricate success.
   const validRemoteId=typeof id==='string'&&id.trim().length>0&&id.length<=256&&
     !/[\u0000-\u001f\u007f]/u.test(id);
   if(!['sent','unknown','manual'].includes(state)||
      (state==='sent'?!validRemoteId:id!==null))throw Error('Invalid send receipt');
   const r=await db.query(`UPDATE xjw_social.reply_ledger SET state=$6,
    remote_reply_id=$7,sent_at=CASE WHEN $6='sent' THEN now() ELSE NULL END,
    error_code=CASE WHEN $6='unknown' THEN 'send_outcome_unknown' WHEN $6='manual' THEN 'final_check_stopped' ELSE NULL END,
    retry_state='never',updated_at=now() WHERE platform=$1 AND account_id=$2 AND post_id=$3
    AND comment_id=$4 AND claim_id=$5 AND state IN ('reserved','sending')
    AND ($6<>'sent' OR state='sending') RETURNING claim_id`,
    [...scope(e),claim,state,id]);
   if(r.rowCount!==1)throw Error('Send receipt not persisted');
  },
  async recover(){
   // Uncertain reservations block all future versions. Recovery never sends.
   const r=await db.query(`WITH stale AS (SELECT platform,account_id,post_id,comment_id,conversation_version
    FROM xjw_social.reply_ledger WHERE state IN ('reserved','sending')
    AND updated_at<now()-interval '15 minutes' ORDER BY updated_at LIMIT 100 FOR UPDATE SKIP LOCKED)
    UPDATE xjw_social.reply_ledger r SET state='unknown',error_code='interrupted_send',retry_state='never',updated_at=now()
    FROM stale s WHERE r.platform=s.platform AND r.account_id=s.account_id
    AND r.post_id=s.post_id AND r.comment_id=s.comment_id
    AND r.conversation_version=s.conversation_version AND r.state IN ('reserved','sending')
    RETURNING r.claim_id`);
   if(!Number.isInteger(r.rowCount)||r.rowCount<0)throw Error('Recovery unconfirmed');
   return {quarantined:r.rowCount,sent:false};
  }
 });
}
module.exports={createSendStore};
