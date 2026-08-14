import fs from 'node:fs';

const worker=fs.readFileSync('src/worker.js','utf8');
const ui=fs.readFileSync('assets/js/publishing-app-v2.js','utf8');

const requiredWorker=[
  "pending_review:['approved','draft']",
  "draft:['pending_review']",
  "if(next==='pending_review')",
  "貼文沒有文案，不能送待審核",
  "貼文沒有圖片，不能送待審核",
  "貼文沒有發布平台，不能送待審核"
];
for(const token of requiredWorker){
  if(!worker.includes(token))throw new Error(`Worker 缺少正式送審流程：${token}`);
}
if(worker.includes("draft:['approved']"))throw new Error('草稿不得直接跳過待審核進入 approved');

const requiredUi=[
  "post.status==='draft'",
  'data-post-status="pending_review"',
  '送待審核',
  "post.status==='pending_review'",
  'data-post-status="approved"',
  '16項審核通過',
  '退回草稿'
];
for(const token of requiredUi){
  if(!ui.includes(token))throw new Error(`貼文中心 UI 缺少正式審核流程：${token}`);
}
if(ui.includes("['draft','pending_review'].includes(post.status)?`<button class=\"btn small green\" data-post-status=\"approved\"")){
  throw new Error('UI 不得讓 draft 與 pending_review 共用直接核准按鈕');
}
console.log('PASS：正式貼文流程固定為草稿 → 待審核 → 16項人工審核通過 → 排程／立即發布；草稿不得直接核准。');
