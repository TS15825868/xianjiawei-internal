const NAV = [
  ['dashboard','營運總覽','⌂'],['posts','貼文中心','▤'],['calendar','內容排程','◫'],
  ['products','產品中心','◆'],['inventory','庫存中心','▦'],['assets','素材中心','▧'],
  ['customers','客戶管理','◎'],['visits','拜訪紀錄','◉'],['orders','訂單管理','◇'],
  ['purchases','採購管理','▽'],['suppliers','供應商','△'],['finance','財務管理','$'],
  ['tasks','任務管理','✓'],['templates','範本中心','▣'],['documents','文件中心','▥'],
  ['platforms','平台授權','↗'],['settings','系統設定','⚙']
];
const TITLES = Object.fromEntries(NAV.map(([id,label])=>[id,label]));
const state = { route:'dashboard', me:null, items:[], filter:'', status:'all', busy:false };
const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
const esc = (value='') => String(value).replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fmt = (value) => value ? new Date(value).toLocaleString('zh-TW',{hour12:false,timeZone:'Asia/Taipei'}) : '—';
const norm = (value='') => String(value).toLowerCase().replace(/\s+/g,'');
const sleep = (ms) => new Promise((resolve)=>setTimeout(resolve,ms));

function localInput(value){
  if(!value) return '';
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part)=>part.type!=='literal').map((part)=>[part.type,part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}
function taipeiLocalToIso(value){
  if(!value) return '';
  return new Date(`${value}:00+08:00`).toISOString();
}
function nextSlot(kind='next'){
  const now = new Date();
  const candidates = [];
  for(let add=0;add<15;add+=1){
    const local = new Date(now.toLocaleString('en-US',{timeZone:'Asia/Taipei'}));
    local.setDate(local.getDate()+add);
    const weekday = local.getDay();
    const isTuesday = weekday===2;
    const isSaturday = weekday===6;
    if(!isTuesday&&!isSaturday) continue;
    local.setHours(isTuesday?19:9,isTuesday?30:30,0,0);
    const iso = taipeiLocalToIso(`${local.getFullYear()}-${String(local.getMonth()+1).padStart(2,'0')}-${String(local.getDate()).padStart(2,'0')}T${String(local.getHours()).padStart(2,'0')}:${String(local.getMinutes()).padStart(2,'0')}`);
    if(new Date(iso)>now) candidates.push(iso);
  }
  return candidates[kind==='following'?1:0] || new Date(Date.now()+86400000).toISOString();
}

async function api(path, options={}){
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),Number(options.timeout||20000));
  try{
    const response = await fetch(`/api${path}`,{
      credentials:'same-origin',cache:'no-store',...options,
      signal:options.signal||controller.signal,
      headers:{...(options.body instanceof FormData?{}:{'content-type':'application/json'}),...(options.headers||{})}
    });
    const text = await response.text();
    if((response.headers.get('content-type')||'').includes('text/html') || /^\s*<!doctype html/i.test(text)){
      throw new Error('登入狀態已失效，請重新整理並完成 Cloudflare Access 登入。');
    }
    let data = text;
    try{ data = text ? JSON.parse(text) : null; }catch{}
    if(!response.ok) throw new Error(data?.error||data?.detail||`系統連線失敗（HTTP ${response.status}）`);
    return data;
  }catch(error){
    if(error?.name==='AbortError') throw new Error('系統回應逾時，請重新整理再試一次。');
    throw error;
  }finally{ clearTimeout(timer); }
}
function toast(message,error=false){
  const root=$('#toastRoot'); if(!root) return;
  const node=document.createElement('div'); node.className=`toast ${error?'error':''}`; node.textContent=message; root.appendChild(node);
  setTimeout(()=>node.remove(),4200);
}
function setConnection(message,error=false){
  const node=$('#connectionState'); if(!node) return;
  node.textContent=message; node.style.color=error?'#b42318':'';
}
function statusLabel(value=''){
  return ({draft:'草稿',pending_review:'待審核',approved:'已核准',scheduled:'已排程',published:'已發布',archived:'已封存',todo:'待處理',doing:'處理中',completed:'已完成',active:'啟用',manual_required:'需人工發布',failed:'失敗'})[value]||value||'—';
}
function endpointFor(module){
  if(module==='posts'||module==='calendar') return '/posts';
  if(module==='settings') return '/settings';
  if(module==='assets') return '/assets';
  if(module==='platforms') return '/platform-authorization';
  return `/modules/${module}`;
}

