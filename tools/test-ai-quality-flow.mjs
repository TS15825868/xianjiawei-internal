import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyAiQualityFlow as classify} from '../src/ai-quality-flow.js';
const keys=['brand','product','specification','pricing_activity','season','weather','occasion','location','scene_environment','temperature','expression','action','mascot_companions','physical_scale','duplicate','compliance_final'];
const fp='f'.repeat(64),sha='a'.repeat(64),url='https://example.com/image.jpg';
const row={status:'pending_review',image_url:url};
const r={id:'r',reviewer_type:'AI',decision:'NEEDS_HUMAN_REVIEW',content_fingerprint:fp,image_url:url,image_sha256:sha,evidence_json:JSON.stringify({content_fingerprint:fp,image_sha256:sha,checks:Object.fromEntries(keys.map(k=>[k,{result:k==='duplicate'?'DEFER':'PASS'}]))})};
const note={schema:'xjw-owner-delegated-historical-gap-acceptance-v1',outcome:'owner_gap_accepted_for_human_review',fingerprint:fp,image_url:url,image_sha256:sha,ai_review_id:'r',historical_media_missing:15,ai_approved:false,human_approved:false,auto_schedule:false,auto_publish:false};
test('bound gap acceptance does not depend on a frozen historical count',()=>{
 for(const count of [1,7,22]){
  const result=classify(row,r,[{after_json:JSON.stringify({...note,historical_media_missing:count})}],fp,true);
  assert.equal(result.state,'AI_QUALITY_COMPLETE_WITH_ACCEPTED_GAPS');
  assert.equal(result.publication_authorized,false);
 }
 for(const count of [0,-1,1.5,'15',null]){
  const result=classify(row,r,[{after_json:JSON.stringify({...note,historical_media_missing:count})}],fp,true);
  assert.equal(result.quality_complete,false);
 }
});
test('duplicate-only defer is identified without bypassing it',()=>{
 const result=classify(row,r,[],fp,true);
 assert.equal(result.reason,'目前版本只缺歷史去重證據');
 assert.equal(result.quality_complete,false);
 assert.equal(result.publication_authorized,false);
});
test('explicit gate rejection is routed to repair',()=>{
 const e=JSON.parse(r.evidence_json);
 e.checks.product.result='REJECT';
 const result=classify(row,{...r,evidence_json:JSON.stringify(e)},[],fp,true);
 assert.equal(result.state,'AI_REPAIR_REQUIRED');
});
test('current authorized gap is complete only for internal quality, not full AI approval or publication',()=>{const x=classify(row,r,[{after_json:JSON.stringify(note)}],fp,true);assert.equal(x.state,'AI_QUALITY_COMPLETE_WITH_ACCEPTED_GAPS');assert.equal(x.quality_complete,true);assert.equal(x.publication_authorized,false);assert.equal(x.auto_publish,false)});
test('missing, stale, failed and changed evidence never completes quality',()=>{for(const x of [classify(row,r,[],fp,true),classify(row,r,[{after_json:JSON.stringify({...note,image_sha256:'b'.repeat(64)})}],fp,true),classify(row,r,[{after_json:JSON.stringify(note)}],'different',true),classify(row,r,[{after_json:JSON.stringify(note)}],fp,false)])assert.equal(x.quality_complete,false)});
test('full AI evidence is a distinct result, still no publish',()=>{const e=JSON.parse(r.evidence_json);e.checks.duplicate.result='PASS';const x=classify(row,{...r,decision:'AI_APPROVED',evidence_json:JSON.stringify(e)},[],fp,true);assert.equal(x.state,'AI_QUALITY_COMPLETE');assert.equal(x.auto_schedule,false)});
