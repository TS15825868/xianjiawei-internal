(()=>{
  const RULES=`品牌只顯示「仙加味」，不可出現台興山產有限公司、統編、公司電話或公司地址。\n文案以日常飲食、生活節奏、料理搭配為主，不談療效、不強迫推銷。\n固定角色：官網版Q版小老闆，米白中式上衣、深綠圍裙、紅色直式「仙加味」印章；小老闆出現時小鹿與小烏龜必須一起出現。灰色小河馬娃娃與米色小鹿安撫巾只在居家、休息、陪伴、親子等合適情境使用。\n正式產品只有六項、六個規格：龜鹿膏100g／罐；龜鹿飲30cc玻璃罐30cc／罐；龜鹿飲180cc鋁袋180cc／包；龜鹿湯塊75g／盒；龜鹿膠600g（1斤）／盒；鹿茸粉75g／罐。不得自行新增產品規格。\n正式產品事實：龜鹿膏成分依序為鹿角萃取物、龜板萃取物、枸杞、紅棗、黃耆、粉光蔘；一般使用為每日早上及下午各一小匙，初次可半匙，可直接取用或以約100～300mL熱水化開，避免接近睡前。龜鹿飲30cc與180cc成分依序為水、龜板萃取物、鹿角萃取物、粉光蔘、枸杞、紅棗、黃耆；30cc每日一罐，180cc每日一包，可溫熱飲用、避免冰飲。龜鹿湯塊與龜鹿膠成分皆依序為龜板萃取物、鹿角萃取物；鹿茸粉成分為鹿茸。若貼文沒有需要寫成分或用量，不要硬塞；但一旦寫到，就必須完全使用以上正式版本。\n產品只能使用正式原產品照片等比例合成，AI只生成背景、角色、道具與情境，不可重畫、裁切、改包裝、改標籤或拉伸比例。\n龜鹿飲30cc：小玻璃罐，裸罐、無貼紙、無外盒、無外袋、金色蓋，同型外觀約42mm直徑×51mm高，高矮胖瘦照原圖，不得稱瓶。\n龜鹿飲180cc：狹長直立鋁袋，寬高比約0.64，畫面自然縮小，不得拉寬或加高。\n龜鹿膏100g：六角玻璃罐約51×78mm，只使用目前新版米白標籤，中央金框「龜鹿膏」、深紅直式「仙加味」印章。\n龜鹿湯塊75g：深藍正式盒裝，8塊裝、每塊約9.375g，只使用75g正式原圖，不得建立其他容量。\n龜鹿膠600g：淡紫色正式盒裝，32塊裝、每塊約18.75g，依原圖比例，不得橫向拉長，也不可與龜鹿湯塊深藍盒互換。\n鹿茸粉75g：白色塑膠罐正式原圖，不改包裝、容量或罐型。\n必須逐項匹配：品牌、產品、規格、價格／活動、季節、天氣、場合、地點、情境、環境、冷熱、表情、動作、小老闆與夥伴、比例尺寸、重複圖。\n繁體中文；新文案與新圖只進待審核，不要直接發布。`;
  const BLOCK=[['公司資訊',['台興山產有限公司','統一編號','公司電話','公司地址']],['30cc錯誤名稱',['龜鹿飲30cc玻璃瓶','30cc／瓶','小玻璃瓶']],['龜鹿膏舊用法',['每天一次，每次一小匙']],['療效宣稱',['治療','治癒','保證改善','療效','藥到病除']]];
  const GUARD_BLOCKING=false;
  function copy(text){if(navigator.clipboard?.writeText)return navigator.clipboard.writeText(text).catch(()=>fallback(text));return fallback(text)}
  function fallback(text){const a=document.createElement('textarea');a.value=text;a.style.position='fixed';a.style.opacity='0';document.body.appendChild(a);a.select();document.execCommand('copy');a.remove();return Promise.resolve()}
  function info(card){return{title:card.querySelector('.xjw-row-head h3')?.textContent?.trim()||'仙加味貼文',copyText:card.querySelector('.xjw-copy')?.textContent?.trim()||'',image:card.querySelector('.xjw-image-preview')?.getAttribute('src')||''}}
  function published(card){const t=(card.textContent||'').replace(/\s+/g,' ');return card.dataset.status==='published'||card.dataset.locked==='true'||/已發布鎖定|已發布|published_final_locked/.test(t)}
  function unauthorizedSoupWeights(text){
    const labels=['龜鹿湯塊','龜鹿膠','龜鹿膏','鹿茸粉'],errors=[];
    const re=/(?<!\d)(\d+(?:\.\d+)?)\s*g/gi; let m;
    while((m=re.exec(text))){const n=Number(m[1]);if(!Number.isFinite(n)||n<50)continue;const before=text.slice(Math.max(0,m.index-80),m.index);let pos=-1,label='';for(const candidate of labels){const p=before.lastIndexOf(candidate);if(p>pos){pos=p;label=candidate}}if(label==='龜鹿湯塊'&&Math.abs(n-75)>0.001)errors.push(`龜鹿湯塊未核准重量：${m[0]}`)}
    return errors;
  }
  function imagePrompt(card){const p=info(card);return `請重新生成一張仙加味社群貼文圖，原因：目前圖片不符合文案、產品包裝、角色或比例。\n\n貼文標題：${p.title}\n貼文文案：${p.copyText}\n目前圖片：${p.image||'無'}\n\n${RULES}\n\n情境、季節、天氣、場合、地點、冷熱、表情與動作都要依文案判斷，不能自行加入衝突元素。若產品出現，保留正式原產品外觀與比例，產品本體不要由AI重畫。輸出獨立社群圖片，不要輸出網站截圖或ERP畫面。`}
  function copyPrompt(card){const p=info(card);return `請重新撰寫這篇仙加味社群貼文文案。\n\n原標題：${p.title}\n原文案：${p.copyText}\n\n${RULES}\n\n保留正確產品事實與原本主題，但重新組織文字；自然、精簡、有生活感，不誇張、不虛構即時天氣或活動日期。只輸出：新標題、新正文、建議分類、圖片情境摘要。`}
  function allPrompt(card){const p=info(card);return `請把這篇仙加味貼文「文案＋圖片」整套重新生成，舊文案與舊圖都不要沿用。\n\n原標題：${p.title}\n原文案：${p.copyText}\n\n${RULES}\n\n圖片為1:1繁體中文社群主圖，短標題優先；產品只用正式原產品照片等比例合成；完成後先進待審核。請輸出：新標題、新正文、建議分類、16項圖文一致性自檢、完整圖片生成指令。`}
  function toast(message){const root=document.getElementById('toastRoot');if(!root)return;const n=document.createElement('div');n.className='toast';n.textContent=message;root.appendChild(n);setTimeout(()=>n.remove(),3500)}
  async function launch(prompt,label){await copy(prompt);toast(`${label}指令已複製，正在開啟 ChatGPT`);window.open('https://chatgpt.com/?q='+encodeURIComponent(prompt),'_blank','noopener')}
  function guard(card){
    const p=info(card),t=`${p.title} ${p.copyText}`,errors=[];
    for(const [label,terms] of BLOCK){const hit=terms.find(x=>t.includes(x));if(hit)errors.push(`${label}：${hit}`)}
    errors.push(...unauthorizedSoupWeights(t));
    if(/approved-v405/.test(p.image)&&/(龜鹿膏|30cc|180cc|龜鹿膠|龜鹿系列)/.test(t))errors.push('圖片：舊產品候選圖需依最新版包裝與比例重新合成');
    let box=card.querySelector('[data-erp-guardian]');if(!box){box=document.createElement('div');box.dataset.erpGuardian='1';const actions=card.querySelector('.xjw-actions');actions?.parentNode?.insertBefore(box,actions)}
    const approve=card.querySelector('[data-post-status="approved"]');
    if(published(card)){box.className='xjw-ok';box.textContent='已發布內容已鎖定：不重生成、不重複排程；需要改版時再人工解除鎖定。';if(approve)approve.disabled=true;return}
    if(errors.length){box.className='xjw-danger';box.textContent=`AI規格檢查提醒：${errors.join('；')}。目前守門員維持提示模式，請先用重新生成按鈕修正後再人工審核。`;if(approve&&GUARD_BLOCKING){approve.disabled=true;approve.title='先修正品牌守門員錯誤'}}
    else{box.className='xjw-ok';let note='AI規格文字預檢通過；圖片仍需人工確認16項。';if(t.includes('30cc'))note+=' 30cc必須裸罐無貼紙無外包裝。';if(t.includes('龜鹿湯塊'))note+=' 龜鹿湯塊只能75g深藍盒。';if(t.includes('龜鹿膏'))note+=' 龜鹿膏只用新版米白標籤；如寫用法，以每日早上及下午各一小匙為正式版本。';if(['颱風','寒流','高溫','空氣品質'].some(x=>t.includes(x)))note+=' 即時資訊發布前需重新確認。';box.textContent=note}
  }
  function enhance(){document.querySelectorAll('.xjw-row').forEach(card=>{const actions=card.querySelector('.xjw-actions'),postButton=card.querySelector('[data-post-view]');if(!actions||!postButton)return;if(published(card)){actions.querySelectorAll('[data-xjw-regenerate]').forEach(x=>x.remove());guard(card);return}if(actions.dataset.aiRegenerate!=='1'){actions.dataset.aiRegenerate='1';const img=document.createElement('button');img.type='button';img.className='btn small orange';img.textContent='圖不符合｜ChatGPT重生成';img.dataset.xjwRegenerate='image';const text=document.createElement('button');text.type='button';text.className='btn small';text.textContent='文案不符合｜ChatGPT重生成';text.dataset.xjwRegenerate='copy';const all=document.createElement('button');all.type='button';all.className='btn small orange';all.textContent='全部重新生成';all.dataset.xjwRegenerate='all';actions.insertBefore(img,actions.firstChild);actions.insertBefore(text,img.nextSibling);actions.insertBefore(all,text.nextSibling)}guard(card)})}
  document.addEventListener('click',e=>{const b=e.target.closest('[data-xjw-regenerate]');if(!b)return;e.preventDefault();e.stopPropagation();const card=b.closest('.xjw-row');if(!card||published(card))return;const mode=b.dataset.xjwRegenerate;if(mode==='copy')launch(copyPrompt(card),'文案重生成');else if(mode==='all')launch(allPrompt(card),'全部重生成');else launch(imagePrompt(card),'圖片重生成')},true);
  const root=document.getElementById('app');if(root)new MutationObserver(enhance).observe(root,{childList:true,subtree:true});document.addEventListener('DOMContentLoaded',enhance);setTimeout(enhance,800)
})();
