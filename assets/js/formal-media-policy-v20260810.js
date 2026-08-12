(()=>{
'use strict';
const CONFIG=Object.freeze({
  runtime:'formal-media-policy-20260812-product-dm-separated-v1',
  approvalBatch:'20260812-product-dm-separated-v1',
  productAuthority:'six-user-confirmed-product-visuals-with-products-v3-identity-reference',
  displayPolicy:'產品貼文固定使用六張正式產品圖；只有明確DM／詳細DM意圖才使用獨立修正版DM；試喝貼文固定使用獨立試喝主圖。三種角色不可互相誤代。products-v3只作實物外觀、包裝與比例校正。',
  productSpecs:Object.freeze({
    guiluGao:'100g／罐',
    guiluDrink30:'30cc／罐（小玻璃罐、裸罐、無貼紙、金色蓋）',
    guiluDrink180:'180cc／包（鋁袋）',
    guiluTangkuai:'75g／盒｜8塊裝',
    guiluTangkuaiDetail:'每塊約9.375g（僅詳細資料；不放產品圖／DM主規格）',
    guiluJiao:'600g（1斤）／盒｜32塊裝',
    guiluJiaoDetail:'每塊約18.75g（僅詳細資料；不放產品圖／DM主規格）',
    luerongFen:'75g／罐'
  }),
  trialMedia:Object.freeze({id:'trial',keywords:['試喝','3罐免費','試喝組','先試喝'],public_url:'https://ts15825868.github.io/xianjiawei/images/customer-display-v20260812/trial.webp?v=20260812-six-product-final-v3-clean',binary_ready:true,approved:true,source:'user-confirmed-separate-trial-master',role:'fixed-full-trial-master-only',alt:'龜鹿飲試喝組｜先試喝，再決定'}),
  formalProductMedia:Object.freeze([
    Object.freeze({id:'guilu-gao',keywords:['龜鹿膏'],public_url:'https://ts15825868.github.io/xianjiawei/images/customer-display-v20260812/guilu-gao.webp?v=20260812-six-product-final-v3-clean',binary_ready:true,approved:true,source:'user-confirmed-six-product-final',role:'official-product-image',alt:'仙加味龜鹿膏100g正式產品圖'}),
    Object.freeze({id:'guilu-drink-30',keywords:['龜鹿飲30cc','30cc','小玻璃罐'],public_url:'https://ts15825868.github.io/xianjiawei/images/customer-display-v20260812/guilu-drink-30cc.webp?v=20260812-six-product-final-v3-clean',binary_ready:true,approved:true,source:'user-confirmed-six-product-final',role:'official-product-image',alt:'仙加味龜鹿飲30cc／罐（小玻璃罐）正式產品圖',validation:'actual-small-glass-jar-no-label-gold-lid-no-shape-or-proportion-change'}),
    Object.freeze({id:'guilu-drink-180',keywords:['龜鹿飲180cc','180cc','鋁袋'],public_url:'https://ts15825868.github.io/xianjiawei/images/customer-display-v20260812/guilu-drink-180cc.webp?v=20260812-six-product-final-v3-clean',binary_ready:true,approved:true,source:'user-confirmed-six-product-final',role:'official-product-image',alt:'仙加味龜鹿飲180cc鋁袋正式產品圖',validation:'actual-foil-pouch-no-shape-or-proportion-change'}),
    Object.freeze({id:'guilu-tangkuai',keywords:['龜鹿湯塊','湯塊75g','湯塊'],public_url:'https://ts15825868.github.io/xianjiawei/images/customer-display-v20260812/guilu-tangkuai.webp?v=20260812-six-product-final-v3-clean',binary_ready:true,approved:true,source:'user-confirmed-six-product-final-clean-v3',role:'official-product-image',alt:'仙加味龜鹿湯塊75g／盒｜8塊裝正式產品圖'}),
    Object.freeze({id:'guilu-jiao',keywords:['龜鹿膠','600g','1斤','32塊'],public_url:'https://ts15825868.github.io/xianjiawei/images/customer-display-v20260812/guilu-jiao.webp?v=20260812-six-product-final-v3-clean',binary_ready:true,approved:true,source:'user-confirmed-six-product-final',role:'official-product-image',alt:'仙加味龜鹿膠600g（1斤）／盒｜32塊裝正式產品圖'}),
    Object.freeze({id:'luerong-fen',keywords:['鹿茸粉','鹿茸','75g'],public_url:'https://ts15825868.github.io/xianjiawei/images/customer-display-v20260812/luerong-fen.webp?v=20260812-six-product-final-v3-clean',binary_ready:true,approved:true,source:'user-confirmed-six-product-final',role:'official-product-image',alt:'仙加味鹿茸粉75g正式產品圖'})
  ]),
  formalDmMedia:Object.freeze([
    Object.freeze({id:'guilu-gao-dm',productId:'guilu-gao',keywords:['龜鹿膏'],public_url:'https://ts15825868.github.io/xianjiawei/images/dm-approved-v20260810/guilu-gao-100g.webp?v=20260812-dm-corrected-v1',binary_ready:true,approved:true,source:'corrected-detailed-dm',role:'detailed-dm',alt:'仙加味龜鹿膏100g詳細DM'}),
    Object.freeze({id:'guilu-drink-30-dm',productId:'guilu-drink-30',keywords:['龜鹿飲30cc','30cc','小玻璃罐'],public_url:'https://ts15825868.github.io/xianjiawei/images/dm-approved-v20260810/guilu-drink-30cc.webp?v=20260812-dm-corrected-v1',binary_ready:true,approved:true,source:'corrected-detailed-dm',role:'detailed-dm',alt:'仙加味龜鹿飲30cc／罐（小玻璃罐）詳細DM',validation:'no-bottle-wording'}),
    Object.freeze({id:'guilu-drink-180-dm',productId:'guilu-drink-180',keywords:['龜鹿飲180cc','180cc','鋁袋'],public_url:'https://ts15825868.github.io/xianjiawei/images/dm-approved-v20260810/guilu-drink-180cc.webp?v=20260812-dm-corrected-v1',binary_ready:true,approved:true,source:'corrected-detailed-dm',role:'detailed-dm',alt:'仙加味龜鹿飲180cc鋁袋詳細DM'}),
    Object.freeze({id:'guilu-tangkuai-dm',productId:'guilu-tangkuai',keywords:['龜鹿湯塊','湯塊75g','湯塊'],public_url:'https://ts15825868.github.io/xianjiawei/images/dm-approved-v20260810/guilu-tangkuai-75g.webp?v=20260812-dm-corrected-v1',binary_ready:true,approved:true,source:'corrected-detailed-dm',role:'detailed-dm',alt:'仙加味龜鹿湯塊75g／盒｜8塊裝詳細DM',validation:'no-piece-weight-on-main-spec'}),
    Object.freeze({id:'guilu-jiao-dm',productId:'guilu-jiao',keywords:['龜鹿膠','600g','1斤','32塊'],public_url:'https://ts15825868.github.io/xianjiawei/images/dm-approved-v20260810/guilu-jiao-600g.webp?v=20260812-dm-corrected-v1',binary_ready:true,approved:true,source:'corrected-detailed-dm',role:'detailed-dm',alt:'仙加味龜鹿膠600g（1斤）／盒｜32塊裝詳細DM',validation:'no-piece-weight-on-main-spec'}),
    Object.freeze({id:'luerong-fen-dm',productId:'luerong-fen',keywords:['鹿茸粉','鹿茸','75g'],public_url:'https://ts15825868.github.io/xianjiawei/images/dm-approved-v20260810/lurong-fen-75g.webp?v=20260812-dm-corrected-v1',binary_ready:true,approved:true,source:'corrected-detailed-dm',role:'detailed-dm',alt:'仙加味鹿茸粉75g詳細DM'})
  ]),
  latestZipCatalog:'/data/latest-user-post-zip.json',
  imageSourcePriority:Object.freeze(['trial_media','formal_dm_media_when_explicit_dm_intent','formal_product_media','user_zip_approved','approved_existing','regenerate_if_missing']),
  regeneration:Object.freeze({invalidateApproval:true,invalidateSchedule:true,returnStatus:'pending_review',autoApprove:false,autoPublish:false,reviewItems:16,actualProductReference:'products-v3'}),
  hardReject:Object.freeze(['products-v2','products-v4-final-as-customer-main','ai-redrawn-wrong-product','wrong-30cc-container','wrong-180cc-package','collage','cropped-character','stretched-product','copy-image-mismatch','dm-copy-conflict','piece-weight-on-main-image'])
});
const normalize=s=>String(s||'').toLowerCase();
const rejected=c=>c?.rejected===true||c?.status==='rejected'||c?.product_redrawn===true||c?.status==='not_zip_authority';
const publishable=c=>c?.binary_ready===true&&/^https?:\/\//.test(String(c?.public_url||''));
const semanticScore=(copy,candidate)=>{const text=normalize(copy),c=candidate||{};let semantic=0;for(const keyword of Array.isArray(c.keywords)?c.keywords:[]){if(keyword&&text.includes(normalize(keyword)))semantic+=12;}const scene=normalize(c.scene||c.title||c.alt||c.id||'');for(const token of text.split(/[\s，。！？、；：,.!?;:]+/).filter(x=>x.length>=2))if(scene.includes(token))semantic+=2;return semantic;};
const scoreCandidate=(copy,candidate)=>{const c=candidate||{};if(rejected(c))return-Infinity;const semantic=semanticScore(copy,c);if(semantic<=0)return-Infinity;let priority=0;const source=normalize(c.source||c.origin||c.source_file||'');if(source.includes('trial-master'))priority+=300;else if(source.includes('corrected-detailed-dm'))priority+=280;else if(source.includes('six-product-final'))priority+=260;else if(source.includes('formal-media'))priority+=240;else if(source.includes('zip')||source.includes('user')||c.source_file)priority+=100;if(c.approved===true||c.status==='approved')priority+=60;return semantic+priority;};
const rank=(copy,candidates)=>(Array.isArray(candidates)?candidates:[]).map(item=>({item,score:scoreCandidate(copy,item)})).filter(x=>Number.isFinite(x.score)&&x.score>0).sort((a,b)=>b.score-a.score);
const chooseSource=(copy,candidates)=>rank(copy,candidates)[0]?.item||null;
const choosePublishable=(copy,candidates)=>rank(copy,candidates).find(x=>publishable(x.item))?.item||null;
const detectRole=copy=>{const text=String(copy||'');if(/試喝|3\s*罐免費|先試喝/.test(text))return'trial';if(/(?:^|[\s｜：:（）()])DM(?:$|[\s｜：:（）()])|詳細DM|產品DM|DM圖|DM海報/i.test(text))return'dm';return'product_or_lifestyle';};
const resolveMedia=(copy,candidates)=>{
  const role=detectRole(copy);
  if(role==='trial'&&semanticScore(copy,CONFIG.trialMedia)>0)return{status:'approved_existing',candidate:CONFIG.trialMedia,action:'use',authority:'trial_media',approvalBatch:CONFIG.approvalBatch,role};
  if(role==='dm'){const dm=choosePublishable(copy,CONFIG.formalDmMedia);if(dm)return{status:'approved_existing',candidate:dm,action:'use',authority:'formal_dm_media',approvalBatch:CONFIG.approvalBatch,role};}
  const product=choosePublishable(copy,CONFIG.formalProductMedia);if(product)return{status:'approved_existing',candidate:product,action:'use',authority:'formal_product_media',approvalBatch:CONFIG.approvalBatch,role};
  const usable=choosePublishable(copy,candidates);if(usable)return{status:'approved_existing',candidate:usable,action:'use',authority:'user_zip_approved',approvalBatch:CONFIG.approvalBatch,role};
  const source=chooseSource(copy,candidates);if(source)return{status:'needs_binary_sync',candidate:source,action:'sync_source_binary',authority:'user_zip_approved',approvalBatch:CONFIG.approvalBatch,role};
  return{status:'regenerate_if_missing',candidate:null,action:'regenerate',authority:'none',approvalBatch:CONFIG.approvalBatch,role,productGenerationRule:'must preserve products-v3 actual product appearance'};
};
const loadJson=async(url)=>{const response=await fetch(url,{cache:'no-store',credentials:'same-origin'});if(!response.ok)throw new Error(`media catalog ${response.status}`);return response.json();};
const runtime={...CONFIG,latestCatalog:null,semanticScore,chooseSourceCandidate:chooseSource,chooseBestCandidate:choosePublishable,detectRole,resolveMedia,needsBinarySync:(copy,candidates)=>resolveMedia(copy,candidates).status==='needs_binary_sync',needsGeneration:(copy,candidates)=>resolveMedia(copy,candidates).status==='regenerate_if_missing'};
const loadLatestZipCatalog=async()=>{const local=await loadJson(CONFIG.latestZipCatalog);let publicCatalog=null;const publicUrl=String(local?.public_catalog||'').trim();if(publicUrl){try{publicCatalog=await fetch(publicUrl,{cache:'no-store'}).then(r=>r.ok?r.json():null);}catch(_){publicCatalog=null;}}const safeScenes=Array.isArray(publicCatalog?.safe_scene_priority)&&publicCatalog.safe_scene_priority.length?publicCatalog.safe_scene_priority:(Array.isArray(local.safe_scene_priority)?local.safe_scene_priority:[]);const catalog={...local,public:publicCatalog,safeScenes};runtime.latestCatalog=catalog;document.documentElement.dataset.latestPostZip=local.source||'user-zip';document.documentElement.dataset.latestPostZipBinary=local.binary_sync?.status||'unknown';document.documentElement.dataset.formalMediaApprovalBatch=CONFIG.approvalBatch;window.dispatchEvent(new CustomEvent('xjw-latest-post-zip-ready',{detail:catalog}));return catalog;};
runtime.loadLatestZipCatalog=loadLatestZipCatalog;window.XJWFormalMediaPolicy=runtime;document.documentElement.dataset.formalMediaPolicy=CONFIG.runtime;
function installNote(catalog){const host=document.querySelector('.publish-separation-note');if(!host||host.querySelector('[data-formal-media-policy-note]'))return;const source=String(catalog?.source||'最新使用者 ZIP');const count=Number(catalog?.candidate_count||0);const note=document.createElement('p');note.dataset.formalMediaPolicyNote='true';note.innerHTML=`<strong>目前配圖規則：</strong>一般產品貼文固定使用六張正式產品圖；文案明確標示「DM／詳細DM」才使用獨立修正版DM；試喝文固定使用試喝主圖。龜鹿湯塊主圖／DM主規格只放「75g／盒｜8塊裝」；龜鹿膠主圖／DM主規格只放「600g（1斤）／盒｜32塊裝」。每塊約重只留詳細資料。生活情境文再比對 ${source}${count?`（${count}張唯一候選）`:''}。任何換圖、重生成或改文案後一律回待審核並重新完成16項。`;host.appendChild(document.createElement('br'));host.appendChild(note);}
window.addEventListener('DOMContentLoaded',()=>{loadLatestZipCatalog().then(installNote).catch(()=>installNote(null));});
})();
