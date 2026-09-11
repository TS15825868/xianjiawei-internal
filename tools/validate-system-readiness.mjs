import fs from 'node:fs';

// Current authority: full ERP operations center + independent publishing center.
// Guards validate the current safety chain and must not force the retired publishing-only root architecture.
const read=path=>fs.readFileSync(path,'utf8');
const must=(ok,message)=>{if(!ok)throw new Error(message)};

const fullSystem=read('src/full-system-entry.js');
const production=read('src/production-entry.js');
const publishingOnly=read('src/publishing-only-entry.js');
const contentAudit=read('src/publishing-content-audit-entry.js');
const readiness=read('src/system-readiness.js');
const review=read('src/publishing-review-gate-entry.js');
const flexible=read('src/flexible-publish-entry.js');
const wrangler=read('wrangler.jsonc');
const publishingHtml=read('publishing.html');
const erpHtml=read('erp.html');
const index=read('index.html');
const ui=read('assets/js/publishing-readiness-ui.js');
const resilience=read('assets/js/publishing-resilience.js');
const productGuard=read('assets/js/product-authority-guard.js');
const formalMedia=read('assets/js/formal-media-policy-v20260810.js');
const pkg=read('package.json');
const latestZip=JSON.parse(read('data/latest-user-post-zip.json'));

// Current Worker entry is the full system wrapper. It must preserve both the content-audit chain and production ERP path.
must(/"main"\s*:\s*"src\/full-system-entry\.js"/.test(wrangler),'正式Wrangler入口必須是目前完整ERP＋獨立貼文中心入口 full-system-entry.js');
for(const token of ["from './publishing-content-audit-entry.js'","from './production-entry.js'",'erpUiEnabled:true','erpApisEnabled:true','publishingCenterEnabled:true','publishingCenterIndependent:true','qixuanPublicVisible:false']){
  must(fullSystem.includes(token),`完整系統入口缺少目前正式能力：${token}`);
}
must(fullSystem.includes("if(isFullErpApi(path))return productionApp.fetch(request,env,ctx)"),'完整ERP API必須直接沿用production安全鏈');
must(fullSystem.includes('const response=await publishingApp.fetch(request,env,ctx)'),'貼文／審核／重生成流程必須沿用內容語意守門鏈');

// Publishing content audit still wraps the historical publishing-only boundary, which itself wraps production.
must(contentAudit.includes("from './publishing-only-entry.js'"),'內容語意守門必須沿用publishing-only正式安全鏈');
for(const token of ['duplicateImageHardGate:true','seasonWeatherContextAudit:true','semanticImageMatchHardGate:true','/api/posts/content-audit'])must(contentAudit.includes(token),`內容語意守門缺少：${token}`);
must(publishingOnly.includes("from './production-entry.js'"),'publishing-only相容層必須沿用production-entry安全邏輯');

// Cloudflare / Access / D1 fundamentals.
must(/"html_handling"\s*:\s*"none"/.test(wrangler),'Cloudflare Assets 必須停用自動 HTML 重新導向，避免 Safari 重新導向循環');
must(/"POLICY_AUD"\s*:\s*"201dea08ea9611989cd8ad4ccac88f99974fd9b1309e4af74bf11a397ee6522f"/.test(wrangler),'Cloudflare Access Application Audience 必須寫入正式 Worker 變數');
must(/"TEAM_DOMAIN"\s*:\s*"https:\/\/tung314069\.cloudflareaccess\.com"/.test(wrangler),'Cloudflare Access Team Domain 必須寫入正式 Worker 變數');
must(wrangler.includes('xianjiawei-internal-db'),'Wrangler 必須保留正式 D1 綁定');

// Production safety and readiness must remain intact.
for(const token of ["path==='/healthz/core'","path==='/healthz/readiness'",'runReadiness(request,env,ctx,app','mutationCoreGate(env)','MUTATING_METHODS.has(request.method)','const d1=await checkD1(env)','platformPublishGate(env)','loginCheck:()=>verifyFastAccess(request,env)','readinessUsesSharedFastAccess:true'])must(production.includes(token),`production安全鏈缺少：${token}`);
must(production.includes('D1未就緒，本輪不發布'),'排程器沒有在D1故障時自動停發');
must(production.includes('平台安全模式：已設定平台API健康檢查未通過，本輪不發布'),'排程發布前沒有平台API健康守門');
for(const token of ['checkD1','checkAccessConfig','checkCurrentLogin','sharedLogin','probeFacebook','probeInstagram','probeLine','probeGoogle','publisherConfiguration','blockingPlatformFailures'])must(readiness.includes(token),`system-readiness缺少診斷：${token}`);
must(readiness.includes('SELECT 1 AS ok'),'D1 readiness沒有使用非破壞性查詢');

// Review, regeneration and flexible publishing guards.
for(const token of ['copyImageMatchHardGate','draftToPendingReviewRequired','directDraftApprovalBlocked','regenerationStartEndpoint','regenerationReadyEndpoint','regenerationReturnsToPendingReview'])must(review.includes(token),`審核入口缺少正式能力：${token}`);
for(const token of ['immediatePublishingBypassesFixedSchedule:true','publish-now','manual_platforms','automatic_platforms'])must(flexible.includes(token),`立即發布入口缺少能力：${token}`);

