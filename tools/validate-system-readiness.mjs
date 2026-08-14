import fs from 'node:fs';
const read=path=>fs.readFileSync(path,'utf8');
const must=(ok,message)=>{if(!ok)throw new Error(message)};

const production=read('src/production-entry.js');
const readiness=read('src/system-readiness.js');
const review=read('src/publishing-review-gate-entry.js');
const flexible=read('src/flexible-publish-entry.js');
const worker=read('src/worker.js');
const wrangler=read('wrangler.jsonc');
const html=read('publishing.html');
const index=read('index.html');
const ui=read('assets/js/publishing-readiness-ui.js');
const resilience=read('assets/js/publishing-resilience.js');
const productGuard=read('assets/js/product-authority-guard.js');
const formalMedia=read('assets/js/formal-media-policy-v20260810.js');
const pkg=read('package.json');
const latestZip=JSON.parse(read('data/latest-user-post-zip.json'));

must(/"main"\s*:\s*"src\/production-entry\.js"/.test(wrangler),'正式Wrangler入口不是完整production-entry.js');
for(const token of ["path==='/healthz/core'","path==='/healthz/readiness'",'runReadiness(request,env,ctx,app','mutationCoreGate(env)','MUTATING_METHODS.has(request.method)','const d1=await checkD1(env)','platformPublishGate(env)','loginCheck:()=>verifyFastAccess(request,env)','readinessUsesSharedFastAccess:true'])must(production.includes(token),`production-entry缺少安全啟動契約：${token}`);
must(production.includes('D1未就緒，本輪不發布'),'排程器沒有在D1故障時自動停發');
must(production.includes('平台安全模式：已設定平台API健康檢查未通過，本輪不發布'),'排程發布前沒有平台API健康守門');
must(production.includes("/^\\/api\\/posts\\/[^/]+\\/publish-now$/"),'立即發布沒有套用平台API安全守門');
for(const token of ['checkD1','checkAccessConfig','checkCurrentLogin','sharedLogin','probeFacebook','probeInstagram','probeLine','probeGoogle','publisherConfiguration','blockingPlatformFailures'])must(readiness.includes(token),`system-readiness缺少診斷：${token}`);
must(readiness.includes('sharedFastAccess:true'),'readiness登入沒有標示共用快速Access驗證');
must(readiness.includes("SELECT 1 AS ok"),'D1 readiness沒有使用非破壞性查詢');
must(readiness.includes('LINE VOOM 依正式規則採人工發布'),'LINE VOOM手動發布狀態沒有納入診斷');

for(const token of ['copyImageMatchHardGate','draftToPendingReviewRequired','directDraftApprovalBlocked','regenerationStartEndpoint','regenerationReadyEndpoint','regenerationReturnsToPendingReview'])must(review.includes(token),`審核入口缺少正式能力：${token}`);
for(const token of ['immediatePublishingBypassesFixedSchedule:true','publish-now','manual_platforms','automatic_platforms'])must(flexible.includes(token),`立即發布入口缺少能力：${token}`);

for(const token of ["new Set(['products','customers','visits','orders','inventory','purchases','suppliers','finance','tasks','documents','templates','assets'])",'/api/overview','/api/settings','audit_logs'])must(worker.includes(token),`ERP核心能力缺少：${token}`);
must(worker.includes("path.match(/^\\/api\\/modules\\/([^/]+)(?:\\/([^/]+))?$/)"),'ERP核心缺少動態 /api/modules/:module/:id 路由');
for(const token of ['MODULES.has(module)','listRecords(env,module)','createRecord(request,env,profile,module)','updateRecord(request,env,profile,module,id)','deleteRecord(request,env,profile,module,id)'])must(worker.includes(token),`ERP模組路由缺少CRUD能力：${token}`);
for(const token of ['app-shell','internal-app.js','erp-publishing-separation.js','/publishing.html'])must(index.includes(token),`ERP根介面缺少：${token}`);