function nav(){
  $('#sideNav').innerHTML=NAV.map(([id,label,icon])=>`<a href="#${id}" class="${state.route===id?'active':''}"><span class="nav-icon">${icon}</span><span>${label}</span></a>`).join('');
  $('#mobileDock').innerHTML=[['dashboard','首頁','⌂'],['posts','貼文','▤'],['calendar','排程','◫'],['products','產品','◆']].map(([id,label,icon])=>`<a href="#${id}" class="${state.route===id?'active':''}"><span class="dock-icon">${icon}</span>${label}</a>`).join('')+`<button type="button" data-open-quick><span class="dock-icon">☰</span>更多</button>`;
  $('#pageTitle').textContent=TITLES[state.route]||'營運總覽';
  $$('.xjw-fab').forEach((node)=>node.remove());
  if(['posts','calendar','products','inventory','assets','customers','orders','purchases','suppliers','tasks'].includes(state.route)){
    const button=document.createElement('button'); button.className='xjw-fab'; button.type='button'; button.dataset.fab=state.route; button.setAttribute('aria-label','快速新增'); button.textContent='＋'; document.body.appendChild(button);
  }
}
function loading(){ $('#app').innerHTML='<section class="loading-card">資料載入中…</section>'; }
function errorView(error){
  $('#app').innerHTML=`<section class="card" style="padding:20px"><h2>系統暫時無法載入</h2><p>${esc(error?.message||error)}</p><button class="btn primary" id="retryButton">重新連線</button></section>`;
  $('#retryButton')?.addEventListener('click',render);
}

async function dashboard(){
  const data=await api('/overview');
  const posts=data?.posts||{}; const modules=data?.modules||{};
  const metrics=[
    ['待審貼文',Number(posts.draft||0)+Number(posts.pending_review||0),'posts'],
    ['已核准',Number(posts.approved||0),'posts'],['已排程',Number(posts.scheduled||0),'calendar'],
    ['產品',Number(modules.products||0),'products'],['庫存項目',Number(modules.inventory||0),'inventory'],['訂單',Number(modules.orders||0),'orders']
  ];
  $('#app').innerHTML=`
    <div class="notice success"><strong>系統已連線。</strong> 正式營運資料存放於 Cloudflare D1；GitHub 只保存程式。</div>
    <div class="xjw-toolbar">
      <button class="btn primary" data-quick-action="post">新增貼文</button>
      <button class="btn" data-quick-action="schedule">查看排程</button>
      <button class="btn" data-quick-action="inventory">庫存異動</button>
      <a class="btn" href="#platforms">平台授權</a>
      <button class="btn" data-open-quick>全部快速功能</button>
    </div>
    <div class="metric-grid">${metrics.map(([label,value,route])=>`<article class="card metric"><small>${label}</small><strong>${value}</strong><a href="#${route}">查看資料 →</a></article>`).join('')}</div>`;
}

