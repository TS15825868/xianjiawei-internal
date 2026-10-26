import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const policy=fs.readFileSync(new URL('../assets/js/post-regenerate-policy-v1.js',import.meta.url),'utf8');
const queueSource=fs.readFileSync(new URL('./build-post-image-rework-queue.mjs',import.meta.url),'utf8');
const config=JSON.parse(fs.readFileSync(new URL('../config/visual-production-spec.json',import.meta.url),'utf8'));
const identity=config.generationRouting.characterReferencePrecondition;
test('owner-approved same-person and independent companions must be attached before any image generation',()=>{
 assert.equal(identity.requiresOriginalOwnerApprovedMascotReferenceImage,true);
 assert.equal(identity.requiresOriginalOwnerApprovedDeerImageWhenVisible,true);
 assert.equal(identity.requiresOriginalOwnerApprovedTurtleImageWhenVisible,true);
 assert.equal(identity.chatTextOnlyNotIdentityProof,true);
 assert.equal(identity.failedOrMissingReferenceBehavior,'stop_generation_keep_draft');
 assert.equal(identity.autoApprove,false);assert.equal(identity.autoPublish,false);
 const required=[
  'CHARACTER_REFERENCE_LOCK','沒有看見正式原圖附件，立即停止生圖',
  '小鹿或小烏龜入鏡','各自正式核准的獨立原圖參考',
  '絕不自由想像另一隻鹿或龜','禁止長大','不能用其他AI候選',
  '只有確認並能逐項對照正式原圖時','新對話不會自動附上角色原圖',
  'mode===\'copy\''
 ];
 for(const v of required)assert.ok(policy.includes(v),'Missing identity lock '+v);
 assert.match(policy,/const common=.+mode==='copy'/);
 assert.match(policy,/if\(mode==='all'\)return.*尚未附上則只重寫文案並列出缺少的參考圖/);
 assert.match(policy,/return.*沒有正式原圖就停止生圖/);
});
test('pending image queue never claims mascot or partner image identity has already been visually verified',()=>{
 for(const value of ['approvedMascotReferenceRequired:true',
 'approvedPartnerReferenceRequiredIfVisible:true',
 'approvedMascotReferenceAttachedAndVerified:false',
 'approvedPartnerReferenceAttachedAndVerified:false',
 'textOnlyCharacterGenerationAllowed:false',
 "generatedCharacterIdentityReview:'not_yet_verified'"])
  assert.ok(queueSource.includes(value),'Missing candidate safeguard '+value);
});
