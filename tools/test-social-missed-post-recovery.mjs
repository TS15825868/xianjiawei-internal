import test from 'node:test';
import assert from 'node:assert/strict';
import {assessMissedSocialPost as assess} from '../src/social-missed-post-recovery.js';
const base={scheduled_at:'2026-11-23T02:00:00Z',platforms:['facebook','instagram','threads'],approved:true,image_verified:true,dedup_verified:true,authorization_valid:true,copy:'仙加味料理搭配與溫熱飲用'};
const receipt=(f='failed',i='failed',t='failed')=>[{platform:'facebook',status:f},{platform:'instagram',status:i},{platform:'threads',status:t}];
const opts={externalQuotaVerified:true,platformReady:true};
test('uncertain result cannot be sent twice',()=>assert.equal(assess(base,receipt('published','unknown','failed'),'2026-11-23T03:00:00Z',opts).action,'VERIFY'));
test('partial success proposes only failed platforms',()=>{const x=assess(base,receipt('published','failed','failed'),'2026-11-23T03:00:00Z',opts);assert.equal(x.action,'RESCHEDULE_REVIEW');assert.deepEqual(x.platforms,['instagram','threads']);});
test('no receipt is not proof of failure',()=>assert.equal(assess(base,[],'2026-11-23T03:00:00Z',opts).action,'VERIFY'));
test('within grace does not retry',()=>assert.equal(assess(base,receipt(),'2026-11-23T02:10:00Z',opts).action,'WAIT'));
test('all delivered does not retry',()=>assert.equal(assess(base,receipt('published','success','delivered'),'2026-11-23T03:00:00Z',opts).action,'DONE'));
test('quota unknown blocks retry',()=>assert.equal(assess(base,receipt(),'2026-11-23T03:00:00Z',{}).action,'HOLD'));
test('old and dated content must be replaced and reviewed',()=>{assert.equal(assess({...base,copy:'仙加味元旦早餐'},receipt(),'2026-11-23T03:00:00Z',opts).action,'REPLACE_REVIEW');assert.equal(assess(base,receipt(),'2026-11-26T03:00:00Z',opts).action,'REPLACE_REVIEW')});
test('unapproved cannot be retried',()=>assert.equal(assess({...base,approved:false},receipt(),'2026-11-23T03:00:00Z',opts).action,'HOLD'));


test('historical mixed-case platform and status receipts are recognized',()=>{
 const x=assess({...base,platforms:['Facebook','Instagram','Threads']},
   [{platform:'Facebook',status:'PUBLISHED'},{platform:'Instagram',status:'FAILED'},{platform:'Threads',status:'FAILED'}],
   '2026-11-23T03:00:00Z',opts);
 assert.equal(x.action,'RESCHEDULE_REVIEW');
 assert.deepEqual(x.platforms,['instagram','threads']);
 assert.equal(x.proposed_at,'2026-11-23T04:00:00.000Z');
});
test('all mixed-case successful platform receipts cannot be resent',()=>{
 const x=assess(base,receipt('PUBLISHED','SUCCESS','DELIVERED').map(r=>({...r,platform:r.platform.toUpperCase()})),'2026-11-23T03:00:00Z',opts);
 assert.equal(x.action,'DONE');
});
test('proposed recovery time is precisely 10:00 or 12:00 Taiwan, not arbitrary minutes',()=>{
 const x=assess(base,receipt(),'2026-11-23T03:47:00Z',opts);
 assert.equal(x.action,'RESCHEDULE_REVIEW');
 assert.equal(x.proposed_at,'2026-11-24T02:00:00.000Z');
});
test('already reserved local calendar dates are skipped',()=>{
 const x=assess(base,receipt(),'2026-11-23T03:47:00Z',{...opts,reservedDates:['2026-11-24']});
 assert.equal(x.action,'RESCHEDULE_REVIEW');
 assert.equal(x.proposed_at,'2026-11-25T02:00:00.000Z');
});
test('reserved ISO times are localized to Taiwan before checking a collision',()=>{
 const x=assess(base,receipt(),'2026-11-23T03:47:00Z',{...opts,reservedDates:['2026-11-24T02:30:00Z']});
 assert.equal(x.proposed_at,'2026-11-25T02:00:00.000Z');
});
test('invalid calendar evidence never proposes an unsafe slot',()=>{
 const x=assess(base,receipt(),'2026-11-23T03:47:00Z',{...opts,reservedDates:['not-a-date']});
 assert.equal(x.action,'HOLD');
});
test('weekend next slot starts Sunday at 10:00 Taiwan',()=>{
 const weekend={...base,scheduled_at:'2026-11-28T02:00:00Z'};
 const x=assess(weekend,receipt(),'2026-11-28T03:12:00Z',opts);
 assert.equal(x.action,'RESCHEDULE_REVIEW');
 assert.equal(x.proposed_at,'2026-11-29T02:00:00.000Z');
});
