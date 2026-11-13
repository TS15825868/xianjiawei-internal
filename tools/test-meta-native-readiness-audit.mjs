import test from 'node:test';
import assert from 'node:assert/strict';
import {probeNativeBrandRoute,collectNativeBrandRouteOnce} from '../src/meta-native-readiness-audit.js';
const page='411869648852531',ig='17841400000000000';
test('read-only verified account route, only GET, no secret or false send certification',async()=>{
 let calls=[];
 const fetcher=async(url,opts)=>{
  calls.push(url);assert.equal(opts.method,'GET');assert.equal(opts.headers.Authorization,'Bearer secret-test');
  assert.equal(new URL(url).hostname,'graph.facebook.com');assert.equal(new URL(url).searchParams.has('access_token'),false);
  const p=new URL(url).pathname;
  let data={};
  if(p.endsWith('/me/permissions'))data={data:[{permission:'pages_manage_posts',status:'granted'},{permission:'instagram_content_publish',status:'granted'}]};
  else if(p.endsWith('/me')&&url.includes('tasks'))data={tasks:['CREATE_CONTENT']};
  else if(p.endsWith('/'+page+'_1446376627512555'))data={id:page+'_1446376627512555',full_picture:'https://cdn.example.com/photo.jpg?access_token=SECRET'};
  else if(p.endsWith('/'+ig+'/content_publishing_limit'))data={data:[{quota_usage:1}]};
  else if(p.endsWith('/'+ig+'/media'))data={data:[{id:'123',permalink:'https://www.instagram.com/p/Dbr1T8YIJuk/',media_url:'https://cdn.example.com/ig.jpg'}]};
  else if(p.endsWith('/'+ig))data={id:ig,username:'xianjiawei.tw'};
  else data={id:page,instagram_business_account:{id:ig}};
  return{ok:true,json:async()=>data};
 };
 const r=await probeNativeBrandRoute({META_PAGE_ACCESS_TOKEN:'secret-test'},{fetcher});
 assert.equal(r.facebook.identityMatches,true);assert.equal(r.facebook.authorizationEvidence,true);assert.equal(r.instagram.identityMatches,true);assert.equal(r.instagram.authorizationEvidence,true);assert.equal(r.actualPublishVerified,false);assert.equal(r.publications,0);assert.equal(r.missingMedia.length,2);
 assert(!JSON.stringify(r).includes('secret-test'));assert(!JSON.stringify(r).includes('access_token'));assert(calls.length>3);
});
test('wrong Meta destination stops before any history or permission query',async()=>{
 let calls=0;
 const r=await probeNativeBrandRoute({META_PAGE_ACCESS_TOKEN:'secret-test'},{fetcher:async()=>{calls++;return{ok:true,json:async()=>({id:'999999999'})}}});
 assert.equal(calls,1);assert.equal(r.facebook.identityMatches,false);assert.equal(r.actualPublishVerified,false);
});
test('missing IG connection is not certified by Facebook success',async()=>{
 const r=await probeNativeBrandRoute({META_PAGE_ACCESS_TOKEN:'secret-test'},{fetcher:async()=>({ok:true,json:async()=>({id:page})})});
 assert.equal(r.instagram.linkedIdPresent,false);assert.equal(r.instagram.authorizationEvidence,undefined);assert.equal(r.publications,0);
});
test('default disabled never touches DB or remote',async()=>{
 const r=await collectNativeBrandRouteOnce({DB:{prepare(){throw Error('unexpected DB')}}});
 assert.equal(r.skipped,'disabled');
});
