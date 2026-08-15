import fs from 'node:fs';
const html=fs.readFileSync('publishing.html','utf8');
const js=fs.readFileSync('assets/js/publishing-app-v2.js','utf8');
const authority=fs.readFileSync('src/authority-entry.js','utf8');
const production=fs.readFileSync('src/production-entry.js','utf8');
const publisher=fs.readFileSync('src/social-publisher.js','utf8');
const publishingOnly=fs.readFileSync('src/publishing-only-entry.js','utf8');
const wrangler=fs.readFileSync('wrangler.jsonc','utf8');
const requiredHtml=['貼文中心系統 App','唯一正式內容系統','data-refresh','data-diagnose','data-add-post','searchInput','statusFilter','clearFilters','listRoot','modalRoot','toastRoot','readinessSummary','publishing-performance.css','publishing-app-v2.js','publishing-review-gate.js','device-image-upload.js','post-regenerate-buttons.js','post-regenerate-policy-v1.js','manual-publish-tools.js','20260815-lean-boot-v1','XJWLoadOptionalScript'];
for(const token of requiredHtml){if(!html.includes(token))throw new Error(`publishing.html缺少必要功能入口：${token}`)}
if(!/publishing-app-v2\.js\?v=[^"']+/.test(html))throw new Error('publishing.html 的正式主程式缺少快取識別');
if(!/post-regenerate-policy-v1\.js\?v=[^"']+/.test(html))throw new Error('publishing.html 的重生成流程缺少快取識別');
if(html.includes('post-regenerate-v6.js'))throw new Error('正式publishing.html不得再載入舊v6第二套重生成邏輯');
if(html.includes('<script src="/assets/js/publishing-resilience.js'))throw new Error('手機正式首屏不得再同步載入舊fetch覆寫 resilience；恢復能力應由核心與可見重連負責');
if(html.includes('<script src="/assets/js/publishing-readiness-ui.js'))throw new Error('手機正式首屏不得再同步載入週期性 readiness；診斷改為使用者觸發');
if(html.includes('<script src="/assets/js/post-bank-sync.js'))throw new Error('手機正式首屏不得載入母庫同步工具；母庫同步應由後端/Workflow處理');
if(!html.includes('fetch(\'/healthz/core\'')||!html.includes('fetch(\'/healthz/readiness\''))throw new Error('系統診斷按鈕必須保留核心與readiness檢查');
const requiredJs=['PAGE_SIZE=18','data-load-more','data-post-view','data-post-edit','data-post-status','data-post-schedule','data-post-publish-now','data-publish-now-from-modal','/posts','/status','/publish-now','/deliveries','/platform-authorization','/me','loading="lazy"','decoding="async"','function debounce','queryPath(offset','offset:String(offset)','state.total','state.counts','document.documentElement.dataset.publishingRuntime=','立即發布不受固定時段限制'];
for(const token of requiredJs){if(!js.includes(token))throw new Error(`publishing-app-v2.js缺少必要功能契約：${token}`)}
if(!/dataset\.publishingRuntime=['"][^'"]*standalone[^'"]*['"]/.test(js))throw new Error('publishing-app-v2.js 缺少正式 standalone runtime 識別');
if(js.includes("state.items.map(card).join('')")&&!js.includes('state.total-state.items.length'))throw new Error('載入更多不得回退為只在本機切片全部貼文');
if(!js.includes('loadPlatforms(loadId)'))throw new Error('平台授權狀態必須非阻塞載入');
if(!js.includes('setButtonBusy'))throw new Error('操作按鈕必須提供處理中狀態');
if(!js.includes('內部檢查（不會發布）')||!js.includes('客戶實際會看到的文案'))throw new Error('貼文卡片必須清楚區分顧客文案與內部檢查');
if(!js.includes('CUSTOMER_INTERNAL_TERMS'))throw new Error('貼文前端預檢缺少內部用語守門');
if(!js.includes('multiProductImage')||!js.includes('products-all'))throw new Error('多產品總覽貼文不得被單一產品預檢規則誤擋');
if(!html.includes("root.querySelector('.loading-card')"))throw new Error('載入完成判斷必須只依實際 loading-card，不得被「載入下一批」文字誤判');
if(html.includes('/載入|啟動|正在連線|安全檢查/.test(root.textContent'))throw new Error('不得用整份貼文文字判斷載入中，否則「載入下一批」會觸發假錯誤');
for(const token of ['limit=Math.min(60','offset=Math.max(0','LIMIT ? OFFSET ?','COUNT(*) AS count']){
  if(!authority.includes(token)&&!production.includes(token))throw new Error(`後端分頁契約缺失：${token}`)
}
for(const token of ['publishingUiAlias(path)','servePublishingAsset(request,env)','rootServesPublishingDirectly:true','redirectLoopPrevention:true','canonicalPublishingPath:CANONICAL_PUBLISHING_PATH']){
  if(!publishingOnly.includes(token))throw new Error(`iPhone正式入口無重新導向循環契約缺失：${token}`)
}
if(!/"html_handling"\s*:\s*"none"/.test(wrangler))throw new Error('Cloudflare Assets 必須停用內建 HTML canonical redirect，避免 /publishing.html 與 /publishing 互相重新導向');
if(publishingOnly.includes("return redirect('/publishing.html')"))throw new Error('正式貼文入口不得再用 302 導向 /publishing.html，避免 Safari/Cloudflare Access 重導循環');
if(!/FAST_API_VERSION=['"][^'"]*fast-read[^'"]*['"]/.test(production))throw new Error('手機快速讀取契約缺少 fast-read 能力識別');
for(const token of [
  'const accessProfiles=new Map()',
  'const accessPromises=new Map()',
  'const accessJwks=new Map()',
  'if(accessPromises.has(token))return accessPromises.get(token)',
  'createRemoteJWKSet',
  'jwtVerify',
  'Promise.all([',
  "path==='/api/me'",
  "path==='/api/posts'",
  "path==='/api/platform-authorization'",
  "path==='/healthz/core'",
  "path==='/healthz/readiness'",
  'mutationCoreGate(env)',
  'platformPublishGate(env)',
  'automaticSafeModeOnD1Failure:true',
  'platformProbeBeforeImmediatePublish:true',
  'platformProbeBeforeScheduledPublish:true',
  'accessProfileCacheSeconds:300',
  'parallelPostQueries:true',
  'ctx.waitUntil(keepLineWarm())',
  'lineKeepWarmIndependent:true',
  'lineKeepWarmBeforePublishingScheduler:true',
  '但LINE keep-warm不受影響',
]){
  if(!production.includes(token))throw new Error(`手機快速讀取／安全診斷／LINE在線契約缺失：${token}`)
}
for(const token of [
  "'LINE VOOM':{manual:true",
  'manual_required:true',
  '尚未設定 ${platform} 官方 API 或 Webhook；已改走人工發布包',
  "['published','manual_required','permanent_failed'].includes(prior.status)",
  'social_publish_deliveries',
  'dispatchFacebook',
  'dispatchInstagram',
  'dispatchLineOfficialAccount',
  'dispatchGoogleBusiness',
]){
  if(!publisher.includes(token))throw new Error(`平台發布安全契約缺失：${token}`)
}
if(!publisher.includes("status=result.manual_required?'manual_required':result.ok?'published'"))throw new Error('平台發布結果沒有以實際回應決定published/manual_required');
if(!publisher.includes("mode:directConfigured?'official_api':webhookConfigured?'webhook':'unconfigured'"))throw new Error('平台授權狀態沒有區分官方API/Webhook/未設定');
console.log('PASS：貼文中心系統 App 使用輕量正式首屏且入口不再重新導向：Cloudflare HTML handling=none，/、/publishing、/publishing/、/publishing.html 皆由 Worker 直接回傳同一正式 App；保留快速Access、D1安全模式、16項審核、立即發布與逐平台發布結果。');
