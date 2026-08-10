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
  'FORMAL_MEDIA_RUNTIME','formalMediaRuntime:FORMAL_MEDIA_RUNTIME',
  'LATEST_POST_ZIP','latestPostZip:LATEST_POST_ZIP',
  'LATEST_POST_ZIP_CANDIDATES','latestPostZipCandidates:LATEST_POST_ZIP_CANDIDATES',
  "postImagePriority:'user_zip_approved'",
  'regenerateOnlyIfNoApprovedMatch:true',
  'reviewItemsAfterMediaChange:16',
  'KNOWN_REGENERATION_MINIMUM','knownRegenerationMinimum:KNOWN_REGENERATION_MINIMUM'
]){
  must(publishingOnly.includes(token),`publishing health 缺少正式能力診斷：${token}`)
}
const uiRuntime=publishingOnly.match(/const UI_RUNTIME=['"]([^'"]+)['"]/i)?.[1]||'';
must(uiRuntime&&/standalone/i.test(uiRuntime),'publishing health 的UI runtime必須維持正式standalone識別');
const productImageVersion=publishingOnly.match(/const PRODUCT_IMAGE_VERSION=['"]([^'"]+)['"]/i)?.[1]||'';
must(productImageVersion&&/products-v3/i.test(productImageVersion)&&!/products-v2/i.test(productImageVersion),'publishing health 的產品圖權威必須維持products-v3正式系列');
const postBankSyncVersion=publishingOnly.match(/const POST_BANK_SYNC_VERSION=['"]([^'"]+)['"]/i)?.[1]||'';
must(postBankSyncVersion&&/post-bank-sync/i.test(postBankSyncVersion),'publishing health 缺少500篇同步正式版本識別');
const formalMediaRuntime=publishingOnly.match(/const FORMAL_MEDIA_RUNTIME=['"]([^'"]+)['"]/i)?.[1]||'';
must(formalMediaRuntime&&/formal-media-policy/i.test(formalMediaRuntime),'publishing health 缺少正式媒體能力識別');
const latestZipName=publishingOnly.match(/const LATEST_POST_ZIP=['"]([^'"]+)['"]/i)?.[1]||'';
const latestZipCount=Number(publishingOnly.match(/LATEST_POST_ZIP_CANDIDATES=(\d+)/)?.[1]||0);
must(latestZipName===latestZip.source&&latestZipName==='2.zip','publishing health 與最新貼文ZIP目錄不同步');
must(latestZipCount>=22&&latestZipCount===Number(latestZip.candidate_count),'publishing health 與最新ZIP候選數不同步');
const knownMinimum=Number(publishingOnly.match(/KNOWN_REGENERATION_MINIMUM=(\d+)/)?.[1]||0);
must(knownMinimum>=121,`publishing health 的已知重生成安全門檻不得低於121，目前${knownMinimum}`);
must(publishingOnly.includes("url.pathname==='/data/latest-user-post-zip.json'")&&publishingOnly.includes('env?.ASSETS?.fetch'),'Worker必須明確提供最新ZIP目錄資產');
must(html.includes('standalone')&&/publishing-app-v2\.js\?v=[^"']+/.test(html),'publishing.html 沒有使用正式standalone UI runtime／主程式快取版本');
for(const token of ['readinessSummary','data-diagnose','publishing-readiness-ui.js','開啟頁面先進安全模式','平台 API 背景檢查通過後自動解鎖','2.zip（22張候選）']){
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
console.log(`PASS：Worker、D1、Access、平台API與媒體來源採分層能力診斷；standalone UI、products-v3、500篇同步、最新${latestZipName}/${latestZipCount}張ZIP優先、缺圖才生成、16項重審與至少${knownMinimum}篇重生成門檻一致；正常升版不因舊版號／舊固定文案誤擋。`);
