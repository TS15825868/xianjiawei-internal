(()=>{
'use strict';
const CONFIG=Object.freeze({
  runtime:'formal-media-policy-current',
  approvalBatch:'20260810-latest-user-dm-and-trial',
  productAuthority:'products-v3-latest-original-product-photos',
  productSpecs:Object.freeze({
    guiluGao:'100g／罐',
    guiluDrink30:'30cc／罐（小玻璃罐、裸罐、無貼紙）',
    guiluDrink180:'180cc／包（鋁袋）',
    guiluTangkuai:'75g／盒｜8塊裝',
    guiluJiao:'600g／盒｜32塊裝',
    luerongFen:'75g／罐'
  }),
  formalProductMedia:Object.freeze([
    Object.freeze({id:'trial',keywords:['試喝','3罐免費','試喝組','先試喝'],public_url:'https://ts15825868.github.io/xianjiawei/images/dm-approved-v20260810/guilu-drink-trial.webp',binary_ready:true,approved:true,source:'user-approved-formal-media',alt:'龜鹿飲試喝組｜先試喝，再決定'}),
    Object.freeze({id:'guilu-gao',keywords:['龜鹿膏'],public_url:'https://ts15825868.github.io/xianjiawei/images/dm-approved-v20260810/guilu-gao-100g.webp',binary_ready:true,approved:true,source:'user-approved-formal-media',alt:'仙加味龜鹿膏100g正式DM'}),
    Object.freeze({id:'guilu-drink-30',keywords:['龜鹿飲30cc','30cc','小玻璃罐'],public_url:'https://ts15825868.github.io/xianjiawei/images/dm-approved-v20260810/guilu-drink-30cc.webp',binary_ready:true,approved:true,source:'user-approved-formal-media',alt:'仙加味龜鹿飲30cc小玻璃罐正式DM'}),
    Object.freeze({id:'guilu-drink-180',keywords:['龜鹿飲180cc','180cc','鋁袋'],public_url:'https://ts15825868.github.io/xianjiawei/images/dm-approved-v20260810/guilu-drink-180cc.webp',binary_ready:true,approved:true,source:'user-approved-formal-media',alt:'仙加味龜鹿飲180cc鋁袋正式DM'}),
    Object.freeze({id:'guilu-tangkuai',keywords:['龜鹿湯塊','湯塊75g','湯塊'],public_url:'https://ts15825868.github.io/xianjiawei/images/dm-approved-v20260810/guilu-tangkuai-75g.webp',binary_ready:true,approved:true,source:'user-approved-formal-media',alt:'仙加味龜鹿湯塊75g正式DM'}),
    Object.freeze({id:'guilu-jiao',keywords:['龜鹿膠','600g','32塊'],public_url:'https://ts15825868.github.io/xianjiawei/images/dm-approved-v20260810/guilu-jiao-600g.webp',binary_ready:true,approved:true,source:'user-approved-formal-media',alt:'仙加味龜鹿膠600g正式DM'}),
    Object.freeze({id:'luerong-fen',keywords:['鹿茸粉','鹿茸','75g'],public_url:'https://ts15825868.github.io/xianjiawei/images/dm-approved-v20260810/lurong-fen-75g.webp',binary_ready:true,approved:true,source:'user-approved-formal-media',alt:'仙加味鹿茸粉75g正式DM'})
  ]),
  latestZipCatalog:'/data/latest-user-post-zip.json',
  imageSourcePriority:Object.freeze(['formal_product_media','user_zip_approved','approved_existing','regenerate_if_missing']),
  regeneration:Object.freeze({invalidateApproval:true,invalidateSchedule:true,returnStatus:'pending_review',autoApprove:false,autoPublish:false,reviewItems:16}),
  hardReject:Object.freeze(['products-v2','ai-redrawn-product','wrong-30cc-container','wrong-180cc-package','collage','cropped-character','stretched-product','copy-image-mismatch'])
});

const normalize=s=>String(s||'').toLowerCase();
const rejected=c=>c?.rejected===true||c?.status==='rejected'||c?.product_redrawn===true||c?.status==='not_zip_authority';
const publishable=c=>c?.binary_ready===true&&/^https?:\/\//.test(String(c?.public_url||''));
const semanticScore=(copy,candidate)=>{
  const text=normalize(copy);
  const c=candidate||{};
  let semantic=0;
  for(const keyword of Array.isArray(c.keywords)?c.keywords:[]){if(keyword&&text.includes(normalize(keyword)))semantic+=12;}
  const scene=normalize(c.scene||c.title||c.alt||c.id||'');
  for(const token of text.split(/[\s，。！？、；：,.!?;:]+/).filter(x=>x.length>=2))if(scene.includes(token))semantic+=2;
  return semantic;
};
const scoreCandidate=(copy,candidate)=>{
  const c=candidate||{};
  if(rejected(c))return -Infinity;
  const semantic=semanticScore(copy,c);
  if(semantic<=0)return -Infinity;
  let priority=0;
  const source=normalize(c.source||c.origin||c.source_file||'');
  if(source.includes('user-approved-formal-media'))priority+=220;
  else if(source.includes('zip')||source.includes('user')||c.source_file)priority+=100;
  if(c.approved===true||c.status==='approved')priority+=60;
  return semantic+priority;
};
const rank=(copy,candidates)=>{
  const list=Array.isArray(candidates)?candidates:[];
  return list.map(item=>({item,score:scoreCandidate(copy,item)})).filter(x=>Number.isFinite(x.score)&&x.score>0).sort((a,b)=>b.score-a.score);
};
const chooseSource=(copy,candidates)=>rank(copy,candidates)[0]?.item||null;
const choosePublishable=(copy,candidates)=>rank(copy,candidates).find(x=>publishable(x.item))?.item||null;
const resolveMedia=(copy,candidates)=>{
  const product=choosePublishable(copy,CONFIG.formalProductMedia);
  if(product)return{status:'approved_existing',candidate:product,action:'use',authority:'formal_product_media',approvalBatch:CONFIG.approvalBatch};
  const usable=choosePublishable(copy,candidates);
  if(usable)return{status:'approved_existing',candidate:usable,action:'use',authority:'user_zip_approved'};
  const source=chooseSource(copy,candidates);
  if(source)return{status:'needs_binary_sync',candidate:source,action:'sync_source_binary',authority:'user_zip_approved'};
  return{status:'regenerate_if_missing',candidate:null,action:'regenerate',authority:'none'};
};
const loadJson=async(url)=>{
  const response=await fetch(url,{cache:'no-store',credentials:'same-origin'});
  if(!response.ok)throw new Error(`media catalog ${response.status}`);
  return response.json();
};
const loadLatestZipCatalog=async()=>{
  const local=await loadJson(CONFIG.latestZipCatalog);
  let publicCatalog=null;
  const publicUrl=String(local?.public_catalog||'').trim();
  if(publicUrl){try{publicCatalog=await fetch(publicUrl,{cache:'no-store'}).then(r=>r.ok?r.json():null);}catch(_){publicCatalog=null;}}
  const safeScenes=Array.isArray(publicCatalog?.safe_scene_priority)&&publicCatalog.safe_scene_priority.length
    ?publicCatalog.safe_scene_priority
    :(Array.isArray(local.safe_scene_priority)?local.safe_scene_priority:[]);
  const catalog={...local,public:publicCatalog,safeScenes};
  runtime.latestCatalog=catalog;
  document.documentElement.dataset.latestPostZip=local.source||'user-zip';
  document.documentElement.dataset.latestPostZipBinary=local.binary_sync?.status||'unknown';
  document.documentElement.dataset.formalMediaApprovalBatch=local.approval_batch||'';
  window.dispatchEvent(new CustomEvent('xjw-latest-post-zip-ready',{detail:catalog}));
  return catalog;
};
const runtime={
  ...CONFIG,
  latestCatalog:null,
  semanticScore,
  chooseSourceCandidate:chooseSource,
  chooseBestCandidate:choosePublishable,
  resolveMedia,
  needsBinarySync:(copy,candidates)=>resolveMedia(copy,candidates).status==='needs_binary_sync',
  needsGeneration:(copy,candidates)=>resolveMedia(copy,candidates).status==='regenerate_if_missing',
  loadLatestZipCatalog
};
window.XJWFormalMediaPolicy=runtime;
document.documentElement.dataset.formalMediaPolicy=CONFIG.runtime;

function installNote(catalog){
  const host=document.querySelector('.publish-separation-note');
  if(!host||host.querySelector('[data-formal-media-policy-note]'))return;
  const source=String(catalog?.source||'最新使用者 ZIP');
  const count=Number(catalog?.candidate_count||0);
  const note=document.createElement('p');
  note.dataset.formalMediaPolicyNote='true';
  note.innerHTML=`<strong>貼文配圖最新原則：</strong>產品／試喝文案優先使用目前核准正式DM與 products-v3；生活情境文再比對 ${source}${count?`（${count}張唯一候選）`:''}，而且必須真的命中季節、情境、環境、冷熱、表情、動作或道具才算合格。若有合格 ZIP 圖但原圖尚未同步，標記「待同步原圖」，不亂換圖也不重生成；只有真的沒有合格來源才重新生成。任何生成或換圖都讓舊核准失效、回待審核並重新完成16項審核。`;
  host.appendChild(document.createElement('br'));
  host.appendChild(note);
}
window.addEventListener('DOMContentLoaded',()=>{
  loadLatestZipCatalog().then(installNote).catch(()=>installNote(null));
});
})();
