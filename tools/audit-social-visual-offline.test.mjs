import test from 'node:test';
import assert from 'node:assert/strict';
import {auditOfflineVisual} from './audit-social-visual-offline.mjs';
const sha='a'.repeat(64),sha2='b'.repeat(64);
test('offline exact and perceptual candidates never auto-approve',()=>{
 const r=auditOfflineVisual({assets:[
  {id:'a',sha256:sha,dhash:'0000000000000000',post_id:'p1'},
  {id:'b',sha256:sha,dhash:'0000000000000000'},
  {id:'c',sha256:sha2,dhash:'0000000000000001'}
 ],posts:[{id:'p1',status:'pending_review'},{id:'p2',status:'pending_review'}]});
 assert.equal(r.exact.length,1);assert.equal(r.similar.length,2);
 assert.deepEqual(r.pending_without_asset_evidence,['p2']);
 assert.equal(r.production_queries,0);assert.equal(r.auto_release_allowed,false);
 assert.equal(r.historical_coverage_verified,false);
});
test('invalid hashes are not treated as exact duplicates',()=>{
 const r=auditOfflineVisual({assets:[{id:'x',sha256:'bad',dhash:'bad'},{id:'y',sha256:'bad',dhash:'bad'}]});
 assert.equal(r.exact.length,0);assert.equal(r.similar.length,0);
 assert.deepEqual(r.invalid_hash_ids,['x','y']);
});
test('distance threshold validates bounds',()=>{
 assert.throws(()=>auditOfflineVisual({assets:[]},{maxDistance:65}),/Invalid/);
});
