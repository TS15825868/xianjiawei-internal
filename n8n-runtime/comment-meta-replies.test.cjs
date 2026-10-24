const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createMetaReplyAdapter}=require('./comment-meta-replies.cjs');
const event={platform:'facebook',accountId:'123',commentId:'456',postId:'789',threadId:'456'};
function adapter(reply){
 const calls=[];
 const a=createMetaReplyAdapter({platform:'facebook',accountId:'123',
  request:async opts=>{calls.push(opts);return reply(opts);},
  loadThread:async()=>{throw Error('not needed');},permissionEvidence:async()=>({
   platform:'facebook',accountId:'123',verified:true,checkedAt:Date.now(),
   expiresAt:Date.now()+600000,scopes:['pages_read_engagement','pages_read_user_content','pages_manage_engagement']})});
 return {a,calls};
}
test('HTTP 401/429/503 cannot impersonate successful Meta identity or reply receipt',async()=>{
 for(const status of [401,429,503]){
  const {a,calls}=adapter(({method})=>({status,id:method==='GET'?'123':'remote-123'}));
  await assert.rejects(a.authorize(event),/Official API rejected request/);
  await assert.rejects(a.sendReply(event,'hello','version'),/Official API rejected request/);
  assert.equal(calls.length,2);
  assert.ok(calls.every(c=>c.retries===0&&c.followRedirects===false));
 }
});
test('fetch-style failures and malformed transport responses fail closed',async()=>{
 for(const result of [null,undefined,{ok:false,id:'remote-123'}, {status:302,id:'remote-123'},
  {status:'200',id:'remote-123'}, {status:0,id:'remote-123'},
  {statusCode:403,id:'remote-123'}]){
  const {a}=adapter(()=>result);
  await assert.rejects(a.sendReply(event,'hello','version'),/Official API rejected request/);
 }
});
test('confirmed successful Meta JSON response is still usable',async()=>{
 const {a}=adapter(({method})=>method==='GET'?{status:200,id:'123'}:{status:201,id:'remote-123'});
 assert.equal(await a.authorize(event),true);
 assert.deepEqual(await a.sendReply(event,'hello','version'),{status:201,id:'remote-123'});
});

test('Threads missing or malformed conversation version never creates a container',async()=>{
 for(const version of [undefined,null,'','previous-version','A'.repeat(64),'0'.repeat(63),'x'.repeat(64),123]){
  let contacted=0;
  const a=createMetaReplyAdapter({
   platform:'threads',accountId:'123',
   request:async()=>{contacted++;throw Error('must not create container')},
   loadThread:async()=>{contacted++;throw Error('must not load history')},
   permissionEvidence:async()=>{contacted++;throw Error('must not request permissions')}
  });
  await assert.rejects(a.sendReply({...event,platform:'threads'},'仙加味',version),
   /Unverified conversation version/);
  assert.equal(contacted,0);
 }
});
test('blank reply never posts to any official platform',async()=>{
 for(const platform of ['facebook','instagram','threads']){
  let contacted=0;
  const a=createMetaReplyAdapter({
   platform,accountId:'123',
   request:async()=>{contacted++;throw Error('must not POST')},
   loadThread:async()=>{contacted++;throw Error('must not load')},
   permissionEvidence:async()=>{contacted++;throw Error('must not authorize')}
  });
  await assert.rejects(a.sendReply({...event,platform},'  ','0'.repeat(64)),/Invalid reply scope/);
  assert.equal(contacted,0);
 }
});
