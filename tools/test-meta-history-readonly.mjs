import test from 'node:test';
import assert from 'node:assert/strict';
import {collectMetaHistoryOnce,safeUrl,fbPost,igPost} from '../src/meta-history-readonly.js';
test('disabled by default: no DB or Graph access',async()=>{
 let called=0;
 const r=await collectMetaHistoryOnce({DB:{prepare(){called++}},META_PAGE_ACCESS_TOKEN:'secret'},{fetcher:()=>{called++;throw Error('network')}});
 assert.equal(r.skipped,'disabled');assert.equal(called,0);
});
test('single read-only Graph history capture includes FB subattachments and IG carousel children without secrets',async()=>{
 let record=null,writes=0,requests=[];
 const db={prepare(sql){let args=[];return{bind(...a){args=a;return this},async first(){return record?{status:record.status}:null},async run(){
   if(sql.startsWith('CREATE'))return{success:true};
   if(sql.startsWith('INSERT')){if(record)return{meta:{changes:0}};record={status:'running'};return{meta:{changes:1}}}
   if(sql.startsWith('UPDATE')){writes++;record={status:args[0],value:JSON.parse(args[1])};return{success:true}};
   throw Error('unexpected mutation')}}}};
 const env={DB:db,XJW_META_HISTORY_READONLY_DATE:'2026-11-05',META_PAGE_ACCESS_TOKEN:'PRIVATE_TEST_TOKEN'};
 const fetcher=async(url,opts)=>{requests.push(url);assert.equal(opts.method,'GET');assert.equal(opts.headers.Authorization,'Bearer PRIVATE_TEST_TOKEN');let data;
   if(url.includes('/me?'))data={id:'123',instagram_business_account:{id:'456'}};
   else if(url.includes('/123/posts?'))data={data:[{id:'fb1',message:'仙加味社群',permalink_url:'https://facebook.com/post/1?access_token=REMOVE',attachments:{data:[{media:{image:{src:'https://cdn.example.com/1.jpg'}},subattachments:{data:[{media:{image:{src:'https://cdn.example.com/2.jpg'}}}]}}]}}]};
   else if(url.includes('/456/media?'))data={data:[{id:'ig1',caption:'仙加味生活',media_type:'CAROUSEL_ALBUM',permalink:'https://instagram.com/p/one/',children:{data:[{id:'igchild',media_url:'https://cdn.example.com/3.jpg'}]}}]};
   else throw Error('unexpected URL '+url);
   return{ok:true,json:async()=>data};
 };
 const result=await collectMetaHistoryOnce(env,{fetcher});
 assert.equal(result.ok,true);assert.equal(result.summary.status,'partial_threads_unverified');
 assert.equal(result.summary.completeThreePlatforms,false);
 assert.equal(record.value.facebook.length,1);assert.equal(record.value.facebook[0].images.length,2);
 assert.equal(record.value.instagram.length,1);assert.equal(record.value.instagram[0].images.length,1);
 assert.equal(record.value.facebook[0].permalink,'https://facebook.com/post/1');
 assert.equal(writes,1);assert.equal(requests.length,3);
 assert.ok(!JSON.stringify(record).includes('PRIVATE_TEST_TOKEN'));
 assert.ok(!JSON.stringify(record).includes('access_token'));
 const again=await collectMetaHistoryOnce(env,{fetcher});
 assert.equal(again.skipped,'already_attempted');assert.equal(writes,1);assert.equal(requests.length,3);
});
test('public URLs redact access tokens, invalid non-HTTPS values are withheld',()=>{
 assert.equal(safeUrl('https://example.com/a.jpg?access_token=PRIVATE&v=1'),'https://example.com/a.jpg?v=1');
 assert.equal(safeUrl('http://example.com/img'),'');
 assert.equal(fbPost({id:'f',message:'abc'}).images.length,0);
 assert.equal(igPost({id:'i',children:{data:[]}}).images.length,0);
});
