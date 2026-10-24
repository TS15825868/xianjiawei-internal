'use strict';
// Server-side, suggestion-only bridge between signed, durably stored Meta
// receipts and the existing official-history/atomic-ledger automation.
// Never handle HTTP requests directly, send replies, or trust webhook text.
// A caller must supply a protected worker DB query and official API bindings.
const {exactAllowedAccount}=require('./account-allowlist.cjs');
const {createHash}=require('node:crypto');

const IDENTIFIER=/^\d{1,64}(?:_\d{1,64})?$/;
const PLATFORM_OBJECT=Object.freeze({facebook:'page',instagram:'instagram',threads:'threads'});
const MAX_EVENTS=100;
const cleanId=value=>typeof value==='string'&&IDENTIFIER.test(value)?value:null;
const fail=reason=>Object.freeze({ok:false,reason,events:[],ignored:0});
function normalizeInbox(row,allowedAccounts){
 if(!row||!['facebook','instagram','threads'].includes(row.platform)||
    !cleanId(row.account_id)||!exactAllowedAccount(allowedAccounts,row.platform,row.account_id)||
    typeof row.event_hash!=='string'||!/^([a-f0-9]{64})$/.test(row.event_hash))
  return fail('unverified_inbox_scope');
 let body=row.payload;
 if(typeof body==='string'){try{body=JSON.parse(body)}catch{return fail('invalid_inbox_payload')}}
 if(!body||Array.isArray(body)||body.object!==PLATFORM_OBJECT[row.platform]||
    !Array.isArray(body.entry)||!body.entry.length||body.entry.length>100)
  return fail('invalid_inbox_payload');
 // One verified signed envelope may contain several allowed accounts. The
 // receiver saves one row per account; never process another account's events.
 const scoped=body.entry.filter(entry=>entry?.id===row.account_id);
 if(!scoped.length||body.entry.some(entry=>!cleanId(entry?.id)||
    !exactAllowedAccount(allowedAccounts,row.platform,entry.id)))
  return fail('unverified_inbox_scope');
 // Threads callback layouts are not yet confirmed against this App's
 // official webhook subscription. Never auto-classify even an empty batch.
 if(row.platform==='threads')return fail('threads_mapping_not_officially_verified');
 const events=[],seen=new Set();let ignored=0;
 for(const entry of scoped){
  if(!Array.isArray(entry.changes)||entry.changes.length>MAX_EVENTS)
   return fail('unverified_inbox_changes');
  for(const change of entry.changes){
   if(!change||typeof change!=='object'||Array.isArray(change))
    return fail('unverified_inbox_changes');
   const value=change.value;
   if(row.platform==='facebook' && (change.field!=='feed'||value?.item!=='comment'||value?.verb!=='add')){
    ignored++;continue;
   }
   if(row.platform==='instagram'&&change.field!=='comments'){ignored++;continue;}
   if(!value||typeof value!=='object'||Array.isArray(value))return fail('invalid_comment_change');
   let postId,commentId,parentId;
   if(row.platform==='facebook'){
    postId=cleanId(value.post_id);commentId=cleanId(value.comment_id);
    parentId=cleanId(value.parent_id);
    // Only a confirmed top-level comment has a known thread root. Replies to
    // other comments require an official API parent-chain lookup first.
    if(!postId||!commentId||!parentId||parentId!==postId||commentId===postId)
     return fail('comment_parent_unverified');
   }else{
    const media=value.media?.id??value.media_id;
    postId=cleanId(media);commentId=cleanId(value.id);
    if(value.media?.id&&value.media_id&&value.media.id!==value.media_id)
     return fail('comment_media_mismatch');
    if(!postId||!commentId||value.parent_id!==undefined&&value.parent_id!==null)
     return fail('comment_parent_unverified');
   }
   const key=[row.platform,row.account_id,postId,commentId].join(':');
   if(seen.has(key)){ignored++;continue;}
   seen.add(key);
   if(events.length>=MAX_EVENTS)return fail('inbox_event_limit');
   events.push(Object.freeze({platform:row.platform,accountId:row.account_id,
    postId,threadId:commentId,commentId}));
  }
 }
 return Object.freeze({ok:true,events,ignored});
}
function createInboxSuggestionProcessor({db,allowedAccounts,resolveAutomation}={}){
 if(typeof db?.query!=='function'||typeof resolveAutomation!=='function')
  throw Error('Protected inbox processor bindings required');
 // Resolve to an operator-created createCommentAutomation(...).suggest only;
 // never use the sender's handle()/releaseApproved path.
 return Object.freeze({async process({limit=20}={}){
  if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid inbox limit');
  const result=await db.query(`SELECT event_hash,platform,account_id,payload
   FROM xjw_social.webhook_inbox WHERE status='manual'
   ORDER BY created_at,event_hash,account_id LIMIT $1`,[limit]);
  if(!Array.isArray(result?.rows)||result.rows.length>limit)
   throw Error('Private inbox read unconfirmed');
  const summary={checked:result.rows.length,reviewed:0,held:0,ignored:0,
   suggestions:0,manual:0,skipped:0,sent:false};
  for(const row of result.rows){
   const parsed=normalizeInbox(row,allowedAccounts);
   if(!parsed.ok){summary.held++;continue;}
   let durable=true;
   const staged={suggestions:0,manual:0,skipped:0};
   for(const event of parsed.events){
    let decision;
    try{
     const automation=resolveAutomation(event.platform,event.accountId);
     if(typeof automation?.suggest!=='function'){durable=false;break;}
     decision=await automation.suggest(event);
    }catch{durable=false;break;}
    // The only acknowledged decisions are ones proven to be written by the
    // existing atomic comment ledger. Ambiguous API failures remain queued.
    if(!decision||decision.sent!==false||
       !['suggest','manual','skip'].includes(decision.action)){durable=false;break;}
    if(!(typeof decision.idempotencyKey==='string'&&/^[a-f0-9]{64}$/.test(decision.idempotencyKey))||
       !(typeof decision.conversationVersion==='string'&&/^[a-f0-9]{64}$/.test(decision.conversationVersion))){
      durable=false;break;
    }
    // On duplicates confirm that the prior claim actually reached a final
    // durable state, rather than being abandoned in 'processing'.
    // A completed row for this version is not proof of the SAME decision.
    // Only duplicate_event may reuse a previously finalized different action.
    // The claim fingerprint must bind the exact signed event scope and the
    // verified conversation version; an unrelated durable claim is not proof.
    const expectedKey=createHash('sha256').update(JSON.stringify([
      event.platform,event.accountId,event.postId,event.threadId,event.commentId,
      decision.conversationVersion
    ])).digest('hex');
    if(decision.idempotencyKey!==expectedKey){durable=false;break;}
    const expectedStatuses=decision.action==='skip'&&decision.reason==='duplicate_event'
      ? ['suggest','skip','manual']:[decision.action];
    const proof=await db.query(`SELECT EXISTS(
      SELECT 1 FROM xjw_social.comment_ledger WHERE platform=$1 AND account_id=$2
      AND post_id=$3 AND comment_id=$4 AND conversation_version=$5
      AND status=ANY($6::text[])
     ) AS finished`,[event.platform,event.accountId,event.postId,event.commentId,decision.conversationVersion,expectedStatuses]);
    if(proof?.rows?.length!==1||proof.rows[0]?.finished!==true){durable=false;break;}
    staged[decision.action==='suggest'?'suggestions':decision.action==='manual'?'manual':'skipped']++;
   }
   if(!durable){summary.held++;continue;}
   // Column-level UPDATE and RLS permit manual -> reviewed only.
   // Empty valid non-comment events may be acknowledged as ignored.
   const changed=await db.query(`UPDATE xjw_social.webhook_inbox SET status='reviewed'
    WHERE event_hash=$1 AND platform=$2 AND account_id=$3 AND status='manual'
    RETURNING event_hash`,[row.event_hash,row.platform,row.account_id]);
   if(changed?.rowCount===1){
    summary.reviewed++;
    summary.suggestions+=staged.suggestions;
    summary.manual+=staged.manual;
    summary.skipped+=staged.skipped;
    summary.ignored+=parsed.ignored;
   }else if(changed?.rowCount!==0)throw Error('Inbox review update unconfirmed');
  }
  return Object.freeze(summary);
 }});
}
module.exports={normalizeInbox,createInboxSuggestionProcessor};
