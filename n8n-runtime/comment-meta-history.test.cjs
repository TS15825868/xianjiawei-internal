const {test}=require('node:test');const assert=require('node:assert/strict');
const {createMetaHistoryReader}=require('./comment-meta-history.cjs');
const {decide}=require('./comment-policy.cjs');
const base={accountId:'123',postId:'456',threadId:'789',commentId:'789'};
function harness(platform,change={}){
 const e={...base,platform};const calls=[];
 const record=(id,text,author,parent)=>platform==='facebook'?{id,message:text,from:{id:author},created_time:'2026-10-22T01:00:00Z',...(parent?{parent:{id:parent}}:{})}:
 platform==='instagram'?{id,text,username:author==='123'?'xianjiawei.tw':author,timestamp:'2026-10-22T01:00:00Z',...(parent?{parent_id:parent}:{})}:
 {id,text,username:author==='123'?'xianjiawei.tw':author,timestamp:'2026-10-22T01:00:00Z',replied_to:{id:parent||'456'}};
 const root=record('789','龜鹿膏成分？','999');
 const request=async r=>{calls.push(r);return change.response?change.response(r,record):{data:r.url.includes('/456/')?[root]:[]};};
 const verifyPost=async()=>({verified:true,...e,username:'xianjiawei.tw',checkedAt:Date.now(),readPermissionVerified:true,...change.proof});
 return {e,calls,reader:createMetaHistoryReader({platform,accountId:'123',username:'xianjiawei.tw',request,verifyPost})};
}
test('all platforms produce scoped complete ordered history only after ownership proof',async()=>{
 for(const p of ['facebook','instagram','threads']){const h=harness(p);const t=await h.reader.loadThread(h.e);assert.equal(t.complete,true);assert.equal(t.verified,true);assert.equal(t.messages[0].id,'789');assert.equal(t.messages[0].role,'customer');}
});
test('ownership mismatch and missing permission make no comment calls',async()=>{
 for(const proof of [{accountId:'wrong'},{readPermissionVerified:false},{checkedAt:0}]){const h=harness('instagram',{proof});await assert.rejects(h.reader.loadThread(h.e));assert.equal(h.calls.length,0);}
});
test('empty comments stay unverified rather than asserting there are none',async()=>{const h=harness('instagram',{response:()=>({data:[]})});await assert.rejects(h.reader.loadThread(h.e),/visibility unverified/);});
test('later reply-page failure never returns a complete conversation',async()=>{const h=harness('facebook',{response:(r,m)=>r.url.includes('/456/')?{data:[m('789','龜鹿膏成分？','999')]}:{error:{message:'denied'}}});await assert.rejects(h.reader.loadThread(h.e));});
test('brand responder stays conservatively human, never guessed AI',async()=>{const h=harness('instagram',{response:(r,m)=>({data:r.url.includes('/456/')?[m('789','龜鹿膏成分？','999')]:[m('790','已回答','123','789')]})});const t=await h.reader.loadThread(h.e);assert.equal(t.replyOwnership,'human');assert.equal(t.messages[1].replyTo,'789');});
test('multiple customers remain manual through existing policy',async()=>{const h=harness('facebook',{response:(r,m)=>({data:r.url.includes('/456/')?[m('789','龜鹿膏成分？','999')]:[m('790','請問容量？','998','789')]})});const t=await h.reader.loadThread(h.e);assert.equal(decide(h.e,t,{}).reason,'multiple_customers_in_thread');});
test('missing author or timestamp fails closed',async()=>{const h=harness('instagram',{response:()=>({data:[{id:'789',text:'hello'}]})});await assert.rejects(h.reader.loadThread(h.e));});
test('Threads missing parent and cycles fail closed',async()=>{
 for(const items of [[{id:'789',text:'q',username:'999',timestamp:'2026-10-22T01:00:00Z',replied_to:{id:'456'}},{id:'790',replied_to:{id:'missing'}}],
 [{id:'789',replied_to:{id:'456'}},{id:'790',replied_to:{id:'791'}},{id:'791',replied_to:{id:'790'}}]]){
  const h=harness('threads',{response:()=>({data:items})});await assert.rejects(h.reader.loadThread(h.e));
 }
});
test('wrong target comment never silently substitutes another message',async()=>{const h=harness('facebook');await assert.rejects(h.reader.loadThread({...h.e,commentId:'888'}));});


test('Instagram Login username-only comment history works with no from.id',async()=>{
 const h=harness('instagram',{response:(r,m)=>({data:r.url.includes('/456/')?[m('789','龜鹿膏成分？','999')]:[m('790','品牌回覆','123','789')]})});
 const result=await h.reader.loadThread(h.e);
 assert.equal(result.messages.length,2);
 assert.equal(result.messages[0].role,'customer');
 assert.equal(result.messages[1].role,'brand');
 assert.equal(result.replyOwnership,'human');
 assert.ok(h.calls.every(q=>!decodeURIComponent(q.url).includes(',from,')));
 assert.ok(h.calls.every(q=>decodeURIComponent(q.url).includes('username')));
});
test('Instagram missing or contradictory author never fabricates a safe conversation',async()=>{
 const noAuthor=harness('instagram',{response:()=>({data:[{id:'789',text:'hi',timestamp:'2026-10-22T01:00:00Z'}]})});
 await assert.rejects(noAuthor.reader.loadThread(noAuthor.e),/Incomplete official comment/);
 const conflict=harness('instagram',{response:()=>({data:[{id:'789',text:'hi',username:'someoneelse',from:{id:'123'},timestamp:'2026-10-22T01:00:00Z'}]})});
 await assert.rejects(conflict.reader.loadThread(conflict.e),/Conflicting Instagram author/);
});
