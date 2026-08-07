(()=>{
  const RULES=`品牌只顯示「仙加味」，不可出現台興山產有限公司、統編、公司電話或公司地址。\n文案以日常飲食、生活節奏、料理搭配為主，不談療效、不強迫推銷。\n固定角色：官網版Q版小老闆，米白中式上衣、深綠圍裙、紅色直式「仙加味」印章；小老闆出現時小鹿與小烏龜必須一起出現。灰色小河馬娃娃與米色小鹿安撫巾只在居家、休息、陪伴、親子等合適情境使用。\n產品只能使用正式原產品照片等比例合成，AI只生成背景、角色、道具與情境，不可重畫、裁切、改包裝、改標籤或拉伸比例。\n龜鹿飲30cc：30cc／罐（小玻璃罐），裸罐、無貼紙、無外盒、無外袋、金色蓋，同型外觀約42mm直徑×51mm高，高矮胖瘦照原圖。\n龜鹿飲180cc：180cc／包（鋁袋），狹長直立，寬高比約0.64，畫面自然縮小，不得拉寬或加高。\n龜鹿膏100g：六角玻璃罐約51×78mm，只使用目前新版米白標籤，中央金框「龜鹿膏」、深紅直式「仙加味」印章；舊紅白直式貼紙禁止。\n龜鹿膠600g：淡紫色正式盒裝，32塊裝，依原圖比例，不得橫向拉長。\n必須逐項匹配：品牌、產品、規格、價格／活動、季節、天氣、場合、地點、情境、環境、冷熱、表情、動作、小老闆與夥伴、比例尺寸、重複圖。\n繁體中文；新文案與新圖只進待審核，不要直接發布。`;
  function copy(text){if(navigator.clipboard?.writeText)return navigator.clipboard.writeText(text).catch(()=>fallback(text));return fallback(text)}
  function fallback(text){const a=document.createElement('textarea');a.value=text;a.style.position='fixed';a.style.opacity='0';document.body.appendChild(a);a.select();document.execCommand('copy');a.remove();return Promise.resolve()}
  function info(card){return{title:card.querySelector('.xjw-row-head h3')?.textContent?.trim()||'仙加味貼文',copyText:card.querySelector('.xjw-copy')?.textContent?.trim()||'',image:card.querySelector('.xjw-image-preview')?.getAttribute('src')||''}}
  function imagePrompt(card){const p=info(card);return `請重新生成一張仙加味社群貼文圖，原因：目前圖片不符合文案、產品包裝、角色或比例。\n\n貼文標題：${p.title}\n貼文文案：${p.copyText}\n目前圖片：${p.image||'無'}\n\n${RULES}\n\n情境、季節、天氣、場合、地點、冷熱、表情與動作都要依文案判斷，不能自行加入衝突元素。若產品出現，保留正式原產品外觀與比例，產品本體不要由AI重畫。輸出獨立社群圖片，不要輸出網站截圖或ERP畫面。`}
  function copyPrompt(card){const p=info(card);return `請重新撰寫這篇仙加味社群貼文文案。\n\n原標題：${p.title}\n原文案：${p.copyText}\n\n${RULES}\n\n保留正確產品事實與原本主題，但重新組織文字；自然、精簡、有生活感，不誇張、不虛構即時天氣或活動日期。只輸出：新標題、新正文、建議分類、圖片情境摘要。`}
  function allPrompt(card){const p=info(card);return `請把這篇仙加味貼文「文案＋圖片」整套重新生成，舊文案與舊圖都不要沿用。\n\n原標題：${p.title}\n原文案：${p.copyText}\n\n${RULES}\n\n圖片為1:1繁體中文社群主圖，短標題優先；產品只用正式原產品照片等比例合成；完成後先進待審核。請輸出：新標題、新正文、建議分類、16項圖文一致性自檢、完整圖片生成指令。`}
  function toast(message){const root=document.getElementById('toastRoot');if(!root)return;const n=document.createElement('div');n.className='toast';n.textContent=message;root.appendChild(n);setTimeout(()=>n.remove(),3500)}
  async function launch(prompt,label){await copy(prompt);toast(`${label}指令已複製，正在開啟 ChatGPT`);window.open('https://chatgpt.com/?q='+encodeURIComponent(prompt),'_blank','noopener')}
  function enhance(){
    document.querySelectorAll('.xjw-row').forEach(card=>{
      const actions=card.querySelector('.xjw-actions');const postButton=card.querySelector('[data-post-view]');if(!actions||!postButton||actions.dataset.aiRegenerate==='1')return;
      actions.dataset.aiRegenerate='1';
      const img=document.createElement('button');img.type='button';img.className='btn small orange';img.textContent='圖不符合｜ChatGPT重生成';img.dataset.xjwRegenerate='image';
      const text=document.createElement('button');text.type='button';text.className='btn small';text.textContent='文案不符合｜ChatGPT重生成';text.dataset.xjwRegenerate='copy';
      const all=document.createElement('button');all.type='button';all.className='btn small orange';all.textContent='全部重新生成';all.dataset.xjwRegenerate='all';
      actions.insertBefore(img,actions.firstChild);actions.insertBefore(text,img.nextSibling);actions.insertBefore(all,text.nextSibling);
    })
  }
  document.addEventListener('click',e=>{const b=e.target.closest('[data-xjw-regenerate]');if(!b)return;e.preventDefault();e.stopPropagation();const card=b.closest('.xjw-row');if(!card)return;const mode=b.dataset.xjwRegenerate;if(mode==='copy')launch(copyPrompt(card),'文案重生成');else if(mode==='all')launch(allPrompt(card),'全部重生成');else launch(imagePrompt(card),'圖片重生成')},true);
  const root=document.getElementById('app');if(root)new MutationObserver(enhance).observe(root,{childList:true,subtree:true});document.addEventListener('DOMContentLoaded',enhance);setTimeout(enhance,800)
})();