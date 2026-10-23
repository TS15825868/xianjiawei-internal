'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {normalizeInbox,createInboxSuggestionProcessor}=require('./comment-inbox-processor.cjs');
const allowed={facebook:['411869648852531'],instagram:['17841478328163000'],threads:['123456789']};
const digest='a'.repeat(64);
const page={object:'page',entry:[{id:'411869648852531',changes:[{field:'feed',
 value:{item:'comment',verb:'add',post_id:'411869648852531_456',parent_id:'411869648852531_456',
 comment_id:'456_789',message:'private must not leave inbox'}}]}]};
const instagram={object:'instagram',entry:[{id:'17841478328163000',changes:[{field:'comments',
 value:{id:'179999999999',media:{id:'180000000000'},text:'customer secret',from:{username:'private-user'}}}]}]};
const row=(platform,payload)=>({event_hash:digest,platform,account_id:
 platform==='facebook'?'411869648852531':platform==='instagram'?'17841478328163000':'123456789',payload});
test('verified Facebook top-level webhook becomes only scoped IDs, no customer text',()=>{
 const r=normalizeInbox(row('facebook',page),allowed);
 assert.equal(r.ok,true);assert.equal(r.events.length,1);
 assert.deepEqual(r.events[0],{platform:'facebook',accountId:'411869648852531',
  postId:'411869648852531_456',threadId:'456_789',commentId:'456_789'});
 assert.doesNotMatch(JSON.stringify(r.events),/private must not leave inbox/);
});
test('Instagram top-level media relationship is normalized without trusting content',()=>{
 const r=normalizeInbox(row('instagram',instagram),allowed);
 assert.equal(r.ok,true);assert.equal(r.events[0].postId,'180000000000');
 assert.equal(r.events[0].threadId,'179999999999');
 assert.doesNotMatch(JSON.stringify(r.events),/customer secret|private-user/);
});
test('ambiguous parent, invalid IDs, account mismatch and media mismatch fail closed',()=>{
 const copy=x=>JSON.parse(JSON.stringify(x));
 const badRoot=copy(page);badRoot.entry[0].changes[0].value.parent_id='456_777';
 const noParent=copy(page);delete noParent.entry[0].changes[0].value.parent_id;
 const changedVerb=copy(page);changedVerb.entry[0].changes[0].value.verb='edit';
 const malicious=copy(page);malicious.entry[0].changes[0].value.post_id='123/../../danger';
 const nested=copy(instagram);nested.entry[0].changes[0].value.parent_id='111';
 const contradictory=copy(instagram);contradictory.entry[0].changes[0].value.media_id='999';
 for(const [platform,payload] of [['facebook',badRoot],['facebook',noParent],['facebook',malicious],
  ['instagram',nested],['instagram',contradictory]]){
  const r=normalizeInbox(row(platform,payload),allowed);
  assert.equal(r.ok,false);assert.deepEqual(r.events,[]);
 }
 assert.equal(normalizeInbox(row('facebook',changedVerb),allowed).events.length,0);
 assert.equal(normalizeInbox({...row('facebook',page),account_id:'999'},allowed).ok,false);
 assert.equal(normalizeInbox({...row('facebook',page),event_hash:'not-verified'},allowed).ok,false);
 assert.equal(normalizeInbox(row('facebook',{...page,object:'instagram'}),allowed).ok,false);
});
test('Threads requires separate official event mapping; cannot be guessed',()=>{
 const r=normalizeInbox(row('threads',{object:'threads',entry:[{id:'123456789',changes:[]}]}),allowed);
 assert.equal(r.ok,false);assert.equal(r.reason,'threads_mapping_not_officially_verified');
});
test('batch from multiple signed accounts never leaks the other account into this row',()=>{
 const body=JSON.parse(JSON.stringify(page));
 body.entry.push({id:'999',changes:[]});
 assert.equal(normalizeInbox(row('facebook',body),allowed).ok,false);
 const extra={facebook:['411869648852531','999']};
 assert.equal(normalizeInbox(row('facebook',body),extra).ok,true);
});
function processorScenario({payload=page,platform='facebook',decision={
 action:'suggest',reason:'verified_product_fact',sent:false,idempotencyKey:'b'.repeat(64)
 },finished=true,failWrite=false}={}){
 const calls=[],inbox=row(platform,payload);let resolved=0;
 const db={async query(sql,args){
  calls.push({sql,args});
  if(sql.includes('FROM xjw_social.webhook_inbox WHERE'))return{rows:[inbox]};
  if(sql.includes('AS finished'))return{rows:[{finished}]};
  if(sql.includes('UPDATE xjw_social.webhook_inbox')){
   if(failWrite)throw Error('storage unavailable');
   return{rowCount:1};
  }
  throw Error('Unexpected SQL '+sql);
 }};
 const api={suggest:async e=>{resolved++;assert.ok(e.postId);return decision},
  handle:()=>assert.fail('Never invoke send-capable handle()')};
 return {processor:createInboxSuggestionProcessor({db,allowedAccounts:allowed,
  resolveAutomation:()=>api}),calls,resolved:()=>resolved};
}
test('durable verified suggestions are marked reviewed, never sent',async()=>{
 const x=processorScenario();const result=await x.processor.process();
 assert.deepEqual(result,{checked:1,reviewed:1,held:0,ignored:0,suggestions:1,manual:0,skipped:0,sent:false});
 assert.equal(x.resolved(),1);
 assert.ok(x.calls.some(c=>c.sql.includes("status='reviewed'")));
 assert.ok(!x.calls.some(c=>/DELETE|TRUNCATE|POST https/i.test(c.sql)));
});
test('unverified official API outcomes and unpersisted claims remain for human review',async()=>{
 for(const opts of [
  {decision:{action:'manual',reason:'permission_expired',sent:false}},
  {decision:{action:'sent',sent:true,idempotencyKey:'b'.repeat(64)}},
  {decision:{action:'suggest',sent:false,idempotencyKey:'b'.repeat(64)},finished:false},
  {platform:'threads',payload:{object:'threads',entry:[{id:'123456789',changes:[]}]}}
 ]){
  const x=processorScenario(opts),r=await x.processor.process();
  assert.equal(r.held,1);assert.equal(r.reviewed,0);
  assert.equal(x.calls.filter(c=>c.sql.includes('UPDATE xjw_social.webhook_inbox')).length,0);
 }
});
test('duplicate events require a completed durable ledger, never an in-progress claim',async()=>{
 const duplicate={action:'skip',reason:'duplicate_event',sent:false};
 for(const finished of [true,false]){
  const x=processorScenario({decision:duplicate,finished});
  const r=await x.processor.process();
  assert.equal(r.reviewed,finished?1:0);
 }
});
test('database failures cannot be acknowledged and limits cannot be bypassed',async()=>{
 const x=processorScenario({failWrite:true});
 await assert.rejects(x.processor.process(),/storage unavailable/);
 await assert.rejects(x.processor.process({limit:101}),/Invalid inbox limit/);
 await assert.rejects(x.processor.process({limit:0}),/Invalid inbox limit/);
});
