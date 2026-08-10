(()=>{
'use strict';
const VERSION='20260810-zip-media-assistant-v1';
const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const postId=card=>card?.querySelector('[data-post-view]')?.getAttribute('data-post-view')||'';
const copyOf=card=>[card?.querySelector('h3')?.textContent||'',card?.querySelector('h4')?.textContent||'',card?.querySelector('.xjw-copy')?.textContent||'',card?.querySelector('.eyebrow')?.textContent||''].join(' ');
const catalogScenes=()=>window.XJWFormalMediaPolicy?.latestCatalog?.safeScenes||[];
function decision(card){
  const policy=window.XJWFormalMediaPolicy;
  if(!policy?.resolveMedia)return null;
  return policy.resolveMedia(copyOf(card),catalogScenes());
}
function label(result){
  if(!result)return{kind:'neutral',text:'最新 ZIP 配圖資料載入中…'};
  if(result.status==='approved_existing')return{kind:'ok',text:`ZIP 已找到可直接使用的合格圖：${result.candidate?.id||result.candidate?.source_file||'候選圖'}`};
  if(result.status==='needs_binary_sync')return{kind:'warning',text:`ZIP 已找到符合文案的原圖：${result.candidate?.id||result.candidate?.source_file||'候選圖'}｜目前只差原圖同步，不應亂換圖或重生成。`};
  return{kind:'danger',text:'最新 ZIP 找不到合格對應圖｜這種情況才進重新生成。'};
}
function renderCard(card){
  if(!card)return;
  card.querySelector('[data-zip-media-assistant]')?.remove();
  const result=decision(card),meta=label(result),id=postId(card);
  const node=document.createElement('div');
  node.dataset.zipMediaAssistant=VERSION;
  node.className=`xjw-${meta.kind==='neutral'?'warning':meta.kind}`;
  node.innerHTML=`<strong>最新 ZIP 配圖判斷：</strong>${esc(meta.text)}`;
  if(result?.status==='approved_existing'&&result.candidate?.public_url&&id){
    const button=document.createElement('button');
    button.type='button';button.className='btn small green';button.textContent='套用 ZIP 合格圖';
    button.addEventListener('click',async()=>{
      button.disabled=true;const old=button.textContent;button.textContent='套用中…';
      try{
        const response=await fetch(`/api/posts/${encodeURIComponent(id)}`,{method:'PATCH',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({image_url:result.candidate.public_url,image_alt:result.candidate.alt||result.candidate.title||result.candidate.id||'仙加味貼文情境圖',image_source:`user_zip_approved｜${result.candidate.source_file||result.candidate.id||''}`,image_quality_status:'ok'})});
        const data=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(data.error||data.detail||`HTTP ${response.status}`);
        window.dispatchEvent(new CustomEvent('xjw-post-imported',{detail:{id,source:'user_zip_approved'}}));
      }catch(error){alert(error.message||String(error));button.disabled=false;button.textContent=old;}
    });
    node.appendChild(document.createTextNode(' '));node.appendChild(button);
  }
  const actions=card.querySelector('.xjw-actions');
  (actions||card).before?.(node);
  if(!actions)card.appendChild(node);
}
function render(){document.querySelectorAll('.publish-card').forEach(renderCard);document.documentElement.dataset.zipMediaAssistant=VERSION;}
window.addEventListener('xjw-latest-post-zip-ready',render);
document.addEventListener('xjw-publishing-list-rendered',render);
window.addEventListener('DOMContentLoaded',()=>setTimeout(render,0));
window.XJWZipMediaAssistant=Object.freeze({version:VERSION,render,decision});
})();
