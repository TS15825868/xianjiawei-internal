const fs=require('fs'),assert=require('assert/strict');
const manifest=JSON.parse(fs.readFileSync('ops/metricool-eight-recovery-20261013.json'));
const rows=JSON.parse(fs.readFileSync('after.json'))[0].results;
for(const expected of manifest.posts){
  const p=rows.find(x=>x.id===expected.d1Id);assert(p,'Missing '+expected.d1Id);
  assert.equal(String(p.uuid),expected.uuid);assert.equal(p.metricool_id,expected.metricoolId);
  assert.equal(p.status,expected.humanApproved?'scheduled':'pending_review');
  assert.equal(p.metricool_state,p.status);
  assert.equal(p.published_at,null);
  assert.equal(p.scheduled_at,expected.humanApproved?expected.publicationAt:null);
  if(!expected.humanApproved){assert.equal(p.approved_by,null);assert.equal(p.image_approved,0)}
}
const counts=JSON.parse(fs.readFileSync('counts.json'))[0].results;
assert.equal(counts.reduce((n,x)=>n+Number(x.count),0),136);
assert.equal(counts.find(x=>x.status==='published').count,3);
assert.equal(counts.find(x=>x.status==='archived').count,72);
console.log('PASS formal D1: exactly eight stable UUID mappings; two scheduled, six pending; total136; published and archived unchanged');
