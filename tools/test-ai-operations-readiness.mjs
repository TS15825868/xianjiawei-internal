import {test} from 'node:test';
import assert from 'node:assert/strict';
import {aiOperationsReadiness} from '../src/ai-operations-readiness.js';
const request=new Request('https://internal.example/api/ai-ops/readiness');
const owner=async()=>({role:'owner',active:1});
const fakeDB=(data=[{status:'pending_review',total:7},{status:'published',total:9}])=>({prepare(sql){
 assert.equal(sql,'SELECT status,COUNT(*) AS total FROM social_posts GROUP BY status');
 return {all:async()=>({results:data})};
}});
test('public requests, wrong methods and non-staff roles are denied before D1',async()=>{
 const noDb={DB:{prepare:()=>assert.fail('D1 must not be queried')}};
 assert.equal((await aiOperationsReadiness(request,noDb,{})).status,503);
 assert.equal((await aiOperationsReadiness(request,noDb,{authenticate:async()=>{throw Error('denied')}})).status,401);
 for(const role of ['viewer','sales','warehouse'])
   assert.equal((await aiOperationsReadiness(request,noDb,{authenticate:async()=>({role,active:1})})).status,403);
 assert.equal((await aiOperationsReadiness(new Request(request.url,{method:'POST'}),noDb,{authenticate:owner})).status,405);
});
test('reads only post status totals without spending neurons or sending any reply',async()=>{
 const env={DB:fakeDB(),AI:{run:()=>assert.fail('No AI calls are allowed')},XJW_AI_FREE_ACCOUNT_CONFIRMED:'false',XJW_SOCIAL_AI_DRAFT_ENABLED:'false'};
 const r=await aiOperationsReadiness(request,env,{authenticate:owner}),d=await r.json();
 assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');
 assert.equal(d.ok,true);assert.equal(d.data.postStatusCounts.pending_review,7);assert.equal(d.data.postStatusCounts.published,9);
 assert.equal(d.modelCalls,0);assert.equal(d.writes,0);assert.equal(d.customerSend,false);
 assert.equal(d.capabilities.generativeDraft,'disabled_or_free_account_unconfirmed');
 assert.equal(d.capabilities.metaCommentAutoReply,'external_e2e_and_platform_control_unverified');
 assert.equal(d.allAutonomous,false);
});
test('AI binding plus private flags means configured, not falsely E2E or free quota verified',async()=>{
 const env={DB:fakeDB([]),AI:{run:()=>assert.fail('Read-only status cannot invoke inference')},XJW_AI_FREE_ACCOUNT_CONFIRMED:'true',XJW_SOCIAL_AI_DRAFT_ENABLED:'true'};
 const d=await (await aiOperationsReadiness(request,env,{authenticate:owner})).json();
 assert.equal(d.capabilities.generativeDraft,'configured_not_live_inference_verified');
 assert.equal(d.limits.freePlanVerifiedByThisEndpoint,false);
 assert.equal(d.safeguards.actualCustomerSendNotVerified,true);
});
test('D1 errors and missing binding fail closed',async()=>{
 assert.equal((await aiOperationsReadiness(request,{}, {authenticate:owner})).status,503);
 const bad={DB:{prepare:()=>({all:async()=>{throw Error('hidden secret');}})}};
 const r=await aiOperationsReadiness(request,bad,{authenticate:owner});
 assert.equal(r.status,503);const payload=await r.text();assert.equal(JSON.parse(payload).code,'d1_status_unavailable');
 assert.ok(!payload.includes('hidden secret'));
});
test('unknown post states ignored; no customer text or DB fields leak',async()=>{
 const env={DB:fakeDB([{status:'unknown_state',total:999},{status:'draft',total:2,secret:'private'}])};
 const d=await (await aiOperationsReadiness(request,env,{authenticate:owner})).json();
 assert.equal(d.data.postStatusCounts.draft,2);
 assert.equal(d.data.postStatusCounts.unknown_state,undefined);
 assert.ok(!JSON.stringify(d).includes('private'));
});
