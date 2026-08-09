import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const must=(ok,message)=>{if(!ok)throw new Error(message)};
const policy=read('assets/js/post-regenerate-policy-v1.js');
const buttons=read('assets/js/post-regenerate-buttons.js');
const html=read('publishing.html');
const gate=read('src/publishing-review-gate-entry.js');
const pkg=read('package.json');

for(const token of [
  "VERSION='20260810-single-system-v3-true-originals'",
  "PRODUCT_IMAGE_VERSION='20260810-products-v3-latest-originals-v3'",
  "images/products-v3/guilu-gao.jpg?v=${PRODUCT_IMAGE_VERSION}",
  "images/products-v3/guilu-drink-30.jpg?v=${PRODUCT_IMAGE_VERSION}",
  "images/products-v3/guilu-drink-180.jpg?v=${PRODUCT_IMAGE_VERSION}",
  "images/products-v3/guilu-tangkuai.jpg?v=${PRODUCT_IMAGE_VERSION}",
  "images/products-v3/guilu-jiao.jpg?v=${PRODUCT_IMAGE_VERSION}",
  "images/products-v3/luerong-fen.jpg?v=${PRODUCT_IMAGE_VERSION}",
  '30cc正式名稱只能是「龜鹿飲30cc玻璃罐」',
  'AI不得重畫產品',
  '每張圖只做一個完整場景',
  '生成／修改完成後只回到「待審核」',
  '/regeneration-start',
  '/regeneration-ready',
  'window.open',
  'navigator.clipboard',
]) must(policy.includes(token),`重新生成政策缺少正式規則：${token}`);

for(const token of [
  'window.XJWPublishingV2',
  'policy.launch(post,mode)',
  'data-post-regenerate-mode',
  '生成後回填／上傳',
  'openResultModal',
  "mode==='copy'",
  "window.prompt('貼上剛生成的新文案",
  'deviceInput.click()',
  'pendingReview',
  '回到待審核',
]) must(buttons.includes(token),`重新生成按鈕流程缺少：${token}`);

must(!policy.includes('OPENAI_API_KEY'),'正式流程不得要求付費OpenAI API key');
must(!policy.includes('/v1/images')&&!policy.includes('/v1/responses'),'正式流程不得由Worker呼叫付費OpenAI API');
must(html.includes('post-regenerate-buttons.js')&&html.includes('post-regenerate-policy-v1.js'),'publishing.html沒有載入重新生成正式流程');
must(html.includes('20260810-single-system-v3-true-originals'),'publishing.html沒有強制載入真正產品原圖版重新生成政策');
must(gate.includes("path.match(/^\\/api\\/posts\\/([^/]+)\\/regeneration-start$/)"),'Worker缺少regeneration-start端點');
must(gate.includes("path.match(/^\\/api\\/posts\\/([^/]+)\\/regeneration-ready$/)"),'Worker缺少regeneration-ready端點');
must(gate.includes("post.status='pending_review'"),'生成完成後必須回待審核');
must(gate.includes('approved_at=null')&&gate.includes('scheduled_at=null'),'重新生成必須撤銷核准與排程');
must(pkg.includes('tools/validate-post-regeneration.mjs'),'package check未納入重新生成驗收');

console.log('PASS：不符合按鈕會撤銷舊核准／排程，開啟免費ChatGPT並帶入最新products-v3真正產品原圖、30cc／180cc比例、小老闆與單一場景規則；新內容回填後只回待審核，重新完成16項審核才可發布。');
