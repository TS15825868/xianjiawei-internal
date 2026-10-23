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
 action:'suggest',reason:'verified_product_fact',sent:false,idempotencyKey:'b'.repeat(64),conversationVersion:'c'.repeat(64)
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
  {decision:{action:'sent',sent:true,idempotencyKey:'b'.repeat(64),conversationVersion:'c'.repeat(64)}},
  {decision:{action:'suggest',sent:false,idempotencyKey:'b'.repeat(64),conversationVersion:'c'.repeat(64)},finished:false},
  {platform:'threads',payload:{object:'threads',entry:[{id:'123456789',changes:[]}]}}
 ]){
  const x=processorScenario(opts),r=await x.processor.process();
  assert.equal(r.held,1);assert.equal(r.reviewed,0);
  assert.equal(x.calls.filter(c=>c.sql.includes('UPDATE xjw_social.webhook_inbox')).length,0);
 }
});
test('duplicate events require a completed durable ledger, never an in-progress claim',async()=>{
 const duplicate={action:'skip',reason:'duplicate_event',sent:false,idempotencyKey:'b'.repeat(64),conversationVersion:'c'.repeat(64)};
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

test('isolated signed inbox -> official GET -> atomic comment ledger -> ERP-ready suggestion, without POST',async()=>{
 const {createCommentAutomation}=require('./comment-automation.cjs');
 const calls=[],counts={reads:0,writes:0,sends:0},claims=new Set();
 const db={async query(sql,args){
  calls.push(sql);
  if(sql.includes('FROM xjw_social.webhook_inbox WHERE'))return{rows:[row('facebook',page)]};
  if(sql.includes('AS human_takeover'))return{rows:[{human_takeover:false,reply_reserved:false}]};
  if(sql.includes('INSERT INTO xjw_social.comment_ledger')){
   const key=args.slice(0,5).join(':');if(claims.has(key))return{rowCount:0};
   claims.add(key);counts.writes++;return{rowCount:1};
  }
  if(sql.includes('UPDATE xjw_social.comment_ledger'))return{rowCount:1};
  if(sql.includes('AS finished'))return{rows:[{finished:claims.size>0}]};
  if(sql.includes('UPDATE xjw_social.webhook_inbox'))return{rowCount:1};
  throw Error('Unreviewed query '+sql);
 }};
 // A consistent official timestamp is essential for the conversation
 // fingerprint; changing official history between reads must block replies.
 const officialCreatedAt='2026-10-23T12:00:00.000Z';
 const request=async({method,url,retries,followRedirects})=>{
  assert.equal(retries,0);assert.equal(followRedirects,false);
  if(method!=='GET'){counts.sends++;throw Error('No send permitted');}
  counts.reads++;
  if(url.includes('/411869648852531_456/comments?'))return{data:[{
   id:'456_789',message:'請問龜鹿膏成分？',from:{id:'900'},
   created_time:officialCreatedAt
  }]};
  if(url.includes('/456_789/comments?'))return{data:[]};
  throw Error('Unexpected API '+url);
 };
 const automation=createCommentAutomation({
  db,platform:'facebook',accountId:'411869648852531',username:'仙加味',
  request,verifyPost:async()=>({
   verified:true,platform:'facebook',accountId:'411869648852531',
   postId:'411869648852531_456',username:'仙加味',
   readPermissionVerified:true,checkedAt:Date.now()
  }),
  permissionEvidence:async()=>({
   verified:true,platform:'facebook',accountId:'411869648852531',
   checkedAt:Date.now(),expiresAt:Date.now()+3600000,
   scopes:['pages_read_engagement','pages_read_user_content','pages_manage_engagement']
  }),
  catalog:{verified:true,version:'test-only',source:'fixture',
   fetchedAt:new Date().toISOString(),
   products:[{id:'gao',name:'龜鹿膏',ingredients:['鹿角萃取物','龜板萃取物']}]},
  allowedAccounts:allowed,releaseApproved:true
 });
 const decisions=[];
 const processor=createInboxSuggestionProcessor({db,allowedAccounts:allowed,
  resolveAutomation:()=>({suggest:async event=>{const decision=await automation.suggest(event);decisions.push(decision);return decision;}})});
 const result=await processor.process();
 assert.equal(result.reviewed,1,JSON.stringify({result,counts,sql: calls.map(s=>s.slice(0,75))}));
 assert.equal(result.suggestions,1,JSON.stringify({result,decisions}));
 assert.equal(counts.writes,1);
 assert.ok(counts.reads>=2);
 assert.equal(counts.sends,0,'Even a release-capable automation must be forced into suggest-only mode');
 assert.ok(calls.some(s=>s.includes('ON CONFLICT DO NOTHING')));
 assert.ok(calls.some(s=>s.includes("status='reviewed'")));
});

// An older completed conversation must not acknowledge a newly interrupted one.
test('completion proof is scoped to the exact conversation version, including duplicates',async()=>{
 for(const action of ['suggest','skip']){
  const x=processorScenario({decision:{action,reason:action==='skip'?'duplicate_event':'verified_product_fact',
   sent:false,idempotencyKey:'b'.repeat(64),conversationVersion:'d'.repeat(64)},finished:false});
  const result=await x.processor.process();
  const proof=x.calls.find(c=>c.sql.includes('AS finished'));
  assert.match(proof.sql,/conversation_version=\$5/);
  assert.equal(proof.args[4],'d'.repeat(64));
  assert.equal(result.reviewed,0);
  assert.equal(result.held,1);
 }
 const missing=processorScenario({decision:{action:'skip',reason:'duplicate_event',sent:false},finished:true});
 assert.equal((await missing.processor.process()).reviewed,0);
 assert.equal(missing.calls.some(c=>c.sql.includes('AS finished')),false);
});

test('partial batch never reports a suggestion as committed when a later event fails',async()=>{
 const payload=JSON.parse(JSON.stringify(instagram));
 payload.entry[0].changes.push({field:'comments',value:{
  id:'179999999998',media:{id:'180000000000'}
 }});
 const inbox=row('instagram',payload);
 const good={action:'suggest',sent:false,idempotencyKey:'b'.repeat(64),conversationVersion:'c'.repeat(64)};
 let seen=0,updates=0;
 const db={async query(sql){
  if(sql.includes('FROM xjw_social.webhook_inbox WHERE'))return {rows:[inbox]};
  if(sql.includes('AS finished'))return {rows:[{finished:true}]};
  if(sql.includes('UPDATE xjw_social.webhook_inbox')){updates++;return {rowCount:1};}
  throw Error('Unexpected SQL');
 }};
 const processor=createInboxSuggestionProcessor({db,allowedAccounts:allowed,
  resolveAutomation:()=>({suggest:async()=>++seen===1?good:{action:'manual',sent:false}})});
 const result=await processor.process();
 assert.equal(result.checked,1);
 assert.equal(result.held,1);
 assert.equal(result.reviewed,0);
 assert.equal(result.suggestions,0);
 assert.equal(result.manual,0);
 assert.equal(result.sent,false);
 assert.equal(updates,0);
});
test('concurrent inbox review does not count suggestions without a durable status transition',async()=>{
 const inbox=row('instagram',instagram);
 const good={action:'suggest',sent:false,idempotencyKey:'b'.repeat(64),conversationVersion:'c'.repeat(64)};
 const db={async query(sql){
  if(sql.includes('FROM xjw_social.webhook_inbox WHERE'))return {rows:[inbox]};
  if(sql.includes('AS finished'))return {rows:[{finished:true}]};
  if(sql.includes('UPDATE xjw_social.webhook_inbox'))return {rowCount:0};
  throw Error('Unexpected SQL');
 }};
 const processor=createInboxSuggestionProcessor({db,allowedAccounts:allowed,
  resolveAutomation:()=>({suggest:async()=>good})});
 const result=await processor.process();
 assert.equal(result.reviewed,0);
 assert.equal(result.suggestions,0);
 assert.equal(result.sent,false);
});

test('durable completion proof matches the exact action except for a genuine duplicate',async()=>{
 const cases=[
  {action:'suggest',reason:'verified_product_fact',ledger:'suggest',reviewed:1},
  {action:'suggest',reason:'verified_product_fact',ledger:'manual',reviewed:0},
  {action:'skip',reason:'no_new_question',ledger:'suggest',reviewed:0},
  {action:'skip',reason:'no_new_question',ledger:'skip',reviewed:1},
  {action:'skip',reason:'duplicate_event',ledger:'suggest',reviewed:1},
  {action:'skip',reason:'duplicate_event',ledger:'processing',reviewed:0}
 ];
 for(const c of cases){
  let updates=0,proof;
  const db={async query(sql,args){
   if(sql.includes('FROM xjw_social.webhook_inbox WHERE'))return {rows:[row('facebook',page)]};
   if(sql.includes('AS finished')){
    proof={sql,args};
    return {rows:[{finished:args[5].includes(c.ledger)}]};
   }
   if(sql.includes('UPDATE xjw_social.webhook_inbox')){updates++;return {rowCount:1};}
   throw Error('Unexpected SQL');
  }};
  const decision={action:c.action,reason:c.reason,sent:false,
   idempotencyKey:'b'.repeat(64),conversationVersion:'c'.repeat(64)};
  const processor=createInboxSuggestionProcessor({db,allowedAccounts:allowed,
   resolveAutomation:()=>({suggest:async()=>decision})});
  const result=await processor.process();
  assert.match(proof.sql,/status=ANY\\(\\$6::text\\[\\]\\)/);
  assert.deepEqual(proof.args[5],c.reason==='duplicate_event'
   ? ['suggest','skip','manual']:[c.action]);
  assert.equal(result.reviewed,c.reviewed);
  assert.equal(result.held,1-c.reviewed);
  assert.equal(updates,c.reviewed);
 }
});
