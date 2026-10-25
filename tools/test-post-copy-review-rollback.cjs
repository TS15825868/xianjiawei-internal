'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const cp=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const target=path.join(root,'tools/apply-post-copy-correction.cjs');
const legacy=fs.readFileSync(path.join(root,'.github/workflows/owner-delegated-ai-review-20261011.yml'),'utf8');
const corr=fs.readFileSync(target,'utf8');
const gate=fs.readFileSync(path.join(root,'.github/workflows/apply-post-copy-correction.yml'),'utf8');
test('legacy AI review is archive-only: no automatic trigger, D1 or approval execution',()=>{
 assert.match(legacy,/workflow_dispatch:/);
 assert.ok(!/^\s*(?:npx wrangler\b|node tools\/apply-owner-delegated-ai-review-20261011\.cjs (?:prepare|verify)\b|CLOUDFLARE_API_TOKEN:|push:|-\s+run:.*(?:wrangler|apply-owner-delegated))/m.test(legacy));
});
test('copy changes explicitly revoke all approval and retain publication history',()=>{
 assert.match(corr,/approved_by=NULL,approved_at=NULL,image_approved=0/);
 assert.match(corr,/status='pending_review'/);
 assert.match(corr,/AND published_at IS NULL/);
 assert.match(corr,/Published or historical posts cannot be rewritten/);
 assert.match(gate,/assert.equal\(p\.approved_at,null\)/);
 assert.match(gate,/assert.equal\(Number\(p\.image_approved\),0\)/);
});
test('synthetic approved correction produces a guarded pending_review SQL without writing D1',()=>{
 const {fingerprint}=require('./metricool-free-evidence.cjs');
 const fixture='ops/post-copy-corrections/xjw-review-regression.json';
 const file=path.join(root,fixture);
 const post={id:'XJW-QA-ONLY',status:'approved',copy:'仙加味原文',title:'仙加味',headline:'',category:'品牌',image_url:'https://example.invalid/approved.jpg',image_alt:'正式情境',image_source:'',image_width:1254,image_height:1254,image_quality_status:'ok',approved_by:'human@example.com',approved_at:'2026-10-01',image_approved:1,updated_at:'2026-10-01 12:00:00',scheduled_at:null,published_at:null};
 const link={post_id:post.id,uuid:'fixture-uuid',updated_at:'2026-10-01 12:00:00'};
 const newCopy='仙加味更新文案';
 const item={post_id:post.id,expected_status:post.status,expected_fingerprint:fingerprint(post),expected_copy:post.copy,new_copy:newCopy,reason:'corrected for review',verified_at:'2026-10-25T00:00:00Z',remote:{id:1234,uuid:link.uuid,draft:true,autoPublish:false,instagramData:{autoPublish:false},text:newCopy,providers:['facebook','instagram','threads'].map(network=>({network}))}};
 const request={batch:'qa-only',authorized_by:'owner@example.com',items:[item]};
 const beforeFile='/tmp/post-copy-before.json',linkFile='/tmp/post-copy-links-before.json';
 try{
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,JSON.stringify(request));
  fs.writeFileSync(beforeFile,JSON.stringify([{results:[post]}]));
  fs.writeFileSync(linkFile,JSON.stringify([{results:[link]}]));
  const run=cp.spawnSync(process.execPath,[target],{cwd:root,env:{...process.env,CORRECTION_FILE:fixture},encoding:'utf8',timeout:3000});
  assert.equal(run.status,0,run.stderr||run.stdout);
  const sql=fs.readFileSync('/tmp/post-copy-correction.sql','utf8');
  assert.ok(sql.includes("approved_by=NULL,approved_at=NULL,image_approved=0"));
  assert.ok(sql.includes("AND published_at IS NULL"));
  assert.ok(sql.includes("status='pending_review'"));
  // Do not execute D1; only inspect the computed SQL string.
  const prohibited={...post,status:'published',published_at:'2026-10-20'};
  request.items[0].expected_status='published';
  request.items[0].expected_fingerprint=fingerprint(prohibited);
  fs.writeFileSync(file,JSON.stringify(request));
  fs.writeFileSync(beforeFile,JSON.stringify([{results:[prohibited]}]));
  const reject=cp.spawnSync(process.execPath,[target],{cwd:root,env:{...process.env,CORRECTION_FILE:fixture},encoding:'utf8',timeout:3000});
  assert.notEqual(reject.status,0);
  assert.match(reject.stderr,/Published or historical posts cannot be rewritten/);
 }finally{
  for(const p of [file,beforeFile,linkFile,'/tmp/post-copy-correction.sql','/tmp/post-copy-result.json'])try{fs.unlinkSync(p)}catch{}
 }
});

const oldBatch29=fs.readFileSync(path.join(root,'.github/workflows/final-reviewed-batches-20261013.yml'),'utf8');
test('historic batch-29 AI review cannot write approval or auto-trigger',()=>{
 assert.match(oldBatch29,/workflow_dispatch:/);
 assert.doesNotMatch(oldBatch29,/^\s*(?:push:|CLOUDFLARE_API_TOKEN:|npx wrangler\b|node tools\/apply-final-reviewed-batches-20261013\.cjs (?:prepare|verify)\b)/m);
 assert.match(oldBatch29,/AI_ASSISTANT_NOT_HUMAN/);
 assert.ok(!oldBatch29.includes('npx wrangler d1 execute'));
});
