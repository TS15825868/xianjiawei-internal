import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const script=new URL('./ai-batch-triage.mjs',import.meta.url).pathname;
const keys=['brand','product','specification','pricing_activity','season','weather','occasion','location','scene_environment','temperature','expression','action','mascot_companions','physical_scale','duplicate','compliance_final'];
function run(records, pending=records.length, history=null){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xjw-triage-'));
 try {
  const input=path.join(dir,'in.json'),output=path.join(dir,'out.json');
  fs.writeFileSync(input,JSON.stringify({safeReadOnly:true,counts:{pending},records}));
  const hist=path.join(dir,'history.json');
  if(history)fs.writeFileSync(hist,JSON.stringify(history));
  const proc=spawnSync(process.execPath,[script,input,output,...(history?[hist]:[])],{encoding:'utf8'});
  return {status:proc.status,stderr:proc.stderr,result:fs.existsSync(output)?JSON.parse(fs.readFileSync(output,'utf8')):null};
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
}
test('DEFER never becomes release-ready',()=>{
 const r=run([{id:'1',decision:'AI_DEFER',currentBound:true,mediaShaEvidencePresent:true,checks:Object.fromEntries(keys.map(k=>[k,k==='duplicate'?'DEFER':'PASS'])),blockers:['duplicate:DEFER','review_decision:AI_DEFER']}]);
 assert.equal(r.status,0,r.stderr);
 assert.equal(r.result.counts.recover_evidence,1);
 assert.equal(r.result.items[0].automaticallyApproved,false);
});
test('only complete source-bound 16/16 AI evidence enters release-gate verification',()=>{
 const r=run([{id:'2',decision:'AI_APPROVED',currentBound:true,mediaShaEvidencePresent:true,checks:Object.fromEntries(keys.map(k=>[k,'PASS'])),blockers:['automatic_release_runtime_and_platform_not_e2e_verified']}]);
 assert.equal(r.status,0,r.stderr);
 assert.equal(r.result.counts.verify_release_gate,1);
});
test('bad media is repair, missing checks are not release-ready',()=>{
 const r=run([{id:'3',decision:'AI_APPROVED',currentBound:true,mediaShaEvidencePresent:true,checks:{brand:'PASS'},blockers:['automatic_release_runtime_and_platform_not_e2e_verified']},{id:'4',blockers:['active_media_missing']}]);
 assert.equal(r.status,0,r.stderr);
 assert.equal(r.result.counts.recover_evidence,1);
 assert.equal(r.result.counts.investigate_or_repair,1);
});
test('incomplete D1 snapshot fails closed',()=>{assert.notEqual(run([{id:'1'}],49).status,0)});

test('duplicate IDs in D1 evidence fail closed',()=>{assert.notEqual(run([{id:'same',blockers:[]},{id:'same',blockers:[]}]).status,0)});
test('all pending posts appear exactly once in action queues',()=>{const r=run([{id:'a',blockers:['duplicate:DEFER']},{id:'b',blockers:['active_media_missing']}]);assert.equal(r.status,0,r.stderr);assert.deepEqual(r.result.queue.recover_evidence,['a']);assert.deepEqual(r.result.queue.investigate_or_repair,['b']);assert.equal(Object.values(r.result.queue).flat().length,2)});

test('known original media gaps prioritize only matched candidates without clearing DEFER',()=>{
 const history={schema:'xjw-published-media-unreachable-links-evidence-v1',capturedOn:'2026-11-08',noD1Writes:true,
 previousPrivateCacheUnavailable:15,missing:[{platform:'instagram',postId:'ig1',publishedPost:'https://www.instagram.com/p/example/',httpStatus:403,priorityCheck:['match']}]};
 const records=[{id:'other',decision:'NEEDS_HUMAN_REVIEW',blockers:['duplicate:DEFER']},{id:'match',decision:'NEEDS_HUMAN_REVIEW',blockers:['duplicate:DEFER']}];
 const r=run(records,2,history);
 assert.equal(r.status,0,r.stderr);
 assert.deepEqual(r.result.queue.recover_evidence,['match','other']);
 assert.equal(r.result.historyGapContext.knownSourceCheckTargets,1);
 assert.equal(r.result.historyGapContext.unidentifiedHistoricalMedia,15);
 assert.equal(r.result.items[1].automaticallyApproved,false);
 assert.equal(r.result.items[1].sourceRecheckTargets[0].observedHttpStatus,403);
});
test('untrusted historical source snapshot fails closed',()=>{
 const r=run([{id:'a',blockers:['duplicate:DEFER']}],1,{schema:'unknown',missing:[]});
 assert.notEqual(r.status,0);
});
