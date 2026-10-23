const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {createCommentSender}=require('./comment-sender.cjs');
const {createMetaReplyAdapter}=require('./comment-meta-replies.cjs');
const {createSendStore}=require('./comment-send-store.cjs');
const e={platform:'facebook',accountId:'123',postId:'456',threadId:'789',commentId:'101'};
const thread={...e,complete:true,verified:true,messages:[{id:'101',text:'龜鹿膏成分？',role:'customer',authorId:'999',at:'2026-10-22T00:00:00Z'}]};
const version=createHash('sha256').update(JSON.stringify(thread.messages)).digest('hex');
const catalog={verified:true,version:'test',source:'fixture',fetchedAt:new Date().toISOString(),products:[{id:'paste',name:'龜鹿膏',ingredients:['測試原料']}]};
const suggestion={action:'suggest',reply:'龜鹿膏的成分依序為：測試原料。',conversationVersion:version,sent:false};
function harness({release=true,read=async()=>thread,send=async()=>({id:'remote'}),begin=true,authorize=true,finishError=false,catalogOverride=catalog}={}){
 let reserved=false,sends=0;const states=[];
 const store={reserve:async()=>{if(reserved)return null;reserved=true;return 'claim';},begin:async()=>begin,
  finish:async(a,b,state)=>{states.push(state);if(finishError)throw Error('DB down');}};
 const sender=createCommentSender({workflow:{execute:async()=>suggestion},adapter:{loadThread:read,authorize:async()=>authorize,
  sendReply:async(...args)=>{sends++;return send(...args);}},store,catalog:catalogOverride,allowedAccounts:{facebook:['123']},releaseApproved:release});
 return {sender,states,sends:()=>sends};
}
test('default dry run does not reserve or send',async()=>{const h=harness();assert.equal((await h.sender.execute(e)).sent,false);assert.equal(h.sends(),0);assert.deepEqual(h.states,[]);});
test('release and live permission gates fail closed',async()=>{for(const options of [{release:false},{authorize:false}]){const h=harness(options);assert.equal((await h.sender.execute(e,{dryRun:false})).action,'manual');assert.equal(h.sends(),0);}});
test('parallel runs reserve only one public reply',async()=>{const h=harness();const r=await Promise.all(Array.from({length:20},()=>h.sender.execute(e,{dryRun:false})));assert.equal(h.sends(),1);assert.equal(r.filter(x=>x.sent).length,1);assert.deepEqual(h.states,['sent']);});
test('changed conversation stops before reservation',async()=>{const h=harness({read:async()=>({...thread,messages:[]})});assert.equal((await h.sender.execute(e,{dryRun:false})).reason,'conversation_changed');assert.equal(h.sends(),0);});
test('human takeover after reservation stops sending',async()=>{let reads=0;const h=harness({read:async()=>({...thread,...(++reads>1?{replyOwnership:'human'}:{})})});assert.equal((await h.sender.execute(e,{dryRun:false})).sent,false);assert.equal(h.sends(),0);assert.deepEqual(h.states,['manual']);});
test('durable takeover or platform disable at begin stops sending',async()=>{const h=harness({begin:false});await h.sender.execute(e,{dryRun:false});assert.equal(h.sends(),0);assert.deepEqual(h.states,['manual']);});
test('facts changing after reservation are quarantined and never send the stale approved answer',async()=>{
 let reads=0;
 const dynamicCatalog={...catalog,products:catalog.products.map(p=>({...p,ingredients:[...p.ingredients]}))};
 const h=harness({catalogOverride:dynamicCatalog,read:async()=>{
  if(++reads===2)dynamicCatalog.products[0].ingredients=['已變更的來源資料'];
  return thread;
 }});
 const r=await h.sender.execute(e,{dryRun:false});
 assert.equal(r.reason,'final_ownership_changed');
 assert.equal(r.sent,false);
 assert.equal(h.sends(),0);
 assert.deepEqual(h.states,['manual']);
});
test('read failure never calls send',async()=>{const h=harness({read:async()=>{throw Error('token secret must not escape');}});const r=await h.sender.execute(e,{dryRun:false});assert.equal(h.sends(),0);assert.ok(!JSON.stringify(r).includes('token secret'));});
test('POST timeout and missing receipt quarantine unknown and never retry',async()=>{for(const send of [async()=>{throw Error('timeout');},async()=>({})]){const h=harness({send});const r=await h.sender.execute(e,{dryRun:false});assert.equal(r.reason,'send_outcome_unknown');await h.sender.execute(e,{dryRun:false});assert.equal(h.sends(),1);assert.deepEqual(h.states,['unknown']);}});
test('receipt database failure cannot claim success or resend',async()=>{const h=harness({finishError:true});assert.equal((await h.sender.execute(e,{dryRun:false})).sent,false);await h.sender.execute(e,{dryRun:false});assert.equal(h.sends(),1);});
test('unapproved account never touches workflow or transport',async()=>{const h=harness();assert.equal((await h.sender.execute({...e,accountId:'other'},{dryRun:false})).reason,'unverified_account');assert.equal(h.sends(),0);});
test('Postgres reservation binds reply and scope and checks all switches',async()=>{let call;const s=createSendStore({query:async(sql,args)=>{call={sql,args};return {rowCount:0};}});assert.equal(await s.reserve(e,version,suggestion.reply),null);assert.match(call.sql,/ON CONFLICT DO NOTHING/);assert.match(call.sql,/p.enabled AND p.e2e_verified AND p.overlap_verified/);assert.match(call.sql,/h.human_takeover/);assert.equal(call.args[7],suggestion.reply);assert.ok(!call.sql.includes(suggestion.reply));});
test('stale send recovery never replays and is bounded',async()=>{let sql;const s=createSendStore({query:async q=>{sql=q;return {rowCount:2};}});assert.deepEqual(await s.recover(),{quarantined:2,sent:false});assert.match(sql,/SKIP LOCKED/);assert.match(sql,/LIMIT 100/);assert.match(sql,/state='unknown'/);});
test('ledger rejects fabricated sent receipt',async()=>{const s=createSendStore({query:()=>assert.fail('no SQL')});await assert.rejects(s.finish(e,'claim','sent'));await assert.rejects(s.finish(e,'claim','unknown','fake'));});
test('Facebook and Instagram use official comment reply paths with zero retry',async()=>{for(const platform of ['facebook','instagram']){let req;const a=createMetaReplyAdapter({platform,accountId:'123',request:async r=>{req=r;return {id:'reply'};},loadThread:async()=>thread,permissionEvidence:async()=>({}),catalog});await a.sendReply({...e,platform},'仙加味');assert.equal(req.url,`https://graph.${platform}.com/v25.0/101/${platform==='instagram'?'replies':'comments'}`);assert.equal(req.retries,0);assert.equal(req.followRedirects,false);assert.deepEqual(req.body,{message:'仙加味'});}});
test('official identity and grant evidence are required',async()=>{const a=createMetaReplyAdapter({platform:'facebook',accountId:'123',request:async()=>({id:'456'}),loadThread:async()=>thread,permissionEvidence:()=>assert.fail('wrong identity'),catalog});assert.equal(await a.authorize(e),false);});
test('Threads container is not published if conversation changed',async()=>{const calls=[];const a=createMetaReplyAdapter({platform:'threads',accountId:'123',request:async r=>{calls.push(r);return {id:'321'};},loadThread:async()=>({...thread,messages:[]}),permissionEvidence:async()=>({}),catalog});await assert.rejects(a.sendReply({...e,platform:'threads'},'仙加味',version));assert.equal(calls.length,1);assert.equal(calls[0].body.reply_to_id,'101');});
test('Threads publishes container and returns only final receipt',async()=>{const calls=[];const t={...thread,platform:'threads'};const a=createMetaReplyAdapter({platform:'threads',accountId:'123',request:async r=>{calls.push(r);return {id:calls.length===1?'321':'654'};},loadThread:async()=>t,permissionEvidence:async()=>({}),catalog});assert.equal((await a.sendReply({...e,platform:'threads'},suggestion.reply,version)).id,'654');assert.equal(calls.length,2);assert.deepEqual(calls[1].body,{creation_id:'321'});});