for(const token of ['customerProductImageAuthority','customer-display-v20260812','detailedDmAuthority','dm-final','trial-poster-small-boss-official-v20260814','productIdentityReference','products-v3'])must(productGuard.includes(token),`前端產品媒體權威缺少：${token}`);
for(const token of ['formalProductMedia','user_zip_approved','needs_binary_sync','regenerate_if_missing','reviewItems:16'])must(formalMedia.includes(token),`正式媒體政策缺少：${token}`);
must(!productGuard.includes('/images/products-v2/'),'產品權威不得引用products-v2');

must(typeof latestZip.source==='string'&&latestZip.source.trim(),'最新ZIP目錄缺少來源名稱');
must(Number(latestZip.candidate_count)>0,'最新ZIP目錄必須有候選圖');
must(Number(latestZip.original_file_count||latestZip.candidate_count)>=Number(latestZip.candidate_count),'最新ZIP原始檔數不得小於唯一候選數');
must(latestZip.priority==='user_zip_approved','最新ZIP必須維持使用者素材優先');
must(/^https:\/\//.test(String(latestZip.public_catalog||'')),'最新ZIP必須提供公開目錄位置');
must(String(latestZip.approval_batch||'').trim(),'最新ZIP必須提供目前核准批次');
must(/needs_binary_sync/.test(String(latestZip.selection_rule||'')),'最新ZIP必須區分有合格來源但原圖待同步');
must(/regenerate only if no approved source candidate matches/i.test(String(latestZip.selection_rule||'')),'最新ZIP缺少「真的沒有合格來源才生成」規則');
must(/pending_review/.test(String(latestZip.review_rule||''))&&/16/.test(String(latestZip.review_rule||'')),'最新ZIP配圖後必須回待審核並保留16項審核');
const sync=latestZip.binary_sync||{};
must(['pending','ready','synced'].includes(String(sync.status||'')),`最新ZIP binary_sync狀態不可判斷：${sync.status}`);
if(sync.status==='synced')must(Number(sync.publishable_count||0)>0,'最新ZIP標示synced但沒有可用的已同步生活情境圖');
for(const role of ['customer_product_image','detailed_dm','trial','product_identity_reference'])must(String(latestZip.media_roles?.[role]||'').trim(),`最新ZIP缺少目前媒體角色：${role}`);

must(/<meta name="xianjiawei-publishing-runtime" content="review-flow-[^"]+">/.test(html),'publishing.html缺少目前正式runtime識別');
must(html.includes('唯一正式內容系統'),'publishing.html沒有標示唯一正式內容系統');
must(/publishing-app-v2\.js\?v=[^"']+/.test(html),'publishing.html主程式缺少快取／版本識別');
for(const token of ['readinessSummary','data-diagnose','publishing-readiness-ui.js','post-bank-sync.js','zip-media-assistant.js','formal-media-policy-v20260810.js','母庫可持續增加','一般產品貼文只用六張正式產品圖'])must(html.includes(token),`publishing.html缺少目前安全診斷／母庫／配圖能力：${token}`);
for(const token of ['publishingSafeMode','publishingPublishReady','MUTATION_SELECTOR','PUBLISH_SELECTOR','publishReady','platformChecked','/healthz/core','/healthz/readiness','xjw-publishing-readiness'])must(ui.includes(token),`publishing-readiness-ui缺少安全模式／平台發布鎖契約：${token}`);
must(ui.includes("PUBLISH_SELECTOR='[data-post-publish-now],[data-publish-now-from-modal]'"),'平台健康檢查未完成時必須只鎖正式發布按鈕');
must(resilience.includes('localStorage')&&resilience.includes('快取模式'),'連線失敗時沒有最近成功資料唯讀備援');

for(const token of ['src/production-entry.js','assets/js/internal-app.js','assets/js/erp-publishing-separation.js','assets/js/publishing-readiness-ui.js','latest-user-post-zip.json'])must(pkg.includes(token),`package check/build缺少目前正式能力檔：${token}`);

console.log(`PASS：完整ERP與唯一正式貼文中心共用production-entry安全鏈；D1、Access、平台API、立即發布、16項審核、完整模組CRUD、正式runtime、動態母庫與ZIP配圖助理、目前產品／媒體角色及 ${latestZip.source}/${latestZip.candidate_count} 張ZIP候選均採能力式診斷；synced批次必須有可用上線圖，不再以publishing-only、固定張數、特定歷史標語或舊版號作正式條件。`);
