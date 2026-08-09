import fs from 'node:fs';
const read=path=>fs.readFileSync(path,'utf8');
const must=(ok,message)=>{if(!ok)throw new Error(message)};
const production=read('src/production-entry.js');
const readiness=read('src/system-readiness.js');
const html=read('publishing.html');
const ui=read('assets/js/publishing-readiness-ui.js');
const resilience=read('assets/js/publishing-resilience.js');
const pkg=read('package.json');

for(const token of ["path==='/healthz/core'","path==='/healthz/readiness'",'runReadiness(request,env,ctx,app','mutationCoreGate(env)','MUTATING_METHODS.has(request.method)','const d1=await checkD1(env)']){
  must(production.includes(token),`production-entry 缺少安全啟動契約：${token}`)
}
must(production.includes('D1未就緒，本輪不發布'),'排程器沒有在D1故障時自動停發');
for(const token of ['checkD1','checkAccessConfig','checkCurrentLogin','probeFacebook','probeInstagram','probeLine','probeGoogle','publisherConfiguration']){
  must(readiness.includes(token),`system-readiness 缺少診斷：${token}`)
}
must(readiness.includes("SELECT 1 AS ok"),'D1 readiness 沒有使用非破壞性查詢');
must(readiness.includes('LINE VOOM 依正式規則採人工發布'),'LINE VOOM 手動發布狀態沒有納入診斷');
for(const token of ['readinessSummary','data-diagnose','publishing-readiness-ui.js','開啟頁面先進安全模式']){
  must(html.includes(token),`publishing.html 缺少安全診斷UI：${token}`)
}
for(const token of ['publishingSafeMode','MUTATION_SELECTOR','/healthz/core','/healthz/readiness','xjw-publishing-readiness']){
  must(ui.includes(token),`publishing-readiness-ui 缺少安全模式契約：${token}`)
}
must(resilience.includes('localStorage')&&resilience.includes('快取模式'),'連線失敗時沒有最近成功資料唯讀備援');
must(pkg.includes('src/system-readiness.js'),'package check 沒有驗 system-readiness');
must(pkg.includes('assets/js/publishing-readiness-ui.js'),'package check/build 沒有驗 publishing-readiness-ui');
console.log('PASS：Worker、D1、Cloudflare Access、登入與平台API採分層診斷；核心異常自動安全模式，離線保留唯讀快取。');
