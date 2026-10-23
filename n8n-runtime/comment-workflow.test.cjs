const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createCommentWorkflow}=require('./comment-workflow.cjs');
const event={platform:'facebook',accountId:'qa',postId:'post',threadId:'thread',commentId:'comment'};
const thread={...event,complete:true,verified:true,messages:[{id:'comment',text:'龜鹿膏成分？',role:'customer',authorId:'qa-customer',at:new Date().toISOString()}]};
const catalog={verified:true,version:'fixture',source:'fixture',fetchedAt:new Date().toISOString(),products:[{id:'paste',name:'龜鹿膏',ingredients:['fixture']}]};
function harness(control){
 const calls=[];let ownershipReads=0;
 const db={query:async(sql,args)=>{
  calls.push(sql);
  if(sql.includes('AS human_takeover'))return {rows:[control(++ownershipReads)]};
  return {rowCount:1};
 }};
 const workflow=createCommentWorkflow({db,adapter:{loadThread:async()=>thread},catalog,allowedAccounts:{facebook:['qa']}});
 return {workflow,calls};
}
test('workflow uses existing policy/store and respects persisted human takeover',async()=>{
 const {workflow}=harness(()=>({human_takeover:true,reply_reserved:false}));
 const r=await workflow.execute(event);assert.equal(r.action,'skip');assert.equal(r.sent,false);
 assert.equal(r.reason,'other_responder_owns_conversation');
});
test('takeover appearing during final refresh prevents a suggestion',async()=>{
 const {workflow}=harness(n=>({human_takeover:n>1,reply_reserved:false}));
 const r=await workflow.execute(event);assert.equal(r.action,'skip');assert.equal(r.sent,false);
});
test('existing send reservation prevents suggestions across versions',async()=>{
 const {workflow}=harness(()=>({human_takeover:false,reply_reserved:true}));
 assert.equal((await workflow.execute(event)).action,'skip');
});
test('ownership uncertainty fails closed without claim',async()=>{
 const {workflow,calls}=harness(()=>({}));
 const r=await workflow.execute(event);assert.equal(r.action,'manual');assert.equal(r.sent,false);
 // The idempotent API-error UPSERT is allowed; the normal suggestion claim
 // (ON CONFLICT DO NOTHING) must still never run when ownership is uncertain.
 assert.ok(!calls.some(sql=>sql.includes('ON CONFLICT DO NOTHING')));
 assert.ok(calls.some(sql=>sql.includes('ON CONFLICT (platform,account_id,post_id,comment_id,conversation_version)')));
});
test('unapproved account never accesses database',async()=>{
 const {workflow,calls}=harness(()=>assert.fail('no read'));
 assert.equal((await workflow.execute({...event,accountId:'unapproved'})).reason,'unverified_account');
 assert.equal(calls.length,0);
});
test('normal suggestion still comes from the existing product policy',async()=>{
 const {workflow}=harness(()=>({human_takeover:false,reply_reserved:false}));
 const r=await workflow.execute(event);assert.equal(r.action,'suggest');assert.equal(r.sent,false);
 assert.equal(r.evidence.productId,'paste');
});
