(()=>{
  'use strict';
  const VERSION='2026-08-09-single-system-generation-policy-v1';
  const SITE='https://ts15825868.github.io/xianjiawei/';
  const OFFICIAL=Object.freeze({
    '龜鹿膏100g':`${SITE}images/products-v3/guilu-gao.jpg`,
    '龜鹿飲30cc玻璃罐':`${SITE}images/products-v3/guilu-drink-30.jpg`,
    '龜鹿飲180cc鋁袋':`${SITE}images/products-v3/guilu-drink-180.jpg`,
    '龜鹿湯塊75g':`${SITE}images/products-v3/guilu-tangkuai.jpg`,
    '龜鹿膠600g':`${SITE}images/products-v3/guilu-jiao.jpg`,
    '鹿茸粉75g':`${SITE}images/products-v3/luerong-fen.jpg`
  });
  const PRODUCT_URLS=Object.entries(OFFICIAL).map(([name,url])=>`${name}：${url}`).join('\n');
  const HARD_RULES=`【仙加味圖片與文案唯一正式規格】\n\n一、視覺總原則\n- 每張只能是一個完整、自然、統一光影與透視的單一場景。\n- 禁止拼貼、拼版、六格、海報疊海報、卡片堆疊、產品裁片硬貼、角色裁片硬貼、黑色補位、不同畫風素材混搭。\n- 不為了塞版面把多個產品強制做成一樣大；沒有可信相對尺寸時改成單品構圖。\n- 圖片與文案的季節、天氣、地點、場合、環境、冷熱、表情、動作必須一致。\n\n二、產品本體\n- AI絕對不得重畫、改造、補畫、變形仙加味產品。\n- 產品只能使用下列 products-v3 正式實拍原圖，完整等比例呈現，不裁切、不拉寬、不拉高、不改標籤、不改包裝。\n${PRODUCT_URLS}\n- 若目前無法安全讀取或合成正式實拍，寧可生成「不含產品本體」的完整場景並預留乾淨產品位置，也不得虛構產品。\n- 多產品同框若無法維持真實比例，拆成不同貼文，不做拼貼式全系列。\n\n三、正式產品與規格只有六項\n1. 龜鹿膏：100g／罐。\n2. 龜鹿飲30cc玻璃罐：30cc／罐（小玻璃罐）。\n3. 龜鹿飲180cc鋁袋：180cc／包（鋁袋）。\n4. 龜鹿湯塊：75g／盒｜8塊裝｜每塊約9.375g。\n5. 龜鹿膠：600g（1斤）／盒｜32塊裝｜每塊約18.75g。\n6. 鹿茸粉：75g／罐。\n不得新增、猜測或沿用舊規格。\n\n四、產品比例硬規則\n- 30cc：小玻璃裸罐、金色蓋、無貼紙、無外盒、無外袋；約Ø42×H51mm；不可叫瓶、不可放大成100g罐大小。\n- 100g龜鹿膏：約寬51×高78mm；正式罐型與標籤比例固定。\n- 180cc：狹長直立鋁袋，寬高比約0.64，可接受約0.60～0.68；不可拉胖、不可誇張放大。\n- 湯塊75g、龜鹿膠600g、鹿茸粉75g沒有可信毫米尺寸，不得自行猜；只維持正式原圖盒型／罐型比例。\n\n五、小老闆與角色\n- 使用仙加味官網正式同款Q版小老闆：圓臉、大而圓深棕眼、短黑髮、米白中式上衣、深橄欖綠圍裙、胸前紅色直式「仙加味」印章。\n- 頭、頭髮、雙手、雙腳與持物完整，不可裁切，四周保留安全空間。\n- 小鹿與小烏龜需要時才加入，必須分開的獨立角色；不可拿LINE OA裁切素材當社群貼文角色。\n\n六、文案與法規\n- 繁體中文；現代漢方生活品牌語氣，日常飲食、生活節奏、料理搭配為主。\n- 不做療效、治療、改善、治癒、保證等宣稱。\n- 品牌只顯示「仙加味」。\n- 文案提到產品、成分、規格、使用方式、價格或活動時必須使用目前正式版本，不可自行補資料。\n\n七、流程\n- 新文案與新圖一律只作 candidate／待審核。\n- 不得因生成完成就自動核准、排程或發布。\n- 生成後必須重新完成16項圖文審核。`;

  const escText=(value='')=>String(value||'').trim();
  function cardInfo(card){
    return {
      title:escText(card?.querySelector('.xjw-row-head h3')?.textContent)||'仙加味貼文',
      copy:escText(card?.querySelector('.xjw-copy')?.textContent),
      image:escText(card?.querySelector('.xjw-image-preview')?.getAttribute('src'))
    };
  }
  function promptFor(mode,card){
    const p=cardInfo(card);
    const common=`\n\n目前標題：${p.title}\n目前文案：${p.copy||'（無）'}\n目前圖片：${p.image||'（無／需重新生成）'}\n\n${HARD_RULES}`;
    if(mode==='copy') return `請重新撰寫這篇仙加味社群貼文文案。保留原主題與正確產品事實，但文字重新組織；自然、精簡、有生活感。不要生成圖片。${common}\n\n只輸出：新標題、新正文、建議分類、建議圖片情境摘要。`;
    if(mode==='all') return `請把這篇仙加味社群貼文的「文案＋圖片」整套重新製作。先重寫文案，再直接使用圖像生成能力產出一張待審核主圖。舊圖不要沿用，也不要做拼貼。${common}\n\n圖片必須是1:1單一完整場景；若需要產品，只能使用products-v3正式實拍等比例融入同一場景；若無法安全合成正式實拍，改生成不含產品本體的完整情境圖並預留乾淨位置，絕對不要AI重畫產品。完成後仍是待審核。`;
    return `請直接使用圖像生成能力，為這篇仙加味社群貼文重新製作一張「待審核候選主圖」。不要只回提示詞或製圖步驟。${common}\n\n先判斷文案是否需要產品；不需要就不要硬塞。需要產品時只能使用products-v3正式實拍完整等比例融入單一場景。禁止任何拼貼式構圖。若無法安全使用正式產品原圖，就生成不含產品的完整情境圖並預留乾淨位置，不能虛構產品。輸出1:1社群主圖，完成後仍須16項人工審核。`;
  }
  function copy(text){
    if(navigator.clipboard?.writeText)return navigator.clipboard.writeText(text).catch(()=>fallback(text));
    return fallback(text);
  }
  function fallback(text){
    const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();return Promise.resolve();
  }
  function toast(message,error=false){
    const root=document.getElementById('toastRoot');if(!root)return;
    const node=document.createElement('div');node.className=`toast ${error?'error':''}`;node.textContent=message;root.appendChild(node);setTimeout(()=>node.remove(),4200);
  }
  async function launch(mode,card){
    const prompt=promptFor(mode,card);
    await copy(prompt);
    toast('已套用仙加味正式生成規格：禁止拼湊、產品不得AI重畫。正在開啟 ChatGPT。');
    window.open(`https://chatgpt.com/?q=${encodeURIComponent(prompt)}`,'_blank','noopener');
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-xjw-regenerate]');
    if(!button)return;
    const card=button.closest('.xjw-row,.publish-card');
    if(!card||card.dataset.status==='published'||card.dataset.locked==='true')return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    launch(button.dataset.xjwRegenerate||'image',card).catch(error=>toast(error?.message||String(error),true));
  },true);
  window.XJWGenerationPolicy=Object.freeze({version:VERSION,officialProducts:OFFICIAL,hardRules:HARD_RULES,promptFor});
})();
