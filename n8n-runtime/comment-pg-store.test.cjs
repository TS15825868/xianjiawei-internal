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

