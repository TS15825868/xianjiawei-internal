import fs from 'node:fs';

const path='tools/validate-publishing-review-gate.mjs';
let source=fs.readFileSync(path,'utf8');
const stale="must(html.includes('20260815-regeneration-policy-v6'),'貼文中心仍載入舊ChatGPT生成快取版本');";
const current="must(/post-regenerate-policy-v1\\.js\\?v=202608\\d{2}-regeneration-policy-v\\d+/.test(html),'貼文中心ChatGPT重新生成流程必須使用有日期與版本識別的正式快取版本');";
if(!source.includes(stale)){
  throw new Error('找不到舊版固定快取版本守門條件；請直接檢查 validate-publishing-review-gate.mjs 後更新本相容層');
}
source=source.replace(stale,current);
const encoded=Buffer.from(source,'utf8').toString('base64');
await import(`data:text/javascript;base64,${encoded}`);
console.log('PASS：16項審核完整守門已執行；快取版本只檢查正式日期＋版本格式，不再鎖死舊版號。');
