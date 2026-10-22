const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createPageCollector}=require('./comment-meta-pages.cjs');
const origin='https://graph.facebook.com';
test('collects all pages, not first page only',async()=>{
 const calls=[];
 const reader=createPageCollector({origin,request:async x=>{
  calls.push(x);
  return calls.length===1?{data:[{id:'1'}],paging:{next:origin+'/v25.0/next?after=a'}}:{data:[{id:'2'}]};
 }});
 const r=await reader.collect(origin+'/v25.0/post/comments');
 assert.equal(r.complete,true);assert.equal(r.pages,2);assert.deepEqual(r.items.map(x=>x.id),['1','2']);
 assert.ok(calls.every(x=>x.retries===0&&x.followRedirects===false));
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
