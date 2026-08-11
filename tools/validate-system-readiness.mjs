import fs from 'node:fs';
const read=path=>fs.readFileSync(path,'utf8');
const must=(ok,message)=>{if(!ok)throw new Error(message)};
const production=read('src/production-entry.js');
const readiness=read('src/system-readiness.js');
const publishingOnly=read('src/publishing-only-entry.js');
const html=read('publishing.html');
const ui=read('assets/js/publishing-readiness-ui.js');
const resilience=read('assets/js/publishing-resilience.js');
const pkg=read('package.json');
const latestZip=JSON.parse(read('data/latest-user-post-zip.json'));

for(const token of ["path==='/healthz/core'","path==='/healthz/readiness'",'runReadiness(request,env,ctx,app','mutationCoreGate(env)','MUTATING_METHODS.has(request.method)','const d1=await checkD1(env)','platformPublishGate(env)','currentPlatformProbe(env','blockingPlatformFailures(probe)','loginCheck:()=>verifyFastAccess(request,env)','readinessUsesSharedFastAccess:true']){
  must(production.includes(token),`production-entry 缺少安全啟動契約：${token}`)
}
must(production.includes('D1未就緒，本輪不發布'),'排程器沒有在D1故障時自動停發');
must(production.includes('平台安全模式：已設定平台API健康檢查未通過，本輪不發布'),'排程發布前沒有平台API健康守門');
must(production.includes("/^\\/api\\/posts\\/[^/]+\\/publish-now$/"),'立即發布沒有套用平台API安全守門');
for(const token of ['checkD1','checkAccessConfig','checkCurrentLogin','sharedLogin','loginCheck=null','probeFacebook','probeInstagram','probeLine','probeGoogle','publisherConfiguration','blockingPlatformFailures']){
  must(readiness.includes(token),`system-readiness 缺少診斷：${token}`)
}
must(readiness.includes('sharedFastAccess:true'),'readiness登入沒有標示共用快速Access驗證');
must(readiness.includes("SELECT 1 AS ok"),'D1 readiness 沒有使用非破壞性查詢');
must(readiness.includes('LINE VOOM 依正式規則採人工發布'),'LINE VOOM 手動發布狀態沒有納入診斷');
must(readiness.includes("configured:true,mode:'official_api'"),'已設定平台API失敗時無法與未設定人工平台區分');

for(const token of [
  'UI_RUNTIME','uiRuntime:UI_RUNTIME',
  'PRODUCT_IMAGE_VERSION','productImageVersion:PRODUCT_IMAGE_VERSION',
  "productImageAuthority:'products-v3-latest-original-product-photos'",
  'POST_BANK_SYNC_VERSION','postBankSyncVersion:POST_BANK_SYNC_VERSION',
  "postBankValidation:'capability-based'",
  'FORMAL_MEDIA_RUNTIME','formalMediaRuntime:FORMAL_MEDIA_RUNTIME',
  'LATEST_POST_ZIP_MANIFEST','latestPostZipManifest:LATEST_POST_ZIP_MANIFEST',
  'latestPostZipDynamic:true',
  "postImagePriority:'user_zip_approved'",
  'regenerateOnlyIfNoApprovedMatch:true',
  'reviewItemsAfterMediaChange:16',
  "guardVersionPolicy:'current-authority-not-historical-version-pin'"
]){
  must(publishingOnly.includes(token),`publishing health 缺少正式能力診斷：${token}`)
}
const uiRuntime=publishingOnly.match(/const UI_RUNTIME=['"]([^'"]+)['"]/i)?.[1]||'';
must(uiRuntime&&/standalone/i.test(uiRuntime),'publishing health 的UI runtime必須維持正式standalone識別');
const productImageVersion=publishingOnly.match(/const PRODUCT_IMAGE_VERSION=['"]([^'"]+)['"]/i)?.[1]||'';
must(productImageVersion&&/products-v3/i.test(productImageVersion)&&!/products-v2/i.test(productImageVersion),'publishing health 的產品圖權威必須維持products-v3正式系列');
const postBankSyncVersion=publishingOnly.match(/const POST_BANK_SYNC_VERSION=['"]([^'"]+)['"]/i)?.[1]||'';
must(postBankSyncVersion&&/post-bank-sync/i.test(postBankSyncVersion),'publishing health 缺少500篇同步能力識別');
const formalMediaRuntime=publishingOnly.match(/const FORMAL_MEDIA_RUNTIME=['"]([^'"]+)['"]/i)?.[1]||'';
must(formalMediaRuntime&&/formal-media-policy/i.test(formalMediaRuntime),'publishing health 缺少正式媒體能力識別');
must(!publishingOnly.includes("LATEST_POST_ZIP='2.zip'")&&!publishingOnly.includes('KNOWN_REGENERATION_MINIMUM=121'),'publishing health 不得再硬鎖舊ZIP或歷史重生成數量');
must(publishingOnly.includes("url.pathname===LATEST_POST_ZIP_MANIFEST")&&publishingOnly.includes('env?.ASSETS?.fetch'),'Worker必須明確提供最新ZIP目錄資產');

