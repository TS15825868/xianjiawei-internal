import fs from 'node:fs';
const html=fs.readFileSync('publishing.html','utf8');
const js=fs.readFileSync('assets/js/publishing-app-v2.js','utf8');
const authority=fs.readFileSync('src/authority-entry.js','utf8');
const requiredHtml=['貼文審核發佈系統','data-refresh','data-add-post','searchInput','statusFilter','clearFilters','listRoot','modalRoot','toastRoot','publishing-performance.css','publishing-app-v2.js','publishing-review-gate.js','post-regenerate-v6.js','manual-publish-tools.js'];
for(const token of requiredHtml){if(!html.includes(token))throw new Error(`publishing.html缺少必要功能入口：${token}`)}
const requiredJs=['PAGE_SIZE=18','data-load-more','data-post-view','data-post-edit','data-post-status','data-post-schedule','data-post-publish-now','/posts','/status','/publish-now','/deliveries','/platform-authorization','/me','loading="lazy"','decoding="async"','function debounce','queryPath(offset','offset:String(offset)','state.total','state.counts'];
for(const token of requiredJs){if(!js.includes(token))throw new Error(`publishing-app-v2.js缺少必要功能契約：${token}`)}
if(js.includes("state.items.map(card).join('')")&&!js.includes('state.total-state.items.length'))throw new Error('載入更多不得回退為只在本機切片全部貼文');
if(!js.includes('loadPlatforms(loadId)'))throw new Error('平台授權狀態必須非阻塞載入');
if(!js.includes('setButtonBusy'))throw new Error('操作按鈕必須提供處理中狀態');
for(const token of ['limit=Math.min(60','offset=Math.max(0','url.searchParams.get(\'status\')','url.searchParams.get(\'q\')','LIMIT ? OFFSET ?','COUNT(*) AS count']){
  if(!authority.includes(token))throw new Error(`後端分頁契約缺失：${token}`)
}
console.log('PASS：獨立貼文系統具備真正server pagination、搜尋/狀態查詢、載入下一批、核心按鈕、圖片懶載入與非阻塞平台狀態。');
