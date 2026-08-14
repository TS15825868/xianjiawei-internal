import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const must=(ok,message)=>{if(!ok)throw new Error(message)};

const index=read('index.html');
const publishing=read('publishing.html');
const separation=read('assets/js/erp-publishing-separation.js');
const internal=read('assets/js/internal-app.js');
const buttons=read('assets/js/post-regenerate-buttons.js');
const policy=read('assets/js/post-regenerate-policy-v1.js');
const productGuard=read('assets/js/product-authority-guard.js');
const mediaPolicy=read('assets/js/formal-media-policy-v20260810.js');
const mediaAssistant=read('assets/js/zip-media-assistant.js');
const standard=read('docs/CONTENT_IMAGE_GENERATION_STANDARD.md');
const latestZip=JSON.parse(read('data/latest-user-post-zip.json'));
const pkg=read('package.json');
const wrangler=read('wrangler.jsonc');
const production=read('src/production-entry.js');
const reviewEntry=read('src/publishing-review-gate-entry.js');
const worker=read('src/worker.js');

for(const token of ['app-shell','營運中控','internal-app.js','erp-publishing-separation.js','/publishing.html'])must(index.includes(token),`ERP首頁缺少完整營運中控能力：${token}`);
must(!index.includes("location.replace('/publishing.html')"),'ERP首頁不得再強制跳轉成publishing-only');
for(const module of ['dashboard','products','inventory','assets','customers','visits','orders','purchases','suppliers','finance','tasks','templates','documents','settings'])must(internal.includes(`'${module}'`)||internal.includes(`\"${module}\"`),`完整ERP前端缺少模組：${module}`);
for(const endpoint of ['/overview','/settings','/assets','/platform-authorization','/modules/'])must(internal.includes(endpoint),`完整ERP前端缺少API能力：${endpoint}`);
for(const module of ['products','customers','visits','orders','inventory','purchases','suppliers','finance','tasks','documents','templates','assets'])must(worker.includes(`'${module}'`),`ERP核心Worker缺少模組：${module}`);

for(const token of ["TARGET='/publishing.html'","#posts","#calendar","data-open-publishing"])must(separation.includes(token),`ERP／貼文分流層缺少：${token}`);
must(publishing.includes('唯一正式內容系統'),'獨立貼文中心缺少唯一正式系統標示');
for(const script of ['post-regenerate-buttons.js','post-regenerate-policy-v1.js','formal-media-policy-v20260810.js','zip-media-assistant.js']){
  must(publishing.includes(script),`正式貼文系統缺少必要能力層：${script}`);
  must(publishing.includes(script+'?v='),`必要能力層缺少快取識別：${script}`);
}
must(!publishing.includes('post-media-suggestion-ui-v1.js'),'正式貼文系統不得同時載入第二套媒體建議層');
must(!publishing.includes('post-regenerate-v6.js'),'正式貼文系統不得再載入舊v6第二套重生成邏輯');
must(!buttons.includes('window.open(')&&!buttons.includes('/api/posts/'),'按鈕呈現層不得偷偷保留第二套ChatGPT/API邏輯');

must(/"main"\s*:\s*"src\/production-entry\.js"/.test(wrangler),'Wrangler正式入口必須是完整production-entry.js');
for(const token of ["from './publishing-review-gate-entry.js'","from './flexible-publish-entry.js'",'runReadiness','platformPublishGate'])must(production.includes(token),`production-entry缺少目前安全能力：${token}`);
for(const token of ['draftToPendingReviewRequired','directDraftApprovalBlocked','regenerationReturnsToPendingReview','copyImageMatchHardGate'])must(reviewEntry.includes(token),`16項貼文審核入口缺少能力：${token}`);