function toolbar(module){
  const status=(module==='posts'||module==='calendar')?`<select id="listStatus"><option value="all">全部狀態</option>${['draft','pending_review','approved','scheduled','published'].map((value)=>`<option value="${value}" ${state.status===value?'selected':''}>${statusLabel(value)}</option>`).join('')}</select>`:'';
  return `<div class="xjw-toolbar"><input id="listFilter" type="search" placeholder="搜尋名稱、標題、規格或文案" value="${esc(state.filter)}">${status}<button class="btn" data-clear-filter>清除</button></div>`;
}
function filterItems(items){
  const query=norm(state.filter);
  return items.filter((item)=>(!query||norm(JSON.stringify(item)).includes(query))&&(state.status==='all'||item.status===state.status));
}
function postAudit(post){
  const copy=norm([post.title,post.headline,post.copy,post.category].join(' '));
  const image=norm([post.image_url,post.image_alt,post.image_source].join(' '));
  const rules=[['龜鹿膏',['龜鹿膏','gao']],['龜鹿飲30',['30cc','30 cc','龜鹿飲30','drink-30']],['龜鹿飲180',['180cc','180 cc','龜鹿飲180','drink-180']],['龜鹿湯塊',['湯塊','soup']],['鹿茸粉',['鹿茸粉','antler']],['龜鹿膠',['龜鹿膠','jiao']]];
  const mentioned=rules.filter(([,keys])=>keys.some((key)=>copy.includes(norm(key))));
  if(!post.image_url) return {level:'danger',text:'缺少圖片，不能通過審核。'};
  if(mentioned.length&&!mentioned.some(([,keys])=>keys.some((key)=>image.includes(norm(key))))) return {level:'danger',text:`文案提到「${mentioned.map((item)=>item[0]).join('、')}」，圖片網址或說明無法辨識對應產品，請人工檢查。`};
  if(!post.image_alt) return {level:'warning',text:'尚未填寫圖片說明，無法完整檢查圖文一致性。'};
  if(post.image_quality_status==='low') return {level:'danger',text:'圖片解析度不足，請更換清晰原圖。'};
  return {level:'ok',text:'目前未發現明顯圖文不一致；審核前仍需查看圖片確認。'};
}
function postRows(items,calendar=false){
  const list=filterItems(calendar?items.filter((item)=>['scheduled','approved'].includes(item.status)||item.proposed_scheduled_at):items);
  if(!list.length) return '<section class="card" style="padding:20px"><p>目前沒有符合條件的貼文。</p></section>';
  return `<div class="xjw-list">${list.map((post)=>{
    const audit=postAudit(post);
    return `<article class="card xjw-row">
      <div class="xjw-row-head"><h3>${esc(post.title||'未命名貼文')}</h3><span class="status-pill ${esc(post.status)}">${esc(statusLabel(post.status))}</span></div>
      <div class="xjw-meta"><span>${esc(post.category||'')}</span><span>${esc((post.platforms||[]).join('／'))}</span>${post.scheduled_at?`<span>排程：${esc(fmt(post.scheduled_at))}</span>`:`<span>建議：${esc(fmt(post.proposed_scheduled_at))}</span>`}</div>
      <div class="xjw-copy">${esc(post.headline||post.copy||'尚無文案')}</div>
      ${post.image_url?`<img class="xjw-image-preview" src="${esc(post.image_url)}" alt="${esc(post.image_alt||post.title||'貼文圖片')}">`:''}
      <div class="xjw-${audit.level}">${esc(audit.text)}</div>
      <div class="xjw-actions">
        <button class="btn small" data-post-view="${esc(post.id)}">查看</button>
        <button class="btn small orange" data-post-edit="${esc(post.id)}">重新編輯</button>
        ${['draft','pending_review'].includes(post.status)?`<button class="btn small green" data-post-status="approved" data-id="${esc(post.id)}" ${audit.level==='danger'?'disabled':''}>審核通過</button>`:''}
        ${post.status==='approved'?`<button class="btn small orange" data-post-schedule="${esc(post.id)}">安排時間</button><button class="btn small green" data-post-publish-now="${esc(post.id)}">立即發布</button>`:''}
        ${post.status==='scheduled'?`<button class="btn small orange" data-post-schedule="${esc(post.id)}">修改時間</button><button class="btn small" data-post-status="draft" data-id="${esc(post.id)}">取消排程</button><button class="btn small green" data-post-publish-now="${esc(post.id)}">立即發布</button>`:''}
      </div>
    </article>`;
  }).join('')}</div>`;
}
function genericRows(items,module){
  const list=filterItems(items);
  if(!list.length) return '<section class="card" style="padding:20px"><p>目前沒有符合條件的資料。</p></section>';
  if(module==='assets') return `<div class="xjw-asset-grid">${list.map((item)=>`<article class="card xjw-asset-card">${item.file_url?`<img src="${esc(item.file_url)}" alt="${esc(item.name||'素材')}">`:'<div class="xjw-warning">沒有可預覽網址</div>'}<h3>${esc(item.name||item.id||'未命名')}</h3><div class="xjw-meta"><span>${esc(item.category||'未分類')}</span><span>${esc(item.width||0)}×${esc(item.height||0)}</span></div><div class="xjw-actions"><button class="btn small" data-record-view="${esc(item.id)}">查看</button><button class="btn small orange" data-record-edit="${esc(item.id)}" data-module="assets">編輯</button></div></article>`).join('')}</div>`;
  return `<div class="xjw-list">${list.map((item)=>{
    const quantity=Number(item.quantity||0), safety=Number(item.safety_stock||0), stockClass=module==='inventory'?(quantity<=0?'xjw-stock-low':safety>0&&quantity<=safety?'xjw-stock-warn':''):'';
    return `<article class="card xjw-row ${stockClass}"><div class="xjw-row-head"><h3>${esc(item.name||item.title||item.order_no||item.purchase_no||item.id||'未命名')}</h3><span class="status-pill">${esc(statusLabel(item.status||item.specification||item.category||item.item_type))}</span></div><div class="xjw-meta"><span>${esc(item.specification||item.unit||item.category||item.type||item.item_type||'')}</span>${module==='inventory'?`<span>數量：${quantity}／安全庫存：${safety}</span>`:''}<span>更新：${esc(fmt(item.updated_at||item.updatedAt||item.created_at||item.createdAt))}</span></div>${module==='inventory'&&quantity<=safety?`<div class="${quantity<=0?'xjw-danger':'xjw-warning'}">${quantity<=0?'已無庫存':'已達低庫存警戒'}</div>`:''}${item.notes?`<div class="xjw-copy">${esc(item.notes)}</div>`:''}<div class="xjw-actions"><button class="btn small" data-record-view="${esc(item.id)}">查看</button><button class="btn small orange" data-record-edit="${esc(item.id)}" data-module="${esc(module)}">編輯</button></div></article>`;
  }).join('')}</div>`;
}
function bindFilters(module){
  const input=$('#listFilter'), select=$('#listStatus');
  if(input) input.addEventListener('input',(event)=>{state.filter=event.target.value; $('#listRoot').innerHTML=module==='posts'||module==='calendar'?postRows(state.items,module==='calendar'):genericRows(state.items,module);});
  if(select) select.addEventListener('change',(event)=>{state.status=event.target.value; $('#listRoot').innerHTML=postRows(state.items,module==='calendar');});
}
async function modulePage(module){
  if(module==='platforms') return platformPage();
  const data=await api(endpointFor(module));
  const items=Array.isArray(data)?data:(data?.items||data?.results||data?.records||[]); state.items=items;
  if(module==='settings'&&!Array.isArray(data)){
    const settings=data?.settings||data?.brand||data;
    $('#app').innerHTML=`<div class="page-head"><div><h1>系統設定</h1><p>只顯示非秘密設定；Token 不會回傳到瀏覽器。</p></div></div><section class="card" style="padding:20px"><dl class="xjw-kv">${Object.entries(settings||{}).map(([key,value])=>`<dt>${esc(key)}</dt><dd>${esc(typeof value==='object'?JSON.stringify(value):value)}</dd>`).join('')}</dl></section>`;
    return;
  }
  $('#app').innerHTML=`<div class="page-head"><div><h1>${esc(TITLES[module]||module)}</h1><p>${module==='calendar'?'固定時段為週二 19:30 與週六 09:30；立即發布不受固定時段限制。':module==='posts'?'系統會先做基本圖文一致性檢查，審核前仍需人工確認圖片。':'所有正式資料保存在 Cloudflare D1。'}</p></div></div>${toolbar(module)}<div id="listRoot">${module==='posts'||module==='calendar'?postRows(items,module==='calendar'):genericRows(items,module)}</div>`;
  bindFilters(module);
}
async function platformPage(){
  const data=await api('/platform-authorization');
  const platforms=data?.platforms||{};
  $('#app').innerHTML=`<div class="page-head"><div><h1>平台授權</h1><p>此頁只顯示是否已設定，不會顯示 Token 內容。</p></div><button class="btn" id="recheckPlatforms">重新檢查</button></div><div class="xjw-list">${Object.entries(platforms).map(([name,info])=>`<article class="card xjw-row"><div class="xjw-row-head"><h3>${esc(name)}</h3><span class="status-pill ${info.ready?'approved':'draft'}">${info.ready?'已設定':info.manualRequired?'人工發布':'未完成'}</span></div><div class="xjw-meta"><span>模式：${esc(info.mode||'未設定')}</span></div><div class="${info.ready?'xjw-ok':info.manualRequired?'xjw-warning':'xjw-danger'}">${esc(info.reason||info.message||(info.ready?'伺服器已讀取必要設定。':'尚未完成設定。'))}</div></article>`).join('')}</div>`;
  $('#recheckPlatforms')?.addEventListener('click',render);
}

