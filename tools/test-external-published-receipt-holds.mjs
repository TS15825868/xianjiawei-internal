import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {publishedPlatformReceiptHold,PUBLISHED_PLATFORM_RECEIPTS} from '../src/external-published-receipt-holds.js';
import {buildPlan} from './build-post-image-rework-queue.mjs';
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
 assert.match(content,/\.\.\.\(receiptHold\?\[receiptHold\.reason\]/);
 for(const fn of ['regenerationStart','regenerationReady']){
  const a=gate.indexOf('async function '+fn+'('),b=gate.indexOf('async function ',a+20);
  assert.ok(a>=0);assert.match(gate.slice(a,b>0?b:undefined),/publishedPlatformReceiptHold\(before\)/);
 }
 assert.match(content,/if\(publishMatch&&request\.method==='POST'\)/);
});