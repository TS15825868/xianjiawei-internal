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
  function eligible(card){return ['已核准','已排程','需人工核對'].includes(statusText(card));}
  function confirmedPlatformsFor(delivery){
    // Reconcile actual per-platform receipts. A status-only record without
    // a remote ID cannot be treated as proof of publication.
    const rows=Array.isArray(delivery?.platforms)?delivery.platforms:[];
    return [...new Set(rows.filter(row=>row?.status==='published'&&String(row.remote_id||'').trim())
      .map(row=>String(row.platform||'').trim()).filter(Boolean))];
  }
  function manualPlatformsFor(post,delivery){
    const confirmed=new Set(confirmedPlatformsFor(delivery));
    const explicit=Array.isArray(delivery?.manual_required_platforms)
      ?delivery.manual_required_platforms.filter(Boolean):[];
    const requested=explicit.length?explicit:Array.isArray(post.platforms)?post.platforms:[];
    return [...new Set(requested)].filter(name=>!confirmed.has(name));
  }
  function packageText(post,delivery={}){
    const platforms=manualPlatformsFor(post,delivery);
    const published=confirmedPlatformsFor(delivery);
    const links=platforms.map((name)=>`${name}：${PLATFORM_URLS[name]||'請開啟該平台官方後台'}`).join('\n');
    const hasThreads=platforms.includes('Threads');
    return [
      '仙加味｜人工發布查核資料包',
      `貼文ID：${post.id||''}`,
      `狀態：${post.status||''}`,
      published.length?`已取得正式回執（切勿重發）：${published.join('、')}`:'',
      `待人工核對（不代表尚未發送）：${platforms.join('、')||'未指定'}`,
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
      published.length?'注意：上方有正式回執的平台不得再次人工發布。':'',
      '如果發送結果不明、超時或正在處理，應先在官方平台核對真實貼文，絕對不要直接重發。',
      '人工發布後請保留官方貼文網址或遠端 ID 交由內部管理員核對；本系統禁止無憑證直接標記「已發布」。',
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
    const done=confirmedPlatformsFor(delivery);
    const threadsNote=manual.includes('Threads')?`<div class="xjw-ok">Threads 優先走 ${esc(THREADS_ROUTE)}；只有外部排程失敗時才改成人工發布。</div>`:'';
    root.innerHTML=`<div class="xjw-modal"><div class="xjw-modal-bg" data-manual-close></div><div class="xjw-modal-card"><h2>人工發布查核資料包</h2><div class="xjw-ok">${done.length?`已取得正式回執：${esc(done.join('、'))}，不得再發。<br>`:''}待人工核對：${esc(manual.join('、')||'未指定平台')}。遇到結果不明請先查官方後台，不可直接重發或補登成功。</div>${threadsNote}<pre class="xjw-copy" style="white-space:pre-wrap;max-height:52vh;overflow:auto">${esc(text)}</pre><div class="xjw-modal-footer"><button type="button" class="btn" data-manual-copy>複製全部</button><button type="button" class="btn orange" data-manual-download>下載文字檔</button><button type="button" class="btn" data-manual-close>關閉</button></div></div></div>`;
    root.querySelector('[data-manual-copy]')?.addEventListener('click',async()=>{await copy(text);toast('手動發布包已複製');});
    root.querySelector('[data-manual-download]')?.addEventListener('click',()=>download(post,text));
    root.querySelectorAll('[data-manual-close]').forEach((button)=>button.addEventListener('click',()=>{root.innerHTML='';}));
  }
  async function getPost(id){return api(`/posts/${encodeURIComponent(id)}`);}
  async function getDeliveries(id){try{return await api(`/posts/${encodeURIComponent(id)}/deliveries`);}catch{return{};}}
  async function handlePackage(button){const card=button.closest('.xjw-row'),id=postId(card);if(!id)return;try{const [post,delivery]=await Promise.all([getPost(id),getDeliveries(id)]);openPackage(post,delivery);}catch(error){toast(error.message||String(error),true);}}
  function ensureThreadsCheckbox(){
    const form=document.getElementById('postForm');
    if(!form||form.querySelector('input[name="platforms"][value="Threads"]'))return;
    const fieldset=[...form.querySelectorAll('fieldset')].find((node)=>/發布平台/.test(node.querySelector('legend')?.textContent||''));
    if(!fieldset)return;
    const label=document.createElement('label');label.className='check-label';
    const input=document.createElement('input');input.type='checkbox';input.name='platforms';input.value='Threads';input.checked=false;
    label.append(input,document.createTextNode(' Threads（Metricool）'));
    const lineLabel=[...fieldset.querySelectorAll('label')].find((node)=>/LINE OA/.test(node.textContent||''));
    if(lineLabel)fieldset.insertBefore(label,lineLabel);else fieldset.appendChild(label);
  }
  function ensureThreadsStatus(){
    const root=document.getElementById('platformSummary');
    const chip=[...(root?.querySelectorAll('.platform-chip')||[])]
      .find(node=>/^Threads：/.test((node.textContent||'').trim()));
    // Only annotate the intended route. Actual readiness comes from the
    // protected provider probe; never force a fake green connected chip.
    if(chip){chip.dataset.threadsRoute='metricool';
      chip.title='Threads 優先使用 Metricool；須核對已核准排程與正式發布回執。';}
  }
  function enhanceCards(){
    document.querySelectorAll('.xjw-row').forEach((card)=>{
      const actions=card.querySelector('.xjw-actions');if(!actions||!postId(card)||!eligible(card))return;
      if(!actions.querySelector('[data-manual-package]')){const pack=document.createElement('button');pack.type='button';pack.className='btn small';pack.textContent='人工發布查核資料';pack.dataset.manualPackage='1';actions.appendChild(pack);}
    });
  }
  function enhanceLight(){
    ensureThreadsCheckbox();
    ensureThreadsStatus();
    enhanceCards();
  }
  document.addEventListener('click',(event)=>{
    const pack=event.target.closest('[data-manual-package]');if(pack){event.preventDefault();event.stopPropagation();handlePackage(pack);return;}
    if(event.target.closest('[data-add-post],[data-post-edit]'))setTimeout(enhanceLight,0);
  },true);
  document.addEventListener('xjw-publishing-list-rendered',()=>{enhanceLight();setTimeout(ensureThreadsStatus,600);});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{enhanceLight();setTimeout(ensureThreadsStatus,900);},{once:true});else{enhanceLight();setTimeout(ensureThreadsStatus,900);}
  window.XJWManualPublishTools=Object.freeze({version:'2026-10-26-v5-explicit-threads-opt-in',publishingUrl:PUBLISHING_URL,threadsRoute:THREADS_ROUTE,packageText,ensureThreadsCheckbox,ensureThreadsStatus});
})();