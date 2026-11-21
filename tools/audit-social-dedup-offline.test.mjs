import test from 'node:test';
import assert from 'node:assert/strict';
import {auditSocialDedup} from './audit-social-dedup-offline.mjs';
const hashA='a'.repeat(64),hashB='b'.repeat(64);
test('exact content and current image hash collisions use local indexed data, no D1',()=>{
 const input={posts:[
  {id:'P',status:'pending_review',title:'相同標題',copy:'仙加味在家做料理',image_url:'https://example.com/p.jpg'},
  {id:'A',status:'published',title:'相同標題',copy:'另一篇',image_url:'https://example.com/a.jpg'},
  {id:'B',status:'archived',title:'其他標題',copy:'仙加味在家做料理',image_url:'https://example.com/b.jpg'}],
 reviews:[
  {id:'1',post_id:'P',image_sha256:hashA,created_at:'2026-11-20T00:00:00Z'},
  {id:'2',post_id:'A',image_sha256:hashA.toUpperCase(),created_at:'2026-11-19T00:00:00Z'},
  {id:'3',post_id:'A',image_sha256:hashB,created_at:'2026-11-21T00:00:00Z'}
 ]};
 const r=auditSocialDedup(input);
 assert.equal(r.production_queries,0);assert.equal(r.changes,0);
 assert.deepEqual(r.collisions.map(x=>[x.other_id,x.collision_type]),[['B','copy_exact'],['A','title_exact']].sort((a,b)=>a[1].localeCompare(b[1])));
 assert.deepEqual(r.pending_missing_latest_review,[]);
});
test('same latest sha, case insensitive, finds collision without O(N^2) SQL',()=>{
 const r=auditSocialDedup({posts:[{id:'p',status:'pending_review'},{id:'h',status:'published'}],reviews:[{id:'a',post_id:'p',image_sha256:hashA,reviewed_at:'2026-11-22T00:00:00Z'},{id:'b',post_id:'h',image_sha256:hashA.toUpperCase(),reviewed_at:'2026-11-22T00:00:00Z'}]});
 assert.deepEqual(r.collisions.map(x=>x.collision_type),['latest_image_sha256_exact']);
});
test('uncertain source evidence never implies safe approval',()=>{
 const r=auditSocialDedup({posts:[{id:'p',status:'pending_review',title:'唯一'}],reviews:[]});
 assert.equal(r.collisions.length,0);assert.deepEqual(r.pending_missing_latest_review,['p']);assert.match(r.warning,/禁止直接發布/);
});
test('invalid or duplicate identifiers reject the export',()=>{
 assert.throws(()=>auditSocialDedup({posts:[{id:'p'},{id:'p'}],reviews:[]}),/duplicate/);
 assert.throws(()=>auditSocialDedup({posts:[],reviews:null}),/Required arrays/);
});
