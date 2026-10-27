import fs from 'node:fs';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
const policy=read('assets/js/post-regenerate-policy-v1.js');
const html=read('publishing.html');
const gate=read('src/publishing-review-gate-entry.js');
const buttons=read('assets/js/post-regenerate-buttons.js');
const ui=read('assets/js/publishing-review-gate.js');
const rules=JSON.parse(read('config/visual-production-spec.json'));
const packageJson=JSON.parse(read('package.json'));
const precondition=rules.generationRouting?.characterReferencePrecondition||{};
for(const flag of [
  'requiresOriginalOwnerApprovedMascotReferenceImage',
  'requiresOriginalOwnerApprovedDeerImageWhenVisible',
  'requiresOriginalOwnerApprovedTurtleImageWhenVisible',
  'chatTextOnlyNotIdentityProof'
])assert.equal(precondition[flag],true,'角色正式原圖不可省略：'+flag);
assert.equal(precondition.failedOrMissingReferenceBehavior,'stop_generation_keep_draft');
assert.equal(precondition.autoApprove,false);
assert.equal(precondition.autoPublish,false);
for(const p of [
  'CHARACTER_REFERENCE_LOCK','沒有看見正式原圖附件，立即停止生圖',
  '各自正式核准的獨立原圖參考','絕不自由想像另一隻鹿或龜',
  '禁止長大','不能用其他AI候選','小鹿在左、小烏龜在右',
  'AI絕對不得重畫','30cc','180cc','官網主檔與商品總覽為準'
])assert.ok(policy.includes(p),'製圖規則缺少最新內容：'+p);
assert.match(policy,/mode==='copy'\?'':'\\n\\n'\+CHARACTER_REFERENCE_LOCK/);
assert.match(policy,/if\(mode==='all'\)return.*尚未附上則只重寫文案並列出缺少的參考圖/);
assert.match(policy,/if\(mode!=='copy'\)toast\('重要：新對話不會自動附上角色原圖/);
assert.match(policy,/beginRegeneration\(id,mode\)/);
assert.match(policy,/markReady\(id,mode\)/);
assert.match(buttons,/button\.dataset\.xjwRegenerate=mode/);
assert.match(buttons,/data-xjw-regenerate/);
assert.match(html,/post-regenerate-policy-v1\.js\?v=/);
assert.match(html,/post-regenerate-buttons\.js\?v=/);
assert.match(ui,/\['mascot_companions','小老闆／夥伴'/);
assert.match(ui,/正式角色原圖/);
assert.match(ui,/16項完整圖文審核/);
for(const q of ["'mascot_companions'","'physical_scale'","'duplicate'","'compliance_final'",'REQUIRED_CHECKS.some','publishedPlatformReceiptHold'])
  assert.ok(gate.includes(q),'後端16項審核缺少：'+q);
for(const obsolete of ['三、目前對外產品只有四項','20261009-four-public-products-v1','images/product-main/','api.openai.com'])
  assert.ok(!policy.includes(obsolete),'舊版製圖規則回流：'+obsolete);
assert.ok(packageJson.scripts.check.includes('node tools/validate-post-regeneration.mjs'),'此驗證必須納入 npm check');
console.log('PASS 角色及夥伴原圖固定、無參考即停止、產品原圖及16項審核；不鎖舊產品數量或快取版本。');
