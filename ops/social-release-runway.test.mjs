import assert from 'node:assert/strict';
import {test} from 'node:test';
import {requiredSlots,inspectSlot,postFingerprint} from './social-release-runway.mjs';
const now=Date.parse('2026-11-17T20:06:00+08:00'),at=Date.parse('2026-11-17T10:00:00+08:00');
const post={id:'isolated',title:'isolated',status:'pending_review',proposed_scheduled_at:'2026-11-17T10:00:00+08:00',review_decision:'NEEDS_HUMAN_REVIEW',image_sha:'a'.repeat(64),evidence_json:JSON.stringify({checks:{duplicate:{result:'DEFER'}}})};
post.review_fingerprint=postFingerprint(post);
test('Taipei Tuesday Friday dates include missed and next real slot, not proposed legacy calendar',()=>{assert.ok(requiredSlots(now).includes(at));assert.ok(requiredSlots(now).includes(Date.parse('2026-11-20T10:00:00+08:00')));assert.equal(requiredSlots(now).includes(Date.parse('2026-11-19T10:00:00+08:00')),false)});
test('pending with proposed date is not scheduled, even when exact current evidence exists',()=>{const x=inspectSlot(at,[post],now);assert.equal(x.state,'MISSED_OR_UNVERIFIED');assert.equal(x.currentVersion,true);assert.ok(x.blockers.includes('HISTORICAL_DEDUP_NOT_COMPLETE'));assert.ok(x.blockers.includes('NO_FORMAL_LOCAL_SCHEDULE'))});
test('draft/external mapping is not publication and must not be resent',()=>{const x=inspectSlot(at,[{...post,metricool_id:1,metricool_uuid:'mock'}],now);assert.ok(x.blockers.includes('EXISTING_REMOTE_MAPPING_REQUIRES_LIVE_READBACK'))});
test('partial success cannot be treated as published or retried across all networks',()=>{const x=inspectSlot(at,[{...post,status:'published',published_at:'2026-11-17T10:00:00+08:00',deliveries:[{platform:'Facebook',status:'published',remote_id:'mock',published_at:'2026-11-17T10:00:00+08:00'}]}],now);assert.equal(x.receiptCount,1);assert.ok(x.blockers.includes('RECONCILE_EXISTING_PUBLICATION_DO_NOT_RESEND'))});
test('three distinct real receipt records are required for local completion',()=>{const x=inspectSlot(at,[{...post,status:'published',published_at:'2026-11-17T10:00:00+08:00',deliveries:['facebook','instagram','threads'].map(platform=>({platform,status:'published',remote_id:'mock-'+platform,published_at:'2026-11-17T10:00:00+08:00'}))}],now);assert.equal(x.state,'D1_THREE_PLATFORM_RECEIPTS_RECORDED')});
test('no candidate and duplicate slot are explicit, never fabricated',()=>{assert.equal(inspectSlot(at,[],now).state,'NO_CANDIDATE');assert.equal(inspectSlot(at,[post,{...post,id:'another'}],now).state,'SLOT_COLLISION')});

test('single owner-approved replacement time is tracked without pretending it was published or requiring another send',()=>{
 const at2=Date.parse('2026-11-18T10:00:00+08:00');
 const p={...post,liveImageVerified:true,grant_id:'mock-grant',grant_schema:'xjw-owner-directed-scoped-release-v1',grant_image_sha:post.image_sha,grant_fingerprint:post.review_fingerprint,grant_review_id:'review',review_id:'review',grant_expires_at:new Date(at2).toISOString(),grant_publication_at:new Date(at2).toISOString(),metricool_id:42,metricool_uuid:'uuid',metricool_state:'awaiting_verification',metricool_publication_at:new Date(at2).toISOString(),metricool_template:JSON.stringify({schema:'xjw-owner-directed-scoped-release-receipt-v1',authorizationId:'mock-grant',postId:post.id,fingerprint:post.review_fingerprint,externalScheduleVerified:true,publicationVerified:false,remote:{id:42,uuid:'uuid',autoPublish:true,draft:false,publicationDate:{dateTime:'2026-11-18T10:00:00',timezone:'Asia/Taipei'},providers:['facebook','instagram','threads'].map(network=>({network}))}})};
 assert.equal(inspectSlot(at,[p],now).state,'RESCHEDULED_SCOPED_REMOTE_RECEIPT');
 assert.equal(inspectSlot(at2,[p],now).state,'SCOPED_REMOTE_SCHEDULE_RECORDED');
 assert.equal(inspectSlot(at2,[p],at2+1).state,'SCOPED_REMOTE_DELIVERY_DUE');
 assert.equal(inspectSlot(at,[{...p,grant_revoked_at:new Date(now).toISOString()}],now).state,'MISSED_OR_UNVERIFIED');
 assert.equal(inspectSlot(at,[{...p,metricool_template:p.metricool_template.replace('"draft":false','"draft":true')}],now).state,'MISSED_OR_UNVERIFIED');
 assert.equal(inspectSlot(at,[{...p,liveImageVerified:false}],now).state,'MISSED_OR_UNVERIFIED');
});
