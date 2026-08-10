(()=>{
'use strict';
const CONFIG=Object.freeze({
  runtime:'20260810-formal-media-policy-v3-binary-aware',
  productAuthority:'products-v3-latest-original-product-photos',
  productSpecs:Object.freeze({
    guiluGao:'100g／罐',
    guiluDrink30:'30cc／罐（小玻璃罐、裸罐、無貼紙）',
    guiluDrink180:'180cc／包（鋁袋）',
    guiluTangkuai:'75g／盒｜8塊裝',
    guiluJiao:'600g／盒｜32塊裝',
    lurongFen:'75g／罐'
  }),
  latestZipCatalog:'/data/latest-user-post-zip.json',
  publicZipCatalog:'https://ts15825868.github.io/xianjiawei/data/post-library-userzip2-v20260810.json',
  imageSourcePriority:Object.freeze(['user_zip_approved','approved_existing','regenerate_if_missing']),
  regeneration:Object.freeze({invalidateApproval:true,invalidateSchedule:true,returnStatus:'pending_review',autoApprove:false,autoPublish:false,reviewItems:16}),
  hardReject:Object.freeze(['products-v2','ai-redrawn-product','wrong-30cc-container','wrong-180cc-package','collage','cropped-character','stretched-product','copy-image-mismatch'])
});

const normalize=s=>String(s||'').toLowerCase();
const rejected=c=>c?.rejected===true||c?.status==='rejected'||c?.product_redrawn===true;
const publishable=c=>c?.binary_ready===true&&/^https?:\/\//.test(String(c?.public_url||''));
const scoreCandidate=(copy,candidate)=>{
  const text=normalize(copy);
  const c=candidate||{};
  if(rejected(c))return -Infinity;
  let score=0;
  const source=normalize(c.source||c.origin||c.source_file||'');
  if(source.includes('zip')||source.includes('user')||c.source_file)score+=100;
  if(c.approved===true||c.status==='approved')score+=60;
  for(const keyword of Array.isArray(c.keywords)?c.keywords:[]){if(keyword&&text.includes(normalize(keyword)))score+=12;}
  const scene=normalize(c.scene||c.title||c.alt||c.id||'');
  for(const token of text.split(/[\s，。！？、；：,.!?;:]+/).filter(x=>x.length>=2))if(scene.includes(token))score+=2;
  return score;
};
const rank=(copy,candidates)=>{
  const list=Array.isArray(candidates)?candidates:[];
  return list.map(item=>({item,score:scoreCandidate(copy,item)})).filter(x=>Number.isFinite(x.score)&&x.score>0).sort((a,b)=>b.score-a.score);
};
const chooseSource=(copy,candidates)=>rank(copy,candidates)[0]?.item||null;
const choosePublishable=(copy,candidates)=>rank(copy,candidates).find(x=>publishable(x.item))?.item||null;
const resolveMedia=(copy,candidates)=>{
  const usable=choosePublishable(copy,candidates);
  if(usable)return{status:'approved_existing',candidate:usable,action:'use'};
  const source=chooseSource(copy,candidates);
  if(source)return{status:'needs_binary_sync',candidate:source,action:'sync_source_binary'};
  return{status:'regenerate_if_missing',candidate:null,action:'regenerate'};
};
const loadJson=async(url)=>{
  const response=await fetch(url,{cache:'no-store',credentials:'same-origin'});
  if(!response.ok)throw new Error(`media catalog ${response.status}`);
  return response.json();
};
const loadLatestZipCatalog=async()=>{
  const local=await loadJson(CONFIG.latestZipCatalog);
  let publicCatalog=null;
  try{publicCatalog=await fetch(CONFIG.publicZipCatalog,{cache:'no-store'}).then(r=>r.ok?r.json():null);}catch(_){publicCatalog=null;}
  const safeScenes=Array.isArray(publicCatalog?.safe_scene_priority)&&publicCatalog.safe_scene_priority.length
    ?publicCatalog.safe_scene_priority
    :(Array.isArray(local.safe_scene_priority)?local.safe_scene_priority:[]);
  const catalog={...local,public:publicCatalog,safeScenes};
  runtime.latestCatalog=catalog;
  document.documentElement.dataset.latestPostZip=local.source||'user-zip';
  document.documentElement.dataset.latestPostZipBinary=local.binary_sync?.status||'unknown';
  window.dispatchEvent(new CustomEvent('xjw-latest-post-zip-ready',{detail:catalog}));
  return catalog;
};
const runtime={
  ...CONFIG,
  latestCatalog:null,
  chooseSourceCandidate:chooseSource,
  chooseBestCandidate:choosePublishable,
  resolveMedia,
  needsBinarySync:(copy,candidates)=>resolveMedia(copy,candidates).status==='needs_binary_sync',
  needsGeneration:(copy,candidates)=>resolveMedia(copy,candidates).status==='regenerate_if_missing',
  loadLatestZipCatalog
};
window.XJWFormalMediaPolicy=runtime;
document.documentElement.dataset.formalMediaPolicy=CONFIG.runtime;

window.addEventListener('DOMContentLoaded',()=>{
  loadLatestZipCatalog().catch(()=>{});
  const host=document.querySelector('.publish-separation-note');
  if(!host||host.querySelector('[data-formal-media-policy-note]'))return;
  const note=document.createElement('p');
  note.dataset.formalMediaPolicyNote='true';
  note.innerHTML='<strong>貼文配圖最新原則：</strong>先比對最新使用者 ZIP；若有合格圖但原圖尚未同步，標記「待同步原圖」，不亂換圖也不重生成；只有真的沒有合格來源才重新生成。任何生成或換圖都回待審核並重新完成16項審核。產品本體只允許正式原圖，AI不得重畫。';
  host.appendChild(document.createElement('br'));
  host.appendChild(note);
});
})();
