import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const registry=read('ops/formal-visual-asset-authority-20261105.json');
const queue=read('ops/social-scene-image-production-queue-20261105.json');
const calendar=read('ops/social-calendar-2026-11-to-2027-03-candidates.json');
const currentProductGuard=fs.readFileSync('assets/js/product-authority-guard.js','utf8');
const expectedIds=['mascot','deer','turtle'];
const requiredFor=brief=>['mascot',...(/小鹿|三個角色/.test(brief)?['deer']:[]),...(/小烏龜|三個角色/.test(brief)?['turtle']:[])];
const validGitBlob=sha=>/^[0-9a-f]{40}$/.test(String(sha||''));
function validateScene(x){
 assert.ok(x.id&&x.sourceD1Id===x.id,'scene must bind current D1 draft id');
 assert.equal(x.visualAuthorityFile,'ops/formal-visual-asset-authority-20261105.json');
 assert.deepEqual(x.requiredCharacterIds,requiredFor(x.sceneBrief),'no random deer/turtle or missing requested companion');
 assert.equal(x.prohibitedUnspecifiedCharacters,true);
 assert.equal(x.sourceAttestationNeeded,true);
 assert.equal(x.referenceIntegrityState,'source_paths_and_git_blob_shas_recorded_not_scene_approved');
 assert.equal(x.characterReferenceSources.length,x.requiredCharacterIds.length);
 assert.equal(x.characterReferenceSources[0].id,'mascot');
 for(const [i,source] of x.characterReferenceSources.entries()){
   const r=registry.assets[source.id];
   assert.ok(r,'approved referenced master exists');
   assert.equal(source.id,x.requiredCharacterIds[i]);
   assert.equal(source.path,r.path);
   assert.equal(source.gitBlobSha,r.gitBlobSha);
   assert.ok(validGitBlob(source.gitBlobSha));
   if(source.id!=='mascot')assert.equal(source.sceneAppearanceApproved,false,'decor sources are not complete characters');
 }
 assert.ok(x.mediaPrompt.includes('本篇只准出現指定角色：'));
 assert.ok(x.mediaPrompt.includes('禁止自行添加')||x.mediaPrompt.includes('小鹿及小烏龜必須分開'));
 assert.ok(x.mediaPrompt.includes('不能讓模型亂寫漢字'));
 assert.ok(x.mediaPrompt.includes('禁止擅自加入')||x.mediaPrompt.includes('只可依正式產品原圖原比例'));
 assert.ok(x.mediaPrompt.includes(x.sceneBrief));
 assert.equal(x.status,'needs_image_generation_reference_first_no_approval');
 for(const [key,expected] of Object.entries({imagePath:null,imageSha256:null,imageApproved:false,ai16Status:'not_run',humanApproved:false,externalScheduled:false,externalPublished:false}))
   assert.equal(x[key],expected);
 if(!x.productRefs.length)assert.deepEqual(x.productOriginalEvidence,[]);
 else{
   assert.equal(x.productRefs.length,x.productOriginalEvidence.length);
   for(const [i,id] of x.productRefs.entries()){
     const r=registry.products.find(p=>p.id===id),source=x.productOriginalEvidence[i];
     assert.ok(r,'present product must be formally registered');
     assert.equal(source.repository,r.repository);
     assert.equal(source.path,r.path);
     assert.equal(source.gitBlobSha,r.gitBlobSha);
     assert.equal(source.identityPath,r.identityReference.path);
     assert.equal(source.identityGitBlobSha,r.identityReference.gitBlobSha);
     assert.equal(source.mustVerifyCurrentOwnerOriginal,true);
     assert.ok(currentProductGuard.includes(r.path),'product must exist in active formal product guard');
     assert.ok(!source.path.includes('product-photo-cutouts/2026-10-11'),'do not silently replace latest main with old crop');
   }
 }
 return true;
}
test('current public product and Q character sources are precisely pinned without confusing decor/scene',()=>{
 assert.equal(registry.schema,'xjw-formal-visual-authority-pinned-main-20261105-v1');
 assert.equal(registry.products.length,4);
 assert.equal(new Set(registry.products.map(x=>x.id)).size,4);
 assert.deepEqual(Object.keys(registry.assets).slice(0,3),expectedIds);
 for(const r of Object.values(registry.assets)){
   assert.equal(r.repository,'TS15825868/xianjiawei');
   assert.ok(validGitBlob(r.gitBlobSha));
 }
 for(const p of registry.products){
   assert.equal(p.role,'current-public-main-photo-only');
   assert.ok(validGitBlob(p.gitBlobSha));
   assert.ok(validGitBlob(p.identityReference.gitBlobSha));
   assert.ok(currentProductGuard.includes(p.path));
   assert.ok(!/dm-final|products-v2|customer-display-v20260812/.test(p.path));
   assert.ok(p.restrictions.includes('do_not_ai_redraw'));
 }
 assert.equal(registry.assets.deer.fullBodySceneApproved,false);
 assert.equal(registry.assets.turtle.fullBodySceneApproved,false);
 assert.equal(registry.assets.sceneStyleReference.copyAsFinalImageAllowed,false);
});
test('23 D1 scene jobs have exact allowed character list and matching image references, no approvals',()=>{
 assert.equal(queue.items.length,23);
 assert.equal(new Set(queue.items.map(x=>x.id)).size,23);
 assert.equal(queue.sourceAuthority,'ops/formal-visual-asset-authority-20261105.json');
 for(const item of queue.items)validateScene(item);
 assert.equal(queue.summary.withDeer,queue.items.filter(x=>x.requiredCharacterIds.includes('deer')).length);
 assert.equal(queue.summary.withTurtle,queue.items.filter(x=>x.requiredCharacterIds.includes('turtle')).length);
 assert.equal(queue.summary.withProduct,queue.items.filter(x=>x.productRefs.length).length);
 assert.equal(queue.summary.AIImagesActuallyGenerated,0);
});
test('calendared D1 copies and dates match photo briefs, without changing human approval or schedule',()=>{
 const staged=calendar.slots.filter(x=>x.status==='staged_d1_draft_needs_scene_and_16_checks');
 assert.equal(staged.length,23);
 const byId=new Map(staged.map(x=>[x.id,x]));
 for(const x of queue.items){
   const original=byId.get(x.id);
   assert.ok(original);
   assert.equal(x.title,original.topic);
   assert.equal(x.draftCaption,original.copy_draft);
   assert.equal(x.plannedAt,original.date+'T'+original.time+':00+08:00');
   assert.equal(x.sceneBrief,original.scene_brief);
   assert.equal(x.imageApproved,false);
   assert.equal(x.humanApproved,false);
   assert.equal(x.externalPublished,false);
 }
});
test('explicit three-character solstice scene cannot merge deer and turtle or introduce fake package',()=>{
 const solstice=queue.items.find(x=>x.id==='XJW-CAND-20261222');
 assert.ok(solstice);
 assert.deepEqual(solstice.requiredCharacterIds,['mascot','deer','turtle']);
 assert.match(solstice.mediaPrompt,/必須分開、各自完整/);
 assert.match(solstice.mediaPrompt,/禁止擅自加入/);
 const noDeer=queue.items.find(x=>x.id==='XJW-CAND-20261208');
 assert.deepEqual(noDeer.requiredCharacterIds,['mascot']);
 assert.match(noDeer.mediaPrompt,/禁止自行添加任何動物夥伴/);
});
test('fails on simulated fabricated characters, old packaging, or synthetic approval',()=>{
 const candidate=structuredClone(queue.items[0]);
 candidate.requiredCharacterIds=['mascot','deer'];
 assert.throws(()=>validateScene(candidate));
 const packagePost=structuredClone(queue.items.find(x=>x.productRefs.includes('guilu-gao')));
 packagePost.productOriginalEvidence[0].path='images/products-v2/fabricated-product.jpg';
 assert.throws(()=>validateScene(packagePost));
 const fakeApproved=structuredClone(queue.items[0]);
 fakeApproved.humanApproved=true;
 assert.throws(()=>validateScene(fakeApproved));
});

test('real mascot identity reference is a decoded public brand image, not corrupt 11KB JPG or already published scene reuse',()=>{
 const ref=registry.verifiedReference;
 assert.equal(ref.testedTrueDecode,true);
 assert.equal(ref.mediaPath,'images/posts/formal-v20260904/first-post-work-rest-qmascot.webp');
 assert.equal(ref.githubBlobSha,registry.assets.mascot.gitBlobSha);
 assert.equal(registry.assets.deer.gitBlobSha,registry.assets.mascot.gitBlobSha);
 assert.equal(registry.assets.turtle.gitBlobSha,registry.assets.mascot.gitBlobSha);
 assert.equal(ref.cannotRepublishImage,true);
 assert.ok(registry.assets.mascot.originalWebsiteReferenceInvalid.includes('mascot-primary-v20260818.jpg'));
 for(const role of ['mascot','deer','turtle'])assert.equal(registry.assets[role].path,ref.mediaPath);
});
