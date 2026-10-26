import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildPlan,rowsFromSnapshot} from './build-post-image-rework-queue.mjs';
test('rework queue includes existing rejected images without touching missing-image draft queue',()=>{
 const rows=[
  {id:'a',status:'pending_review',title:'仙加味龜鹿飲30cc',copy:'在家',image_alt:'居家小老闆',image_url:'https://example.test/original.jpg',image_quality_status:'needs_rework'},
  {id:'b',status:'draft',title:'仙加味生活',copy:'雨天',image_alt:'雨天小老闆',image_url:'',image_quality_status:'needs_regeneration'},
  {id:'c',status:'archived',image_quality_status:'needs_rework'},
  {id:'d',status:'published',image_quality_status:'needs_rework'},
  {id:'e',status:'pending_review',image_quality_status:'clear'}
 ];
 const old=JSON.stringify(rows);
 const p=buildPlan(rows,{a:'萬華店鋪早上情境'});
 assert.equal(p.total,2);assert.equal(p.byStatus.pending_review,1);assert.equal(p.byStatus.draft,1);
 assert.equal(p.items.find(x=>x.postId==='a').scene,'萬華店鋪早上情境');
 assert.equal(p.items.find(x=>x.postId==='a').requiredAction,'replace_existing_rejected_image');
 assert.deepEqual(p.items.find(x=>x.postId==='a').productsMentioned,['龜鹿飲30cc']);
 assert.equal(p.items.find(x=>x.postId==='b').requiredAction,'produce_missing_or_rejected_image');
 assert.equal(p.items.find(x=>x.postId==='b').sceneRequiresManualReview,true);
 const comparison=buildPlan([{id:'compare',status:'pending_review',title:'30cc跟180cc，怎麼選？',copy:'仙加味說明兩種包裝',image_alt:'龜鹿飲30cc裸玻璃罐與180cc鋁袋',image_quality_status:'needs_rework',image_url:'https://example.test/old.png'}]);
 assert.deepEqual(comparison.items[0].productsMentioned,['龜鹿飲30cc','龜鹿飲180cc']);
 assert.equal(p.items.every(x=>x.readyForAutomaticPublication===false&&x.requiresHumanVisualReview===true),true);
 assert.equal(JSON.stringify(rows),old);assert.equal(JSON.stringify(p).includes('"copy":"在家"'),false);
});
test('retains dynamic counts without hardcoded four-item or 59-post limits',()=>{
 const rows=Array.from({length:71},(_,i)=>({id:'P-'+i,title:'仙加味',status:'pending_review',image_quality_status:'needs_rework',image_alt:'工作空檔',copy:'日常生活'}));
 const p=buildPlan(rows);assert.equal(p.total,71);assert.equal(new Set(p.items.map(x=>x.postId)).size,71);
 assert.throws(()=>buildPlan([...rows,rows[0]]),/Duplicate/);
 assert.deepEqual(rowsFromSnapshot([{results:rows}]),rows);
 assert.throws(()=>rowsFromSnapshot({other:[]}),/missing/);
});