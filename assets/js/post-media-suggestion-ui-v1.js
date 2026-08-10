(()=>{
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formCopy=form=>['title','headline','copy','category'].map(n=>form.elements?.[n]?.value||'').join(' ').trim();
const candidates=policy=>policy?.latestCatalog?.safeScenes||[];

function ensurePanel(form){
  let panel=form.querySelector('[data-media-suggestion-panel]');
  if(panel)return panel;
  panel=document.createElement('section');
  panel.dataset.mediaSuggestionPanel='true';
  panel.className='card';
  panel.style.margin='12px 0';
  panel.style.padding='14px';
  const imageField=form.querySelector('[name="image_url"]')?.closest('label,.field');
  if(imageField?.parentNode)imageField.parentNode.insertBefore(panel,imageField.nextSibling);
  else form.querySelector('.form-grid')?.appendChild(panel);
  return panel;
}

function applyCandidate(form,c){
  if(!c?.public_url)return;
  const url=form.elements?.image_url;
  const alt=form.elements?.image_alt;
  if(url){url.value=c.public_url;url.dispatchEvent(new Event('input',{bubbles:true}));url.dispatchEvent(new Event('change',{bubbles:true}));}
  if(alt&&!alt.value){alt.value=c.alt||c.title||c.id||'仙加味貼文圖片';alt.dispatchEvent(new Event('input',{bubbles:true}));}
}

function render(form){
  const policy=window.XJWFormalMediaPolicy;
  if(!policy?.resolveMedia)return;
  const panel=ensurePanel(form);
  const copy=formCopy(form);
  if(!copy){
    panel.innerHTML='<strong>依文案推薦圖片</strong><p class="muted">先輸入標題／文案，系統才會依季節、情境、冷熱、動作、道具與產品內容比對。</p>';
    return;
  }
  const result=policy.resolveMedia(copy,candidates(policy));
  const c=result?.candidate||null;
  if(result?.status==='approved_existing'&&c?.public_url){
    const authority=result.authority==='formal_product_media'?'正式產品DM／試喝圖':'最新ZIP合格圖';
    panel.innerHTML=`<strong>依文案推薦圖片｜可直接使用</strong><p class="muted">來源：${esc(authority)}。仍須完成16項圖文審核。</p><img src="${esc(c.public_url)}" alt="${esc(c.alt||c.title||'推薦圖片')}" style="display:block;width:100%;max-height:320px;object-fit:contain;border-radius:12px;background:#fff;margin:10px 0" loading="lazy"><button type="button" class="btn green" data-use-media-candidate>套用這張推薦圖</button>`;
    panel.querySelector('[data-use-media-candidate]')?.addEventListener('click',()=>applyCandidate(form,c),{once:true});
    return;
  }
  if(result?.status==='needs_binary_sync'&&c){
    panel.innerHTML=`<strong>依文案推薦圖片｜待同步原圖</strong><p>找到符合文案的 ZIP 素材：<code>${esc(c.source_file||c.id||'ZIP候選')}</code>。</p><p class="muted">目前原始圖片二進位尚未同步到公開網址，因此不會塞假路徑、不會誤用別張圖，也不會因為尚未同步就重生成。</p>`;
    return;
  }
  panel.innerHTML='<strong>依文案推薦圖片｜需要重新生成</strong><p>正式產品DM與最新 ZIP 都沒有找到足夠吻合的來源，才進重新生成。生成或換圖後會回到待審核，重新完成16項審核。</p>';
}

function enhance(form){
  if(!form||form.dataset.mediaSuggestionBound==='true')return;
  form.dataset.mediaSuggestionBound='true';
  let timer=0;
  const refresh=()=>{clearTimeout(timer);timer=setTimeout(()=>render(form),160);};
  form.addEventListener('input',e=>{if(['title','headline','copy','category'].includes(e.target?.name))refresh();});
  form.addEventListener('change',e=>{if(['title','headline','copy','category'].includes(e.target?.name))refresh();});
  const policy=window.XJWFormalMediaPolicy;
  const ready=policy?.latestCatalog?Promise.resolve():policy?.loadLatestZipCatalog?.().catch(()=>{});
  Promise.resolve(ready).finally(()=>render(form));
}

function scan(){document.querySelectorAll('#postForm').forEach(enhance);}
const observer=new MutationObserver(scan);
window.addEventListener('DOMContentLoaded',()=>{
  scan();
  const root=document.querySelector('#modalRoot')||document.body;
  observer.observe(root,{childList:true,subtree:true});
});
window.addEventListener('xjw-latest-post-zip-ready',scan);
})();
