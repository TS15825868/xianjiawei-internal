const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createPgCommentStore}=require('./comment-pg-store.cjs');
const {processComment}=require('./comment-policy.cjs');
const e={platform:'facebook',accountId:'fixture',postId:'post',threadId:'thread',commentId:"comment'); DROP TABLE x;--"};
test('restart recovery quarantines stale claims with bounded locking, never resends',async()=>{
 const store=createPgCommentStore({query:async(sql,args)=>{
  assert.match(sql,/FOR UPDATE SKIP LOCKED/);assert.match(sql,/status='manual'/);
  assert.match(sql,/retry_state='never'/);assert.deepEqual(args,[900,100]);
  return {rowCount:2};
 }});
 assert.deepEqual(await store.recoverStaleProcessing(),{recovered:2,action:'manual',sent:false});
});
test('recovery rejects unsafe bounds before accessing database',async()=>{
 const store=createPgCommentStore({query:async()=>assert.fail('must not query')});
 for(const opts of [{olderThanSeconds:0},{olderThanSeconds:NaN},{limit:1001},{limit:0}])
  await assert.rejects(store.recoverStaleProcessing(opts),/Invalid recovery bounds/);
});
test('recovery requires database confirmation',async()=>{
 await assert.rejects(createPgCommentStore({query:async()=>({})}).recoverStaleProcessing(),/not confirmed/);
});
test('Postgres claims bind all identifiers and use atomic unique conflict',async()=>{
 const calls=[];const store=createPgCommentStore({query:async(sql,args)=>{calls.push({sql,args});return {rowCount:1}}});
 assert.equal(await store.claim('key',e,'v1'),true);
 assert.match(calls[0].sql,/ON CONFLICT DO NOTHING RETURNING/);
 assert.ok(!calls[0].sql.includes(e.commentId));assert.equal(calls[0].args[3],e.commentId);
});
test('Postgres duplicate claim is skipped',async()=>assert.equal(await createPgCommentStore({query:async()=>({rowCount:0})}).claim('k',e,'v'),false));
test('finish cannot fabricate sent or lose durable scope',async()=>{
 const store=createPgCommentStore({query:async()=>{assert.fail('must not write')}});
 await assert.rejects(store.finish('k',{action:'suggest',sent:true},e,'v'));
 await assert.rejects(store.finish('k',{action:'suggest'}));
});
test('finish rejects concurrent state change',async()=>{
 const store=createPgCommentStore({query:async()=>({rowCount:0})});
 await assert.rejects(store.finish('k',{action:'skip',sent:false},e,'v'),/state changed/);
});
test('policy passes durable event and version to Pg finish',async()=>{
 const calls=[];const store=createPgCommentStore({query:async(sql,args)=>{calls.push({sql,args});return {rowCount:1}}});
 const t={...e,verified:true,complete:true,messages:[{id:e.commentId,text:'早安',role:'customer',authorId:'fixture-customer',at:new Date().toISOString()}]};
 const r=await processComment(e,{adapter:{loadThread:async()=>t},store,allowedAccounts:{facebook:['fixture']}});
 assert.equal(r.action,'skip');assert.equal(calls.length,2);assert.equal(calls[1].args[3],e.commentId);assert.match(calls[1].args[4],/^[a-f0-9]{64}$/);
});



test('Postgres claim never disguises an unconfirmed write as an ordinary duplicate',async()=>{
 for(const rowCount of [undefined,null,-1,2,NaN,'1']){
  const store=createPgCommentStore({query:async()=>({rowCount})});
  await assert.rejects(store.claim('k',e,'v'),/PostgreSQL claim not confirmed/);
 }
 assert.equal(await createPgCommentStore({query:async()=>({rowCount:0})}).claim('k',e,'v'),false);
});
test('Postgres error audit must persist exactly one sanitized manual record',async()=>{
 for(const rowCount of [undefined,null,0,2]){
  const store=createPgCommentStore({query:async()=>({rowCount})});
  await assert.rejects(store.recordError(e,{reason:'api_unavailable'}),/PostgreSQL error audit not persisted/);
 }
 const seen=[];
 const store=createPgCommentStore({query:async(sql,args)=>{seen.push({sql,args});return {rowCount:1}}});
 await assert.doesNotReject(store.recordError(e,{reason:'api_unavailable'}));
 assert.match(seen[0].sql,/INSERT INTO xjw_social.comment_ledger/);
 assert.equal(seen[0].args.at(-1),'api_unavailable');
 assert.ok(!seen[0].sql.includes(e.commentId));
});


