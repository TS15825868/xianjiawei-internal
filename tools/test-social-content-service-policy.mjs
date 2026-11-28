import test from 'node:test';
import assert from 'node:assert/strict';
import {socialContentDraft,validateOutput} from '../src/social-content-draft.js';

const safe = {
  copy:'午後在家整理餐桌，倒一杯溫水，為忙碌的生活留下一點從容。仙加味陪你把漢方飲食文化融入每天的節奏。商品諮詢歡迎透過官方 LINE 聯繫。',
  sceneBrief:'小老闆在明亮的家中餐桌整理茶具，小鹿與小烏龜各自坐在旁邊。',
  imageAlt:'小老闆在餐桌旁整理茶具，小鹿與小烏龜在旁陪伴。'
};
const claims=['營業時間：10:00–20:00','週六預約取貨','歡迎到門市選購','可以自取','提供面交','開放預約自取','10：00～20：00','仙加味自家工廠','實體門市地址','週日公休'];
const auth=async()=>({active:1,role:'owner',email:'test@example.invalid'});
const input={topic:'午後在家整理餐桌',category:'生活',sceneBrief:safe.sceneBrief,persist:false};
const request=(body)=>new Request('https://example.invalid/api/social-content/draft',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
function fakeEnv(output){
 let calls=0;
 const env={XJW_SOCIAL_CONTENT_DRAFT_ENABLED:'true',XJW_AI_FREE_ACCOUNT_CONFIRMED:'true',AI:{run:async(_model,options)=>{calls++;assert.match(options.messages[0].content,/現代漢方生活品牌/);assert.match(options.messages[0].content,/不主動宣傳固定營業時間/);return {response:JSON.stringify(output)};}},DB:{prepare(){throw Error('preview must never touch D1');}}};
 return {env,calls:()=>calls};
}
test('safe public brand and LINE service wording remains valid',()=>{assert.equal(validateOutput(safe,null),true);});
test('unconfirmed public claims fail output validation in every field',()=>{
 for(const claim of claims)for(const field of ['copy','sceneBrief','imageAlt'])assert.equal(validateOutput({...safe,[field]:safe[field]+' '+claim},null),false,field+': '+claim);
});
test('invalid public-service topics fail before AI inference',async()=>{
 for(const claim of claims){const {env,calls}=fakeEnv(safe);const res=await socialContentDraft(request({...input,topic:claim}),env,{authenticate:auth});assert.equal(res.status,422,claim);assert.equal(calls(),0);}
});
test('model-generated stale service claim fails closed without saving or sending',async()=>{
 const {env,calls}=fakeEnv({...safe,copy:safe.copy+' 歡迎到門市選購。'});
 const res=await socialContentDraft(request(input),env,{authenticate:auth});const body=await res.json();
 assert.equal(res.status,422);assert.equal(body.published,false);assert.equal(body.approved,false);assert.equal(calls(),1);
});
test('valid preview preserves all existing approval and publication boundaries',async()=>{
 const {env,calls}=fakeEnv(safe);const res=await socialContentDraft(request(input),env,{authenticate:auth});const body=await res.json();
 assert.equal(res.status,200);assert.equal(calls(),1);assert.equal(body.persisted,false);assert.equal(body.draft.humanApprovalRequired,true);assert.equal(body.draft.humanApproved,false);assert.equal(body.draft.published,false);assert.equal(body.draft.scheduled,false);assert.equal(body.draft.autoPublish,false);
});

import {customerCopyErrors} from '../src/publishing-review-gate-entry.js';

test('existing imported or manually edited drafts obey the same current public service policy',()=>{
 const row={title:'仙加味日常餐桌',copy:safe.copy,image_alt:safe.imageAlt};
 assert.deepEqual(customerCopyErrors(row),[]);
 for(const claim of [...claims,'09:30－18:30','10:00－20:00'])for(const field of ['title','headline','copy','image_alt']){
  const r={...row,[field]:String(row[field]||'')+' '+claim};
  assert.ok(customerCopyErrors(r).some(e=>e.includes('未確認')),field+': '+claim);
 }
 for(const text of ['在萬華工作桌整理筆記','商品諮詢、訂購及配送，歡迎透過官方 LINE 聯繫。','家族傳承的鹿角與熬膠工藝','仙加味商行｜統一編號：00702569'])assert.deepEqual(customerCopyErrors({...row,copy:text}),[]);
});