function closeModal(){ $('#modalRoot').innerHTML=''; }
function selectedPlatforms(form){ return $$('[name="platforms"]:checked',form).map((input)=>input.value); }
function openPostForm(post=null){
  const edit=Boolean(post);
  $('#modalRoot').innerHTML=`<div class="xjw-modal"><div class="xjw-modal-bg" data-close-modal></div><form class="xjw-modal-card" id="postForm"><h2>${edit?'重新編輯貼文':'新增貼文草稿'}</h2>${edit&&post.status!=='draft'?'<div class="xjw-warning">儲存修改後會退回草稿，必須重新審核。</div>':''}<div class="form-grid"><label class="field full"><span>標題</span><input name="title" required value="${esc(post?.title||'')}"></label><label class="field full"><span>主標</span><input name="headline" value="${esc(post?.headline||'')}"></label><label class="field full"><span>文案</span><textarea name="copy" required>${esc(post?.copy||'')}</textarea></label><label class="field"><span>分類</span><input name="category" value="${esc(post?.category||'日常節奏')}"></label><label class="field"><span>圖片網址</span><input name="image_url" type="url" value="${esc(post?.image_url||'')}"></label><label class="field full"><span>圖片說明</span><input name="image_alt" value="${esc(post?.image_alt||'')}"></label><fieldset class="field full"><legend>發布平台</legend>${['Facebook','Instagram','LINE OA','LINE VOOM','Google 商家'].map((name)=>`<label style="display:inline-flex;align-items:center;gap:6px;margin:5px 12px 5px 0"><input style="width:auto;min-height:auto" type="checkbox" name="platforms" value="${name}" ${(post?.platforms||['Facebook','Instagram']).includes(name)?'checked':''}> ${name}</label>`).join('')}</fieldset></div><div class="xjw-modal-footer"><button type="button" class="btn" data-close-modal>取消</button><button class="btn primary">${edit?'儲存並退回草稿':'儲存草稿'}</button></div></form></div>`;
  $('#postForm').addEventListener('submit',async(event)=>{
    event.preventDefault(); const form=event.currentTarget; const body=Object.fromEntries(new FormData(form).entries()); body.platforms=selectedPlatforms(form);
    try{ await api(edit?`/posts/${encodeURIComponent(post.id)}`:'/posts',{method:edit?'PUT':'POST',body:JSON.stringify(body)}); closeModal(); toast(edit?'貼文已更新並退回草稿':'貼文草稿已新增'); location.hash='posts'; await render(); }catch(error){ toast(error.message,true); }
  });
}
function openPostView(post){
  const audit=postAudit(post);
  $('#modalRoot').innerHTML=`<div class="xjw-modal"><div class="xjw-modal-bg" data-close-modal></div><div class="xjw-modal-card"><h2>${esc(post.title)}</h2><div class="xjw-meta"><span class="status-pill ${esc(post.status)}">${esc(statusLabel(post.status))}</span><span>${esc((post.platforms||[]).join('／'))}</span></div><h3>${esc(post.headline||'')}</h3><div class="xjw-copy">${esc(post.copy||'尚無文案')}</div>${post.image_url?`<p><img class="xjw-image-preview" src="${esc(post.image_url)}" alt="${esc(post.image_alt||post.title)}"></p>`:''}<div class="xjw-${audit.level}">${esc(audit.text)}</div><div class="xjw-modal-footer"><button class="btn orange" data-post-edit="${esc(post.id)}">重新編輯</button><button class="btn" data-close-modal>關閉</button></div></div></div>`;
}
function openSchedule(post){
  const suggested=post.scheduled_at||post.proposed_scheduled_at||nextSlot();
  $('#modalRoot').innerHTML=`<div class="xjw-modal"><div class="xjw-modal-bg" data-close-modal></div><form class="xjw-modal-card" id="scheduleForm"><h2>${post.status==='scheduled'?'修改排程時間':'安排貼文時間'}</h2><p>${esc(post.title)}</p><div class="xjw-schedule-presets"><button type="button" class="btn" data-schedule-preset="next">下一個固定時段</button><button type="button" class="btn" data-schedule-preset="following">再下一個固定時段</button><button type="button" class="btn green" data-publish-now-from-modal>立即發布</button></div><label class="field full"><span>日期與時間（台灣時間）</span><input id="scheduleAt" name="scheduled_at" type="datetime-local" required value="${esc(localInput(suggested))}"></label><div class="xjw-warning">固定時段：週二 19:30、週六 09:30。自訂時間可另行選擇；立即發布不受固定時段限制。</div><div class="xjw-modal-footer"><button type="button" class="btn" data-close-modal>取消</button><button class="btn primary">儲存排程</button></div></form></div>`;
  const input=$('#scheduleAt');
  $$('[data-schedule-preset]').forEach((button)=>button.addEventListener('click',()=>{input.value=localInput(nextSlot(button.dataset.schedulePreset));}));
  $('[data-publish-now-from-modal]')?.addEventListener('click',async()=>{closeModal(); await publishNow(post.id);});
  $('#scheduleForm').addEventListener('submit',async(event)=>{event.preventDefault(); const iso=taipeiLocalToIso(input.value); await changeStatus(post.id,'scheduled',iso); closeModal();});
}
async function changeStatus(id,status,scheduledAt=''){
  try{
    const post=state.items.find((item)=>item.id===id);
    if(status==='approved'&&post&&postAudit(post).level==='danger'){toast('請先修正圖片或圖文一致性問題',true);return;}
    await api(`/posts/${encodeURIComponent(id)}/status`,{method:'POST',body:JSON.stringify({status,scheduled_at:scheduledAt})}); toast('貼文狀態已更新'); await render();
  }catch(error){toast(error.message,true);}
}
async function publishNow(id){
  if(state.busy) return; state.busy=true; toast('正在送出立即發布，請稍候…');
  try{const result=await api(`/posts/${encodeURIComponent(id)}/publish-now`,{method:'POST',body:'{}',timeout:45000}); toast(result?.message||'立即發布完成'); await render();}
  catch(error){toast(error.message,true);} finally{state.busy=false;}
}

