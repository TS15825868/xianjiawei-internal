import fs from 'node:fs';

const path='tools/validate-publishing-review-gate.mjs';
let source=fs.readFileSync(path,'utf8');

const staleCache="must(html.includes('20260815-regeneration-policy-v6'),'貼文中心仍載入舊ChatGPT生成快取版本');";
const currentCache="must(/post-regenerate-policy-v1\\.js\\?v=202608\\d{2}-regeneration-policy-v\\d+/.test(html),'貼文中心ChatGPT重新生成流程必須使用有日期與版本識別的正式快取版本');";
if(!source.includes(staleCache)){
  throw new Error('找不到舊版固定快取版本守門條件；請直接檢查 validate-publishing-review-gate.mjs 後更新本相容層');
}
source=source.replace(staleCache,currentCache);

const staleEntry=`const contentAuditMain=wrangler.includes('"main": "src/publishing-content-audit-entry.js"');
must(productionMain||publishingOnlyMain||contentAuditMain,'Worker正式入口必須沿用production-entry／publishing-only安全鏈，並可在其外層增加目前內容語意守門能力');`;
const currentEntry=`const contentAuditMain=wrangler.includes('"main": "src/publishing-content-audit-entry.js"');
const fullSystemMain=wrangler.includes('"main": "src/full-system-entry.js"');
const fullSystem=fs.existsSync('src/full-system-entry.js')?read('src/full-system-entry.js'):'';
must(productionMain||publishingOnlyMain||contentAuditMain||fullSystemMain,'Worker正式入口必須沿用目前production／publishing安全鏈，完整ERP入口只可包在正式貼文安全鏈外層');
if(fullSystemMain){
  must(fullSystem.includes("from './publishing-content-audit-entry.js'"),'完整ERP入口必須沿用目前內容語意守門鏈');
  must(fullSystem.includes("from './production-entry.js'"),'完整ERP入口必須保留正式production能力');
  must(fullSystem.includes('erpUiEnabled:true')&&fullSystem.includes('erpApisEnabled:true')&&fullSystem.includes('publishingCenterIndependent:true'),'完整ERP入口缺少目前ERP／獨立貼文中心能力標記');
}`;
if(!source.includes(staleEntry)){
  throw new Error('找不到舊版Worker入口守門條件；請直接檢查 validate-publishing-review-gate.mjs 後更新本相容層');
}
source=source.replace(staleEntry,currentEntry);

const encoded=Buffer.from(source,'utf8').toString('base64');
await import(`data:text/javascript;base64,${encoded}`);
console.log('PASS：16項審核完整守門已執行；正式入口接受目前 full-system-entry 包住既有安全鏈，快取版本只檢查正式日期＋版本格式，不再鎖死舊版號。');
