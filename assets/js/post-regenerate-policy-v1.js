(()=>{
  'use strict';
  const VERSION='2026-08-10-single-system-generation-policy-v4-latest-originals';
  const SITE='https://ts15825868.github.io/xianjiawei/';
  const PRODUCT_IMAGE_VERSION='20260810-products-v3-latest-originals-v3';
  const STORAGE_PREFIX='xjw-regeneration:';
  const nativeFetch=window.fetch.bind(window);
  const OFFICIAL=Object.freeze({
    '龜鹿膏100g':`${SITE}images/products-v3/guilu-gao.jpg?v=${PRODUCT_IMAGE_VERSION}`,
    '龜鹿飲30cc玻璃罐':`${SITE}images/products-v3/guilu-drink-30.jpg?v=${PRODUCT_IMAGE_VERSION}`,
    '龜鹿飲180cc鋁袋':`${SITE}images/products-v3/guilu-drink-180.jpg?v=${PRODUCT_IMAGE_VERSION}`,
    '龜鹿湯塊75g':`${SITE}images/products-v3/guilu-tangkuai.jpg?v=${PRODUCT_IMAGE_VERSION}`,
    '龜鹿膠600g':`${SITE}images/products-v3/guilu-jiao.jpg?v=${PRODUCT_IMAGE_VERSION}`,
    '鹿茸粉75g':`${SITE}images/products-v3/luerong-fen.jpg?v=${PRODUCT_IMAGE_VERSION}`
  });
  const PRODUCT_URLS=Object.entries(OFFICIAL).map(([name,url])=>`${name}：${url}`).join('\n');
  const HARD_RULES=`【仙加味圖片與文案唯一正式規格】\n\n一、視覺總原則\n- 每張只能是一個完整、自然、統一光影與透視的單一場景。\n- 禁止拼貼、拼版、六格、海報疊海報、卡片堆疊、產品裁片硬貼、角色裁片硬貼、黑色補位、不同畫風素材混搭。\n- 不為了塞版面把多個產品強制做成一樣大；沒有可信相對尺寸時改成單品構圖。\n- 圖片與文案的季節、天氣、地點、場合、環境、冷熱、表情、動作必須一致。\n\n二、產品本體\n- AI絕對不得重畫、改造、補畫、變形仙加味產品。\n- 產品只能使用下列 products-v3 最新正式實拍原圖，完整等比例呈現，不裁切、不拉寬、不拉高、不改標籤、不改包裝。\n${PRODUCT_URLS}\n- 若目前無法安全讀取或合成正式實拍，寧可生成「不含產品本體」的完整場景並預留乾淨產品位置，也不得虛構產品。\n- 多產品同框若無法維持真實比例，拆成不同貼文，不做拼貼式全系列。\n\n三、正式產品與規格只有六項\n1. 龜鹿膏：100g／罐。\n2. 龜鹿飲30cc玻璃罐：30cc／罐（小玻璃罐）。\n3. 龜鹿飲180cc鋁袋：180cc／包（鋁袋）。\n4. 龜鹿湯塊：75g／盒｜8塊裝｜每塊約9.375g。\n5. 龜鹿膠：600g（1斤）／盒｜32塊裝｜每塊約18.75g。\n6. 鹿茸粉：75g／罐。\n不得新增、猜測或沿用舊規格。\n\n四、產品比例硬規則\n- 30cc：小玻璃裸罐、金色蓋、無貼紙、無外盒、無外袋；約Ø42×H51mm；不可叫瓶、不可放大成100g罐大小。\n- 100g龜鹿膏：約寬51×高78mm；正式罐型與標籤比例固定。\n- 180cc：狹長直立鋁袋，寬高比約0.64，可接受約0.60～0.68；不可拉胖、不可誇張放大。\n- 湯塊75g、龜鹿膠600g、鹿茸粉75g沒有可信毫米尺寸，不得自行猜；只維持正式原圖盒型／罐型比例。\n\n五、小老闆與角色\n- 使用仙加味官網正式同款Q版小老闆：圓臉、大而圓深棕眼、短黑髮、米白中式上衣、深橄欖綠圍裙、胸前紅色直式「仙加味」印章。\n- 頭、頭髮、雙手、雙腳與持物完整，不可裁切，四周保留安全空間。\n- 小鹿與小烏龜需要時才加入，必須分開的獨立角色；不可拿LINE OA裁切素材當社群貼文角色。\n\n六、文案與法規\n- 繁體中文；現代漢方生活品牌語氣，日常飲食、生活節奏、料理搭配為主。\n- 不做療效、治療、改善、治癒、保證等宣稱。\n- 品牌只顯示「仙加味」。\n- 文案提到產品、成分、規格、使用方式、價格或活動時必須使用目前正式版本，不可自行補資料。\n\n七、流程\n- 新文案與新圖一律只作 candidate／待審核。\n- 不得因生成完成就自動核准、排程或發布。\n- 生成後回仙加味貼文系統，按同一張卡片的「生成後回填／上傳」，貼上新文案或上傳新圖片；儲存後系統自動送回待審核。\n- 生成後必須重新完成16項圖文審核。`;

  const escText=(value='')=>String(value||'').trim();
  function cardInfo(card){return{title:escText(card?.querySelector('.xjw-row-head h3')?.textContent)||'仙加味貼文',copy:escText(card?.querySelector('.xjw-copy')?.textContent),image:escText(card?.querySelector('.xjw-image-preview')?.getAttribute('src'))}}
  function postId(card){const button=card?.querySelector('[data-post-view],[data-post-edit]');return escText(button?.dataset?.postView||button?.dataset?.postEdit)}
  function promptFor(mode,card){
    const p=cardInfo(card);
    const common=`\n\n目前標題：${p.title}\n目前文案：${p.copy||'（無）'}\n目前圖片：${p.image||'（無／需重新生成）'}\n\n${HARD_RULES}`;
    const back='\n\n完成後請回到仙加味貼文審核系統，在原貼文卡片按「生成後回填／上傳」，把新文案貼回或把生成圖片從手機／平板／電腦上傳；儲存後系統會自動改成待審核，不會自動發布。';
    if(mode==='copy')return`請重新撰寫這篇仙加味社群貼文文案。保留原主題與正確產品事實，但文字重新組織；自然、精簡、有生活感。不要生成圖片。${common}\n\n只輸出：新標題、新正文、建議分類、建議圖片情境摘要。${back}`;
    if(mode==='all')return`請把這篇仙加味社群貼文的「文案＋圖片」整套重新製作。先重寫文案，再直接使用圖像生成能力產出一張待審核主圖。舊圖不要沿用，也不要做拼貼。${common}\n\n圖片必須是1:1單一完整場景；若需要產品，只能使用products-v3最新正式實拍等比例融入同一場景；若無法安全合成正式實拍，改生成不含產品本體的完整情境圖並預留乾淨位置，絕對不要AI重畫產品。完成後仍是待審核。${back}`;
    return`請直接使用圖像生成能力，為這篇仙加味社群貼文重新製作一張「待審核候選主圖」。不要只回提示詞或製圖步驟。${common}\n\n先判斷文案是否需要產品；不需要就不要硬塞。需要產品時只能使用products-v3最新正式實拍完整等比例融入單一場景。禁止任何拼貼式構圖。若無法安全使用正式產品原圖，就生成不含產品的完整情境圖並預留乾淨位置，不能虛構產品。輸出1:1社群主圖，完成後仍須16項人工審核。${back}`;
  }
  function copy(text){if(navigator.clipboard?.writeText)return navigator.clipboard.writeText(text).catch(()=>fallback(text));return fallback(text)}
  function fallback(text){const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();return Promise.resolve()}
  function toast(message,error=false){const root=document.getElementById('toastRoot');if(!root)return;const node=document.createElement('div');node.className=`toast ${error?'error':''}`;node.textContent=message;root.appendChild(node);setTimeout(()=>node.remove(),5200)}
  function key(id){return`${STORAGE_PREFIX}${id}`}
  function remember(id,mode){try{localStorage.setItem(key(id),JSON.stringify({mode,startedAt:new Date().toISOString(),version:VERSION}))}catch{}}
  function recalled(id){try{const raw=localStorage.getItem(key(id));return raw?JSON.parse(raw):null}catch{return null}}
  function forget(id){try{localStorage.removeItem(key(id))}catch{}}
  async function jsonRequest(path,body){const response=await nativeFetch(path,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify(body||{})});const raw=await response.text();let data={};try{data=raw?JSON.parse(raw):{}}catch{}if(!response.ok)throw new Error(data.error||`系統操作失敗（HTTP ${response.status}）`);return data}
  async function beginRegeneration(id,mode){const data=await jsonRequest(`/api/posts/${encodeURIComponent(id)}/regeneration-start`,{mode});remember(id,mode);return data}
  async function markReady(id,mode){const data=await jsonRequest(`/api/posts/${encodeURIComponent(id)}/regeneration-ready`,{mode});forget(id);document.dispatchEvent(new CustomEvent('xjw-regeneration-ready',{detail:{id,mode,data}}));toast('新文案／圖片已自動送回「待審核」，請重新完成16項圖文審核。');return data}
  function chatPlaceholder(){
    let tab=null;
    try{tab=window.open('about:blank','_blank');if(tab){try{tab.opener=null;tab.document.title='仙加味｜準備重新生成';tab.document.body.innerHTML='<p style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:24px">正在準備仙加味重新生成…</p>'}catch{}}}catch{}
    return tab;
  }
  async function launch(mode,card){
    const id=postId(card);if(!id)throw new Error('找不到貼文 ID，請重新整理後再試。');
    const tab=chatPlaceholder();
    try{
      await beginRegeneration(id,mode);
      const prompt=promptFor(mode,card);await copy(prompt);enhanceReturnButtons();
      const target=`https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
      if(tab&&!tab.closed){try{tab.location.replace(target)}catch{tab.location.href=target}}
      else toast('瀏覽器阻擋了新分頁；正式生成指令已複製，請手動開啟 ChatGPT 貼上即可。',true);
      toast('舊核准與排程已撤銷；生成後回此卡按「生成後回填／上傳」。');
    }catch(error){try{if(tab&&!tab.closed)tab.close()}catch{}throw error}
  }
  async function openReturnEditor(card){
    const id=postId(card);if(!id)throw new Error('找不到貼文 ID，請重新整理後再試。');
    const marker=recalled(id),mode=['image','copy','all'].includes(marker?.mode)?marker.mode:'all';
    await beginRegeneration(id,mode);
    const edit=card.querySelector('[data-post-edit]');if(!edit)throw new Error('目前沒有可編輯入口，請重新整理後再試。');
    toast('請貼上新文案或使用「從手機／平板／電腦上傳圖片」。儲存後會自動進入待審核。');edit.click();
  }
  function enhanceReturnButtons(root=document){
    const cards=[];if(root?.matches?.('.xjw-row,.publish-card'))cards.push(root);root?.querySelectorAll?.('.xjw-row,.publish-card').forEach(card=>cards.push(card));
    [...new Set(cards)].forEach(card=>{if(card.dataset.status==='published'||card.dataset.locked==='true')return;const id=postId(card),actions=card.querySelector('.xjw-actions');if(!id||!actions||actions.querySelector('[data-xjw-regeneration-return]'))return;const button=document.createElement('button');button.type='button';button.className='btn small green';button.dataset.xjwRegenerationReturn=id;button.textContent=recalled(id)?'生成後回填／上傳｜待送審':'回填新文案／圖片';actions.appendChild(button)})
  }

  window.fetch=async function xjwGenerationAwareFetch(input,init={}){
    const response=await nativeFetch(input,init);
    try{
      const url=typeof input==='string'?new URL(input,location.href):new URL(input?.url||'',location.href),method=String(init?.method||'GET').toUpperCase(),match=url.pathname.match(/^\/api\/posts\/([^/]+)$/);
      if(response.ok&&match&&['PUT','PATCH'].includes(method)){
        const id=decodeURIComponent(match[1]),marker=recalled(id);
        if(marker){try{await markReady(id,marker.mode||'all')}catch(error){toast(`貼文已儲存，但自動送回待審核失敗：${error.message||error}。請保留此頁並再按一次「生成後回填／上傳」。`,true)}}
      }
    }catch{}
    return response;
  };

  document.addEventListener('click',event=>{
    const returnButton=event.target.closest('[data-xjw-regeneration-return]');
    if(returnButton){const card=returnButton.closest('.xjw-row,.publish-card');if(!card)return;event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();openReturnEditor(card).catch(error=>toast(error?.message||String(error),true));return}
    const button=event.target.closest('[data-xjw-regenerate]');if(!button)return;
    const card=button.closest('.xjw-row,.publish-card');if(!card||card.dataset.status==='published'||card.dataset.locked==='true')return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();launch(button.dataset.xjwRegenerate||'image',card).catch(error=>toast(error?.message||String(error),true));
  },true);

  const observer=new MutationObserver(mutations=>{for(const mutation of mutations)for(const node of mutation.addedNodes)if(node?.nodeType===1)enhanceReturnButtons(node)});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>enhanceReturnButtons());else enhanceReturnButtons();
  observer.observe(document.documentElement,{childList:true,subtree:true});document.addEventListener('xjw-publishing-list-rendered',()=>enhanceReturnButtons());
  window.XJWGenerationPolicy=Object.freeze({version:VERSION,productImageVersion:PRODUCT_IMAGE_VERSION,officialProducts:OFFICIAL,hardRules:HARD_RULES,promptFor,beginRegeneration,markReady});
})();