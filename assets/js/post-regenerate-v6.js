(()=>{
  const RULES=`品牌只顯示「仙加味」，不可出現台興山產有限公司、統編、公司電話或公司地址。\n固定角色：官網版Q版小老闆，米白中式上衣、深綠圍裙、紅色直式「仙加味」印章；小老闆出現時小鹿與小烏龜必須一起出現。\n產品只能使用正式原產品照片等比例合成，AI只生成背景、角色、道具與情境，不可重畫、裁切、改包裝、改標籤或拉伸比例。\n龜鹿飲30cc：30cc／罐（小玻璃罐），裸罐無貼紙、金色蓋，同型外觀約42mm直徑×51mm高，高矮胖瘦照原圖。\n龜鹿飲180cc：180cc／包（鋁袋），狹長直立，寬高比約0.64，畫面自然縮小，不得拉寬或加高。\n龜鹿膏100g：六角玻璃罐約51×78mm，只使用目前新版標籤，舊紅白直式貼紙禁止。\n龜鹿膠600g：淡紫色正式盒裝，32塊裝，依原圖比例，不得橫向拉長。\n必須逐項匹配：品牌、產品、規格、價格／活動、季節、天氣、場合、地點、情境、環境、冷熱、表情、動作、小老闆與夥伴、比例尺寸、重複圖。\n不談療效。繁體中文。新圖只進待審核，不要直接發布。`;
  function copy(text){
    if(navigator.clipboard?.writeText)return navigator.clipboard.writeText(text).catch(()=>fallback(text));
    return fallback(text);
  }
  function fallback(text){
    const a=document.createElement('textarea');a.value=text;a.style.position='fixed';a.style.opacity='0';document.body.appendChild(a);a.select();document.execCommand('copy');a.remove();return Promise.resolve();
  }
  function promptFor(card){
    const title=card.querySelector('.xjw-row-head h3')?.textContent?.trim()||'仙加味貼文';
    const copyText=card.querySelector('.xjw-copy')?.textContent?.trim()||'';
    const image=card.querySelector('.xjw-image-preview')?.getAttribute('src')||'';
    return `請重新生成一張仙加味社群貼文圖，原因：目前圖片不符合文案或產品比例。\n\n貼文標題：${title}\n貼文文案：${copyText}\n目前圖片：${image||'無'}\n\n${RULES}\n\n情境、季節、天氣、場合、地點、冷熱、表情與動作都要依文案判斷，不能自行加入衝突元素。若產品出現，保留正式原產品外觀與比例，產品本體不要由AI重畫。輸出獨立社群圖片，不要輸出網站截圖或ERP畫面。`;
  }
  function enhance(){
    document.querySelectorAll('.xjw-row').forEach(card=>{
      const actions=card.querySelector('.xjw-actions');
      const postButton=card.querySelector('[data-post-view]');
      if(!actions||!postButton||actions.querySelector('[data-xjw-regenerate]'))return;
      const b=document.createElement('button');
      b.type='button';b.className='btn small orange';b.textContent='圖不符合｜ChatGPT重新生成';b.dataset.xjwRegenerate='1';
      actions.insertBefore(b,actions.firstChild);
    });
  }
  document.addEventListener('click',async e=>{
    const b=e.target.closest('[data-xjw-regenerate]');if(!b)return;
    e.preventDefault();e.stopPropagation();
    const card=b.closest('.xjw-row');if(!card)return;
    const prompt=promptFor(card);await copy(prompt);
    const toast=document.getElementById('toastRoot');
    if(toast){const n=document.createElement('div');n.className='toast';n.textContent='生成指令已複製，正在開啟 ChatGPT';toast.appendChild(n);setTimeout(()=>n.remove(),3500);}
    window.open('https://chatgpt.com/?q='+encodeURIComponent(prompt),'_blank','noopener');
  },true);
  const root=document.getElementById('app');
  if(root)new MutationObserver(enhance).observe(root,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',enhance);setTimeout(enhance,800);
})();
