(()=>{
  const SITE='https://ts15825868.github.io/xianjiawei/';
  const PRODUCT_IMAGES=Object.freeze({
    'guilu-gao':`${SITE}images/products-v3/guilu-gao.jpg?v=20260809-25`,
    'guilu-drink-30':`${SITE}images/products-v3/guilu-drink-30.jpg?v=20260809-25`,
    'guilu-drink-180':`${SITE}images/products-v3/guilu-drink-180.jpg?v=20260809-25`,
    'guilu-tangkuai':`${SITE}images/products-v3/guilu-tangkuai.jpg?v=20260809-25`,
    'guilu-jiao':`${SITE}images/products-v3/guilu-jiao.jpg?v=20260809-25`,
    'luerong-fen':`${SITE}images/products-v3/luerong-fen.jpg?v=20260809-25`
  });
  const PRODUCT_IMAGE_BLOCK=Object.entries(PRODUCT_IMAGES).map(([id,url])=>`${id}: ${url}`).join('\n');
  const RULES=`品牌只顯示「仙加味」，不可出現台興山產有限公司、統編、公司電話或公司地址。\n文案以日常飲食、生活節奏、料理搭配為主，不談療效、不強迫推銷。\n\n固定角色：只使用官網 images/brand/approved-v405/ 同款柔和立體Q版小老闆；圓臉、大而圓的深棕色眼睛、短黑髮、米白中式上衣、深橄欖綠圍裙、胸前紅色直式「仙加味」印章。姿勢可以依文案自由變化，但臉型、髮型、服裝與畫風不可改。頭、頭髮、雙手、雙腳與持物必須完整，四周至少保留約8%安全空間；不得裁切LINE OA專用圖，不得使用cover、slice或clipPath強制聚焦。小鹿與小烏龜不是每張強制出現；需要夥伴時才加入，且必須是分開的獨立Q版角色。灰色小河馬娃娃與米色小鹿安撫巾只在居家、休息、陪伴、親子等合適情境使用。\n\n正式產品只有六項、六個規格：\n1. 龜鹿膏 100g／罐。\n2. 龜鹿飲30cc玻璃罐 30cc／罐（小玻璃罐）。\n3. 龜鹿飲180cc鋁袋 180cc／包（鋁袋）。\n4. 龜鹿湯塊 75g／盒｜8塊裝｜每塊約9.375g。\n5. 龜鹿膠 600g（1斤）／盒｜32塊裝｜每塊約18.75g。\n6. 鹿茸粉 75g／罐。\n不得自行新增產品規格。\n\n正式產品圖片唯一來源是 products-v3 使用者核准實拍：\n${PRODUCT_IMAGE_BLOCK}\n舊 products-v2、舊DM、舊海報、舊候選SVG及AI重畫產品都不能當產品本體。\n\n實際比例硬規則：\n- 龜鹿飲30cc：約Ø42×H51mm，小玻璃裸罐、金色蓋、無貼紙、無外盒、無外袋；不得稱瓶，不得放大成接近100g罐。\n- 龜鹿膏100g：約寬51×高78mm；現行正式六角罐與標籤比例固定。\n- 龜鹿飲180cc：狹長直立鋁袋，寬高比目標約0.64，可接受約0.60～0.68，不得拉胖或誇張放大。\n- 龜鹿湯塊75g、龜鹿膠600g、鹿茸粉75g：目前沒有可信毫米尺寸，不得自行猜測；只能保持products-v3正式原圖盒型／罐型長寬比。\n- 多產品同框不得為排版強制等高／等寬；沒有可靠真實相對尺度時，改成單品構圖或生成不含產品本體、預留乾淨產品合成區的完整場景，再回人工審核。\n\n正式產品事實：龜鹿膏成分依序為鹿角萃取物、龜板萃取物、枸杞、紅棗、黃耆、粉光蔘；一般使用為每日早上及下午各一小匙，初次可半匙，可直接取用或以約100～300mL熱水化開，避免接近睡前。龜鹿飲30cc與180cc成分依序為水、龜板萃取物、鹿角萃取物、粉光蔘、枸杞、紅棗、黃耆；30cc每日一罐，180cc每日一包，可溫熱飲用、避免冰飲。龜鹿湯塊與龜鹿膠成分皆依序為龜板萃取物、鹿角萃取物；鹿茸粉成分為鹿茸。沒有需要寫成分或用量時不要硬塞，但一旦寫到必須完全使用正式版本。\n\n產品本體只能使用上述正式原產品照片整體等比例合成；AI只生成背景、小老闆、夥伴、道具與情境。不可重畫產品、改包裝、改標籤、裁切、拉寬、拉高或把不同產品強制排成一樣大。\n\n必須逐項匹配：品牌、產品、規格、價格／活動、季節、天氣、場合、地點、情境、環境、冷熱、表情、動作、小老闆與夥伴、比例尺寸、重複圖。\n繁體中文；新文案與新圖只進待審核，不要直接發布。`;
  const BLOCK=[['公司資訊',['台興山產有限公司','統一編號','公司電話','公司地址']],['30cc錯誤名稱',['龜鹿飲30cc玻璃瓶','30cc／瓶','小玻璃瓶']],['龜鹿膏舊用法',['每天一次，每次一小匙']],['療效宣稱',['治療','治癒','保證改善','療效','藥到病除']]];
  const GUARD_BLOCKING=false;
  function copy(text){if(navigator.clipboard?.writeText)return navigator.clipboard.writeText(text).catch(()=>fallback(text));return fallback(text)}
  function fallback(text){const a=document.createElement('textarea');a.value=text;a.style.position='fixed';a.style.opacity='0';document.body.appendChild(a);a.select();document.execCommand('copy');a.remove();return Promise.resolve()}
  function info(card){return{title:card.querySelector('.xjw-row-head h3')?.textContent?.trim()||'仙加味貼文',copyText:card.querySelector('.xjw-copy')?.textContent?.trim()||'',image:card.querySelector('.xjw-image-preview')?.getAttribute('src')||''}}
  function published(card){const t=(card.textContent||'').replace(/\s+/g,' ');return card.dataset.status==='published'||card.dataset.locked==='true'||/已發布鎖定|已發布|published_final_locked/.test(t)}
  function unauthorizedSoupWeights(text=''){
    const labels=['龜鹿湯塊','龜鹿膠','龜鹿膏','鹿茸粉'],errors=[];
    const re=/(?<!\d)(\d+(?:\.\d+)?)\s*g/gi; let m;
    while((m=re.exec(text))){const n=Number(m[1]);if(!Number.isFinite(n)||n<50)continue;const before=text.slice(Math.max(0,m.index-80),m.index);let pos=-1,label='';for(const candidate of labels){const p=before.lastIndexOf(candidate);if(p>pos){pos=p;label=candidate}}if(label==='龜鹿湯塊'&&Math.abs(n-75)>0.001)errors.push(`龜鹿湯塊未核准重量：${m[0]}`)}
    return errors;
  }
  function imagePrompt(card){const p=info(card);return `請直接使用圖像生成能力，為這篇仙加味社群貼文產出一張「待審核候選主圖」，不要只回覆提示詞、步驟或製圖說明。\n\n貼文標題：${p.title}\n貼文文案：${p.copyText}\n目前圖片：${p.image||'無／需重新生成'}\n\n${RULES}\n\n執行要求：\n1. 先判斷文案是否真的需要產品；不需要就不要硬塞產品。\n2. 需要產品時只使用上方products-v3正式原圖；若目前無法安全讀取或合成正式實拍，先生成不含產品本體、預留乾淨合成區的完整情境圖，絕對不要AI虛構產品。\n3. 季節、天氣、場合、地點、環境、冷熱、表情與動作全部依文案判斷，不能加入衝突元素。\n4. 小老闆若出現必須完整不裁切，四周保留安全空間。\n5. 輸出獨立1:1繁體中文社群主圖，不是網站截圖、ERP畫面或儀表板。\n6. 結果只作candidate／待審核，不視為已核准或已發布。`}
  function copyPrompt(card){const p=info(card);return `請重新撰寫這篇仙加味社群貼文文案。\n\n原標題：${p.title}\n原文案：${p.copyText}\n\n${RULES}\n\n保留正確產品事實與原本主題，但重新組織文字；自然、精簡、有生活感，不誇張、不虛構即時天氣或活動日期。任何30cc舊字樣「瓶／瓶裝」都改為正式「玻璃罐／罐」。只輸出：新標題、新正文、建議分類、圖片情境摘要。`}
  function allPrompt(card){const p=info(card);return `請把這篇仙加味貼文「文案＋圖片」整套重新生成，舊文案與舊圖都不要沿用；圖片請直接使用圖像生成能力產出一張待審核候選主圖，不要只回圖片提示詞。\n\n原標題：${p.title}\n原文案：${p.copyText}\n\n${RULES}\n\n文案要求：繁體中文、自然、保留正確主題，不做療效宣稱，不虛構即時資訊。\n圖片要求：1:1社群主圖、繁體中文短標題；先判斷是否需要產品，產品只能使用products-v3正式實拍等比例合成；無法安全合成時做不含產品的完整情境候選並預留乾淨區域；小老闆完整不裁切。完成後只作待審核。`}
  function toast(message){const root=document.getElementById('toastRoot');if(!root)return;const n=document.createElement('div');n.className='toast';n.textContent=message;root.appendChild(n);setTimeout(()=>n.remove(),3500)}
  async function launch(prompt,label){await copy(prompt);toast(`${label}指令已複製，正在開啟 ChatGPT`);window.open('https://chatgpt.com/?q='+encodeURIComponent(prompt),'_blank','noopener')}
  function guard(card){
    const p=info(card),t=`${p.title} ${p.copyText}`,errors=[];
    for(const [label,terms] of BLOCK){const hit=terms.find(x=>t.includes(x));if(hit)errors.push(`${label}：${hit}`)}
    errors.push(...unauthorizedSoupWeights(t));
    if(!p.image)errors.push('圖片：目前沒有候選圖，必須先重新生成或上傳，不能核准。');
    if(/products-v2|dm-final|generated-v20260808-priority1|generated-v20260808-preflight\/(?:guide-use|choose-products|choose-by-habit)\.svg/i.test(p.image))errors.push('圖片：目前仍是舊產品圖／舊候選SVG，必須重新生成或換成products-v3正式原圖。');
    if(/approved-v405/.test(p.image)&&/(龜鹿膏|30cc|180cc|龜鹿膠|龜鹿湯塊|鹿茸粉|龜鹿系列)/.test(t))errors.push('圖片：網站小老闆情境圖不能代替產品正式原圖；產品貼文需依products-v3與實際比例重新合成');
    let box=card.querySelector('[data-erp-guardian]');if(!box){box=document.createElement('div');box.dataset.erpGuardian='1';const actions=card.querySelector('.xjw-actions');actions?.parentNode?.insertBefore(box,actions)}
    const approve=card.querySelector('[data-post-status="approved"]');
    if(published(card)){box.className='xjw-ok';box.textContent='已發布內容已鎖定：不重生成、不重複排程；需要改版時再人工解除鎖定。';if(approve)approve.disabled=true;return}
    if(errors.length){box.className='xjw-danger';box.textContent=`AI規格檢查提醒：${errors.join('；')}。目前守門員維持提示模式；無圖時ERP原生審核也會禁止核准。`;if(approve&&GUARD_BLOCKING){approve.disabled=true;approve.title='先修正品牌守門員錯誤'}}
    else{box.className='xjw-ok';let note='AI規格文字預檢通過；圖片仍需人工確認16項。';if(t.includes('30cc'))note+=' 30cc必須裸罐無貼紙無外包裝，約Ø42×H51mm。';if(t.includes('180cc'))note+=' 180cc必須保持狹長鋁袋約0.64比例。';if(t.includes('龜鹿湯塊'))note+=' 龜鹿湯塊只能75g深藍盒。';if(t.includes('龜鹿膏'))note+=' 龜鹿膏約51×78mm；如寫用法，以每日早上及下午各一小匙為正式版本。';if(['颱風','寒流','高溫','空氣品質'].some(x=>t.includes(x)))note+=' 即時資訊發布前需重新確認。';box.textContent=note}
  }
  function enhance(){document.querySelectorAll('.xjw-row').forEach(card=>{const actions=card.querySelector('.xjw-actions'),postButton=card.querySelector('[data-post-view]');if(!actions||!postButton)return;if(published(card)){actions.querySelectorAll('[data-xjw-regenerate]').forEach(x=>x.remove());guard(card);return}if(actions.dataset.aiRegenerate!=='1'){actions.dataset.aiRegenerate='1';const img=document.createElement('button');img.type='button';img.className='btn small orange';img.textContent='圖不符合｜ChatGPT重生成';img.dataset.xjwRegenerate='image';const text=document.createElement('button');text.type='button';text.className='btn small';text.textContent='文案不符合｜ChatGPT重生成';text.dataset.xjwRegenerate='copy';const all=document.createElement('button');all.type='button';all.className='btn small orange';all.textContent='全部重新生成';all.dataset.xjwRegenerate='all';actions.insertBefore(img,actions.firstChild);actions.insertBefore(text,img.nextSibling);actions.insertBefore(all,text.nextSibling)}guard(card)})}
  document.addEventListener('click',e=>{const b=e.target.closest('[data-xjw-regenerate]');if(!b)return;e.preventDefault();e.stopPropagation();const card=b.closest('.xjw-row');if(!card||published(card))return;const mode=b.dataset.xjwRegenerate;if(mode==='copy')launch(copyPrompt(card),'文案重生成');else if(mode==='all')launch(allPrompt(card),'全部重生成');else launch(imagePrompt(card),'圖片重生成')},true);
  const root=document.getElementById('app');if(root)new MutationObserver(enhance).observe(root,{childList:true,subtree:true});document.addEventListener('DOMContentLoaded',enhance);setTimeout(enhance,800);
  window.XJWPostRegenerate=Object.freeze({version:'2026-08-09-v7-products-v3-direct-image',productImages:PRODUCT_IMAGES});
})();