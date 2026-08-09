(()=>{
  const VERSION='20260809-publishing-review-ui-v1';
  const CHECKS=[
    ['brand','品牌與整體風格','符合仙加味正式品牌風格，沒有錯誤Logo／不合品牌元素'],
    ['product','產品','文案提到的產品與圖片中的產品完全一致'],
    ['specification','規格','產品容量、重量、包裝、數量與正式規格一致'],
    ['pricing_activity','價格／活動','若圖文出現價格、試喝或活動，內容與目前正式方案一致'],
    ['season','季節','圖片季節與文案一致；文案未指定時不亂加明顯季節'],
    ['weather','天氣','圖片天氣與文案一致；即時天氣貼文發布前會再確認'],
    ['occasion','場合','節慶、工作、居家、外出等場合與文案一致'],
    ['location','地點','萬華、門市、室內外等地點與文案一致'],
    ['scene_environment','情境／環境','背景、道具、料理或使用情境符合文案'],
    ['temperature','冷熱','溫熱、常溫、冷飲等呈現沒有與文案相反'],
    ['expression','表情','小老闆與角色表情符合貼文語氣'],
    ['action','動作','小老闆與角色動作真的對應文案，不是隨機姿勢'],
    ['mascot_companions','小老闆／夥伴','人物完整不裁切；需要夥伴時小鹿與小烏龜分開，造型正確'],
    ['physical_scale','產品比例尺寸','產品只等比例縮放；30cc、100g罐、180cc鋁袋與其他產品不得亂改大小比例'],
    ['duplicate','重複圖','沒有短期重複使用同一張不合適圖片，亦非舊版／淘汰素材'],
    ['compliance_final','法規與最終確認','沒有療效宣稱、錯字、錯規格、錯資訊，整張圖可正式對外'],
  ];
  const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  function toast(message,error=false){const root=document.getElementById('toastRoot');if(!root){if(error)alert(message);return}const n=document.createElement('div');n.className=`toast ${error?'error':''}`;n.textContent=message;root.appendChild(n);setTimeout(()=>n.remove(),4500)}
  async function api(path,options={}){const response=await fetch(`/api${path}`,{credentials:'same-origin',cache:'no-store',...options,headers:{...(options.body?{'content-type':'application/json'}:{}),...(options.headers||{})}});const text=await response.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={message:text}}if(!response.ok)throw new Error(data.error||data.detail||data.message||`HTTP ${response.status}`);return data}
  function cardId(button){return button?.dataset?.id||button?.closest('.publish-card,.xjw-row')?.querySelector('[data-post-view]')?.dataset?.postView||''}
  function render(post){
    const root=document.getElementById('modalRoot');if(!root)return;
    root.innerHTML=`<div class="xjw-modal"><div class="xjw-modal-bg" data-review-close></div><div class="xjw-modal-card publishing-review-card"><h2>16項完整圖文審核</h2><p class="muted">這次核准會綁定目前這份文案與圖片。之後只要文案或圖片修改，核准會自動失效，必須重新檢查。</p><div class="publishing-review-preview"><div><strong>${esc(post.title||'未命名貼文')}</strong><div class="publishing-review-copy">${esc(post.copy||post.headline||'尚無文案')}</div></div>${post.image_url?`<img src="${esc(post.image_url)}" alt="${esc(post.image_alt||post.title||'貼文候選圖')}" loading="eager" decoding="async">`:'<div class="xjw-danger">缺少圖片</div>'}</div><div class="publishing-review-checks">${CHECKS.map(([id,label,help])=>`<label class="publishing-review-check"><input type="checkbox" data-review-check="${id}"><span><strong>${label}</strong><small>${help}</small></span></label>`).join('')}</div><label class="publishing-review-match"><input type="checkbox" id="copyImageMatch"><span><strong>最終確認：文案與圖片一致</strong><small>產品、情境、季節、環境、冷熱、表情與動作都已逐項比對。</small></span></label><div class="xjw-modal-footer"><button type="button" class="btn" data-review-close>取消</button><button type="button" class="btn" id="reviewSelectAll">全部符合</button><button type="button" class="btn green" id="reviewApprove" disabled>完成審核並核准</button></div></div></div>`;
    const boxes=[...root.querySelectorAll('[data-review-check]')],match=root.querySelector('#copyImageMatch'),approve=root.querySelector('#reviewApprove');
    const refresh=()=>{approve.disabled=!(boxes.every(box=>box.checked)&&match.checked&&post.image_url)};
    boxes.forEach(box=>box.addEventListener('change',refresh));match.addEventListener('change',refresh);
    root.querySelector('#reviewSelectAll')?.addEventListener('click',()=>{boxes.forEach(box=>box.checked=true);match.checked=true;refresh()});
    root.querySelectorAll('[data-review-close]').forEach(node=>node.addEventListener('click',()=>{root.innerHTML=''}));
    approve.addEventListener('click',async()=>{approve.disabled=true;const old=approve.textContent;approve.textContent='審核送出中…';try{const checklist=Object.fromEntries(boxes.map(box=>[box.dataset.reviewCheck,box.checked]));await api(`/posts/${encodeURIComponent(post.id)}/status`,{method:'POST',body:JSON.stringify({status:'approved',review_checklist:checklist,copy_image_match:match.checked})});root.innerHTML='';toast('16項圖文審核完成，貼文已核准');document.querySelector('[data-refresh]')?.click()}catch(error){approve.disabled=false;approve.textContent=old;toast(error.message||String(error),true)}});
  }
  async function openReview(button){const id=cardId(button);if(!id){toast('找不到貼文ID，請重新整理',true);return}button.disabled=true;const old=button.textContent;button.textContent='載入審核…';try{const post=await api(`/posts/${encodeURIComponent(id)}`);render(post)}catch(error){toast(error.message||String(error),true)}finally{button.disabled=false;button.textContent=old}}
  document.addEventListener('click',event=>{const button=event.target.closest('[data-post-status="approved"]');if(!button||button.disabled)return;event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();openReview(button)},true);
  function enhance(){document.querySelectorAll('[data-post-status="approved"]').forEach(button=>{if(button.dataset.reviewGateReady)return;button.dataset.reviewGateReady='1';button.textContent='16項審核通過';button.title='必須完成品牌、產品、規格、情境、季節、天氣、冷熱、表情、動作、產品比例與圖文一致等完整檢查後才能核准。'})}
  new MutationObserver(enhance).observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance,{once:true});else enhance();
  window.XJWPublishingReviewGate=Object.freeze({version:VERSION,checks:CHECKS.map(item=>item[0])});
})();
