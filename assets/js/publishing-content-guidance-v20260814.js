(()=>{
  const VERSION='20260814-content-guidance-v2';
  const TOPIC_URL='/assets/data/guilu-content-topic-bank-v20260814.json?v='+VERSION;
  const LEGACY_BRAND=['台興山產・仙加味','台興山產有限公司','台興山產'];
  const REJECTED=['不是每個人都一定需要'];
  const RISKY=['治療','治癒','療效','改善疾病','預防疾病','保證功效','保證改善','藥到病除','關節','卡卡','疲勞','精神不濟','補氣','生津','膠原蛋白','鈣質'];
  let topics=[];

  const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function toast(message,error=false){
    const root=document.getElementById('toastRoot');
    if(!root){if(error)alert(message);return;}
    const n=document.createElement('div');n.className=`toast ${error?'error':''}`;n.textContent=message;root.appendChild(n);setTimeout(()=>n.remove(),4200);
  }
  function scan(value=''){
    const text=String(value||''),errors=[];
    if(LEGACY_BRAND.some(x=>text.includes(x)))errors.push('對外品牌名稱只使用「仙加味」');
    if(REJECTED.some(x=>text.includes(x)))errors.push('此品牌定位句已停用，請改用正向生活情境或文化敘事');
    if(RISKY.some(x=>text.includes(x)))errors.push('含不適合食品公開內容的功效／健康宣稱，請改用飲食文化、產品型態、原料、工序、料理或一般使用情境');
    if(/30cc／瓶|30\s*cc\s*瓶裝|龜鹿飲30cc玻璃瓶/.test(text))errors.push('30cc正式單位為「罐」，名稱使用「龜鹿飲30cc玻璃罐」');
    return[...new Set(errors)];
  }
  function formText(form){return['title','headline','copy','category'].map(name=>form.elements[name]?.value||'').join(' ')}
  function guidanceBox(form){
    let box=form.querySelector('[data-content-guidance]');
    if(box)return box;
    box=document.createElement('div');box.dataset.contentGuidance='1';box.className='xjw-warning';box.style.margin='10px 0 0';
    const copy=form.elements.copy?.closest('.field');
    copy?.insertAdjacentElement('afterend',box);
    return box;
  }
  function updateGuidance(form){
    const box=guidanceBox(form),errors=scan(formText(form));
    if(!box)return errors;
    if(errors.length){box.textContent='文案檢查：'+errors.join('；');box.dataset.level='warning';}
    else{box.textContent='文案方向正常：對外只使用仙加味；龜鹿主題以飲食文化、產品型態、生活情境、工序、料理與一般使用為主。';box.dataset.level='ok';}
    return errors;
  }
  function bindForm(form){
    if(!form||form.dataset.contentGuidanceReady)return;
    form.dataset.contentGuidanceReady='1';
    ['title','headline','copy','category'].forEach(name=>form.elements[name]?.addEventListener('input',()=>updateGuidance(form)));
    form.addEventListener('submit',event=>{
      const errors=updateGuidance(form);
      if(!errors.length)return;
      event.preventDefault();event.stopImmediatePropagation();
      toast('文案尚有需要修正的項目，請先看文案檢查提醒。',true);
    },true);
    updateGuidance(form);
  }
  function waitForForm(callback,attempt=0){
    const form=document.getElementById('postForm');
    if(form){bindForm(form);callback?.(form);return;}
    if(attempt<20)setTimeout(()=>waitForForm(callback,attempt+1),60);
  }
  function applyTopic(topic){
    document.querySelector('[data-topic-modal]')?.remove();
    document.querySelector('[data-add-post]')?.click();
    waitForForm(form=>{
      if(form.elements.title)form.elements.title.value=topic.title||'';
      if(form.elements.headline)form.elements.headline.value=topic.headline||'';
      if(form.elements.copy)form.elements.copy.value=topic.copy||'';
      if(form.elements.category)form.elements.category.value=topic.category||'龜鹿入門';
      if(topic.imageUrl&&form.elements.image_url)form.elements.image_url.value=topic.imageUrl;
      if(topic.imageAlt&&form.elements.image_alt)form.elements.image_alt.value=topic.imageAlt;
      updateGuidance(form);
      form.elements.title?.focus();
      toast(topic.imageUrl?'已帶入龜鹿題目與目前正式圖片；儲存後仍需完成圖文審核。':'已帶入龜鹿題目；此題需依文案配對既有情境圖或重新生成後再送審。');
    });
  }
  function openTopics(){
    document.querySelector('[data-topic-modal]')?.remove();
    const root=document.createElement('div');root.className='xjw-modal';root.dataset.topicModal='1';
    const ready=topics.filter(topic=>topic.seedToReview===true).length;
    root.innerHTML=`<div class="xjw-modal-bg" data-topic-close></div><div class="xjw-modal-card"><p class="eyebrow">仙加味・內容題庫</p><h2>龜鹿長青主題</h2><p class="muted">共 ${topics.length} 題；其中 ${ready} 題已有可安全沿用的正式圖片。其餘題目不硬湊產品圖，需配對既有情境圖或重新生成。</p><div style="display:grid;gap:10px;max-height:60vh;overflow:auto">${topics.map((topic,index)=>`<button type="button" class="btn" data-topic-index="${index}" style="white-space:normal;text-align:left;height:auto;padding:12px 14px"><strong>${esc(topic.title)}</strong><br><small>${esc(topic.headline||'')}</small><br><small>${topic.seedToReview===true?'✓ 已有正式圖，可送審':'○ 需配對情境圖'}</small></button>`).join('')}</div><div class="xjw-modal-footer"><button type="button" class="btn" data-topic-close>關閉</button></div></div>`;
    document.body.appendChild(root);
    root.querySelectorAll('[data-topic-close]').forEach(n=>n.addEventListener('click',()=>root.remove()));
    root.querySelectorAll('[data-topic-index]').forEach(n=>n.addEventListener('click',()=>applyTopic(topics[Number(n.dataset.topicIndex)])));
  }
  function installButton(){
    const actions=document.querySelector('.publish-header-actions');
    if(!actions)return;
    let button=actions.querySelector('[data-topic-bank]');
    if(!button){
      button=document.createElement('button');button.className='btn';button.type='button';button.dataset.topicBank='1';
      const add=actions.querySelector('[data-add-post]');if(add)actions.insertBefore(button,add);else actions.appendChild(button);
      button.addEventListener('click',openTopics);
    }
    button.textContent=topics.length?`龜鹿題庫（${topics.length}）`:'龜鹿題庫';
  }
  async function loadTopics(){
    try{
      const response=await fetch(TOPIC_URL,{cache:'no-store'});if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const data=await response.json();topics=Array.isArray(data?.topics)?data.topics:[];
      installButton();
    }catch(error){console.warn('龜鹿題庫載入失敗',error);}
  }
  function enhance(){installButton();waitForForm();}
  document.addEventListener('click',event=>{if(event.target.closest('[data-add-post],[data-post-edit]'))setTimeout(()=>waitForForm(),80)},true);
  new MutationObserver(enhance).observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{loadTopics();enhance()},{once:true});else{loadTopics();enhance()}
  window.XJWPublishingContentGuidance=Object.freeze({version:VERSION,scan,get topics(){return topics}});
})();
