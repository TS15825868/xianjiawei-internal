const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createSendStore}=require('./comment-send-store.cjs');

const event={
 platform:'instagram',accountId:'17841478328163000',
 postId:'media-1',threadId:'thread-1',commentId:"comment'); DROP TABLE x;--"
};
const scope=['instagram','17841478328163000','media-1',event.commentId];
function adapter(rowCount){
 if(arguments.length===0)rowCount=1;
 const calls=[];
 const db={async query(sql,args){calls.push({sql,args});return {rowCount};}};
 return {store:createSendStore(db),calls};
}
test('missing database binding fails closed',()=>{
 for(const db of [null,{}, {query:5}])assert.throws(()=>createSendStore(db),/binding/);
});
test('reserve binds all identifiers and suggestion text; checks every release flag',async()=>{
 const x=adapter();
 const claim=await x.store.reserve(event,'thread-v1','Safe suggested text');
 assert.match(claim,/^[0-9a-f]{8}-[0-9a-f-]{27,}$/);
 assert.equal(x.calls.length,1);
 const {sql,args}=x.calls[0];
 assert.match(sql,/INSERT INTO xjw_social\.reply_ledger/);
 assert.match(sql,/ON CONFLICT DO NOTHING/);
 assert.match(sql,/c\.status='suggest'/);
 assert.match(sql,/p\.enabled AND p\.e2e_verified AND p\.overlap_verified/);
 assert.match(sql,/NOT c\.human_takeover/);
 assert.match(sql,/h\.human_takeover/);
 assert.match(sql,/c\.thread_id=\$7/);
 assert.match(sql,/c\.decision->>'reply'=\$8/);
 assert.ok(!sql.includes(event.commentId));
 assert.ok(!sql.includes('Safe suggested text'));
 assert.deepEqual(args.slice(0,5),[...scope,'thread-v1']);
 assert.equal(args[5],claim);
 assert.equal(args[6],event.threadId);
 assert.equal(args[7],'Safe suggested text');
});
test('confirmed duplicate or disabled reservation never claims a reply',async()=>{
 const x=adapter(0);
 assert.equal(await x.store.reserve(event,'v','suggestion'),null);
});
test('incomplete or impossible reservation receipts require manual recovery, not duplicate skips',async()=>{
 for(const rows of [undefined,null,NaN,-1,1.5,2,'0','1']){
  const x=adapter(rows);
  await assert.rejects(x.store.reserve(event,'v','suggestion'),/Reply reservation not confirmed/);
 }
 await assert.rejects(createSendStore({query:async()=>undefined}).reserve(event,'v','suggestion'),/Reply reservation not confirmed/);
});
test('send-start database receipts must confirm exactly one transitioned row',async()=>{
 for(const rows of [undefined,null,NaN,-1,1.5,2,'0','1']){
  const x=adapter(rows);
  await assert.rejects(x.store.begin(event,'claim-1'),/Reply send transition not confirmed/);
 }
 assert.equal(await adapter(0).store.begin(event,'claim-1'),false);
 await assert.rejects(createSendStore({query:async()=>undefined}).begin(event,'claim-1'),/Reply send transition not confirmed/);
});
test('begin requires a fresh durable reservation and all three active switches',async()=>{
 const x=adapter();
 assert.equal(await x.store.begin(event,'claim-1'),true);
 const {sql,args}=x.calls[0];
 assert.match(sql,/state='reserved'/);
 assert.match(sql,/SET state='sending'/);
 assert.match(sql,/p\.enabled AND p\.e2e_verified AND p\.overlap_verified/);
 assert.match(sql,/h\.human_takeover/);
 assert.match(sql,/AND EXISTS\(SELECT 1 FROM xjw_social\.comment_ledger c/);
 assert.match(sql,/c\.status='suggest'/);
 assert.match(sql,/c\.conversation_version=r\.conversation_version/);
 assert.match(sql,/NOT c\.human_takeover/);
 assert.match(sql,/RETURNING r\.claim_id/);
 assert.deepEqual(args,[...scope,'claim-1']);
 const rejected=adapter(0);
 assert.equal(await rejected.store.begin(event,'claim-1'),false);
});
test('invalid receipts are rejected without touching the database',async()=>{
 const x=createSendStore({query:()=>assert.fail('unexpected DB write')});
 for(const [state,id] of [
  ['sent',null],['sent',undefined],['sent',123],['sent',{}],
  ['sent',''],['sent','  '],['sent','bad\nid'],['sent','x'.repeat(257)],
  ['unknown','fake'],['unknown',''],
  ['manual','remote'],['cancelled',null],['reserved',null]
 ])await assert.rejects(x.finish(event,'claim-1',state,id),/Invalid send receipt/);
});
test('verified sent receipt uses a parameter, never embeds its identifier in SQL',async()=>{
 const x=adapter();
 await x.store.finish(event,'claim-1','sent','remote_reply_0123');
 const {sql,args}=x.calls[0];
 assert.match(sql,/state=\$6/);
 assert.match(sql,/sent_at=CASE WHEN \$6='sent' THEN now\(\) ELSE NULL END/);
 assert.match(sql,/retry_state='never'/);
 assert.match(sql,/state IN \('reserved','sending'\)/);
 assert.match(sql,/\(\$6<>'sent' OR state='sending'\)/);
 assert.equal(args[5],'sent');
 assert.equal(args[6],'remote_reply_0123');
 assert.ok(!sql.includes('remote_reply_0123'));
});
test('unknown and manual states cannot claim publication or retain a remote ID',async()=>{
 for(const [state,marker] of [['unknown','send_outcome_unknown'],['manual','final_check_stopped']]){
  const x=adapter();
  await x.store.finish(event,'claim-1',state);
  assert.deepEqual(x.calls[0].args,[...scope,'claim-1',state,null]);
  assert.match(x.calls[0].sql,new RegExp(marker));
  assert.match(x.calls[0].sql,/retry_state='never'/);
 }
});
test('state race and database outage never falsely acknowledge sent receipt',async()=>{
 const x=adapter(0);
 await assert.rejects(x.store.finish(event,'claim-1','sent','123'),/not persisted/);
 const err=createSendStore({query:async()=>{throw Error('db down')}});
 await assert.rejects(err.finish(event,'claim-1','sent','123'),/db down/);
});
test('stale reservations quarantine unknown with bounded locks and no retry',async()=>{
 const x=adapter(2);
 assert.deepEqual(await x.store.recover(),{quarantined:2,sent:false});
 assert.equal(x.calls.length,1);
 assert.match(x.calls[0].sql,/FOR UPDATE SKIP LOCKED/);
 assert.match(x.calls[0].sql,/LIMIT 100/);
 assert.match(x.calls[0].sql,/state IN \('reserved','sending'\)/);
 assert.match(x.calls[0].sql,/SET state='unknown'/);
 assert.match(x.calls[0].sql,/retry_state='never'/);
 assert.ok(!/sendReply|fetch\(|POST /i.test(x.calls[0].sql));
});
test('recovery requires confirmed nonnegative row count',async()=>{
 for(const rowCount of [-1,1.5,NaN,undefined]){
  const x=adapter(rowCount);
  await assert.rejects(x.store.recover(),/Recovery unconfirmed/);
 }
});

test('recovery only updates the selected conversation version and pending states',async()=>{
 const x=adapter(1);
 await x.store.recover();
 const sql=x.calls[0].sql;
 assert.match(sql,/SELECT platform,account_id,post_id,comment_id,conversation_version/);
 assert.match(sql,/r\.conversation_version=s\.conversation_version/);
 assert.match(sql,/r\.state IN \('reserved','sending'\)/);
});