test('repeated official API failures share one durable audit scope and never expand storage',async()=>{
 const events=[];const seen=new Set();
 const store=createPgCommentStore({query:async(sql,args)=>{
  events.push({sql,args});
  assert.match(sql,/ON CONFLICT \(platform,account_id,post_id,comment_id,conversation_version\)/);
  assert.match(sql,/DO UPDATE SET updated_at=now\(\),error_code=EXCLUDED.error_code/);
  assert.doesNotMatch(sql,/human_takeover\s*=|status\s*=\s*'processing'/);
  seen.add(args[4]);
  return {rowCount:1};
 }});
 await store.recordError(e,{reason:'api_unavailable'});
 await store.recordError(e,{reason:'api_unavailable'});
 assert.equal(events.length,2);
 assert.equal(events[0].args[4],events[1].args[4]);
 assert.match(events[0].args[4],/^error-[a-f0-9]{64}$/);
 assert.equal(seen.size,1);
 await store.recordError(e,{reason:'permission_expired'});
 assert.equal(seen.size,2);
});
test('unsafe or customer-controlled audit reasons are rejected without database calls',async()=>{
 const store=createPgCommentStore({query:async()=>assert.fail('audit must not use SQL')});
 for(const reason of ['Invalid password=secret','api-unavailable','api_unavailable\nDROP',undefined,'x'.repeat(65)])
  await assert.rejects(store.recordError(e,{reason}),/Invalid error audit scope/);
});


// A reused comment/version fingerprint from another thread must never
// complete this thread's processing claim, even if the other fields match.
test('finish binds the exact thread, not just a comment/version fingerprint',async()=>{
 const calls=[];
 const store=createPgCommentStore({query:async(sql,args)=>{
  calls.push({sql,args});
  assert.match(sql,/thread_id=\$8/);
  assert.equal(args[7],e.threadId);
  return {rowCount:args[7]==='thread'?1:0};
 }});
 await assert.doesNotReject(store.finish('key',{action:'suggest',sent:false},e,'v1'));
 assert.equal(calls.length,1);
 const mismatched=createPgCommentStore({query:async(sql,args)=>{
  assert.match(sql,/thread_id=\$8/);
  assert.equal(args[7],'other_thread');
  // A real PostgreSQL WHERE thread_id=$8 would match no row here.
  return {rowCount:0};
 }});
 await assert.rejects(mismatched.finish('key',{action:'suggest',sent:false},
  {...e,threadId:'other_thread'},'v1'),/Ledger state changed/);
 const invalid=createPgCommentStore({query:async()=>assert.fail('must not write')});
 await assert.rejects(invalid.finish('key',{action:'suggest',sent:false},
  {...e,threadId:''},'v1'),/Durable scope required/);
});

test('thread ownership joins every reply claim to its exact comment and version',async()=>{
 const store=createPgCommentStore({query:async(sql,args)=>{
  assert.match(sql,/JOIN xjw_social\.comment_ledger c/);
  assert.match(sql,/c\.conversation_version=r\.conversation_version/);
  assert.match(sql,/c\.thread_id=\$4/);
  assert.doesNotMatch(sql,/AND comment_id=\$5 AND state IN/);
  assert.deepEqual(args,[e.platform,e.accountId,e.postId,e.threadId,e.commentId]);
  return {rows:[{human_takeover:false,reply_reserved:true}]};
 }});
 assert.deepEqual(await store.conversationControl(e),{humanTakeover:false,replyReserved:true});
});
test('uncertain ownership query cannot be interpreted as a safe empty thread',async()=>{
 const store=createPgCommentStore({query:async()=>({rows:[]})});
 await assert.rejects(store.conversationControl(e),/ownership not confirmed/);
});