for(const token of ['customerProductImageAuthority','customer-display-v20260812','detailedDmAuthority','dm-final','trial-poster-small-boss-official-v20260814','productIdentityReference','products-v3'])must(productGuard.includes(token),`產品媒體角色權威缺少：${token}`);
for(const token of ['100g／罐','30cc／罐（小玻璃罐）','180cc／包（鋁袋）','75g／盒｜8塊裝','600g（1斤）／盒｜32塊裝','75g／罐','每日早上及下午各一小匙'])must(productGuard.includes(token),`產品權威缺少目前正式值：${token}`);
must(!productGuard.includes('/images/products-v2/'),'產品圖片守門不得回退products-v2');
for(const token of ['禁止拼貼','AI絕對不得重畫','30cc','180cc','小老闆','16項','待審核','/regeneration-start','/regeneration-ready'])must(policy.includes(token),`重新生成守門缺少硬規格／閉環能力：${token}`);
for(const token of ['禁止拼湊','AI 重畫產品','30cc','180cc','小老闆','16 項正式審核','禁止回退'])must(standard.includes(token),`生成母規格文件缺少：${token}`);
for(const token of ['formalProductMedia','semanticScore','scoreCandidate','rank','user_zip_approved','approved_existing','regenerate_if_missing','pending_review','reviewItems:16','needs_binary_sync','formal_product_media','latestZipCatalog'])must(mediaPolicy.includes(token),`最新媒體權威runtime缺少能力：${token}`);
must(/const semantic=semanticScore\(copy,c\);if\(semantic<=0\)return\s*-?Infinity/.test(mediaPolicy),'ZIP／正式素材候選在零語意命中時必須直接淘汰，來源權重不得救回不相干圖片');
must(/filter\(x=>Number\.isFinite\(x\.score\)&&x\.score>0\)/.test(mediaPolicy),'候選排名必須只保留有限且正分的語意候選');
for(const token of ['resolveMedia','approved_existing','needs_binary_sync','regenerate_if_missing','套用正式圖','套用 ZIP 合格圖'])must(mediaAssistant.includes(token),`唯一正式配圖助理缺少能力：${token}`);

must(typeof latestZip.source==='string'&&latestZip.source.trim(),'最新貼文ZIP來源名稱不可為空');
must(Number(latestZip.candidate_count)>0,'最新ZIP必須有唯一候選圖');
must(Number(latestZip.original_file_count||latestZip.candidate_count)>=Number(latestZip.candidate_count),'最新ZIP原始檔數不得小於唯一候選數');
must(latestZip.priority==='user_zip_approved','最新ZIP必須維持使用者素材優先');
must(/^https:\/\//.test(String(latestZip.public_catalog||'')),'貼文中心未指向目前最新ZIP公開目錄');
must(/needs_binary_sync/.test(String(latestZip.selection_rule||'')),'最新ZIP必須區分有合格來源但原圖待同步');
must(/regenerate only if no approved source candidate matches/i.test(String(latestZip.selection_rule||'')),'缺少「真的沒有合格來源才生成」能力規則');
must(/pending_review/.test(String(latestZip.review_rule||''))&&/16/.test(String(latestZip.review_rule||'')),'最新ZIP配圖後必須回待審核並保留16項審核');
const sync=latestZip.binary_sync||{};
must(['pending','ready','synced'].includes(String(sync.status||'')),`最新ZIP binary狀態不可判斷：${sync.status}`);
if(sync.status==='synced')must(Number(sync.publishable_count||0)>0,'最新ZIP已同步但沒有可用上線情境圖');

for(const file of ['index.html','publishing.html','internal-app.js','erp-publishing-separation.js','internal-app.css','publishing-app-v2.js','post-regenerate-policy-v1.js','formal-media-policy-v20260810.js','latest-user-post-zip.json'])must(pkg.includes(file),`正式build缺少必要檔：${file}`);
must(!pkg.includes('cp assets/js/post-regenerate-v6.js'),'正式部署不得帶出舊v6第二套重生成邏輯');

console.log(`PASS：完整ERP根介面與核心模組已恢復，貼文／排程仍只走單一獨立publishing.html；production-entry保留16項審核、立即發布與平台安全；產品／DM／試喝／products-v3身份參考角色分離；語意分數為零的候選在來源加權前即淘汰；最新 ${latestZip.source}/${latestZip.candidate_count} 張候選採能力式驗收。`);
