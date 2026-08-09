import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const must=(cond,message)=>{if(!cond)throw new Error(message)};
const wrangler=read('wrangler.jsonc');
const production=read('src/production-entry.js');
const gate=read('src/publishing-review-gate-entry.js');
const ui=read('assets/js/publishing-review-gate.js');
const html=read('publishing.html');

must(wrangler.includes('"main": "src/production-entry.js"'),'Worker正式入口必須是production-entry.js');
must(production.includes("gateState(env,row)"),'排程發布前必須檢查持久圖文審核指紋');
must(production.includes("status='draft'"),'無有效審核的到期排程必須退回草稿');
must(gate.includes('social_post_review_gates'),'必須建立持久圖文審核紀錄表');
must(gate.includes("crypto.subtle.digest('SHA-256'"),'文案圖片核准必須綁定內容指紋');
must(gate.includes("body?.status==='approved'"),'審核通過必須經過review gate');
must(gate.includes("body?.status==='scheduled'"),'排程前必須經過review gate');
must(gate.includes("publishMatch&&request.method==='POST'"),'立即發布前必須經過review gate');
must(gate.includes('copy_image_match!==true'),'必須明確確認文案與圖片一致');
must(gate.includes('30cc正式名稱必須是小玻璃罐'),'30cc玻璃罐正式名稱守門缺失');
must(gate.includes('龜鹿湯塊正式規格只有75g'),'龜鹿湯塊75g唯一規格守門缺失');
const required=(gate.match(/'brand','product','specification','pricing_activity','season','weather','occasion','location'/)||[]).length;
must(required===1,'16項審核欄位母本缺失');
must((ui.match(/\['[a-z_]+','/g)||[]).length===16,'前端必須剛好顯示16項審核');
must(ui.includes('最終確認：文案與圖片一致'),'前端缺少最終圖文一致確認');
must(ui.includes('stopImmediatePropagation'),'原本的一鍵審核按鈕必須被完整審核流程攔截');
must(html.includes('publishing-review-gate.js'),'獨立貼文系統沒有載入16項圖文審核UI');
must(html.includes('文案或圖片一改，原核准自動失效'),'獨立貼文系統沒有清楚提示重新審核規則');
console.log('PASS：獨立貼文系統具備持久16項圖文審核、內容指紋、排程與立即發布硬守門。');
