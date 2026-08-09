import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const must=(cond,message)=>{if(!cond)throw new Error(message)};
const wrangler=read('wrangler.jsonc');
const production=read('src/production-entry.js');
const wrapper=fs.existsSync('src/publishing-only-entry.js')?read('src/publishing-only-entry.js'):'';
const gate=read('src/publishing-review-gate-entry.js');
const ui=read('assets/js/publishing-review-gate.js');
const raster=read('assets/js/svg-candidate-rasterizer.js');
const html=read('publishing.html');

const productionMain=wrangler.includes('"main": "src/production-entry.js"');
const publishingOnlyMain=wrangler.includes('"main": "src/publishing-only-entry.js"');
must(productionMain||publishingOnlyMain,'Worker正式入口必須是production-entry.js或publishing-only-entry.js');
if(publishingOnlyMain){
  must(wrapper.includes("from './production-entry.js'"),'publishing-only入口必須沿用正式production-entry安全邏輯');
  must(wrapper.includes("'/api/modules/'")&&wrapper.includes('XJW_PUBLISHING_ONLY'),'publishing-only入口沒有封鎖已停用ERP API');
}
must(production.includes("gateState(env,row)"),'排程發布前必須檢查持久圖文審核指紋');
must(production.includes("status='draft'"),'無有效審核的到期排程必須退回草稿');
must(gate.includes('social_post_review_gates'),'必須建立持久圖文審核紀錄表');
must(gate.includes("crypto.subtle.digest('SHA-256'"),'文案圖片核准必須綁定內容指紋');
must(gate.includes("body?.status==='approved'"),'審核通過必須經過review gate');
must(gate.includes("body?.status==='scheduled'"),'排程前必須經過review gate');
must(gate.includes("publishMatch&&request.method==='POST'"),'立即發布前必須經過review gate');
must(gate.includes('copy_image_match!==true'),'必須明確確認文案與圖片一致');
must(gate.includes("['PUT','PATCH'].includes(request.method)"),'文案或圖片PUT/PATCH修改必須立即使舊審核失效');
must(gate.includes('invalidateEditedPost'),'缺少貼文修改後立即退回草稿與清核准機制');
must(gate.includes("status='draft',scheduled_at=NULL,approved_by=NULL,approved_at=NULL,image_approved=0"),'修改後未完整清除排程／核准／圖片核准狀態');
must(gate.includes('30cc正式名稱必須是小玻璃罐'),'30cc玻璃罐正式名稱守門缺失');
must(gate.includes('龜鹿湯塊正式規格只有75g'),'龜鹿湯塊75g唯一規格守門缺失');
const required=(gate.match(/'brand','product','specification','pricing_activity','season','weather','occasion','location'/)||[]).length;
must(required===1,'16項審核欄位母本缺失');
must((ui.match(/\['[a-z_]+','/g)||[]).length===16,'前端必須剛好顯示16項審核');
must(ui.includes('最終確認：文案與圖片一致'),'前端缺少最終圖文一致確認');
must(ui.includes('stopImmediatePropagation'),'原本的一鍵審核按鈕必須被完整審核流程攔截');
must(html.includes('publishing-review-gate.js'),'獨立貼文系統沒有載入16項圖文審核UI');
must(html.includes('原核准自動失效'),'獨立貼文系統沒有清楚提示重新審核規則');
must(raster.includes("version:'2026-08-09-v7-raster-invalidates-review'"),'SVG轉JPEG工具不是目前正式v7重新審核版本');
must(raster.includes("throw new Error('這張候選圖仍內嵌舊 products-v2"),'舊products-v2候選沒有被SVG轉圖器硬拒絕');
must(raster.includes("throw new Error('這張候選圖仍內嵌LINE OA專用角色素材"),'LINE OA角色素材沒有被貼文轉圖器硬拒絕');
must(raster.includes("RAW_BASE}images/products-v3/"),'SVG轉圖沒有鎖到products-v3正式原圖');
must(!raster.includes('LEGACY_PRODUCT_MAP'),'SVG轉圖器不得再保留products-v3反向映射products-v2');
must(raster.includes("if(approving){button.dataset.xjwRasterReady='1';button.click();return}"),'審核按鈕轉JPEG後應繼續進16項審核');
must(raster.includes("圖片已轉成正式JPEG並退回草稿；請重新完成16項圖文審核後再發布"),'已核准貼文轉JPEG後沒有明確要求重新審核');
const rasterAt=html.indexOf('svg-candidate-rasterizer.js'),reviewAt=html.indexOf('publishing-review-gate.js');
must(rasterAt>=0&&reviewAt>=0&&rasterAt<reviewAt,'正式順序必須先安全轉JPEG，再進16項人工圖文審核');
console.log('PASS：唯一貼文系統具備products-v3-only候選轉JPEG、轉圖後重新審核、持久16項圖文審核、內容指紋、修改立即失效、排程與立即發布硬守門。');
