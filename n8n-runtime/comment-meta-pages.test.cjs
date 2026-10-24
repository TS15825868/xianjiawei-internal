const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createPageCollector}=require('./comment-meta-pages.cjs');
const origin='https://graph.facebook.com';
test('collects all pages, not first page only',async()=>{
 const calls=[];
 const reader=createPageCollector({origin,request:async x=>{
  calls.push(x);
  return calls.length===1?{data:[{id:'1'}],paging:{next:origin+'/v25.0/post/comments?after=a'}}:{data:[{id:'2'}]};
 }});
 const r=await reader.collect(origin+'/v25.0/post/comments');
 assert.equal(r.complete,true);assert.equal(r.pages,2);assert.deepEqual(r.items.map(x=>x.id),['1','2']);
 assert.ok(calls.every(x=>x.retries===0&&x.followRedirects===false));
});
test('rejects embedded tokens before any credential-bearing request',async()=>{
 for(const suffix of ['?access_token=secret','?ACCESS_TOKEN=secret','?access%5Ftoken=secret','?token=secret']){
  let calls=0;const r=createPageCollector({origin,request:async()=>{calls++;return {data:[],paging:{next:origin+'/v25.0/a'+suffix}};}});
  await assert.rejects(r.collect(origin+'/v25.0/a'));assert.equal(calls,1);
  await assert.rejects(r.collect(origin+'/v25.0/a'+suffix));assert.equal(calls,1);
 }
});
test('Meta tokenized next is reduced to official cursor without forwarding any access token',async()=>{
 const requests=[];
 const reader=createPageCollector({origin,request:async q=>{
  requests.push(q.url);
  return requests.length===1?{data:[{id:'1'}],paging:{
   cursors:{after:'cursor-xyz'},
   next:origin+'/v25.0/post/comments?limit=100&access_token=private-test-token&after=cursor-xyz'
  }}:{data:[{id:'2'}]};
 }});
 const result=await reader.collect(origin+'/v25.0/post/comments?fields=id&limit=100');
 assert.deepEqual(result.items.map(i=>i.id),['1','2']);
 assert.ok(requests.every(u=>!u.includes('access_token')&&!u.includes('private-test-token')));
 assert.match(requests[1],/after=cursor-xyz/);
 assert.match(requests[1],/fields=id/);
});
test('token-bearing opaque next can only continue from official cursor, never its own token',async()=>{
 const requests=[];
 const reader=createPageCollector({origin,request:async q=>{
  requests.push(q.url);
  return requests.length===1?{data:[{id:'1'}],paging:{
   cursors:{after:'officialCursor_2'},
   next:origin+'/v25.0/a?__paging_token=opaque&access_token=private-test-token'
  }}:{data:[{id:'2'}]};
 }});
 const r=await reader.collect(origin+'/v25.0/a?fields=id&limit=100');
 assert.equal(r.pages,2);assert.ok(requests[1].includes('after=officialCursor_2'));
 assert.ok(!requests[1].includes('__paging_token'));
 assert.ok(requests.every(u=>!u.includes('access_token')));
});
test('tokenized paging with missing or mismatched cursor is rejected before follow-up request',async()=>{
 for(const paging of [
  {next:origin+'/v25.0/a?access_token=secret'},
  {next:origin+'/v25.0/a?access_token=secret&after=evil',cursors:{after:'safe'}},
  {next:'https://example.org/v25.0/a?access_token=secret',cursors:{after:'safe'}},
  {next:origin+'/v25.0/b?access_token=secret',cursors:{after:'safe'}},
  {next:origin+'/v25.0/a?access_token=secret',cursors:{after:'x'.repeat(4097)}}
 ]){
  let calls=0;
  const reader=createPageCollector({origin,request:async()=>{calls++;return {data:[],paging}}});
  await assert.rejects(reader.collect(origin+'/v25.0/a'));
  assert.equal(calls,1);
 }
});

