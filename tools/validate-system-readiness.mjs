import fs from 'node:fs';
const read=path=>fs.readFileSync(path,'utf8');
const must=(ok,message)=>{if(!ok)throw new Error(message)};

const production=read('src/production-entry.js');
const publishingOnly=read('src/publishing-only-entry.js');
const readiness=read('src/system-readiness.js');
const review=read('src/publishing-review-gate-entry.js');
const flexible=read('src/flexible-publish-entry.js');
const wrangler=read('wrangler.jsonc');
const html=read('publishing.html');
const index=read('index.html');
const ui=read('assets/js/publishing-readiness-ui.js');
const resilience=read('assets/js/publishing-resilience.js');
const productGuard=read('assets/js/product-authority-guard.js');
const formalMedia=read('assets/js/formal-media-policy-v20260810.js');
const pkg=read('package.json');
const latestZip=JSON.parse(read('data/latest-user-post-zip.json'));

must(/"main"\s*:\s*"src\/publishing-only-entry\.js"/.test(wrangler),'正式Wrangler入口必須是publishing-only-entry.js');
for(const token of ["path==='/healthz/core'","path==='/healthz/readiness'",'runReadiness(request,env,ctx,app','mutationCoreGate(env)','MUTATING_METHODS.has(request.method)','const d1=await checkD1(env)','platformPublishGate(env)','loginCheck:()=>verifyFastAccess(request,env)','readinessUsesSharedFastAccess:true'])must(production.includes(token),`production安全鏈缺少：${token}`);
must(production.includes('D1未就緒，本輪不發布'),'排程器沒有在D1故障時自動停發');
must(production.includes('平台安全模式：已設定平台API健康檢查未通過，本輪不發布'),'排程發布前沒有平台API健康守門');
for(const token of ['checkD1','checkAccessConfig','checkCurrentLogin','sharedLogin','probeFacebook','probeInstagram','probeLine','probeGoogle','publisherConfiguration','blockingPlatformFailures'])must(readiness.includes(token),`system-readiness缺少診斷：${token}`);
must(readiness.includes("SELECT 1 AS ok"),'D1 readiness沒有使用非破壞性查詢');
for(const token of ['copyImageMatchHardGate','draftToPendingReviewRequired','directDraftApprovalBlocked','regenerationStartEndpoint','regenerationReadyEndpoint','regenerationReturnsToPendingReview'])must(review.includes(token),`審核入口缺少正式能力：${token}`);
for(const token of ['immediatePublishingBypassesFixedSchedule:true','publish-now','manual_platforms','automatic_platforms'])must(flexible.includes(token),`立即發布入口缺少能力：${token}`);

for(const token of ["path==='/'||path==='/index.html'||path==='/publishing'||path==='/publishing/'","redirect('/publishing.html')","blockedApi(path)","path==='/api/me'","path==='/api/platform-authorization'","path==='/api/media-upload'","path==='/api/posts'","path.startsWith('/api/posts/')",'erpUiDisabled:true','erpApisBlocked:true','publishingCenterApp:true','canonicalPublishingPath'])must(publishingOnly.includes(token),`publishing-only隔離層缺少：${token}`);
must(index.includes("location.replace('/publishing.html')"),'根網址必須直接進入貼文中心');
must(!index.includes('internal-app.js')&&!index.includes('營運中控'),'根頁不得再載入ERP介面');

for(const token of ['customerProductImageAuthority','customer-display-v20260812','detailedDmAuthority','dm-final','trial-poster-small-boss-official-v20260814','productIdentityReference','products-v3'])must(productGuard.includes(token),`前端產品媒體權威缺少：${token}`);
for(const token of ['formalProductMedia','user_zip_approved','needs_binary_sync','regenerate_if_missing','reviewItems:16'])must(formalMedia.includes(token),`正式媒體政策缺少：${token}`);
must(!productGuard.includes('/images/products-v2/'),'產品權威不得引用products-v2');

must(typeof latestZip.source==='string'&&latestZip.source.trim(),'最新ZIP目錄缺少來源名稱');
must(Number(latestZip.candidate_count)>0,'最新ZIP目錄必須有候選圖');
must(latestZip.priority==='user_zip_approved','最新ZIP必須維持使用者素材優先');
must(/^https:\/\//.test(String(latestZip.public_catalog||'')),'最新ZIP必須提供公開目錄位置');
must(/pending_review/.test(String(latestZip.review_rule||''))&&/16/.test(String(latestZip.review_rule||'')),'最新ZIP配圖後必須回待審核並保留16項審核');

must(/<meta name="xianjiawei-publishing-runtime" content="publishing-center-app-[^"]+">/.test(html),'publishing.html缺少貼文中心App runtime識別');
must(html.includes('唯一正式內容系統'),'publishing.html沒有標示唯一正式內容系統');
for(const token of ['貼文中心系統 App','其他 ERP 功能目前暫停','readinessSummary','data-diagnose','data-refresh','20260815-lean-boot-v1','/healthz/core','/healthz/readiness','publishing-app-v2.js','publishing-review-gate.js','publishing-base.css'])must(html.includes(token),`publishing.html缺少貼文中心能力：${token}`);
must(!html.includes('<script src="/assets/js/publishing-readiness-ui.js'),'iPhone首屏不得啟動週期性readiness檢查');
must(!html.includes('<script src="/assets/js/publishing-resilience.js'),'iPhone首屏不得啟動全域fetch覆寫／週期性重連');
must(!html.includes('<script src="/assets/js/post-bank-sync.js'),'iPhone首屏不得啟動母庫同步工具');
must(html.includes('XJWLoadOptionalScript')&&html.includes('device-image-upload.js')&&html.includes('post-regenerate-policy-v1.js'),'非核心操作工具必須延後載入');
for(const token of ['publishingSafeMode','publishingPublishReady','MUTATION_SELECTOR','PUBLISH_SELECTOR','publishReady','platformChecked','/healthz/core','/healthz/readiness','xjw-publishing-readiness'])must(ui.includes(token),`備用publishing-readiness-ui缺少安全模式／平台發布鎖契約：${token}`);
must(resilience.includes('localStorage')&&resilience.includes('快取模式')&&resilience.includes('pageshow'),'備用iPhone/Safari恢復模組能力不足');

for(const token of ['src/publishing-only-entry.js','assets/css/publishing-base.css','assets/js/publishing-readiness-ui.js','assets/js/publishing-resilience.js','assets/js/publishing-app-v2.js','latest-user-post-zip.json','manifest.webmanifest'])must(pkg.includes(token),`package check/build缺少正式貼文App檔：${token}`);
for(const retired of ['assets/js/internal-app.js','assets/js/erp-publishing-separation.js','assets/js/loading-watchdog-v20260809.js'])must(!pkg.includes(retired),`正式部署仍帶入已停用ERP前端：${retired}`);

console.log(`PASS：正式系統為貼文中心系統App；根網址與/publishing均正規化到/publishing.html，ERP UI/API不對外；iPhone首屏採輕量核心、診斷手動觸發，保留D1、Access、16項審核、排程／立即發布與延後載入媒體工具。最新ZIP：${latestZip.source}/${latestZip.candidate_count}張候選。`);
