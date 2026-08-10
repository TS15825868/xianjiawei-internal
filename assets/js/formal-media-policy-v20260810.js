(()=>{
'use strict';
const POLICY=Object.freeze({
  runtime:'20260810-formal-media-policy-v1',
  productAuthority:'products-v3-latest-original-product-photos',
  productSpecs:Object.freeze({
    guiluGao:'100g／罐',
    guiluDrink30:'30cc／罐（小玻璃罐、裸罐、無貼紙）',
    guiluDrink180:'180cc／包（鋁袋）',
    guiluTangkuai:'75g／盒｜8塊裝',
    guiluJiao:'600g／盒｜32塊裝',
    lurongFen:'75g／罐'
  }),
  imageSourcePriority:Object.freeze(['user_zip_approved','approved_existing','regenerate_if_missing']),
  regeneration:Object.freeze({invalidateApproval:true,invalidateSchedule:true,returnStatus:'pending_review',autoApprove:false,autoPublish:false,reviewItems:16}),
  hardReject:Object.freeze(['products-v2','ai-redrawn-product','wrong-30cc-container','wrong-180cc-package','collage','cropped-character','stretched-product','copy-image-mismatch'])
});
window.XJWFormalMediaPolicy=POLICY;
document.documentElement.dataset.formalMediaPolicy=POLICY.runtime;

const normalize=s=>String(s||'').toLowerCase();
const scoreCandidate=(copy,candidate)=>{
  const text=normalize(copy);
  const c=candidate||{};
  if(c.rejected===true||c.status==='rejected'||c.product_redrawn===true)return -Infinity;
  let score=0;
  const source=normalize(c.source||c.origin||'');
  if(source.includes('zip')||source.includes('user'))score+=100;
  if(c.approved===true||c.status==='approved')score+=60;
  for(const keyword of Array.isArray(c.keywords)?c.keywords:[]){if(keyword&&text.includes(normalize(keyword)))score+=12;}
  const scene=normalize(c.scene||c.title||c.alt||'');
  for(const token of text.split(/[\s，。！？、；：,.!?;:]+/).filter(x=>x.length>=2))if(scene.includes(token))score+=2;
  return score;
};
const choose=(copy,candidates)=>{
  const list=Array.isArray(candidates)?candidates:[];
  const ranked=list.map(item=>({item,score:scoreCandidate(copy,item)})).filter(x=>Number.isFinite(x.score)&&x.score>0).sort((a,b)=>b.score-a.score);
  return ranked[0]?.item||null;
};
window.XJWFormalMediaPolicy.chooseBestCandidate=choose;
window.XJWFormalMediaPolicy.needsGeneration=(copy,candidates)=>!choose(copy,candidates);

window.addEventListener('DOMContentLoaded',()=>{
  const host=document.querySelector('.publish-separation-note');
  if(!host||host.querySelector('[data-formal-media-policy-note]'))return;
  const note=document.createElement('p');
  note.dataset.formalMediaPolicyNote='true';
  note.innerHTML='<strong>貼文配圖最新原則：</strong>先使用最新使用者 ZIP 素材依文案情境比對；沒有合格圖才重新生成。圖不符不得硬配，生成或修改後一律回待審核並重新完成16項審核。產品本體只允許正式原圖，AI不得重畫。';
  host.appendChild(document.createElement('br'));
  host.appendChild(note);
});
})();