test('rejects unsafe URL variants and changed endpoint',async()=>{
 for(const next of ['http://graph.facebook.com/v25.0/a','//graph.facebook.com/v25.0/a','https://u:p@graph.facebook.com/v25.0/a',origin+'/v25.0/b',origin+'/v25.0/a#x']){
  const r=createPageCollector({origin,request:async()=>({data:[],paging:{next}})});await assert.rejects(r.collect(origin+'/v25.0/a'));
 }
});
test('rejects malformed paging, next and cursor values',async()=>{
 for(const paging of [null,[],false,'bad',{next:0},{next:false},{next:null},{next:''},{next:{}},{cursors:[]},{cursors:{after:5}}]){
  const r=createPageCollector({origin,request:async()=>({data:[],paging})});await assert.rejects(r.collect(origin+'/v25.0/a'));
 }
});
test('rejects invalid configured limits before making requests',()=>{
 for(const maxPages of [0,-1,1.5,101,Infinity,NaN,'2'])assert.throws(()=>createPageCollector({origin,request:async()=>{},maxPages}));
 for(const maxItems of [0,-1,1.5,10001,Infinity,NaN,'2'])assert.throws(()=>createPageCollector({origin,request:async()=>{},maxItems}));
});
test('canonicalized query loops and page exhaustion fail closed',async()=>{
 const r=createPageCollector({origin,request:async()=>({data:[],paging:{next:origin+'/v25.0/a?b=2&a=1'}})});
 await assert.rejects(r.collect(origin+'/v25.0/a?a=1&b=2'));
 const bounded=createPageCollector({origin,maxPages:1,request:async()=>({data:[],paging:{next:origin+'/v25.0/a?after=2'}})});
 await assert.rejects(bounded.collect(origin+'/v25.0/a'));
});
test('sanitizes request errors without leaking secrets',async()=>{
 const r=createPageCollector({origin,request:async()=>{throw Error('access_token=secret');}});
 await assert.rejects(r.collect(origin+'/v25.0/a'),e=>!e.message.includes('secret'));
});
test('rejects off-origin next and credential-bearing URLs',async()=>{
 const reader=createPageCollector({origin,request:async()=>({data:[],paging:{next:'https://example.com/steal'}})});
 await assert.rejects(reader.collect(origin+'/v25.0/post/comments'));
 await assert.rejects(reader.collect('https://user:pass@graph.facebook.com/a'));
});
test('rejects paging loops and truncated responses',async()=>{
 const url=origin+'/v25.0/a';
 const loop=createPageCollector({origin,request:async()=>({data:[],paging:{next:url}})});
 await assert.rejects(loop.collect(url));
 const bad=createPageCollector({origin,request:async()=>({paging:{}})});
 await assert.rejects(bad.collect(url));
});
test('fails closed on duplicate IDs, bounds, and API errors',async()=>{
 const url=origin+'/v25.0/a';
 await assert.rejects(createPageCollector({origin,request:async()=>({data:[{id:'1'},{id:'1'}]})}).collect(url));
 await assert.rejects(createPageCollector({origin,maxItems:1,request:async()=>({data:[{id:'1'},{id:'2'}]})}).collect(url));
 await assert.rejects(createPageCollector({origin,request:async()=>({error:{message:'secret'}})}).collect(url));
});


test('unsuccessful official HTTP pages are rejected even with valid-looking data',async()=>{
 const url=origin+'/v25.0/post/comments?fields=id&limit=100';
 for(const response of [
  {status:401,data:[{id:'1'}]},
  {statusCode:403,data:[{id:'1'}]},
  {status:429,data:[{id:'1'}]},
  {status:500,data:[{id:'1'}]},
  {status:302,data:[{id:'1'}]},
  {ok:false,data:[{id:'1'}]},
  {status:'200',data:[{id:'1'}]},
  {statusCode:NaN,data:[{id:'1'}]}
 ]){
  let calls=0;
  const reader=createPageCollector({origin,request:async()=>{calls++;return response;}});
  await assert.rejects(reader.collect(url),/Incomplete official page/);
  assert.equal(calls,1);
 }
});
test('valid official HTTP status with complete pagination remains accepted',async()=>{
 const url=origin+'/v25.0/post/comments';
 const requests=[];
 const reader=createPageCollector({origin,request:async request=>{
  requests.push(request.url);
  return requests.length===1
   ?{ok:true,status:200,data:[{id:'1'}],paging:{next:url+'?after=page2'}}
   :{ok:true,statusCode:200,data:[{id:'2'}]};
 }});
 const result=await reader.collect(url);
 assert.equal(result.complete,true);
 assert.deepEqual(result.items.map(row=>row.id),['1','2']);
 assert.equal(requests.length,2);
});