test('malformed durable reply reservation is a manual preflight failure and never sends',async()=>{
 const h=harness();
 const original=h.sender;
 // The real PostgreSQL adapter is covered separately; sender must treat a
 // throwing durable store as a hard stop, not a successful or duplicate send.
 const store=createSendStore({query:async()=>({rowCount:undefined})});
 const sender=createCommentSender({workflow:{execute:async()=>suggestion},adapter:{
  authorize:async()=>true,loadThread:async()=>thread,
  sendReply:async()=>{assert.fail('must not POST after unconfirmed reservation')}
 },store,catalog,allowedAccounts:{facebook:['123']},releaseApproved:true});
 const result=await sender.execute(e,{dryRun:false});
 assert.equal(result.action,'manual');
 assert.equal(result.reason,'preflight_unavailable');
 assert.equal(result.sent,false);
});

test('null and malformed workflow suggestions fail closed without contacting transport',async()=>{
 for(const malformed of [null,undefined,0,'bad',[]]){
  let called=false;
  const sender=createCommentSender({
   workflow:{execute:async()=>malformed},
   adapter:{loadThread:async()=>{called=true;throw Error('unexpected read')},
    authorize:async()=>{called=true;throw Error('unexpected auth')},
    sendReply:async()=>{called=true;throw Error('unexpected send')}},
   store:{reserve:async()=>{called=true;throw Error('unexpected reserve')}},
   catalog,allowedAccounts:{facebook:['123']},releaseApproved:true
  });
  const result=await sender.execute(e,{dryRun:false});
  assert.equal(result.action,'manual');
  assert.equal(result.reason,'suggestion_unavailable');
  assert.equal(result.sent,false);
  assert.equal(called,false);
 }
});