must(typeof latestZip.source==='string'&&latestZip.source.trim(),'最新 ZIP 目錄缺少來源名稱');
must(Number(latestZip.candidate_count)>0,'最新 ZIP 目錄必須有候選圖');
must(Number(latestZip.original_file_count||latestZip.candidate_count)>=Number(latestZip.candidate_count),'最新 ZIP 原始檔數不得小於唯一候選數');
must(latestZip.priority==='user_zip_approved','最新 ZIP 必須維持使用者素材優先');
must(/^https:\/\//.test(String(latestZip.public_catalog||'')),'最新 ZIP 必須提供公開目錄位置');
must(/needs_binary_sync/.test(String(latestZip.selection_rule||'')),'最新 ZIP 必須區分有合格來源但原圖待同步');
must(/regenerate only if no approved source candidate matches/i.test(String(latestZip.selection_rule||'')),'最新 ZIP 缺少「真的沒有合格來源才生成」規則');
must(/pending_review/.test(String(latestZip.review_rule||''))&&/16/.test(String(latestZip.review_rule||'')),'最新 ZIP 配圖後必須回待審核並保留16項審核');

must(html.includes('standalone')&&/publishing-app-v2\.js\?v=[^"']+/.test(html),'publishing.html 沒有使用正式standalone runtime／主程式快取識別');
for(const token of ['readinessSummary','data-diagnose','publishing-readiness-ui.js','開啟頁面先進安全模式','平台 API 背景檢查通過後自動解鎖','最新使用者 ZIP 素材']){
  must(html.includes(token),`publishing.html 缺少最新安全診斷／媒體UI：${token}`)
}
for(const token of ['publishingSafeMode','publishingPublishReady','MUTATION_SELECTOR','PUBLISH_SELECTOR','publishReady','platformChecked','/healthz/core','/healthz/readiness','xjw-publishing-readiness']){
  must(ui.includes(token),`publishing-readiness-ui 缺少安全模式／平台發布鎖契約：${token}`)
}
must(ui.includes("PUBLISH_SELECTOR='[data-post-publish-now],[data-publish-now-from-modal]'"),'平台健康檢查未完成時必須只鎖正式發布按鈕');
must(ui.includes('5*60*1000'),'平台API必須週期性自動重檢');
must(resilience.includes('localStorage')&&resilience.includes('快取模式'),'連線失敗時沒有最近成功資料唯讀備援');
must(pkg.includes('src/system-readiness.js'),'package check 沒有驗 system-readiness');
must(pkg.includes('assets/js/publishing-readiness-ui.js'),'package check/build 沒有驗 publishing-readiness-ui');
must(pkg.includes('latest-user-post-zip.json'),'package check/build 沒有帶入最新ZIP目錄');
console.log(`PASS：Worker、D1、Access、平台API與媒體來源採分層能力診斷；standalone UI、products-v3、500篇同步、最新 ${latestZip.source}/${latestZip.candidate_count} 張唯一候選、ZIP優先、缺圖才生成與16項重審一致；不再因舊ZIP名稱、舊版號或歷史重生成數量誤擋。`);
