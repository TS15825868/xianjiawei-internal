import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const must=(value,message)=>{if(!value)throw new Error(message)};
const worker=read('src/worker.js');
const production=read('src/production-entry.js');
const gate=read('src/publishing-review-gate-entry.js');
const seed=read('tools/build-guilu-review-seed.mjs');

for(const status of ['pending_review','manual_required','failed']){
  must(worker.includes(`'${status}'`),`worker D1狀態母本缺少 ${status}`);
  must(production.includes(status),`production狀態讀取缺少 ${status}`);
}
must(worker.includes('ensureSocialPostStatusSchema'),'worker 缺少舊D1狀態 CHECK 自動遷移');
must(!gate.includes('龜鹿膏目前正式使用方式為每日早上及下午各一小匙'),'review gate仍保留退役龜鹿膏固定時段');
must(gate.includes('食用時間可依個人使用習慣與作息時間安排'),'review gate未同步目前龜鹿膏使用原則');
must(!gate.includes('每塊約9.375g只留產品詳細／內部資料，不放貼文主規格'),'review gate仍誤擋目前湯塊每塊約重');
must(!gate.includes('每塊約18.75 g只留產品詳細／內部資料，不放貼文主規格'),'review gate仍誤擋目前龜鹿膠每塊約重');
must(seed.includes('XJW_CONTENT_SEED_CREATED_BY'),'母庫 seed 沒有合法 created_by 來源');
must(!seed.includes('INSERT OR IGNORE INTO social_posts'),'母庫 seed 不得再靜默忽略 CHECK／FK 錯誤');
must(seed.includes('ON CONFLICT(id) DO UPDATE SET'),'母庫 seed 缺少 draft／pending_review 安全同步');
must(seed.includes("WHERE social_posts.status IN ('draft','pending_review')"),'母庫 seed 不得覆寫已核准／已發布貼文');

console.log('PASS：D1正式貼文狀態、待審核母庫與目前產品守門規則一致。');
