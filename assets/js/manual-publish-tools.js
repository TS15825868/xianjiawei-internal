(()=>{
  const PLATFORM_URLS={
    'Facebook':'https://www.facebook.com/',
    'Instagram':'https://www.instagram.com/',
    'Threads':'https://www.threads.com/',
    'LINE OA':'https://manager.line.biz/',
    'LINE OA 廣播':'https://manager.line.biz/',
    'LINE VOOM':'https://manager.line.biz/',
    'Google 商家':'https://business.google.com/'
  };
  const PUBLISHING_URL='/publishing.html';
  const THREADS_ROUTE='Metricool（仙加味／xianjiawei.tw）';
  const jsonHeaders={'content-type':'application/json'};
  const esc=(value='')=>String(value).replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
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
    const hasThreads=platforms.includes('Threads');
    return [
      '仙加味｜手動發布包',
      `貼文ID：${post.id||''}`,
      `狀態：${post.status||''}`,
      published.length?`已由系統完成：${published.join('、')}`:'',
      `這次只需人工處理：${platforms.join('、')||'未指定'}`,
      hasThreads?`Threads 正式主路徑：${THREADS_ROUTE}；只有 Metricool 無法發布時才改用 Threads 後台人工發布。`:'',
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
      'LINE VOOM 維持人工發布；Threads 優先使用已連線的 Metricool，不強迫改走尚未穩定的 Worker 直連。'
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
    const threadsNote=manual.includes('Threads')?`<div class="xjw-ok">Threads 優先走 ${esc(THREADS_ROUTE)}；只有外部排程失敗時才改成人工發布。</div>`:'';
    root.innerHTML=`<div class="xjw-modal"><div class="xjw-modal-bg" data-manual-close></div><div class="xjw-modal-card"><h2>手動發布包</h2><div class="xjw-ok">${done.length?`已自動完成：${esc(done.join('、'))}。<br>`:''}這次只需人工處理：${esc(manual.join('、')||'未指定平台')}。完成後再按「手動補登已發布」。</div>${threadsNote}<pre class="xjw-copy" style="white-space:pre-wrap;max-height:52vh;overflow:auto">${esc(text)}</pre><div class="xjw-modal-footer"><button type="button" class="btn" data-manual-copy>複製全部</button><button type="button" class="btn orange" data-manual-download>下載文字檔</button><button type="button" class="btn" data-manual-close>關閉</button></div></div></div>`;
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
  function ensureThreadsCheckbox(){
    const form=document.getElementById('postForm');
    if(!form||form.querySelector('input[name="platforms"][value="Threads"]'))return;
    const fieldset=[...form.querySelectorAll('fieldset')].find((node)=>/發布平台/.test(node.querySelector('legend')?.textContent||''));
    if(!fieldset)return;
    const label=document.createElement('label');label.className='check-label';
    const input=document.createElement('input');input.type='checkbox';input.name='platforms';input.value='Threads';input.checked=true;
    label.append(input,document.createTextNode(' Threads（Metricool）'));
    const lineLabel=[...fieldset.querySelectorAll('label')].find((node)=>/LINE OA/.test(node.textContent||''));
    if(lineLabel)fieldset.insertBefore(label,lineLabel);else fieldset.appendChild(label);
  }
  function ensureThreadsStatus(){
    const root=document.getElementById('platformSummary');
    if(!root)return;
    const chips=[...root.querySelectorAll('.platform-chip')];
    let chip=chips.find((node)=>/^Threads：/.test((node.textContent||'').trim()));
    if(!chip){chip=document.createElement('span');chip.className='platform-chip';root.appendChild(chip);}
    chip.classList.add('ready');
    chip.classList.remove('manual');
    chip.dataset.threadsRoute='metricool';
    chip.textContent='Threads：Metricool 發布';
    chip.title='仙加味 Threads xianjiawei.tw 已連接 Metricool；正式優先使用 Metricool 排程／發布。';
  }
  function enhanceCards(){
    document.querySelectorAll('.xjw-row').forEach((card)=>{
      const actions=card.querySelector('.xjw-actions');if(!actions||!postId(card)||!eligible(card))return;
      if(!actions.querySelector('[data-manual-package]')){const pack=document.createElement('button');pack.type='button';pack.className='btn small';pack.textContent=statusText(card)==='需人工發布'?'只看待人工平台':'手動發布包';pack.dataset.manualPackage='1';actions.appendChild(pack);}
      if(statusText(card)!=='已發布'&&!actions.querySelector('[data-manual-published]')){const mark=document.createElement('button');mark.type='button';mark.className='btn small green';mark.textContent='手動補登已發布';mark.dataset.manualPublished='1';actions.appendChild(mark);}
    });
  }
  function enhanceLight(){
    ensureThreadsCheckbox();
    ensureThreadsStatus();
    enhanceCards();
  }
  document.addEventListener('click',(event)=>{
    const pack=event.target.closest('[data-manual-package]');if(pack){event.preventDefault();event.stopPropagation();handlePackage(pack);return;}
    const mark=event.target.closest('[data-manual-published]');if(mark){event.preventDefault();event.stopPropagation();handleMark(mark);return;}
    if(event.target.closest('[data-add-post],[data-post-edit]'))setTimeout(enhanceLight,0);
  },true);
  document.addEventListener('xjw-publishing-list-rendered',()=>{enhanceLight();setTimeout(ensureThreadsStatus,600);});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{enhanceLight();setTimeout(ensureThreadsStatus,900);},{once:true});else{enhanceLight();setTimeout(ensureThreadsStatus,900);}
  window.XJWManualPublishTools=Object.freeze({version:'2026-09-15-v4-metricool-threads-light',publishingUrl:PUBLISHING_URL,threadsRoute:THREADS_ROUTE,packageText,ensureThreadsCheckbox,ensureThreadsStatus});
})();