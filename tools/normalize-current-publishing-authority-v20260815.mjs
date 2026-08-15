import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const SELF='tools/normalize-current-publishing-authority-v20260815.mjs';
const files=execFileSync('git',['ls-files'],{encoding:'utf8'}).split(/\r?\n/).filter(Boolean);
let changed=0;
for(const file of files){
  if(file===SELF||file.startsWith('.github/workflows/')||file.startsWith('audits/')||file.startsWith('node_modules/'))continue;
  let raw;try{raw=fs.readFileSync(file,'utf8')}catch{continue}
  if(raw.includes('\u0000'))continue;
  let next=raw
    .replaceAll('75g （2兩）／盒｜8塊裝','75g／盒｜8塊裝')
    .replaceAll('75g（2兩）／盒｜8塊裝','75g／盒｜8塊裝')
    .replaceAll('current-product-authority-20260815-v3-2li-1jin','current-product-authority-20260815-v4-current-spec');
  if(file==='tools/validate-system-readiness.mjs'){
    next=next.replace("for(const token of ['貼文中心系統 App','其他 ERP 功能目前暫停','readinessSummary','data-diagnose','data-refresh','20260815-lean-boot-v1','/healthz/core','/healthz/readiness','publishing-app-v2.js','publishing-review-gate.js','publishing-base.css'])must(html.includes(token),`publishing.html缺少貼文中心能力：${token}`);",
      "for(const token of ['貼文中心系統 App','其他 ERP 功能目前暫停','readinessSummary','data-diagnose','data-refresh','/healthz/core','/healthz/readiness','publishing-app-v2.js','publishing-review-gate.js','publishing-base.css'])must(html.includes(token),`publishing.html缺少貼文中心能力：${token}`);\nmust(/window\\.__XJW_BOOT_VERSION__=['\\\"][^'\\\"]+['\\\"]/.test(html),'publishing.html缺少目前正式 Boot 能力識別');");
  }
  if(file==='publishing.html'){
    const before='<strong>圖片規則：</strong>每篇貼文都要有符合該篇文案的專屬圖片，不同貼文不重複使用同一張主圖。需要產品時以正式產品外觀為準，不得重畫包裝；30cc與180cc包裝、比例不可改。小老闆使用網站同款精緻Q版，小鹿與小烏龜分開呈現；沒有合適既有圖時，重新生成一張完整單一情境圖，不使用拼湊式版面。';
    const after=before+'<br><br><strong>產品素材角色：</strong>一般產品貼文使用正式產品原圖；詳細DM與試喝圖各自使用核准素材；products-v3只作產品身份、包裝與比例校正，不作一般顧客主圖。';
    if(next.includes(before)&&!next.includes('products-v3只作產品身份、包裝與比例校正'))next=next.replace(before,after);
  }
  if(next!==raw){fs.writeFileSync(file,next,'utf8');console.log('updated',file);changed++}
}
if(!changed)throw new Error('no authority normalization changes applied');
console.log(`PASS: normalized ${changed} current publishing authority files.`);
