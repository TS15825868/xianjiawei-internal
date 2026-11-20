'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {verifyPublishedReceipt:v}=require('./verify-owner-directed-published-receipt.cjs');
const p=require('../ops/receipts/20261118-owner-directed-publication.json');
const post={id:p.postId,status:'published',image_approved:0,published_at:p.publicationAt};
const fp=()=>p.fingerprint;
const checks=Object.fromEntries(['brand','product','specification','pricing_activity','season','weather','occasion','location','scene_environment','temperature','expression','action','mascot_companions','physical_scale','duplicate','compliance_final'].map(k=>[k,{result:k==='duplicate'?'DEFER':'PASS'}]));
const rows=()=>Object.keys(p.urls).map(platform=>({post_id:p.postId,metricool_id:p.metricoolId,uuid:p.uuid,state:'published',status:'published',remote_id:p.urls[platform],grant_id:p.grantId,grant_schema:'xjw-owner-directed-scoped-release-v1',scope:'brand-social-only',owner_authorization_ref:p.ownerAuthorizationRef,revoked_at:null,content_fingerprint:p.fingerprint,grant_fp:p.fingerprint,review_fp:p.fingerprint,grant_sha:p.imageSha256,image_sha256:p.imageSha256,review_id:p.reviewId,decision:'NEEDS_HUMAN_REVIEW',evidence_json:JSON.stringify({checks}),sync_at:p.publicationAt,delivery_at:p.publicationAt,grant_at:p.publicationAt,issued_at:'2026-11-18T00:00:00+08:00',expires_at:p.publicationAt,channels_json:JSON.stringify(Object.keys(p.urls)),platform,response_json:JSON.stringify({network:platform,status:'PUBLISHED',publicUrl:p.urls[platform],metricoolId:p.metricoolId,uuid:p.uuid,ownerDirectException:true,duplicate:'DEFER'})}));
test('exact historical receipt is accepted without changing any approval',()=>assert.equal(v(post,rows(),p,fp),true));
test('pending or mismatched current version cannot use the exception',()=>{assert.equal(v({...post,status:'pending_review'},rows(),p,fp),false);assert.equal(v(post,rows(),p,()=> 'changed'),false);assert.equal(v({...post,id:'other'},rows(),p,fp),false)});
test('partial, duplicate, revoked, mismatched provider or authorization fail closed',()=>{assert.equal(v(post,rows().slice(0,2),p,fp),false);for(const mutate of [r=>r.platform='threads',r=>r.revoked_at='2026-11-18',r=>r.remote_id='wrong',r=>r.grant_fp='wrong',r=>r.owner_authorization_ref='wrong',r=>r.image_sha256='wrong',r=>r.response_json='{}',r=>r.status='pending',r=>r.evidence_json='{}']){const rr=rows();mutate(rr[0]);assert.equal(v(post,rr,p,fp),false)}});

test('internal DEFER review can validate official provider receipts lacking a duplicate field only under scoped historical mode',()=>{
 const official=rows().map(r=>{const out=JSON.parse(r.response_json);delete out.duplicate;out.source='Metricool official connector';return {...r,response_json:JSON.stringify(out)}});
 assert.equal(v(post,official,p,fp),false);
 assert.equal(v(post,official,p,fp,{allowOfficialMetricoolWithoutDuplicate:true}),true);
 const invalid=official.map(r=>({...r}));
 const payload=JSON.parse(invalid[0].response_json);payload.duplicate='PASS';invalid[0].response_json=JSON.stringify(payload);
 assert.equal(v(post,invalid,p,fp,{allowOfficialMetricoolWithoutDuplicate:true}),false);
 const fake=official.map(r=>({...r}));const f=JSON.parse(fake[0].response_json);f.source='planner';fake[0].response_json=JSON.stringify(f);
 assert.equal(v(post,fake,p,fp,{allowOfficialMetricoolWithoutDuplicate:true}),false);
 const changed=official.map(r=>({...r}));const z=JSON.parse(changed[0].evidence_json);z.checks.duplicate.result='PASS';changed[0].evidence_json=JSON.stringify(z);
 assert.equal(v(post,changed,p,fp,{allowOfficialMetricoolWithoutDuplicate:true}),false);
});
