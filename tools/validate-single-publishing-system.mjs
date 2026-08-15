import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const must=(ok,message)=>{if(!ok)throw new Error(message)};

const index=read('index.html');
const publishing=read('publishing.html');
const publishingOnly=read('src/publishing-only-entry.js');
const contentAudit=read('src/publishing-content-audit-entry.js');
const buttons=read('assets/js/post-regenerate-buttons.js');
const policy=read('assets/js/post-regenerate-policy-v1.js');
const productGuard=read('assets/js/product-authority-guard.js');
const mediaPolicy=read('assets/js/formal-media-policy-v20260810.js');
const mediaAssistant=read('assets/js/zip-media-assistant.js');
const standard=read('docs/CONTENT_IMAGE_GENERATION_STANDARD.md');
const latestZip=JSON.parse(read('data/latest-user-post-zip.json'));
const pkg=read('package.json');
const wrangler=read('wrangler.jsonc');
const production=read('src/production-entry.js');
const reviewEntry=read('src/publishing-review-gate-entry.js');

must(index.includes("location.replace('/publishing.html')"),'備用index頁必須仍能開啟貼文中心');
must(!index.includes('營運中控')&&!index.includes('internal-app.js')&&!index.includes('erp-publishing-separation.js'),'根頁仍殘留ERP介面');
must(publishing.includes('唯一正式內容系統'),'貼文中心缺少唯一正式系統標示');
must(publishing.includes('貼文中心系統 App'),'貼文中心沒有App定位');
for(const script of ['post-regenerate-buttons.js','post-regenerate-policy-v1.js','formal-media-policy-v20260810.js','zip-media-assistant.js']){
  must(publishing.includes(script),`正式貼文系統缺少必要能力層：${script}`);
  must(publishing.includes(script+'?v='),`必要能力層缺少快取識別：${script}`);
}
must(publishing.includes('publishing-base.css'),'貼文中心沒有使用獨立基礎樣式');
must(!publishing.includes('internal-app.js')&&!publishing.includes('erp-publishing-separation.js'),'貼文中心不得載入ERP前端程式');
must(!publishing.includes('post-regenerate-v6.js'),'正式貼文系統不得再載入舊v6第二套重生成邏輯');
must(!buttons.includes('window.open(')&&!buttons.includes('/api/posts/'),'按鈕呈現層不得偷偷保留第二套ChatGPT/API邏輯');

must(/"main"\s*:\s*"src\/publishing-content-audit-entry\.js"/.test(wrangler),'Wrangler正式入口必須是目前內容語意守門入口');
must(/"html_handling"\s*:\s*"none"/.test(wrangler),'Wrangler 靜態 HTML 必須使用 none，禁止 Cloudflare 自動把 /publishing.html 導向 /publishing');
for(const token of ["from './publishing-only-entry.js'",'duplicateImageHardGate:true','seasonWeatherContextAudit:true','semanticImageMatchHardGate:true'])must(contentAudit.includes(token),`內容語意守門入口缺少：${token}`);
for(const token of ["from './production-entry.js'","blockedApi(path)",'publishingUiAlias(path)','servePublishingAsset(request,env)','rootServesPublishingDirectly:true','redirectLoopPrevention:true','publishingCenterApp:true','erpUiDisabled:true','erpApisBlocked:true'])must(publishingOnly.includes(token),`publishing-only入口缺少：${token}`);
must(!publishingOnly.includes("return redirect('/publishing.html')"),'貼文中心入口不得再依賴302重新導向');
for(const token of ["from './publishing-review-gate-entry.js'","from './flexible-publish-entry.js'",'runReadiness','platformPublishGate'])must(production.includes(token),`production安全鏈缺少：${token}`);
for(const token of ['draftToPendingReviewRequired','directDraftApprovalBlocked','regenerationReturnsToPendingReview','copyImageMatchHardGate'])must(reviewEntry.includes(token),`16項貼文審核入口缺少能力：${token}`);

for(const token of ['customerProductImageAuthority','customer-display-v20260812','detailedDmAuthority','dm-final','trial-poster-small-boss-official-v20260814','productIdentityReference','products-v3'])must(productGuard.includes(token),`產品媒體角色權威缺少：${token}`);
for(const token of ['100g／罐','30cc／罐（小玻璃罐）','180cc／包（鋁袋）','75g／盒｜8塊裝','600g （1斤）／盒｜32塊裝','75g／罐'])must(productGuard.includes(token),`產品權威缺少目前正式值：${token}`);
must(!productGuard.includes('/images/products-v2/'),'產品圖片守門不得回退products-v2');
for(const token of ['禁止拼貼','AI絕對不得重畫','30cc','180cc','小老闆','16項','待審核','/regeneration-start','/regeneration-ready'])must(policy.includes(token),`重新生成守門缺少硬規格／閉環能力：${token}`);
for(const token of ['禁止拼湊','AI 重畫產品','30cc','180cc','小老闆','16 項正式審核','禁止回退'])must(standard.includes(token),`生成母規格文件缺少：${token}`);
for(const token of ['formalProductMedia','semanticScore','scoreCandidate','rank','user_zip_approved','approved_existing','regenerate_if_missing','pending_review','reviewItems:16','needs_binary_sync','formal_product_media','latestZipCatalog'])must(mediaPolicy.includes(token),`最新媒體權威runtime缺少能力：${token}`);
must(/const semantic=semanticScore\(copy,c\);if\(semantic<=0\)return\s*-?Infinity/.test(mediaPolicy),'ZIP／正式素材候選在零語意命中時必須直接淘汰');
for(const token of ['resolveMedia','approved_existing','needs_binary_sync','regenerate_if_missing','套用正式圖','套用 ZIP 合格圖'])must(mediaAssistant.includes(token),`唯一正式配圖助理缺少能力：${token}`);

must(typeof latestZip.source==='string'&&latestZip.source.trim(),'最新貼文ZIP來源名稱不可為空');
must(Number(latestZip.candidate_count)>0,'最新ZIP必須有唯一候選圖');
must(latestZip.priority==='user_zip_approved','最新ZIP必須維持使用者素材優先');
must(/^https:\/\//.test(String(latestZip.public_catalog||'')),'貼文中心未指向目前最新ZIP公開目錄');
must(/pending_review/.test(String(latestZip.review_rule||''))&&/16/.test(String(latestZip.review_rule||'')),'最新ZIP配圖後必須回待審核並保留16項審核');

for(const file of ['index.html','publishing.html','manifest.webmanifest','publishing-base.css','publishing-app.css','publishing-app-v2.js','post-regenerate-policy-v1.js','formal-media-policy-v20260810.js','latest-user-post-zip.json','publishing-content-audit-entry.js'])must(pkg.includes(file),`正式build/check缺少必要檔：${file}`);
for(const retired of ['internal-app.js','erp-publishing-separation.js','loading-watchdog-v20260809.js'])must(!pkg.includes(retired),`正式build仍包含ERP前端：${retired}`);
must(!pkg.includes('cp assets/js/post-regenerate-v6.js'),'正式部署不得帶出舊v6第二套重生成邏輯');

console.log(`PASS：正式介面只保留仙加味貼文中心系統App；目前Worker先做重複圖片、季節、天氣與情境語意守門，再沿用既有publishing-only與production安全鏈；其他ERP UI/API停用，貼文審核、配圖、重生成、排程、立即發布、D1與平台安全能力保留。最新 ${latestZip.source}/${latestZip.candidate_count} 張候選採能力式驗收。`);
