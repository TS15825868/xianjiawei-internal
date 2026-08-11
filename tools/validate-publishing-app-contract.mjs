import fs from 'node:fs';
const html=fs.readFileSync('publishing.html','utf8');
const js=fs.readFileSync('assets/js/publishing-app-v2.js','utf8');
const authority=fs.readFileSync('src/authority-entry.js','utf8');
const production=fs.readFileSync('src/production-entry.js','utf8');
const publisher=fs.readFileSync('src/social-publisher.js','utf8');
const requiredHtml=['貼文審核發佈系統','data-refresh','data-diagnose','data-add-post','searchInput','statusFilter','clearFilters','listRoot','modalRoot','toastRoot','readinessSummary','publishing-performance.css','publishing-resilience.js','publishing-readiness-ui.js','publishing-app-v2.js','publishing-review-gate.js','post-bank-sync.js','post-regenerate-buttons.js','post-regenerate-policy-v1.js','manual-publish-tools.js'];
for(const token of requiredHtml){if(!html.includes(token))throw new Error(`publishing.html缺少必要功能入口：${token}`)}
if(!/publishing-app-v2\.js\?v=[^"']+/.test(html))throw new Error('publishing.html 的正式主程式缺少快取識別');
if(!/post-bank-sync\.js\?v=[^"']+/.test(html))throw new Error('publishing.html 的目前母庫同步工具缺少快取識別');
if(!/post-regenerate-policy-v1\.js\?v=[^"']+/.test(html))throw new Error('publishing.html 的重生成流程缺少快取識別');
if(html.includes('post-regenerate-v6.js'))throw new Error('正式publishing.html不得再載入舊v6第二套重生成邏輯');
const requiredJs=['PAGE_SIZE=18','data-load-more','data-post-view','data-post-edit','data-post-status','data-post-schedule','data-post-publish-now','data-publish-now-from-modal','/posts','/status','/publish-now','/deliveries','/platform-authorization','/me','loading="lazy"','decoding="async"','function debounce','queryPath(offset','offset:String(offset)','state.total','state.counts','XJWPublishingReadiness?.run','document.documentElement.dataset.publishingRuntime=','立即發布不受固定時段限制'];
for(const token of requiredJs){if(!js.includes(token))throw new Error(`publishing-app-v2.js缺少必要功能契約：${token}`)}
if(!/dataset\.publishingRuntime=['"][^'"]*standalone[^'"]*['"]/.test(js))throw new Error('publishing-app-v2.js 缺少正式 standalone runtime 識別');
if(js.includes("state.items.map(card).join('')")&&!js.includes('state.total-state.items.length'))throw new Error('載入更多不得回退為只在本機切片全部貼文');
if(!js.includes('loadPlatforms(loadId)'))throw new Error('平台授權狀態必須非阻塞載入');
if(!js.includes('setButtonBusy'))throw new Error('操作按鈕必須提供處理中狀態');
for(const token of ['limit=Math.min(60','offset=Math.max(0','LIMIT ? OFFSET ?','COUNT(*) AS count']){
  if(!authority.includes(token)&&!production.includes(token))throw new Error(`後端分頁契約缺失：${token}`)
}
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
console.log('PASS：獨立貼文系統以目前能力契約驗收：核心安全診斷、立即發布不受固定時段限制、單一重生成流程、動態目前母庫同步、快速Access驗證、D1安全模式、平台API預檢、server pagination、離線快取、LINE keep-warm與逐平台發布結果均存在；不以歷史貼文數量或舊版號誤擋新版。');
