import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const must=(ok,message)=>{if(!ok)throw new Error(message)};
const index=read('index.html');
const publishing=read('publishing.html');
const policy=read('assets/js/post-regenerate-policy-v1.js');
const standard=read('docs/CONTENT_IMAGE_GENERATION_STANDARD.md');
const pkg=read('package.json');

must(index.includes("location.replace('/publishing.html')"),'首頁必須直接進唯一貼文審核發佈系統');
must(!publishing.includes('營運 ERP'),'貼文系統不得再顯示ERP入口');
must(publishing.includes('唯一正式內容系統'),'貼文系統缺少唯一正式系統標示');
must(publishing.includes('禁止拼貼')&&publishing.includes('AI 不得重畫產品'),'主畫面沒有清楚顯示圖片硬規則');
must(publishing.indexOf('post-regenerate-policy-v1.js')>=0,'未載入最高優先生成規格守門');
must(publishing.indexOf('post-regenerate-policy-v1.js')<publishing.indexOf('post-regenerate-v6.js'),'正式生成規格守門必須先於舊重生成工具載入');

for(const token of ['禁止拼貼','products-v3','AI絕對不得重畫','30cc','Ø42×H51mm','180cc','0.60～0.68','小老闆','不可裁切','16項','待審核']){
  must(policy.includes(token),`生成守門缺少硬規格：${token}`)
}
for(const token of ['禁止拼湊','products-v3','AI 重畫產品','30cc','180cc','小老闆','完整成圖／非拼湊','16 項正式審核','禁止回退']){
  must(standard.includes(token),`生成母規格文件缺少：${token}`)
}
must(!pkg.includes('cp brand-control.html dist/brand-control.html'),'正式部署不得再帶出品牌控制台');
must(!pkg.includes('cp assets/js/internal-app.js dist/assets/js/internal-app.js'),'正式部署不得再帶出ERP前端');
must(!pkg.includes('cp assets/js/erp-publishing-separation.js'),'正式部署不得再帶出ERP分流工具');
must(pkg.includes('post-regenerate-policy-v1.js'),'正式部署缺少生成規格守門');
console.log('PASS：正式部署只保留仙加味貼文審核發佈系統；文案與圖片唯一母規格、禁止拼湊、products-v3、產品不得AI重畫與16項重審均已鎖定。');