// Full ERP is enabled again; publishing remains a separate page and must not load ERP frontend code.
must(index.includes("location.replace('/erp.html')"),'根頁必須進入完整ERP營運中控');
must(index.includes('href="/publishing.html"'),'根頁必須保留貼文中心入口');
must(erpHtml.includes('仙加味營運中控'),'ERP頁缺少正式營運中控標示');
must(erpHtml.includes('internal-app.js')&&erpHtml.includes('erp-publishing-separation.js'),'ERP頁缺少完整內部系統前端');
must(publishingHtml.includes('唯一正式內容系統')&&publishingHtml.includes('貼文中心系統 App'),'貼文中心缺少正式獨立內容系統標示');
must(!publishingHtml.includes('<script src="/assets/js/internal-app.js'),'獨立貼文中心不得載入ERP前端程式');
must(!publishingHtml.includes('<script src="/assets/js/erp-publishing-separation.js'),'獨立貼文中心不得載入ERP分離控制程式');

// Product/media authorities must stay current and strict.
for(const token of ['customerProductImageAuthority','customer-display-v20260812','detailedDmAuthority','dm-final','trial-poster-small-boss-official-v20260814','productIdentityReference','products-v3'])must(productGuard.includes(token),`前端產品媒體權威缺少：${token}`);
for(const token of ['formalProductMedia','user_zip_approved','needs_binary_sync','regenerate_if_missing','reviewItems:16'])must(formalMedia.includes(token),`正式媒體政策缺少：${token}`);
must(!productGuard.includes('/images/products-v2/'),'產品權威不得引用products-v2');

// Uploaded material remains candidate-only until formal review.
must(typeof latestZip.source==='string'&&latestZip.source.trim(),'最新ZIP目錄缺少來源名稱');
must(Number(latestZip.candidate_count)>0,'最新ZIP目錄必須有候選圖');
must(latestZip.priority==='user_zip_approved','最新ZIP必須維持使用者素材優先');
must(/^https:\/\//.test(String(latestZip.public_catalog||'')),'最新ZIP必須提供公開目錄位置');
must(/pending_review/.test(String(latestZip.review_rule||''))&&/16/.test(String(latestZip.review_rule||'')),'最新ZIP配圖後必須回待審核並保留16項審核');

// Publishing app runtime and recovery behavior.
must(/<meta name="xianjiawei-publishing-runtime" content="publishing-center-app-[^"]+">/.test(publishingHtml),'publishing.html缺少貼文中心App runtime識別');
for(const token of ['readinessSummary','data-diagnose','data-refresh','/healthz/core','/healthz/readiness','publishing-app-v2.js','publishing-review-gate.js','publishing-base.css'])must(publishingHtml.includes(token),`publishing.html缺少貼文中心能力：${token}`);
must(/window\.__XJW_BOOT_VERSION__=['\"][^'\"]+['\"]/.test(publishingHtml),'publishing.html缺少目前正式 Boot 能力識別');
must(!publishingHtml.includes('<script src="/assets/js/publishing-readiness-ui.js'),'iPhone首屏不得啟動週期性readiness檢查');
must(!publishingHtml.includes('<script src="/assets/js/post-bank-sync.js'),'iPhone首屏不得啟動母庫同步工具');
must(publishingHtml.includes('XJWLoadOptionalScript')&&publishingHtml.includes('device-image-upload.js')&&publishingHtml.includes('post-regenerate-policy-v1.js'),'非核心操作工具必須延後載入');
for(const token of ['publishingSafeMode','publishingPublishReady','MUTATION_SELECTOR','PUBLISH_SELECTOR','publishReady','platformChecked','/healthz/core','/healthz/readiness','xjw-publishing-readiness'])must(ui.includes(token),`備用publishing-readiness-ui缺少安全模式／平台發布鎖契約：${token}`);
must(resilience.includes('localStorage')&&resilience.includes('快取模式')&&resilience.includes('pageshow'),'iPhone/Safari恢復模組能力不足');

// Build package must contain both ERP and publishing assets under the current architecture.
for(const token of ['src/full-system-entry.js','src/publishing-content-audit-entry.js','src/publishing-only-entry.js','erp.html','assets/css/internal-app.css','assets/js/internal-app.js','assets/js/erp-publishing-separation.js','assets/css/publishing-base.css','assets/js/publishing-app-v2.js','latest-user-post-zip.json','manifest.webmanifest'])must(pkg.includes(token),`package check/build缺少目前正式檔：${token}`);
must(!pkg.includes('cp assets/js/post-regenerate-v6.js'),'正式部署不得帶出已退役v6第二套重生成邏輯');

console.log(`PASS：完整ERP營運中控＋獨立貼文中心架構已對齊目前main；內容語意守門、Cloudflare Access、D1、16項審核、重複圖片、季節／天氣／情境檢查、排程／立即發布與媒體工具均保留。最新ZIP：${latestZip.source}/${latestZip.candidate_count}張候選。`);
