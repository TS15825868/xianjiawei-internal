'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {verifyScheduledHistoricalReceipt:v}=require('./verify-scoped-scheduled-receipt.cjs');
const p=require('./receipts/20261120-owner-directed-scheduled.json');
const t=Date.parse('2026-11-20T11:00:00+08:00'),fp=()=>p.fingerprint;
const post={id:p.postId,status:'published',image_approved:0,published_at:p.publicationAt};
const checks=Object.fromEntries(['brand','product','specification','pricing_activity','season','weather','occasion','location','scene_environment','temperature','expression','action','mascot_companions','physical_scale','duplicate','compliance_final'].map(k=>[k,{result:k==='duplicate'?'DEFER':'PASS'}]));
const mockUrls={facebook:'https://facebook.com/1475619177921633/posts/12345',instagram:'https://www.instagram.com/p/EXAMPLE/',threads:'https://www.threads.com/@xianjiawei.tw/post/EXAMPLE'};
const rows=()=>Object.entries(mockUrls).map(([platform,remote_id])=>({post_id:p.postId,metricool_id:p.metricoolId,uuid:p.uuid,state:'published',status:'published',remote_id,grant_id:p.grantId,grant_schema:'xjw-owner-directed-scoped-release-v1',scope:'brand-social-only',owner_authorization_ref:p.ownerAuthorizationRef,revoked_at:null,content_fingerprint:p.fingerprint,grant_fp:p.fingerprint,review_fp:p.fingerprint,grant_sha:p.imageSha256,image_sha256:p.imageSha256,review_id:p.reviewId,decision:'NEEDS_HUMAN_REVIEW',evidence_json:JSON.stringify({checks}),sync_at:p.publicationAt,delivery_at:p.publicationAt,grant_at:p.publicationAt,issued_at:p.observedAt,expires_at:p.publicationAt,channels_json:JSON.stringify(Object.keys(mockUrls)),platform,response_json:JSON.stringify({source:'Metricool connector',network:platform,id:platform==='instagram'?remote_id:platform==='facebook'?'12345':'67890',status:'PUBLISHED',publicUrl:remote_id,metricoolId:p.metricoolId,uuid:p.uuid,ownerDirectException:true,duplicate:'DEFER',observedAt:'2026-11-20T10:30:00+08:00'})}));
test('only exact delivered historical row is eligible; fixtures never write D1',()=>{assert.equal(v(post,rows(),p,fp,t),true);assert.equal(v({...post,status:'pending_review'},rows(),p,fp,t),false);assert.equal(v(post,[],p,fp,t),false);assert.equal(v(post,rows(),p,fp,Date.parse('2026-11-19T10:00:00+08:00')),false)});
test('wrong brand, missing/partial/future/fake receipt or stale fingerprint cannot pass',()=>{assert.equal(v(post,rows().slice(1),p,fp,t),false);assert.equal(v(post,rows(),p,()=> 'wrong',t),false);for(const change of [r=>r.status='pending',r=>r.revoked_at=p.publicationAt,r=>r.remote_id='https://facebook.com/999/posts/12345',r=>r.response_json='{}',r=>{let z=JSON.parse(r.response_json);z.observedAt='2026-11-19T10:00:00+08:00';r.response_json=JSON.stringify(z)},r=>{let z=JSON.parse(r.response_json);z.source='planner only';r.response_json=JSON.stringify(z)}]){const rr=rows();change(rr[0]);assert.equal(v(post,rr,p,fp,t),false)}});

test('genuine late Metricool publication passes without manufacturing AI approval or changing actual D1 timestamps',()=>{
 const actual='2026-11-20T02:07:10.534Z';
 const source={...post,published_at:actual};
 const delivered=rows().map(r=>({
  ...r,delivery_at:actual,
  response_json:JSON.stringify({...JSON.parse(r.response_json),source:'Metricool official connector',observedAt:actual})
 }));
 assert.equal(v(source,delivered,p,fp,t),true);
 assert.equal(source.published_at,actual);
 assert.equal(delivered[0].delivery_at,actual);
 assert.equal(source.image_approved,0);
 assert.equal(JSON.parse(delivered[0].evidence_json).checks.duplicate.result,'DEFER');
 // Every channel must prove the very same publication time and real connector source.
 for(const mutate of [
  r=>r.delivery_at=p.publicationAt,
  r=>r.delivery_at='2026-11-20T02:08:10.534Z',
  r=>{let j=JSON.parse(r.response_json);j.source='planner only';r.response_json=JSON.stringify(j)},
  r=>{let j=JSON.parse(r.response_json);j.observedAt=p.publicationAt;r.response_json=JSON.stringify(j)},
  r=>{let j=JSON.parse(r.response_json);j.observedAt='2026-11-20T03:20:00.000Z';r.response_json=JSON.stringify(j)},
  r=>r.status='PENDING',
  r=>r.grant_sha='fabricated'
 ]){
  const next=delivered.map(x=>({...x}));mutate(next[0]);
  assert.equal(v(source,next,p,fp,t),false);
 }
 assert.equal(v({...source,published_at:'2026-11-20T01:59:59.000Z'},delivered,p,fp,t),false);
 assert.equal(v({...source,published_at:'2026-11-20T02:31:00.000Z'},delivered,p,fp,t),false);
 assert.equal(v(source,delivered,p,fp,Date.parse('2026-11-20T10:01:00+08:00')),false);
});
