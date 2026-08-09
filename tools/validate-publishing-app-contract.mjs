import fs from 'node:fs';
const html=fs.readFileSync('publishing.html','utf8');
const js=fs.readFileSync('assets/js/publishing-app.js','utf8');
const requiredHtml=['貼文審核發佈系統','data-refresh','data-add-post','searchInput','statusFilter','clearFilters','listRoot','modalRoot','toastRoot','publishing-performance.css','post-regenerate-v6.js','manual-publish-tools.js'];
for(const token of requiredHtml){if(!html.includes(token))throw new Error(`publishing.html缺少必要功能入口：${token}`)}
const requiredJs=['PAGE_SIZE=18','data-load-more','data-post-view','data-post-edit','data-post-status','data-post-schedule','data-post-publish-now','/posts','/status','/publish-now','/deliveries','/platform-authorization','/me','loading="lazy"','decoding="async"','function debounce'];
for(const token of requiredJs){if(!js.includes(token))throw new Error(`publishing-app.js缺少必要功能契約：${token}`)}
if(js.includes("state.items.map(card).join('')"))throw new Error('不得回退為一次渲染全部貼文卡');
if(!js.includes('loadPlatforms(loadId)'))throw new Error('平台授權狀態必須非阻塞載入');
if(!js.includes("setButtonBusy"))throw new Error('操作按鈕必須提供處理中狀態');
console.log('PASS：獨立貼文系統核心按鈕、API、分批渲染、圖片懶載入與非阻塞平台狀態均存在。');
