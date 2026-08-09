(()=>{
  const PLATFORM_URLS={
    'Facebook':'https://www.facebook.com/',
    'Instagram':'https://www.instagram.com/',
    'LINE OA':'https://manager.line.biz/',
    'LINE OA 廣播':'https://manager.line.biz/',
    'LINE VOOM':'https://manager.line.biz/',
    'Google 商家':'https://business.google.com/'
  };
  const PUBLISHING_URL='/publishing.html';
  const jsonHeaders={'content-type':'application/json'};
  const esc=(value='')=>String(value).replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
  let dashboardMetricLoading=false;
  function toast(message,error=false){
    const root=document.getElementById('toastRoot');
    if(!root){if(error)alert(message);return;}
    const node=document.createElement('div');node.className=`toast ${error?'error':''}`;node.textContent=message;root.appendChild(node);setTimeout(()=>node.remove(),4200);
  }
  async function api(path,options={}){
    const response=await fetch(`/api${path}`,{credentials:'same-origin',cache:'no-store',...options,headers:{...(options.body?jsonHeaders:{}),...(options.headers||{})}});
    const text=await response.text();let data={};try{data=text?JSON.parse(text):{};}catch{data={message:text};}
    if(!response.ok)throw new Error(data.error||data.detail||data.message||`HTTP ${response.status}`);
    return data;
  }
  function postId(card){return card?.querySelector('[data-post-view]')?.getAttribute('data-post-view')||'';}
  function statusText(card){return card?.querySelector('.status-pill')?.textContent?.trim()||'';}
  function eligible(card){return ['已核准','已排程','需人工發布','已發布'].includes(statusText(card));}
  function manualPlatformsFor(post,delivery){
    const explicit=Array.isArray(delivery?.manual_required_platforms)?delivery.manual_required_platforms.filter(Boolean):[];
    if(explicit.length)return explicit;
    return Array.isArray(post.platforms)?post.platforms:[];
  }
  function packageText(post,delivery={}){
    const platforms=manualPlatformsFor(post,delivery);
    const published=Array.isArray(delivery?.published_platforms)?delivery.published_platforms:[];
    const links=platforms.map((name)=>`${name}：${PLATFORM_URLS[name]||'請開啟該平台官方後台'}`).join('\n');
    return [
      '仙加味｜手動發布包',
      `貼文ID：${post.id||''}`,
      `狀態：${post.status||''}`,
      published.length?`已由系統完成：${published.join('、')}`:'',
      `這次只需人工處理：${platforms.join('、')||'未指定'}`,
      '',
      `標題：${post.title||''}`,
      post.headline?`主標：${post.headline}`:'',
      '',
      '貼文正文：',
      post.copy||'',
      '',
      `圖片：${post.image_url||'未設定'}`,
      `圖片說明：${post.image_alt||''}`,
      '',
      '人工平台入口：',
      links,
      '',
      published.length?'注意：上方「已由系統完成」的平台不要再次人工發布。':'',
      '人工平台發布完成後，回獨立貼文發佈系統按「手動補登已發布」。',
      'LINE VOOM 維持人工發布；其他沒有官方 API／Token 的平台也會自動轉到這個人工流程。'
    ].filter(Boolean).join('\n');
  }
  async function copy(text){
    if(navigator.clipboard?.writeText){try{await navigator.clipboard.writeText(text);return;}catch{}}
    const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();
  }
  function download(post,text){
    const blob=new Blob([text],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`仙加味-手動發布包-${post.id||'post'}.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(url),0);
  }
  function openPackage(post,delivery){
    const text=packageText(post,delivery);const root=document.getElementById('modalRoot');
    if(!root){copy(text);toast('手動發布包已複製');return;}
    const manual=manualPlatformsFor(post,delivery);
    const done=Array.isArray(delivery?.published_platforms)?delivery.published_platforms:[];
    root.innerHTML=`<div class="xjw-modal"><div class="xjw-modal-bg" data-manual-close></div><div class="xjw-modal-card"><h2>手動發布包</h2><div class="xjw-ok">${done.length?`已自動完成：${esc(done.join('、'))}。<br>`:''}這次只需人工處理：${esc(manual.join('、')||'未指定平台')}。完成後再按「手動補登已發布」。</div><pre class="xjw-copy" style="white-space:pre-wrap;max-height:52vh;overflow:auto">${esc(text)}</pre><div class="xjw-modal-footer"><button type="button" class="btn" data-manual-copy>複製全部</button><button type="button" class="btn orange" data-manual-download>下載文字檔</button><button type="button" class="btn" data-manual-close>關閉</button></div></div></div>`;
    root.querySelector('[data-manual-copy]')?.addEventListener('click',async()=>{await copy(text);toast('手動發布包已複製');});
    root.querySelector('[data-manual-download]')?.addEventListener('click',()=>download(post,text));
    root.querySelectorAll('[data-manual-close]').forEach((button)=>button.addEventListener('click',()=>{root.innerHTML='';}));
  }
  async function getPost(id){return api(`/posts/${encodeURIComponent(id)}`);}
  async function getDeliveries(id){try{return await api(`/posts/${encodeURIComponent(id)}/deliveries`);}catch{return{};}}
  async function manualMarkPublished(id){
    const post=await getPost(id);
    if(post.status==='published'){toast('此貼文已是已發布狀態');return;}
    if(!['approved','scheduled','manual_required'].includes(post.status))throw new Error('貼文必須先完成審核，才能手動補登已發布。');
    const delivery=await getDeliveries(id),manual=manualPlatformsFor(post,delivery);
    if(!confirm(`確認已完成人工發布「${post.title||id}」？\n\n人工平台：${manual.join('、')||'未指定'}\n此動作只補登發布結果，不會再次呼叫已完成的社群 API。`))return;
    if(post.status==='approved'){
      const scheduledAt=new Date(Date.now()+1500).toISOString();
      await api(`/posts/${encodeURIComponent(id)}/status`,{method:'POST',body:JSON.stringify({status:'scheduled',scheduled_at:scheduledAt})});
      await sleep(1700);
    }
    await api(`/posts/${encodeURIComponent(id)}/status`,{method:'POST',body:JSON.stringify({status:'published'})});
    toast('已手動補登為已發布；已自動完成的平台不會重複發布。');
    setTimeout(()=>location.reload(),500);
  }
  async function handlePackage(button){const card=button.closest('.xjw-row'),id=postId(card);if(!id)return;try{const [post,delivery]=await Promise.all([getPost(id),getDeliveries(id)]);openPackage(post,delivery);}catch(error){toast(error.message||String(error),true);}}
  async function handleMark(button){const card=button.closest('.xjw-row'),id=postId(card);if(!id)return;button.disabled=true;try{await manualMarkPublished(id);}catch(error){toast(error.message||String(error),true);}finally{button.disabled=false;}}
  async function enhanceDashboard(){
    const grid=document.querySelector('.metric-grid');
    if(!grid||grid.querySelector('[data-manual-required-metric]')||dashboardMetricLoading)return;
    dashboardMetricLoading=true;
    try{const data=await api('/overview'),count=Number(data?.posts?.manual_required||0),article=document.createElement('article');article.className='card metric';article.dataset.manualRequiredMetric='1';article.innerHTML=`<small>需人工發布</small><strong>${count}</strong><a href="${PUBLISHING_URL}">開啟獨立貼文系統 →</a>`;grid.appendChild(article);}catch{}finally{dashboardMetricLoading=false;}
  }
  function enhance(){
    const select=document.getElementById('listStatus');
    if(select&&!select.querySelector('option[value="manual_required"]')){const option=document.createElement('option');option.value='manual_required';option.textContent='需人工發布';select.appendChild(option);}
    document.querySelectorAll('.xjw-row').forEach((card)=>{
      const actions=card.querySelector('.xjw-actions');if(!actions||!postId(card)||!eligible(card))return;
      if(!actions.querySelector('[data-manual-package]')){const pack=document.createElement('button');pack.type='button';pack.className='btn small';pack.textContent=statusText(card)==='需人工發布'?'只看待人工平台':'手動發布包';pack.dataset.manualPackage='1';actions.appendChild(pack);}
      if(statusText(card)!=='已發布'&&!actions.querySelector('[data-manual-published]')){const mark=document.createElement('button');mark.type='button';mark.className='btn small green';mark.textContent='手動補登已發布';mark.dataset.manualPublished='1';actions.appendChild(mark);}
    });
    enhanceDashboard();
  }
  document.addEventListener('click',(event)=>{
    const pack=event.target.closest('[data-manual-package]');if(pack){event.preventDefault();event.stopPropagation();handlePackage(pack);return;}
    const mark=event.target.closest('[data-manual-published]');if(mark){event.preventDefault();event.stopPropagation();handleMark(mark);}
  },true);
  const observer=new MutationObserver(enhance);observer.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance);else enhance();
  window.XJWManualPublishTools=Object.freeze({version:'2026-08-09-v2-standalone-publishing',publishingUrl:PUBLISHING_URL,packageText});
})();