const FIELD_SETS={
  products:['name','sku','category','specification','unit','retail_price','promotional_price','wholesale_price','promotion_text','description','ingredients','usage','storage','image_url','notes'],
  inventory:['name','item_type','category','specification','unit','quantity','safety_stock','product_id','notes'],
  assets:['name','category','file_url','mime_type','width','height','notes'],
  customers:['name','phone','email','address','source','status','notes'],
  visits:['customer_id','customer_name','visited_at','result','next_action','notes'],
  orders:['order_no','customer_id','customer_name','status','subtotal','shipping_fee','total','payment_status','shipping_status','notes'],
  purchases:['purchase_no','supplier_id','supplier_name','status','total','notes'],
  suppliers:['name','contact_name','phone','email','address','status','notes'],
  finance:['entry_type','category','amount','occurred_at','reference_no','notes'],
  tasks:['title','status','due_at','assignee','notes'],
  templates:['name','category','content','notes'],
  documents:['name','category','file_url','notes']
};
const LABELS={name:'名稱',sku:'SKU',category:'分類',specification:'規格',unit:'單位',retail_price:'售價',promotional_price:'優惠價',wholesale_price:'批發價',promotion_text:'優惠說明',description:'產品說明',ingredients:'成分',usage:'使用方式',storage:'保存方式',image_url:'圖片網址',notes:'備註',item_type:'庫存類型',quantity:'目前數量',safety_stock:'安全庫存',product_id:'產品 ID',file_url:'檔案網址',mime_type:'檔案類型',width:'寬度',height:'高度',phone:'電話',email:'Email',address:'地址',source:'來源',status:'狀態',customer_id:'客戶 ID',customer_name:'客戶名稱',visited_at:'拜訪時間',result:'結果',next_action:'下一步',order_no:'訂單編號',subtotal:'小計',shipping_fee:'運費',total:'總額',payment_status:'付款狀態',shipping_status:'出貨狀態',purchase_no:'採購編號',supplier_id:'供應商 ID',supplier_name:'供應商名稱',contact_name:'聯絡人',entry_type:'收支類型',amount:'金額',occurred_at:'日期',reference_no:'參考編號',title:'標題',due_at:'期限',assignee:'負責人',content:'內容'};
function recordFields(module,item={}){return FIELD_SETS[module]||Object.keys(item).filter((key)=>!['id','createdAt','updatedAt','created_at','updated_at'].includes(key)).slice(0,20);}
function fieldLabel(key){return LABELS[key]||key;}
function openRecordForm(module,item=null){
  const edit=Boolean(item), fields=recordFields(module,item||{});
  $('#modalRoot').innerHTML=`<div class="xjw-modal"><div class="xjw-modal-bg" data-close-modal></div><form class="xjw-modal-card" id="recordForm"><h2>${edit?'編輯':'新增'}${esc(TITLES[module]||module)}</h2><div class="form-grid">${fields.map((key)=>{const value=item?.[key]??''; const large=['description','ingredients','usage','storage','notes','content'].includes(key); const numeric=['retail_price','promotional_price','wholesale_price','quantity','safety_stock','width','height','subtotal','shipping_fee','total','amount'].includes(key); const date=['visited_at','occurred_at','due_at'].includes(key); return `<label class="field ${large?'full':''}"><span>${esc(fieldLabel(key))}</span>${large?`<textarea name="${esc(key)}">${esc(value)}</textarea>`:`<input name="${esc(key)}" ${numeric?'type="number" step="1"':date?'type="datetime-local"':''} value="${esc(date?localInput(value):value)}">`}</label>`;}).join('')}</div><div class="xjw-modal-footer"><button type="button" class="btn" data-close-modal>取消</button><button class="btn primary">儲存</button></div></form></div>`;
  $('#recordForm').addEventListener('submit',async(event)=>{
    event.preventDefault(); const body=Object.fromEntries(new FormData(event.currentTarget).entries());
    for(const key of ['retail_price','promotional_price','wholesale_price','quantity','safety_stock','width','height','subtotal','shipping_fee','total','amount']) if(key in body&&body[key]!=='') body[key]=Number(body[key]);
    for(const key of ['visited_at','occurred_at','due_at']) if(body[key]) body[key]=taipeiLocalToIso(body[key]);
    try{await api(edit?`/modules/${module}/${encodeURIComponent(item.id)}`:`/modules/${module}`,{method:edit?'PUT':'POST',body:JSON.stringify(body)}); closeModal(); toast('資料已儲存'); await render();}catch(error){toast(error.message,true);}
  });
}
function openRecordView(item,module){
  $('#modalRoot').innerHTML=`<div class="xjw-modal"><div class="xjw-modal-bg" data-close-modal></div><div class="xjw-modal-card"><h2>${esc(item.name||item.title||item.id)}</h2><dl class="xjw-kv">${Object.entries(item).filter(([key])=>!['createdAt','updatedAt'].includes(key)).map(([key,value])=>`<dt>${esc(fieldLabel(key))}</dt><dd>${esc(typeof value==='object'?JSON.stringify(value):value)}</dd>`).join('')}</dl><div class="xjw-modal-footer"><button class="btn orange" data-record-edit="${esc(item.id)}" data-module="${esc(module)}">編輯</button><button class="btn" data-close-modal>關閉</button></div></div></div>`;
}
function openQuickMenu(){
  $('#modalRoot').innerHTML=`<div class="xjw-modal"><div class="xjw-modal-bg" data-close-modal></div><div class="xjw-modal-card"><h2>快速選單</h2><div class="xjw-quick-grid"><button data-quick-action="post"><span>＋</span>新增貼文</button><a href="#posts" data-close-modal><span>✓</span>待審貼文</a><a href="#calendar" data-close-modal><span>◫</span>內容排程</a><button data-quick-action="product"><span>◆</span>新增產品</button><button data-quick-action="inventory"><span>▦</span>庫存異動</button><button data-quick-action="asset"><span>▧</span>新增素材</button><a href="#orders" data-close-modal><span>◇</span>訂單</a><a href="#purchases" data-close-modal><span>▽</span>採購</a><a href="#platforms" data-close-modal><span>↗</span>平台授權</a></div><div class="xjw-modal-footer"><button class="btn" data-close-modal>關閉</button></div></div></div>`;
}
function quickAction(type){
  if(type==='post') return openPostForm(); if(type==='schedule'){location.hash='calendar';closeModal();return;} if(type==='product') return openRecordForm('products'); if(type==='inventory') return openRecordForm('inventory'); if(type==='asset') return openRecordForm('assets');
}

