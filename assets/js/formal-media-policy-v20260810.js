(()=>{
'use strict';
const CONFIG=Object.freeze({
  runtime:'formal-media-policy-20260812-customer-display',
  approvalBatch:'20260812-user-approved-customer-display',
  productAuthority:'products-v3-real-product-identity-authority',
  displayPolicy:'產品／試喝貼文優先使用使用者最新核准正式DM／正式視覺；products-v3保留為產品實物身份校正，不要求顧客端使用簡單原圖。',
  productSpecs:Object.freeze({
    guiluGao:'100g／罐',
    guiluDrink30:'30cc／罐（小玻璃罐、裸罐、無貼紙、金色蓋）',
    guiluDrink180:'180cc／包（鋁袋）',
    guiluTangkuai:'75g／盒｜8塊裝',
    guiluJiao:'600g／盒｜32塊裝',
    luerongFen:'75g／罐'
  }),
  formalProductMedia:Object.freeze([
    Object.freeze({id:'trial',keywords:['試喝','3罐免費','試喝組','先試喝'],public_url:'https://ts15825868.github.io/xianjiawei/images/customer-display-v20260812/trial.webp?v=20260812',binary_ready:true,approved:true,source:'user-approved-formal-media-v20260812',alt:'龜鹿飲試喝組｜先試喝，再決定'}),
    Object.freeze({id:'guilu-gao',keywords:['龜鹿膏'],public_url:'https://ts15825868.github.io/xianjiawei/images/customer-display-v20260812/guilu-gao.webp?v=20260812',binary_ready:true,approved:true,source:'user-approved-formal-media-v20260812',alt:'仙加味龜鹿膏100g正式DM'}),
    Object.freeze({id:'guilu-drink-30',keywords:['龜鹿飲30cc','30cc','小玻璃罐'],public_url:'https://ts15825868.github.io/xianjiawei/images/customer-display-v20260812/guilu-drink-30cc.webp?v=20260812',binary_ready:true,approved:true,source:'user-approved-formal-media-v20260812',alt:'仙加味龜鹿飲30cc／罐（小玻璃罐）正式DM',validation:'actual-small-glass-jar-no-label-gold-lid'}),
    Object.freeze({id:'guilu-drink-180',keywords:['龜鹿飲180cc','180cc','鋁袋'],public_url:'https://ts15825868.github.io/xianjiawei/images/customer-display-v20260812/guilu-drink-180cc.webp?v=20260812',binary_ready:true,approved:true,source:'user-approved-formal-media-v20260812',alt:'仙加味龜鹿飲180cc鋁袋正式DM'}),
    Object.freeze({id:'guilu-tangkuai',keywords:['龜鹿湯塊','湯塊75g','湯塊'],public_url:'https://ts15825868.github.io/xianjiawei/images/customer-display-v20260812/guilu-tangkuai.webp?v=20260812',binary_ready:true,approved:true,source:'user-approved-formal-media-v20260812',alt:'仙加味龜鹿湯塊75g／盒｜8塊裝正式DM'}),
    Object.freeze({id:'guilu-jiao',keywords:['龜鹿膠','600g','32塊'],public_url:'https://ts15825868.github.io/xianjiawei/images/customer-display-v20260812/guilu-jiao.webp?v=20260812',binary_ready:true,approved:true,source:'user-approved-formal-media-v20260812',alt:'仙加味龜鹿膠600g／盒｜32塊裝正式DM'}),
    Object.freeze({id:'luerong-fen',keywords:['鹿茸粉','鹿茸','75g'],public_url:'https://ts15825868.github.io/xianjiawei/images/customer-display-v20260812/luerong-fen.webp?v=20260812',binary_ready:true,approved:true,source:'user-approved-formal-media-v20260812',alt:'仙加味鹿茸粉75g正式DM'})
  ]),
  latestZipCatalog:'/data/latest-user-post-zip.json',
  imageSourcePriority:Object.freeze(['formal_product_media','user_zip_approved','approved_existing','regenerate_if_missing']),
  regeneration:Object.freeze({invalidateApproval:true,invalidateSchedule:true,returnStatus:'pending_review',autoApprove:false,autoPublish:false,reviewItems:16,actualProductReference:'products-v3'}),
  hardReject:Object.freeze(['products-v2','ai-redrawn-wrong-product','wrong-30cc-container','wrong-180cc-package','collage','cropped-character','stretched-product','copy-image-mismatch','dm-copy-conflict','retired-piece-weight','retired-jin-wording'])
});
const normalize=s=>String(s||'').toLowerCase();
const rejected=c=>c?.rejected===true||c?.status==='rejected'||c?.product_redrawn===true||c?.status==='not_zip_authority';
const publishable=c=>c?.binary_ready===true&&/^https?:\/\//.test(String(c?.public_url||''));
const semanticScore=(copy,candidate)=>{const text=normalize(copy),c=candidate||{};let semantic=0;for(const keyword of Array.isArray(c.keywords)?c.keywords:[]){if(keyword&&text.includes(normalize(keyword)))semantic+=12;}const scene=normalize(c.scene||c.title||c.alt||c.id||'');for(const token of text.split(/[\s，。！？、；：,.!?;:]+/).filter(x=>x.length>=2))if(scene.includes(token))semantic+=2;return semantic;};
const scoreCandidate=(copy,candidate)=>{const c=candidate||{};if(rejected(c))return-Infinity;const semantic=semanticScore(copy,c);if(semantic<=0)return-Infinity;let priority=0;const source=normalize(c.source||c.origin||c.source_file||'');if(source.includes('formal-media'))priority+=240;else if(source.includes('zip')||source.includes('user')||c.source_file)priority+=100;if(c.approved===true||c.status==='approved')priority+=60;return semantic+priority;};
const rank=(copy,candidates)=>(Array.isArray(candidates)?candidates:[]).map(item=>({item,score:scoreCandidate(copy,item)})).filter(x=>Number.isFinite(x.score)&&x.score>0).sort((a,b)=>b.score-a.score);
const chooseSource=(copy,candidates)=>rank(copy,candidates)[0]?.item||null;
const choosePublishable=(copy,candidates)=>rank(copy,candidates).find(x=>publishable(x.item))?.item||null;
const resolveMedia=(copy,candidates)=>{const product=choosePublishable(copy,CONFIG.formalProductMedia);if(product)return{status:'approved_existing',candidate:product,action:'use',authority:'formal_product_media',approvalBatch:CONFIG.approvalBatch};const usable=choosePublishable(copy,candidates);if(usable)return{status:'approved_existing',candidate:usable,action:'use',authority:'user_zip_approved',approvalBatch:CONFIG.approvalBatch};const source=chooseSource(copy,candidates);if(source)return{status:'needs_binary_sync',candidate:source,action:'sync_source_binary',authority:'user_zip_approved',approvalBatch:CONFIG.approvalBatch};return{status:'regenerate_if_missing',candidate:null,action:'regenerate',authority:'none',approvalBatch:CONFIG.approvalBatch,productGenerationRule:'must preserve products-v3 actual product appearance'};};
const loadJson=async(url)=>{const response=await fetch(url,{cache:'no-store',credentials:'same-origin'});if(!response.ok)throw new Error(`media catalog ${response.status}`);return response.json();};
const runtime={...CONFIG,latestCatalog:null,semanticScore,chooseSourceCandidate:chooseSource,chooseBestCandidate:choosePublishable,resolveMedia,needsBinarySync:(copy,candidates)=>resolveMedia(copy,candidates).status==='needs_binary_sync',needsGeneration:(copy,candidates)=>resolveMedia(copy,candidates).status==='regenerate_if_missing'};
const loadLatestZipCatalog=async()=>{const local=await loadJson(CONFIG.latestZipCatalog);let publicCatalog=null;const publicUrl=String(local?.public_catalog||'').trim();if(publicUrl){try{publicCatalog=await fetch(publicUrl,{cache:'no-store'}).then(r=>r.ok?r.json():null);}catch(_){publicCatalog=null;}}const safeScenes=Array.isArray(publicCatalog?.safe_scene_priority)&&publicCatalog.safe_scene_priority.length?publicCatalog.safe_scene_priority:(Array.isArray(local.safe_scene_priority)?local.safe_scene_priority:[]);const catalog={...local,public:publicCatalog,safeScenes};runtime.latestCatalog=catalog;document.documentElement.dataset.latestPostZip=local.source||'user-zip';document.documentElement.dataset.latestPostZipBinary=local.binary_sync?.status||'unknown';document.documentElement.dataset.formalMediaApprovalBatch=CONFIG.approvalBatch;window.dispatchEvent(new CustomEvent('xjw-latest-post-zip-ready',{detail:catalog}));return catalog;};
runtime.loadLatestZipCatalog=loadLatestZipCatalog;window.XJWFormalMediaPolicy=runtime;document.documentElement.dataset.formalMediaPolicy=CONFIG.runtime;
function installNote(catalog){const host=document.querySelector('.publish-separation-note');if(!host||host.querySelector('[data-formal-media-policy-note]'))return;const source=String(catalog?.source||'最新使用者 ZIP');const count=Number(catalog?.candidate_count||0);const note=document.createElement('p');note.dataset.formalMediaPolicyNote='true';note.innerHTML=`<strong>目前配圖優先順序：</strong>產品／試喝文案先使用 2026-08-12 最新核准正式DM／正式視覺；生活情境文再比對 ${source}${count?`（${count}張唯一候選）`:''}。不要再把簡單原圖當顧客端主要視覺；但所有生成或合成中的產品本體必須照 products-v3 實際產品外觀，不得亂改罐型、鋁袋、盒裝、標籤或比例。任何換圖或改文案後回待審核並重新完成16項。`;host.appendChild(document.createElement('br'));host.appendChild(note);}
window.addEventListener('DOMContentLoaded',()=>{loadLatestZipCatalog().then(installNote).catch(()=>installNote(null));});
})();
