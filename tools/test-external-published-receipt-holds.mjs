import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {publishedPlatformReceiptHold,PUBLISHED_PLATFORM_RECEIPTS} from '../src/external-published-receipt-holds.js';
import {buildPlan} from './build-post-image-rework-queue.mjs';
import {duplicatePostErrors} from '../src/publishing-review-gate-entry.js';
test('real remote receipts hold two pre-published D1 drafts without modifying any row',()=>{
 assert.equal(PUBLISHED_PLATFORM_RECEIPTS.length,2);
 const rows=PUBLISHED_PLATFORM_RECEIPTS.map(r=>({id:r.postId,status:'draft',image_quality_status:'needs_rework',image_url:'https://example.invalid/old.jpg',title:'仙加味'}));
 const original=JSON.stringify(rows);
 for(const row of rows){
  const h=publishedPlatformReceiptHold(row);
  assert.equal(h.id,row.id);assert.match(h.reason,/禁止重製成新的待發文/);
 }
 assert.equal(publishedPlatformReceiptHold({id:rows[0].id,status:'published'}),null);
 assert.equal(publishedPlatformReceiptHold({id:'unrelated',status:'draft'}),null);
 // Public Metricool receipts (same copy posted twice 10 minutes apart) must
 // also hold a newly-created D1 ID, but not unrelated weather reminders.
 const already='🌧️ 風雨來了，平安最重要。\n\n仙加味想提醒大家：\n\n記得關好門窗、收好陽台物品，準備好飲水、食物與必要用品。\n\n風雨期間盡量避免外出，也別忘了關心家中的長輩，以及獨自居住的親友。\n\n希望大家都能平平安安地待在家裡。\n\n願風雨平息，大家一切安好。❤️\n\n仙加味｜補養，是一種節奏。\n\n#仙加味 #颱風天注意安全 #平安最重要';
 const duplicate=publishedPlatformReceiptHold({id:'future-new-id',copy:already,status:'pending_review'});
 assert.ok(duplicate);assert.match(duplicate.reason,/403318046/);
 assert.ok(publishedPlatformReceiptHold({id:'future-new-id',copy:already.replace(/\s+/g,''),status:'draft'}));
 assert.equal(publishedPlatformReceiptHold({id:'future-new-id',copy:'雨天記得帶傘',status:'draft'}),null);
 const plan=buildPlan([...rows,{id:'unrelated',status:'pending_review',title:'在家使用',image_quality_status:'needs_rework',image_url:'https://example.invalid/d.jpg'}]);
 assert.equal(plan.total,3);assert.equal(plan.externalReceiptReconciliationCount,2);
 assert.equal(plan.eligibleForImageReworkCount,1);
 assert.equal(plan.items.filter(x=>x.publicationReconciliationRequired&&x.safeToBeginImageRework===false).length,2);
 assert.equal(JSON.stringify(rows),original);
});
test('backend approval, regeneration and immediate publish all apply hold independent of image quality',()=>{
 const content=fs.readFileSync(new URL('../src/publishing-content-audit-entry.js',import.meta.url),'utf8');
 const gate=fs.readFileSync(new URL('../src/publishing-review-gate-entry.js',import.meta.url),'utf8');
 assert.match(content,/publishedPlatformReceiptHold\(row\)/);
 assert.match(content,/publication_reconciliation_required:Boolean\(receiptHold\)/);
 const ui=fs.readFileSync(new URL('../assets/js/publishing-review-gate.js',import.meta.url),'utf8');
 const buttons=fs.readFileSync(new URL('../assets/js/post-regenerate-buttons.js',import.meta.url),'utf8');
 const policy=fs.readFileSync(new URL('../assets/js/post-regenerate-policy-v1.js',import.meta.url),'utf8');
 assert.match(ui,/item\.publication_reconciliation_required===true/);
 assert.match(ui,/card\.dataset\.externalPublishedHold/);
 assert.match(buttons,/externalPublishedHold==='1'/);
 assert.match(policy,/externalPublishedHold==='1'/);
 assert.match(content,/\.\.\.\(receiptHold\?\[receiptHold\.reason\]/);
 for(const fn of ['regenerationStart','regenerationReady']){
  const a=gate.indexOf('async function '+fn+'('),b=gate.indexOf('async function ',a+20);
  assert.ok(a>=0);assert.match(gate.slice(a,b>0?b:undefined),/publishedPlatformReceiptHold\(before\)/);
 }
 assert.match(gate,/const priorPublic=publishedPlatformReceiptHold\(row\);if\(priorPublic\)return/);
 assert.match(gate,/async function saveGate\(env,row,body,profile\)\{const priorPublic=publishedPlatformReceiptHold\(row\)/);
 assert.match(content,/if\(publishMatch&&request\.method==='POST'\)/);
});
test('archived historical copy blocks duplicate publication but not shared headings or product images',async()=>{
 const sameCopy='在家準備一份熟悉的家常料理，備料、慢煮、端上餐桌，每個步驟都有不同的生活風味與家人記憶。';
 const row={id:'new-post',title:'家常料理',copy:sameCopy,image_url:'https://example.invalid/official-product.jpg'};
 const archived={id:'old-post',title:'家常料理',copy:sameCopy,image_url:row.image_url,status:'archived'};
 const calls=[];
 const env={DB:{prepare:sql=>{calls.push(sql);return{bind:()=>({all:async()=>({results:[archived]})})}}}};
 const issues=await duplicatePostErrors(env,row);
 assert.ok(calls[0].includes('FROM social_posts WHERE id<>?'));
 assert.ok(!calls[0].includes("status<>'archived'"));
 assert.ok(issues.some(issue=>issue.includes('內容')&&issue.includes('過度相似')));
 assert.ok(!issues.some(issue=>issue.includes('標題')||issue.includes('主圖')));
 const unrelatedArchived={...archived,copy:'另外一個完全不同的飲食文化分享內容，食材來源、品名與保存方式各有其重要性，需要慢慢確認再開始。'};
 assert.deepEqual(await duplicatePostErrors(env,row,[unrelatedArchived]),[]);
 const active={...unrelatedArchived,status:'pending_review'};
 const activeErrors=await duplicatePostErrors(env,row,[active]);
 assert.ok(activeErrors.some(issue=>issue.includes('標題')));
 assert.ok(activeErrors.some(issue=>issue.includes('主圖')));
});
