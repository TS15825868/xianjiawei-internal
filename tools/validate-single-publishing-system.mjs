import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const must=(ok,message)=>{if(!ok)throw new Error(message)};
const index=read('index.html');
const publishing=read('publishing.html');
const buttons=read('assets/js/post-regenerate-buttons.js');
const policy=read('assets/js/post-regenerate-policy-v1.js');
const productGuard=read('assets/js/product-authority-guard.js');
const mediaPolicy=read('assets/js/formal-media-policy-v20260810.js');
const mediaAssistant=read('assets/js/zip-media-assistant.js');
const standard=read('docs/CONTENT_IMAGE_GENERATION_STANDARD.md');
const formalMedia=read('docs/FORMAL_MEDIA_POLICY_20260810.md');
const latestZip=JSON.parse(read('data/latest-user-post-zip.json'));
const pkg=read('package.json');

must(index.includes("location.replace('/publishing.html')"),'首頁必須直接進唯一貼文審核發佈系統');
must(!publishing.includes('營運 ERP'),'貼文系統不得再顯示ERP入口');
must(publishing.includes('唯一正式內容系統'),'貼文系統缺少唯一正式系統標示');
must(publishing.includes('禁止拼貼')&&publishing.includes('AI 不得重畫產品'),'主畫面沒有清楚顯示圖片硬規則');
for(const script of ['post-regenerate-buttons.js','post-regenerate-policy-v1.js','formal-media-policy-v20260810.js','zip-media-assistant.js']){
  must(publishing.includes(script),`正式系統缺少必要能力層：${script}`);
  must(new RegExp(script.replaceAll('.','\\.')+'\\?v=[^"\\\']+').test(publishing),`必要能力層缺少快取識別：${script}`);
}
must(!publishing.includes('post-media-suggestion-ui-v1.js'),'正式系統不得同時載入第二套媒體建議層');
must(!publishing.includes('post-regenerate-v6.js'),'正式系統不得再載入舊v6第二套重生成邏輯');
must(publishing.indexOf('post-regenerate-buttons.js')<publishing.indexOf('post-regenerate-policy-v1.js'),'正式順序必須先建立按鈕，再由唯一重生成流程接管操作');
must(!buttons.includes('window.open(')&&!buttons.includes('/api/posts/'),'按鈕呈現層不得偷偷保留第二套ChatGPT/API邏輯');

for(const token of ['禁止拼貼','products-v3','AI絕對不得重畫','30cc','Ø42×H51mm','180cc','0.60～0.68','小老闆','不可裁切','16項','待審核','/regeneration-start','/regeneration-ready'])must(policy.includes(token),`生成守門缺少硬規格／閉環能力：${token}`);
must(!policy.includes('products-v2'),'生成守門不得回退products-v2');
for(const token of ['products-v3','Ø42','H51','0.60','0.68'])must(productGuard.includes(token),`產品圖片守門缺少正式原圖／比例能力：${token}`);
must(!productGuard.includes('/images/products-v2/'),'產品圖片守門不得把products-v2當正式來源');
for(const token of ['禁止拼湊','products-v3','AI 重畫產品','30cc','180cc','小老闆','完整成圖／非拼湊','16 項正式審核','禁止回退'])must(standard.includes(token),`生成母規格文件缺少：${token}`);

for(const token of ['formalProductMedia','semanticScore','user_zip_approved','approved_existing','regenerate_if_missing','pending_review','reviewItems:16','needs_binary_sync','binary_ready','public_url','formal_product_media'])must(mediaPolicy.includes(token),`最新媒體權威 runtime 缺少能力：${token}`);
must(mediaPolicy.includes('if(semantic<=0)return -Infinity'),'ZIP來源權重不得讓未命中文案的圖片被誤判為合格');
for(const token of ['resolveMedia','approved_existing','needs_binary_sync','regenerate_if_missing','formal_product_media','套用正式圖','套用 ZIP 合格圖','xjw-publishing-list-rendered'])must(mediaAssistant.includes(token),`唯一正式配圖助理缺少能力：${token}`);
for(const token of ['2.zip','approved_existing','needs_binary_sync','regenerate_if_missing','pending_review','16項','products-v3','不驗舊版固定句子'])must(formalMedia.includes(token),`最新媒體權威文件缺少目前正式能力：${token}`);

must(latestZip.source==='2.zip','貼文中心尚未鎖定使用者最新 2.zip 素材批次');
must(Number(latestZip.candidate_count)>=22,'最新 ZIP 候選數不足，不能偷偷退回舊圖庫');
must(latestZip.priority==='user_zip_approved','最新 ZIP 必須優先於舊候選／重新生成');
must(/post-library-userzip2-v20260810\.json/.test(latestZip.public_catalog||''),'貼文中心未指向官網最新 ZIP 公開目錄');
const selectionRule=String(latestZip.selection_rule||'');
must(/needs_binary_sync/.test(selectionRule),'最新ZIP必須區分有合格來源但原圖待同步');
must(/regenerate only if no approved .*candidate matches/.test(selectionRule),'缺少「真的沒有合格來源才生成」能力規則');
must(/pending_review/.test(latestZip.review_rule||'')&&/16/.test(latestZip.review_rule||''),'最新 ZIP 配圖後必須回待審核並保留16項審核');
must(publishing.includes('最新貼文圖來源')&&publishing.includes('待同步原圖')&&publishing.includes('正式圖與 ZIP 都沒有合格來源'),'顧客可見說明沒有同步正式圖／ZIP／待同步／重生成能力');

must(!pkg.includes('cp brand-control.html dist/brand-control.html'),'正式部署不得再帶出品牌控制台');
must(!pkg.includes('cp assets/js/internal-app.js dist/assets/js/internal-app.js'),'正式部署不得再帶出ERP前端');
must(!pkg.includes('cp assets/js/erp-publishing-separation.js'),'正式部署不得再帶出ERP分流工具');
for(const file of ['post-regenerate-buttons.js','post-regenerate-policy-v1.js','formal-media-policy-v20260810.js','zip-media-assistant.js','latest-user-post-zip.json'])must(pkg.includes(file),`正式部署缺少能力檔：${file}`);
must(!pkg.includes('post-media-suggestion-ui-v1.js'),'正式部署不得保留第二套媒體建議層');
must(!pkg.includes('cp assets/js/post-regenerate-v6.js'),'正式部署不得再帶出舊v6第二套重生成邏輯');
console.log('PASS：唯一正式配圖助理會先判產品／試喝正式圖，再做真正語意命中的ZIP配圖；有來源待同步不誤生成，真的無合格來源才生成；products-v3、16項重審與能力式守門均保留。');
