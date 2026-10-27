import {test} from 'node:test';
import assert from 'node:assert/strict';
import {aiOperationsReadiness} from '../src/ai-operations-readiness.js';
const request=new Request('https://internal.example/api/ai-ops/readiness');
const owner=async()=>({role:'owner',active:1});
const fakeDB=(data=[{status:'pending_review',total:7},{status:'published',total:9}],line=[],meta=[])=>({prepare(sql){
 if(sql==='SELECT status,COUNT(*) AS total FROM social_posts GROUP BY status')
  return {all:async()=>({results:data})};
 if(sql==='SELECT handling_status,COUNT(*) AS total FROM xjw_line_receipt_inbox GROUP BY handling_status')
  return {all:async()=>({results:line})};
 if(sql==='SELECT platform,COUNT(*) AS total FROM xjw_webhook_receipts GROUP BY platform')
  return {all:async()=>({results:meta})};
 throw Error('unexpected query');
}});
test('public requests, wrong methods and non-staff roles are denied before D1',async()=>{
 const noDb={DB:{prepare:()=>assert.fail('D1 must not be queried')}};
 assert.equal((await aiOperationsReadiness(request,noDb,{})).status,503);
 assert.equal((await aiOperationsReadiness(request,noDb,{authenticate:async()=>{throw Error('denied')}})).status,401);
 for(const role of ['viewer','warehouse','accounting'])
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
 assert.equal(d.capabilities.postReview,'human_or_verified_low_risk_ai_approval');
 assert.equal(d.capabilities.lowRiskAiApproval.supported,true);
 assert.equal(d.capabilities.lowRiskAiApproval.highRiskNeedsHuman,true);
 assert.equal(d.capabilities.pendingPostAutoApproval,false);
 assert.equal(d.capabilities.metricool,'external_queue_requires_live_review');
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

test('staff-only LINE standby data exposes counts, never raw customer messages',async()=>{
 const DB=fakeDB([],[{handling_status:'unhandled',total:3,customer:'private line token'},
  {handling_status:'handled',total:2}]);
 const r=await aiOperationsReadiness(request,{DB},{authenticate:owner}),d=await r.json();
 assert.equal(r.status,200);
 assert.equal(d.data.lineReceiptInbox.schema,'available');
 assert.equal(d.data.lineReceiptInbox.total,5);
 assert.equal(d.data.lineReceiptInbox.unhandled,3);
 assert.equal(d.data.lineReceiptInbox.liveWebhookVerified,false);
 assert.equal(d.data.lineReceiptInbox.canReply,false);
 assert.ok(!JSON.stringify(d).includes('private line token'));
 assert.equal(d.customerSend,false);
});
test('LINE inbox missing or read error is an unavailable table, never falsely live',async()=>{
 const db={prepare(sql){
  if(sql.includes('FROM social_posts '))return{all:async()=>({results:[]})};
  return {all:async()=>{throw Error('no such table: xjw_line_receipt_inbox')}};
 }};
 const d=await (await aiOperationsReadiness(request,{DB:db},{authenticate:owner})).json();
 assert.equal(d.ok,true);
 assert.equal(d.data.lineReceiptInbox.schema,'unavailable');
 assert.equal(d.data.lineReceiptInbox.liveWebhookVerified,false);
 assert.equal(d.data.lineReceiptInbox.total,0);
});
test('invalid LINE counts fail closed and do not leak foreign content',async()=>{
 const db=fakeDB([],[{handling_status:'unhandled',total:'NaN',event_json:'private msg'}]);
 const d=await (await aiOperationsReadiness(request,{DB:db},{authenticate:owner})).json();
 assert.equal(d.data.lineReceiptInbox.schema,'unavailable');
 assert.ok(!JSON.stringify(d).includes('private msg'));
});

test('staff-only Meta receipt summary never exposes private payload content',async()=>{
 const DB=fakeDB([],[],[
  {platform:'facebook',total:2,payload_json:'private message'},
  {platform:'instagram',total:3},
  {platform:'threads',total:1}
 ]);
 const response=await aiOperationsReadiness(request,{DB},{authenticate:owner});
 assert.equal(response.status,200);
 const data=await response.json(),meta=data.data.metaReceiptInbox;
 assert.equal(meta.schema,'available');
 assert.equal(meta.total,6);
 assert.deepEqual(meta.platformCounts,{facebook:2,instagram:3,threads:1});
 assert.equal(meta.liveWebhookVerified,false);
 assert.equal(meta.canReply,false);
 assert.equal(data.customerSend,false);
 assert.ok(!JSON.stringify(data).includes('private message'));
});
test('Meta D1 table failure is reported as unavailable, not as successful E2E',async()=>{
 const DB={prepare(sql){
  if(sql.includes('FROM social_posts'))return{all:async()=>({results:[]})};
  if(sql.includes('FROM xjw_line_receipt_inbox'))return{all:async()=>({results:[]})};
  throw Error('no such meta table or access denied');
 }};
 const data=await (await aiOperationsReadiness(request,{DB},{authenticate:owner})).json();
 assert.equal(data.ok,true);
 assert.equal(data.data.metaReceiptInbox.schema,'unavailable');
 assert.equal(data.data.metaReceiptInbox.liveWebhookVerified,false);
 assert.ok(!JSON.stringify(data).includes('access denied'));
});

test('handoff metrics count only active claims and distinguish unassigned work',async()=>{
 const DB={prepare(sql){
  if(sql.includes('FROM social_posts'))return {all:async()=>({results:[]})};
  if(sql.includes('GROUP BY handling_status'))return {all:async()=>({results:[{handling_status:'unhandled',total:5}]})};
  if(sql.includes('FROM xjw_line_handoff_claims'))return {first:async()=>({total:2})};
  if(sql.includes('FROM xjw_webhook_receipts'))return {all:async()=>({results:[]})};
  throw Error('unexpected query');
 }};
 const response=await aiOperationsReadiness(request,{DB},{authenticate:owner});
 const data=await response.json();
 assert.equal(response.status,200);
 assert.equal(data.data.lineHandoff.schema,'available');
 assert.equal(data.data.lineHandoff.activeClaims,2);
 assert.equal(data.data.lineHandoff.unassigned,3);
 assert.equal(data.customerSend,false);
});
test('claim-table failure is marked unverified instead of reporting zero',async()=>{
 const DB={prepare(sql){
  if(sql.includes('FROM social_posts'))return {all:async()=>({results:[]})};
  if(sql.includes('GROUP BY handling_status'))return {all:async()=>({results:[{handling_status:'unhandled',total:5}]})};
  if(sql.includes('FROM xjw_line_handoff_claims'))return {first:async()=>{throw Error('private D1 reason')}};
  if(sql.includes('FROM xjw_webhook_receipts'))return {all:async()=>({results:[]})};
  throw Error('unexpected query');
 }};
 const d=await (await aiOperationsReadiness(request,{DB},{authenticate:owner})).json();
 assert.equal(d.data.lineHandoff.schema,'unavailable');
 assert.equal(d.data.lineHandoff.activeClaims,null);
 assert.equal(d.data.lineHandoff.unassigned,null);
 assert.equal(JSON.stringify(d).includes('private D1 reason'),false);
});

test('sales support role can view aggregate ops status without raw LINE or Meta customer data',async()=>{
 const DB=fakeDB([{status:'pending_review',total:2}],[
  {handling_status:'unhandled',total:3}
 ],[{platform:'facebook',total:1}]);
 const r=await aiOperationsReadiness(request,{DB},{authenticate:async()=>({role:'sales',active:1,email:'sales@example.test'})});
 assert.equal(r.status,200);
 const data=await r.json();
 assert.equal(data.customerSend,false);
 assert.equal(data.modelCalls,0);
 assert.equal(data.data.lineReceiptInbox.unhandled,3);
 assert.equal(data.data.metaReceiptInbox.platformCounts.facebook,1);
 assert.ok(!JSON.stringify(data).includes('event_json'));
 assert.ok(!JSON.stringify(data).includes('replyToken'));
 assert.equal(data.capabilities.metaCommentAutoReply,'external_e2e_and_platform_control_unverified');
});

test('inactive or incompletely verified staff profiles cannot access aggregate operations',async()=>{
 let dbReads=0;
 const env={DB:{prepare(){dbReads++;throw Error('inactive staff must never reach private D1')}}};
 for(const role of ['owner','admin','content','sales']){
  for(const active of [0,'0',false,null,undefined]){
   const res=await aiOperationsReadiness(request,env,{authenticate:async()=>({role,active})});
   assert.equal(res.status,403,role+':'+String(active));
   assert.equal((await res.json()).code,'role_denied');
  }
 }
 assert.equal(dbReads,0);
});

test('staff-only publication backlog returns aggregate counts without customer/private content',async()=>{
 const sql="SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN status='retry' THEN 1 ELSE 0 END),0) AS waiting_retry, COALESCE(SUM(CASE WHEN status='manual_required' THEN 1 ELSE 0 END),0) AS manual_review, COALESCE(SUM(CASE WHEN status='sending' AND (updated_at IS NULL OR datetime(updated_at)<=datetime('now','-15 minutes')) THEN 1 ELSE 0 END),0) AS stale_sending, COALESCE(SUM(CASE WHEN status='published' AND TRIM(COALESCE(remote_id,''))='' THEN 1 ELSE 0 END),0) AS published_no_remote_id FROM social_publish_deliveries";
 const DB={prepare(q){
  if(q==='SELECT status,COUNT(*) AS total FROM social_posts GROUP BY status')
   return{all:async()=>({results:[{status:'scheduled',total:5}]})};
  if(q===sql)return{first:async()=>({
   total:17,waiting_retry:3,manual_review:4,stale_sending:2,published_no_remote_id:1,
   private_post_text:'PRIVATE CUSTOMER COPY',reply_token:'DO NOT SHOW'})};
  throw Error('other optional standby tables unavailable');
 }};
 const response=await aiOperationsReadiness(request,{DB},{authenticate:owner});
 const data=await response.json();
 assert.equal(response.status,200);
 assert.deepEqual(data.data.publicationQueue,{
  schema:'available',total:17,waitingRetry:3,manualReview:4,staleSending:2,publishedMissingRemoteId:1
 });
 assert.equal(data.readOnly,true);
 assert.equal(data.modelCalls,0);
 assert.equal(data.writes,0);
 assert.equal(data.customerSend,false);
 assert.ok(!JSON.stringify(data).includes('PRIVATE CUSTOMER COPY'));
 assert.ok(!JSON.stringify(data).includes('DO NOT SHOW'));
});
test('bad or inconsistent publish backlog cannot be reported as a healthy zero',async()=>{
 const sql="SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN status='retry' THEN 1 ELSE 0 END),0) AS waiting_retry, COALESCE(SUM(CASE WHEN status='manual_required' THEN 1 ELSE 0 END),0) AS manual_review, COALESCE(SUM(CASE WHEN status='sending' AND (updated_at IS NULL OR datetime(updated_at)<=datetime('now','-15 minutes')) THEN 1 ELSE 0 END),0) AS stale_sending, COALESCE(SUM(CASE WHEN status='published' AND TRIM(COALESCE(remote_id,''))='' THEN 1 ELSE 0 END),0) AS published_no_remote_id FROM social_publish_deliveries";
 for(const value of [
  {total:10,waiting_retry:'bad',manual_review:0,stale_sending:0,published_no_remote_id:0},
  {total:3,waiting_retry:2,manual_review:2,stale_sending:2,published_no_remote_id:2},
  null
 ]){
  const DB={prepare(q){
   if(q==='SELECT status,COUNT(*) AS total FROM social_posts GROUP BY status')
    return{all:async()=>({results:[]})};
   if(q===sql)return{first:async()=>value};
   throw Error('private D1 failure');
  }};
  const data=await (await aiOperationsReadiness(request,{DB},{authenticate:owner})).json();
  assert.equal(data.ok,true);
  assert.equal(data.data.publicationQueue.schema,'unavailable');
  assert.equal(data.data.publicationQueue.manualReview,null);
  assert.ok(!JSON.stringify(data).includes('private D1 failure'));
 }
});
