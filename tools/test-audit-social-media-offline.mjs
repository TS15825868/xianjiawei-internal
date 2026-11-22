import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditSocialMediaOffline } from './audit-social-media-offline.mjs';
const sha = 'a'.repeat(64);
const base = {assets:[
  {source_zip:'a.zip',source_path:'a.png',sha256:sha,dhash:'0000000000000000'},
  {source_zip:'b.zip',source_path:'b.png',sha256:'b'.repeat(64),dhash:'0000000000000001'},
  {source_zip:'c.zip',source_path:'c.png',sha256:sha,dhash:'ffffffffffffffff'}
]};
test('offline inventory records exact and visual candidates without approving', () => {
 const r=auditSocialMediaOffline(base);
 assert.equal(r.assets_checked,3);
 assert.deepEqual(r.asset_pairs.map(p=>p.type),['visual_candidate','exact_sha256']);
 assert.equal(r.automatic_approval_permitted,false);
 assert.equal(r.production_d1_queries,0);
});
test('pending post gets source matches, while not changing review/approval status', () => {
 const r=auditSocialMediaOffline({...base,posts:[{id:'p1',status:'pending_review'}, {id:'p2',status:'published'}],reviews:[{id:'1',post_id:'p1',created_at:'2026-11-01',image_sha256:sha}]});
 assert.equal(r.pending_posts_checked,1);
 assert.equal(r.pending[0].asset_matches.length,2);
 assert.equal(r.pending[0].evidence_status,'candidate_found_not_approved');
 assert.equal(r.pending[0].release_allowed,false);
});
test('missing and invalid evidence remains blocked', () => {
 const r=auditSocialMediaOffline({assets:[],posts:[{id:'a',status:'pending_review'},{id:'b',status:'pending_review'}],reviews:[{post_id:'b',created_at:'2026-11-01',image_sha256:'wrong'}]});
 assert.deepEqual(r.pending.map(p=>p.evidence_status),['missing_review','missing_image_sha256']);
});
test('only valid dHash participates in comparison and threshold is checked',()=>{
 const r=auditSocialMediaOffline({assets:[{sha256:sha,dhash:'invalid'},{sha256:'b'.repeat(64),dhash:'0000000000000000'}]},0);
 assert.equal(r.asset_pairs.length,0);
 assert.throws(()=>auditSocialMediaOffline({},65),/Invalid dHash threshold/);
});
