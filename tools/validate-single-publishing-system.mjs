import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const must=(ok,message)=>{if(!ok)throw new Error(message)};
const index=read('index.html');
const publishing=read('publishing.html');
const buttons=read('assets/js/post-regenerate-buttons.js');
const policy=read('assets/js/post-regenerate-policy-v1.js');
const productGuard=read('assets/js/product-authority-guard.js');
const mediaPolicy=read('assets/js/formal-media-policy-v20260810.js');
const standard=read('docs/CONTENT_IMAGE_GENERATION_STANDARD.md');
const formalMedia=read('docs/FORMAL_MEDIA_POLICY_20260810.md');
const pkg=read('package.json');

must(index.includes("location.replace('/publishing.html')"),'首頁必須直接進唯一貼文審核發佈系統');
must(!publishing.includes('營運 ERP'),'貼文系統不得再顯示ERP入口');
must(publishing.includes('唯一正式內容系統'),'貼文系統缺少唯一正式系統標示');
must(publishing.includes('禁止拼貼')&&publishing.includes('AI 不得重畫產品'),'主畫面沒有清楚顯示圖片硬規則');
must(publishing.includes('post-regenerate-buttons.js'),'正式系統缺少重生成按鈕呈現層');
must(publishing.includes('post-regenerate-policy-v1.js'),'未載入唯一免費重生成流程');
must(publishing.includes('formal-media-policy-v20260810.js'),'正式系統沒有載入最新媒體權威流程');
must(/post-regenerate-policy-v1\.js\?v=[^"']+/.test(publishing),'貼文系統重生成流程缺少正式快取版本識別');
must(/product-authority-guard\.js\?v=[^"']+/.test(publishing),'貼文系統產品守門缺少正式快取版本識別');
must(/formal-media-policy-v20260810\.js\?v=[^"']+/.test(publishing),'貼文系統最新媒體權威缺少快取版本識別');
must(!/single-system-v2-free-roundtrip|single-system-v3-true-originals/.test(publishing),'貼文系統不得回退已退役重生成版本');
must(!/product-authority-v6-true-originals/.test(publishing),'貼文系統不得回退已退役產品守門版本');
must(!publishing.includes('post-regenerate-v6.js'),'正式系統不得再載入舊v6第二套重生成邏輯');
must(publishing.indexOf('post-regenerate-buttons.js')<publishing.indexOf('post-regenerate-policy-v1.js'),'正式順序必須先建立按鈕，再由唯一free-roundtrip流程接管操作');
must(!buttons.includes('window.open(')&&!buttons.includes('/api/posts/'),'按鈕呈現層不得偷偷保留第二套ChatGPT/API邏輯');

for(const token of ['禁止拼貼','products-v3','AI絕對不得重畫','30cc','Ø42×H51mm','180cc','0.60～0.68','小老闆','不可裁切','16項','待審核','/regeneration-start','/regeneration-ready']){
  must(policy.includes(token),`生成守門缺少硬規格／免費閉環／最新產品原圖能力：${token}`)
}
must(!policy.includes('products-v2'),'生成守門不得回退products-v2');
for(const token of ['products-v3','Ø42','H51','0.60','0.68']){
  must(productGuard.includes(token),`產品圖片守門沒有鎖定products-v3正式原圖或實際比例：${token}`)
}
must(!productGuard.includes('/images/products-v2/'),'產品圖片守門不得把products-v2當正式來源');
for(const token of ['禁止拼湊','products-v3','AI 重畫產品','30cc','180cc','小老闆','完整成圖／非拼湊','16 項正式審核','禁止回退']){
  must(standard.includes(token),`生成母規格文件缺少：${token}`)
}
for(const token of ['user_zip_approved','approved_existing','regenerate_if_missing','pending_review','reviewItems:16','ai-redrawn-product','copy-image-mismatch']){
  must(mediaPolicy.includes(token),`最新媒體權威 runtime 缺少能力：${token}`)
}
for(const token of ['最新提供的 zip','沒有合格圖才進重新生成','16項審核','AI 不得重畫產品','不驗舊版固定句子']){
  must(formalMedia.includes(token),`最新媒體權威文件缺少：${token}`)
}
must(publishing.includes('最新貼文圖來源')&&publishing.includes('不合格不得硬配')&&publishing.includes('找不到合格圖才重新生成'),'貼文中心顧客可見說明沒有同步最新zip優先配圖原則');
must(!pkg.includes('cp brand-control.html dist/brand-control.html'),'正式部署不得再帶出品牌控制台');
must(!pkg.includes('cp assets/js/internal-app.js dist/assets/js/internal-app.js'),'正式部署不得再帶出ERP前端');
must(!pkg.includes('cp assets/js/erp-publishing-separation.js'),'正式部署不得再帶出ERP分流工具');
must(pkg.includes('post-regenerate-buttons.js')&&pkg.includes('post-regenerate-policy-v1.js'),'正式部署缺少單一重生成按鈕＋流程');
must(pkg.includes('formal-media-policy-v20260810.js'),'正式部署沒有包含最新媒體權威 runtime');
must(!pkg.includes('cp assets/js/post-regenerate-v6.js'),'正式部署不得再帶出舊v6第二套重生成邏輯');
console.log('PASS：正式部署只保留仙加味唯一貼文審核發佈系統；守門驗最新使用者ZIP優先配圖、缺圖才重生成、products-v3權威、尺寸、禁止拼湊、產品不得AI重畫與16項重審能力，不再因正確新版快取版本號或舊固定文案更新而誤擋。');