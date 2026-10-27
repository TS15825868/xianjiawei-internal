import test from 'node:test';
import assert from 'node:assert/strict';
import {assessAutopublishCandidate} from '../src/ai-autopublish-policy.js';
import {aiApprovedChannels} from '../src/ai-quality-review.js';
const valid={status:'pending_review',copy:'在家準備一壺溫熱的紅棗茶，聊聊漢方飲食文化。',image_url:'https://example.com/image.jpg',platforms:['facebook','instagram','threads']};
const checks=Object.fromEntries(['aiEvidenceValid','imageAuthentic','sceneMatches','productAuthorityValid','uniqueCopy','uniqueImage','rightsVerified','scheduledTimeValid','platformReady','quotaVerified','deliveryDedupReady'].map(x=>[x,true]));checks.reviewedAt=new Date().toISOString();
test('完整證據才可排程',()=>assert.equal(assessAutopublishCandidate(valid,checks).ok,true));
test('沒有證據預設拒絕',()=>assert.equal(assessAutopublishCandidate(valid,{}).ok,false));
test('疾病療效阻擋',()=>assert.equal(assessAutopublishCandidate({...valid,copy:'治療高血壓'},checks).ok,false));
test('已發布不可重發',()=>assert.equal(assessAutopublishCandidate({...valid,status:'published'},checks).ok,false));
test('缺圖不可排程',()=>assert.equal(assessAutopublishCandidate({...valid,image_url:''},checks).ok,false));

test('正式資產品質 clear 與 ok 可驗證，待重製圖不可排程',()=>{
  assert.equal(assessAutopublishCandidate({...valid,image_quality_status:'clear'},checks).ok,true);
  assert.equal(assessAutopublishCandidate({...valid,image_quality_status:'ok'},checks).ok,true);
  assert.equal(assessAutopublishCandidate({...valid,image_quality_status:'needs_rework'},checks).ok,false);
});
test('AI委託僅可使用既有 Facebook Instagram Threads 平台',()=>{
  assert.deepEqual(aiApprovedChannels({platforms_json:'["Facebook","Threads","Instagram"]'}),['facebook','instagram','threads']);
  assert.equal(aiApprovedChannels({platforms_json:'["Facebook","LINE OA"]'}),null);
  assert.equal(aiApprovedChannels({platforms_json:'["Instagram","Instagram"]'}),null);
  assert.equal(aiApprovedChannels({platforms_json:'[]'}),null);
  assert.equal(aiApprovedChannels({platforms_json:'not JSON'}),null);
});
test('外部發送結果未知不可重發',()=>{
  assert.equal(assessAutopublishCandidate({...valid,externalStatus:'unknown'},checks).ok,false);
  assert.equal(assessAutopublishCandidate({...valid,published_at:'2026-10-20T01:00:00Z'},checks).ok,false);
  assert.equal(assessAutopublishCandidate({...valid,platforms:['Facebook','LINE OA']},checks).ok,false);
});