async function render(){
  state.route=(location.hash||'#dashboard').slice(1); if(!TITLES[state.route]) state.route='dashboard'; state.filter=''; state.status='all'; nav(); loading();
  try{if(state.route==='dashboard') await dashboard(); else await modulePage(state.route); setConnection('D1 雲端已連線');}
  catch(error){setConnection('連線失敗',true); errorView(error);}
}
function bind(){
  window.addEventListener('hashchange',()=>{document.body.classList.remove('sidebar-open');closeModal();render();});
  $('#menuToggle')?.addEventListener('click',()=>document.body.classList.toggle('sidebar-open'));
  $('#sidebarBackdrop')?.addEventListener('click',()=>document.body.classList.remove('sidebar-open'));
  $('#refreshButton')?.addEventListener('click',render);
  document.addEventListener('click',(event)=>{
    const openQuick=event.target.closest('[data-open-quick]'); if(openQuick){event.preventDefault();openQuickMenu();return;}
    if(event.target.closest('[data-close-modal]')){event.preventDefault();closeModal();return;}
    if(event.target.closest('[data-clear-filter]')){state.filter='';state.status='all';render();return;}
    const quick=event.target.closest('[data-quick-action]'); if(quick){event.preventDefault();quickAction(quick.dataset.quickAction);return;}
    const fab=event.target.closest('[data-fab]'); if(fab){quickAction(({posts:'post',calendar:'post',products:'product',inventory:'inventory',assets:'asset',customers:'customer',orders:'order',purchases:'purchase',suppliers:'supplier',tasks:'task'})[fab.dataset.fab]||fab.dataset.fab); if(!['posts','calendar','products','inventory','assets'].includes(fab.dataset.fab)) openRecordForm(fab.dataset.fab); return;}
    const postView=event.target.closest('[data-post-view]'); if(postView){const post=state.items.find((item)=>item.id===postView.dataset.postView);if(post)openPostView(post);return;}
    const postEdit=event.target.closest('[data-post-edit]'); if(postEdit){const post=state.items.find((item)=>item.id===postEdit.dataset.postEdit);if(post)openPostForm(post);return;}
    const postStatus=event.target.closest('[data-post-status]'); if(postStatus&&!postStatus.disabled){changeStatus(postStatus.dataset.id,postStatus.dataset.postStatus);return;}
    const schedule=event.target.closest('[data-post-schedule]'); if(schedule){const post=state.items.find((item)=>item.id===schedule.dataset.postSchedule);if(post)openSchedule(post);return;}
    const publish=event.target.closest('[data-post-publish-now]'); if(publish){publishNow(publish.dataset.postPublishNow);return;}
    const recordView=event.target.closest('[data-record-view]'); if(recordView){const item=state.items.find((entry)=>entry.id===recordView.dataset.recordView);if(item)openRecordView(item,state.route);return;}
    const recordEdit=event.target.closest('[data-record-edit]'); if(recordEdit){const item=state.items.find((entry)=>entry.id===recordEdit.dataset.recordEdit);if(item)openRecordForm(recordEdit.dataset.module||state.route,item);}
  });
}
async function loadMe(){
  try{state.me=await api('/me'); $('#sidebarUser').innerHTML=`<strong>${esc(state.me?.display_name||state.me?.email||'已登入')}</strong><br>${esc(state.me?.role_label||state.me?.role||'管理者')}`;}
  catch(error){$('#sidebarUser').textContent=error.message||'登入驗證失敗';}
}
async function init(){bind();nav();await Promise.allSettled([render(),loadMe()]);}
window.addEventListener('error',(event)=>{setConnection('前端錯誤',true);if($('#app')?.textContent.includes('載入中'))errorView(event.error||new Error(event.message));});
window.addEventListener('unhandledrejection',(event)=>{setConnection('前端錯誤',true);if($('#app')?.textContent.includes('載入中'))errorView(event.reason||new Error('未知錯誤'));});
window.addEventListener('pageshow',(event)=>{if(event.persisted)setTimeout(render,150);});
init();
