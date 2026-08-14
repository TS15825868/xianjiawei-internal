(()=>{
  'use strict';
  const VERSION='2026-08-15-regenerate-buttons-v2-missing-image-aware';
  function locked(card){
    const status=String(card?.dataset?.status||'');
    const text=String(card?.textContent||'').replace(/\s+/g,' ');
    return status==='published'||status==='archived'||card?.dataset?.locked==='true'||/已發布鎖定|published_final_locked/.test(text);
  }
  function addButton(actions,mode,label,className='btn small'){
    const existing=actions.querySelector(`[data-xjw-regenerate="${mode}"]`);
    if(existing){existing.textContent=label;existing.className=className;return existing;}
    const button=document.createElement('button');
    button.type='button';button.className=className;button.dataset.xjwRegenerate=mode;button.textContent=label;
    actions.appendChild(button);return button;
  }
  function missingImage(card){
    const preview=card?.querySelector('.xjw-image-preview');
    const src=String(preview?.getAttribute('src')||'').trim();
    return !src;
  }
  function enhance(root=document){
    const cards=[];
    if(root?.matches?.('.xjw-row,.publish-card'))cards.push(root);
    root?.querySelectorAll?.('.xjw-row,.publish-card').forEach(card=>cards.push(card));
    [...new Set(cards)].forEach(card=>{
      const actions=card.querySelector('.xjw-actions');if(!actions)return;
      if(locked(card)){actions.querySelectorAll('[data-xjw-regenerate]').forEach(node=>node.remove());return;}
      if(actions.dataset.xjwRegenerateButtons===VERSION)return;
      addButton(actions,'image',missingImage(card)?'缺圖｜ChatGPT生成':'圖不符合｜ChatGPT重生成','btn small orange');
      addButton(actions,'copy','文案不符合｜ChatGPT重生成');
      addButton(actions,'all','全部重新生成','btn small orange');
      actions.dataset.xjwRegenerateButtons=VERSION;
    });
  }
  const observer=new MutationObserver(mutations=>{for(const mutation of mutations)for(const node of mutation.addedNodes)if(node?.nodeType===1)enhance(node)});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>enhance(),{once:true});else enhance();
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('xjw-publishing-list-rendered',()=>enhance());
  window.XJWPostRegenerateButtons=Object.freeze({version:VERSION});
})();
