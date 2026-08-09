import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const must=(ok,message)=>{if(!ok)throw new Error(message)};
const index=read('index.html');
const publishing=read('publishing.html');
const buttons=read('assets/js/post-regenerate-buttons.js');
const policy=read('assets/js/post-regenerate-policy-v1.js');
const productGuard=read('assets/js/product-authority-guard.js');
const standard=read('docs/CONTENT_IMAGE_GENERATION_STANDARD.md');
const pkg=read('package.json');

must(index.includes("location.replace('/publishing.html')"),'首頁必須直接進唯一貼文審核發佈系統');
must(!publishing.includes('營運 ERP'),'貼文系統不得再顯示ERP入口');
must(publishing.includes('唯一正式內容系統'),'貼文系統缺少唯一正式系統標示');
must(publishing.includes('禁止拼貼')&&publishing.includes('AI 不得重畫產品'),'主畫面沒有清楚顯示圖片硬規則');
must(publishing.includes('post-regenerate-buttons.js'),'正式系統缺少重生成按鈕呈現層');
must(publishing.includes('post-regenerate-policy-v1.js'),'未載入唯一免費重生成流程');
must(publishing.includes('20260810-single-system-v4-latest-originals'),'貼文系統沒有強制載入最新products-v3原圖版重生成流程');
must(publishing.includes('20260810-product-authority-v7-latest-originals'),'貼文系統沒有強制載入最新products-v3原圖版產品守門');
must(!publishing.includes('post-regenerate-v6.js'),'正式系統不得再載入舊v6第二套重生成邏輯');
must(publishing.indexOf('post-regenerate-buttons.js')<publishing.indexOf('post-regenerate-policy-v1.js'),'正式順序必須先建立按鈕，再由唯一free-roundtrip流程接管操作');
must(!buttons.includes('window.open(')&&!buttons.includes('/api/posts/'),'按鈕呈現層不得偷偷保留第二套ChatGPT/API邏輯');

for(const token of ['禁止拼貼','products-v3','AI絕對不得重畫','30cc','Ø42×H51mm','180cc','0.60～0.68','小老闆','不可裁切','16項','待審核','/regeneration-start','/regeneration-ready','20260810-products-v3-latest-originals-v3']){
  must(policy.includes(token),`生成守門缺少硬規格／免費閉環／最新產品原圖版本：${token}`)
}
for(const token of ['20260810-products-v3-latest-originals-v3','products-v3-latest-original-product-photos','Ø42','H51','0.60','0.68']){
  must(productGuard.includes(token),`產品圖片守門沒有鎖定最新products-v3原圖或實際比例：${token}`)
}
for(const token of ['禁止拼湊','products-v3','AI 重畫產品','30cc','180cc','小老闆','完整成圖／非拼湊','16 項正式審核','禁止回退']){
  must(standard.includes(token),`生成母規格文件缺少：${token}`)
}
must(!pkg.includes('cp brand-control.html dist/brand-control.html'),'正式部署不得再帶出品牌控制台');
must(!pkg.includes('cp assets/js/internal-app.js dist/assets/js/internal-app.js'),'正式部署不得再帶出ERP前端');
must(!pkg.includes('cp assets/js/erp-publishing-separation.js'),'正式部署不得再帶出ERP分流工具');
must(pkg.includes('post-regenerate-buttons.js')&&pkg.includes('post-regenerate-policy-v1.js'),'正式部署缺少單一重生成按鈕＋流程');
must(!pkg.includes('cp assets/js/post-regenerate-v6.js'),'正式部署不得再帶出舊v6第二套重生成邏輯');
console.log('PASS：正式部署只保留仙加味唯一貼文審核發佈系統；產品守門與重生成流程都鎖定最新products-v3原圖、禁止拼湊、產品不得AI重畫並要求16項重審。');
