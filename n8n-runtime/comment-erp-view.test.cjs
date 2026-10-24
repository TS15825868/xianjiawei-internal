const {test}=require('node:test');const assert=require('node:assert/strict');
const {createCommentErpView}=require('./comment-erp-view.cjs');
test('private ERP view binds platform/account/version and limits rows',async()=>{
 let call;const view=createCommentErpView({allowedAccounts:{instagram:['123']},db:{query:async(sql,args)=>{call={sql,args};return {rows:[{platform:'instagram',account_id:'123',comment_id:'789',status:'manual',reply_state:'unknown',human_takeover:true,error_code:'send_outcome_unknown',updated_at:'now'}]};}}});
 const rows=await view.list({platform:'instagram',accountId:'123',limit:10});assert.deepEqual(call.args,['instagram','123',10]);
 assert.match(call.sql,/r.conversation_version=c.conversation_version/);assert.match(call.sql,/r.platform=c.platform/);
 assert.equal(rows[0].replyState,'unknown');assert.equal(rows[0].humanTakeover,true);assert.equal(rows[0].errorCode,'send_outcome_unknown');
});
test('unapproved accounts and excessive limits never access DB',async()=>{const view=createCommentErpView({allowedAccounts:{facebook:['123']},db:{query:()=>assert.fail('no SQL')}});for(const input of [{platform:'instagram',accountId:'123'},{platform:'facebook',accountId:'other'},{platform:'facebook',accountId:'123',limit:101}])await assert.rejects(view.list(input));});
test('ERP projection omits raw payloads, credentials and unsanitized errors',async()=>{const view=createCommentErpView({allowedAccounts:{facebook:['123']},db:{query:async()=>({rows:[{platform:'facebook',account_id:'123',raw:'customer private',token:'secret',error_code:'token=secret'}]})}});const r=await view.list({platform:'facebook',accountId:'123'});assert.ok(!JSON.stringify(r).includes('secret'));assert.ok(!JSON.stringify(r).includes('customer private'));});
test('ERP human takeover persists only in the requested platform/account/thread',async()=>{let args;const v=createCommentErpView({allowedAccounts:{facebook:['123']},db:{query:async(sql,a)=>{args=a;assert.match(sql,/human_takeover=true/);return {rowCount:2};}}});assert.deepEqual(await v.takeover({platform:'facebook',accountId:'123',postId:'456',threadId:'789'}),{humanTakeover:true,updated:2,sent:false});assert.deepEqual(args,['facebook','123','456','789']);});
test('missing durable conversation is not reported as successful takeover',async()=>{const v=createCommentErpView({allowedAccounts:{facebook:['123']},db:{query:async()=>({rowCount:0})}});await assert.rejects(v.takeover({platform:'facebook',accountId:'123',postId:'456',threadId:'789'}));});

test('ERP refuses unexpected cross-account ledger rows',async()=>{
 const view=createCommentErpView({allowedAccounts:{facebook:['123']},db:{query:async()=>({rows:[{platform:'facebook',account_id:'999',comment_id:'456'}]})}});
 await assert.rejects(view.list({platform:'facebook',accountId:'123'}),/ERP scope mismatch/);
});

// An unexpected adapter result must never bypass the SQL LIMIT or be treated as a successful private ERP read.
test('ERP rejects oversized or missing database read results',async()=>{
 const account={platform:'facebook',account_id:'123'};
 for(const result of [undefined,null,{}, {rows:null},{rows:[account,account]}]){
  const view=createCommentErpView({allowedAccounts:{facebook:['123']},db:{query:async()=>result}});
  await assert.rejects(view.list({platform:'facebook',accountId:'123',limit:1}),/ERP read unconfirmed/);
 }
});
