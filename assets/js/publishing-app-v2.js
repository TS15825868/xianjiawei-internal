const state={me:null,items:[],total:0,counts:{},filter:'',status:'all',loading:false,platforms:null,loadId:0};
const PAGE_SIZE=18;
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=(v='')=>String(v).toLowerCase().replace(/\s+/g,'');
const fmt=v=>v?new Date(v).toLocaleString('zh-TW',{hour12:false,timeZone:'Asia/Taipei'}):'—';

function localInput(value){
  if(!value)return'';
  const d=new Date(value);
  const parts=new Intl.DateTimeFormat('en-CA',{
    timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).formatToParts(d);
  const m=Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return`${m.year}-${m.month}-${m.day}T${m.hour}:${m.minute}`;
}

function taipeiLocalToIso(v){
  return v?new Date(`${v}:00+08:00`).toISOString():'';
}

function nextSlot(which='next'){
  const now=new Date();
  const out=[];
  for(let add=0;add<15;add++){
    const local=new Date(now.toLocaleString('en-US',{timeZone:'Asia/Taipei'}));
    local.setDate(local.getDate()+add);
    if(![2,6].includes(local.getDay()))continue;
    local.setHours(local.getDay()===2?19:9,30,0,0);
    const iso=taipeiLocalToIso(`${local.getFullYear()}-${String(local.getMonth()+1).padStart(2,'0')}-${String(local.getDate()).padStart(2,'0')}T${String(local.getHours()).padStart(2,'0')}:${String(local.getMinutes()).padStart(2,'0')}`);
    if(new Date(iso)>now)out.push(iso);
  }
  return out[which==='following'?1:0]||new Date(Date.now()+86400000).toISOString();
}

async function api(path,options={}){
  const ctl=new AbortController();
  const timer=setTimeout(()=>ctl.abort(),Number(options.timeout||18000));
  try{
    const res=await fetch(`/api${path}`,{
      credentials:'same-origin',cache:'no-store',...options,signal:options.signal||ctl.signal,
      headers:{...(options.body instanceof FormData?{}:{'content-type':'application/json'}),...(options.headers||{})}
    });
    const raw=await res.text();
    if((res.headers.get('content-type')||'').includes('text/html')||/^\s*<!doctype html/i.test(raw)){
      throw new Error('登入狀態已失效，請重新整理並完成 Cloudflare Access 登入。');
    }
    let data=raw;
    try{data=raw?JSON.parse(raw):null}catch{}
    if(!res.ok)throw new Error(data?.error||data?.detail||`系統連線失敗（HTTP ${res.status}）`);
    return data;
  }catch(error){
    if(error?.name==='AbortError')throw new Error('系統回應逾時，請重新整理再試一次。');
    throw error;
  }finally{
    clearTimeout(timer);
  }
}

function toast(message,error=false){
  const root=$('#toastRoot');
  if(!root)return;
  const n=document.createElement('div');
  n.className=`toast ${error?'error':''}`;
  n.textContent=message;
  root.appendChild(n);
  setTimeout(()=>n.remove(),3800);
}

function connection(message,error=false){
  const n=$('#connectionState');
  if(n){
    n.textContent=message;
    n.classList.toggle('error',error);
  }
}

function statusLabel(v=''){
  return({draft:'草稿',pending_review:'待審核',approved:'已核准',scheduled:'已排程',published:'已發布',manual_required:'需人工發布',failed:'失敗',archived:'已封存'})[v]||v||'—';
}

function setButtonBusy(button,text='處理中…'){
  if(!button)return()=>{};
  const old=button.textContent;
  button.disabled=true;
  button.textContent=text;
  return()=>{
    button.disabled=false;
    button.textContent=old;
  };
}

function audit(post){
  const copy=norm([post.title,post.headline,post.copy,post.category].join(' '));
  const image=norm([post.image_url,post.image_alt,post.image_source].join(' '));
  const rules=[
    ['龜鹿膏',['龜鹿膏','gao']],
    ['龜鹿飲30',['30cc','龜鹿飲30','drink-30']],
    ['龜鹿飲180',['180cc','龜鹿飲180','drink-180']],
    ['龜鹿湯塊',['湯塊','soup']],
    ['鹿茸粉',['鹿茸粉','antler']],
    ['龜鹿膠',['龜鹿膠','jiao']]
  ];
  const mentioned=rules.filter(([,keys])=>keys.some(k=>copy.includes(norm(k))));
  if(!post.image_url)return{level:'danger',text:'缺少圖片，不能通過審核。'};
  if(mentioned.length&&!mentioned.some(([,keys])=>keys.some(k=>image.includes(norm(k))))){
    return{level:'danger',text:`文案提到「${mentioned.map(x=>x[0]).join('、')}」，圖片資訊無法確認對應產品，請先修正。`};
  }
  if(!post.image_alt)return{level:'warning',text:'尚未填寫圖片說明，請補齊後再完成審核。'};
  if(post.image_quality_status==='low')return{level:'danger',text:'圖片解析度不足，請更換清晰圖片。'};
  return{level:'ok',text:'基本圖文預檢通過；正式發布前仍須完成16項人工圖文審核。'};
}

function metricsData(){
  const c=state.counts||{};
  return{
    draft:Number(c.draft||0),
    pending:Number(c.pending_review||0),
    approved:Number(c.approved||0),
    scheduled:Number(c.scheduled||0),
    published:Number(c.published||0),
    manual:Number(c.manual_required||0)
  };
}

function renderMetrics(){
  const root=$('#metrics');
  if(!root)return;
  const c=metricsData();
  root.innerHTML=[
    ['草稿',c.draft,'draft'],
    ['待審核',c.pending,'pending_review'],
    ['已核准',c.approved,'approved'],
    ['已排程',c.scheduled,'scheduled'],
    ['已發布',c.published,'published'],
    ['需人工發布',c.manual,'manual_required']
  ].map(([label,value,status])=>`<button class="publish-metric ${state.status===status?'active':''}" data-filter-status="${status}"><small>${label}</small><strong>${value}</strong></button>`).join('');
}

function renderPlatforms(){
  const root=$('#platformSummary');
  if(!root)return;
  const entries=Object.entries(state.platforms?.platforms||{});
  root.innerHTML=entries.length
    ?entries.map(([name,p])=>`<span class="platform-chip ${p.ready?'ready':'manual'}">${esc(name)}：${p.ready?'可自動發布':'人工／未授權'}</span>`).join('')
    :'<span class="platform-chip">平台狀態稍後載入</span>';
}

function card(post){
  const a=audit(post);
  const locked=post.status==='published';
  return`<article class="card xjw-row publish-card" data-status="${esc(post.status)}" data-locked="${locked?'true':'false'}">
    <div class="xjw-row-head">
      <div><p class="eyebrow">${esc(post.category||'貼文')}</p><h3>${esc(post.title||'未命名貼文')}</h3></div>
      <span class="status-pill ${esc(post.status)}">${esc(statusLabel(post.status))}</span>
    </div>
    <div class="xjw-meta"><span>${esc((post.platforms||[]).join('／')||'未指定平台')}</span>${post.scheduled_at?`<span>排程：${esc(fmt(post.scheduled_at))}</span>`:''}</div>
    ${post.headline?`<h4>${esc(post.headline)}</h4>`:''}
    <div class="xjw-copy">${esc(post.copy||'尚無文案')}</div>
    ${post.image_url?`<img class="xjw-image-preview" src="${esc(post.image_url)}" alt="${esc(post.image_alt||post.title||'貼文圖片')}" loading="lazy" decoding="async" fetchpriority="low">`:''}
    <div class="xjw-${a.level}">${esc(a.text)}</div>
    <div class="xjw-actions">
      <button class="btn small" data-post-view="${esc(post.id)}">查看／發布結果</button>
      ${!locked?`<button class="btn small orange" data-post-edit="${esc(post.id)}">重新編輯</button>`:''}
      ${post.status==='draft'?`<button class="btn small green" data-post-status="pending_review" data-id="${esc(post.id)}" ${a.level==='danger'?'disabled':''}>送待審核</button>`:''}
      ${post.status==='pending_review'?`<button class="btn small green" data-post-status="approved" data-id="${esc(post.id)}" ${a.level==='danger'?'disabled':''}>16項審核通過</button><button class="btn small" data-post-status="draft" data-id="${esc(post.id)}">退回草稿</button>`:''}
      ${post.status==='approved'?`<button class="btn small orange" data-post-schedule="${esc(post.id)}">安排時間</button><button class="btn small green" data-post-publish-now="${esc(post.id)}">立即發布</button>`:''}
      ${post.status==='scheduled'?`<button class="btn small orange" data-post-schedule="${esc(post.id)}">修改時間</button><button class="btn small" data-post-status="draft" data-id="${esc(post.id)}">取消排程</button><button class="btn small green" data-post-publish-now="${esc(post.id)}">立即發布</button>`:''}
      ${post.status==='manual_required'?`<button class="btn small" data-post-deliveries="${esc(post.id)}">查看各平台狀態</button>`:''}
    </div>
  </article>`;
}

function renderList(){
  const root=$('#listRoot');
  if(!root)return;
  const remaining=Math.max(0,state.total-state.items.length);
  root.innerHTML=state.items.length
    ?`<div class="xjw-list">${state.items.map(card).join('')}</div>${remaining>0?`<div class="publish-load-more"><button class="btn primary" data-load-more>載入下一批 ${Math.min(PAGE_SIZE,remaining)} 篇 <small>（尚有 ${remaining} 篇）</small></button></div>`:''}`
    :'<section class="card empty-state"><h3>沒有符合條件的貼文</h3><p>可調整搜尋／狀態條件，或新增貼文草稿。</p></section>';
  renderMetrics();
  requestAnimationFrame(()=>document.dispatchEvent(new CustomEvent('xjw-publishing-list-rendered')));
}

function queryPath(offset=0){
  const p=new URLSearchParams({limit:String(PAGE_SIZE),offset:String(offset)});
  if(state.status!=='all')p.set('status',state.status);
  if(state.filter.trim())p.set('q',state.filter.trim());
  return`/posts?${p}`;
}

async function loadPlatforms(loadId){
  try{
    const data=await api('/platform-authorization',{timeout:12000});
    if(loadId!==state.loadId)return;
    state.platforms=data;
    renderPlatforms();
  }catch{
    if(loadId===state.loadId){
      state.platforms=null;
      renderPlatforms();
    }
  }
}

async function load({append=false}={}){
  if(state.loading)return;
  const loadId=++state.loadId;
  state.loading=true;
  const offset=append?state.items.length:0;
  connection(append?'載入更多貼文中…':'讀取貼文中…');
  const refreshButtons=$$('[data-refresh]');
  if(!append)refreshButtons.forEach(b=>b.disabled=true);
  const loadMore=$('[data-load-more]');
  const doneMore=setButtonBusy(loadMore,'載入中…');
  try{
    const data=await api(queryPath(offset),{timeout:18000});
    if(loadId!==state.loadId)return;
    const batch=Array.isArray(data)?data:(data?.items||[]);
    state.items=append?[...state.items,...batch.filter(n=>!state.items.some(o=>o.id===n.id))]:batch;
    state.total=Number(data?.total??state.items.length);
    state.counts=data?.counts||state.counts||{};
    renderList();
    connection(`已連線｜顯示 ${state.items.length}／${state.total} 篇`);
    if(!append)loadPlatforms(loadId);
  }catch(error){
    if(loadId!==state.loadId)return;
    connection('連線失敗',true);
    if(!append){
      const root=$('#listRoot');
      if(root)root.innerHTML=`<section class="card empty-state"><h3>貼文系統暫時無法載入</h3><p>${esc(error.message||error)}</p><button class="btn primary" data-refresh>重新連線</button></section>`;
    }else{
      toast(error.message||String(error),true);
    }
  }finally{
    if(loadId===state.loadId){
      state.loading=false;
      refreshButtons.forEach(b=>b.disabled=false);
      doneMore();
    }
  }
}

function closeModal(){
  const root=$('#modalRoot');
  if(root)root.innerHTML='';
}

function selectedPlatforms(form){
  return $$('[name="platforms"]:checked',form).map(i=>i.value);
}

function openPostForm(post=null){
  const edit=!!post;
  const root=$('#modalRoot');
  if(!root)return;
  root.innerHTML=`<div class="xjw-modal"><div class="xjw-modal-bg" data-close-modal></div><form class="xjw-modal-card" id="postForm">
    <h2>${edit?'重新編輯貼文':'新增貼文草稿'}</h2>
    ${edit&&post.status!=='draft'?'<div class="xjw-warning">儲存修改後會退回草稿，16項圖文核准會自動失效，必須重新審核。</div>':''}
    <div class="form-grid">
      <label class="field full"><span>標題</span><input name="title" required value="${esc(post?.title||'')}"></label>
      <label class="field full"><span>主標</span><input name="headline" value="${esc(post?.headline||'')}"></label>
      <label class="field full"><span>文案</span><textarea name="copy" required>${esc(post?.copy||'')}</textarea></label>
      <label class="field"><span>分類</span><input name="category" value="${esc(post?.category||'日常節奏')}"></label>
      <label class="field"><span>圖片網址</span><input name="image_url" type="url" value="${esc(post?.image_url||'')}"></label>
      <label class="field full"><span>圖片說明</span><input name="image_alt" value="${esc(post?.image_alt||'')}"></label>
      <fieldset class="field full"><legend>發布平台</legend>${['Facebook','Instagram','LINE OA','LINE VOOM','Google 商家'].map(name=>`<label class="check-label"><input type="checkbox" name="platforms" value="${name}" ${(post?.platforms||['Facebook','Instagram']).includes(name)?'checked':''}> ${name}</label>`).join('')}</fieldset>
    </div>
    <div class="xjw-modal-footer"><button type="button" class="btn" data-close-modal>取消</button><button class="btn primary" data-submit-post>${edit?'儲存並退回草稿':'儲存草稿'}</button></div>
  </form></div>`;

  $('#postForm')?.addEventListener('submit',async e=>{
    e.preventDefault();
    const form=e.currentTarget;
    const button=form.querySelector('[data-submit-post]');
    const done=setButtonBusy(button,'儲存中…');
    const body=Object.fromEntries(new FormData(form).entries());
    body.platforms=selectedPlatforms(form);
    try{
      await api(edit?`/posts/${encodeURIComponent(post.id)}`:'/posts',{
        method:edit?'PUT':'POST',body:JSON.stringify(body)
      });
      closeModal();
      toast(edit?'貼文已更新並退回草稿':'貼文草稿已新增');
      await load();
    }catch(error){
      toast(error.message||String(error),true);
      done();
    }
  });
}

async function deliveries(id){
  try{
    return await api(`/posts/${encodeURIComponent(id)}/deliveries`,{timeout:12000});
  }catch{
    return null;
  }
}

async function openPostView(post,button){
  const done=setButtonBusy(button,'讀取中…');
  try{
    const [latest,d]=await Promise.all([
      api(`/posts/${encodeURIComponent(post.id)}`,{timeout:12000}),
      deliveries(post.id)
    ]);
    const rows=d?.platforms||[];
    const root=$('#modalRoot');
    if(!root)return;
    const p=latest||post;
    root.innerHTML=`<div class="xjw-modal"><div class="xjw-modal-bg" data-close-modal></div><div class="xjw-modal-card">
      <h2>${esc(p.title||'貼文')}</h2>
      <div class="xjw-meta"><span class="status-pill ${esc(p.status)}">${esc(statusLabel(p.status))}</span><span>${esc((p.platforms||[]).join('／'))}</span></div>
      ${p.image_url?`<img class="xjw-image-preview" src="${esc(p.image_url)}" alt="${esc(p.image_alt||p.title||'貼文圖片')}">`:''}
      <h3>文案</h3><div class="xjw-copy">${esc(p.copy||'')}</div>
      <h3>各平台發布結果</h3>
      ${rows.length?`<div class="delivery-list">${rows.map(r=>`<div class="delivery-row"><strong>${esc(r.platform)}</strong><span>${esc(statusLabel(r.status))}</span><small>${esc(r.remote_id||r.error_text||'')}</small></div>`).join('')}</div>`:'<p class="muted">尚無發布紀錄。</p>'}
      ${p.status==='manual_required'?`<div class="xjw-warning">有平台需要人工發布。請使用卡片上的「手動發布包」，完成後再補登已發布。</div><div class="xjw-modal-footer"><button class="btn green" data-post-status="published" data-id="${esc(p.id)}">手動補登已發布</button></div>`:''}
      <div class="xjw-modal-footer"><button class="btn" data-close-modal>關閉</button></div>
    </div></div>`;
  }catch(error){
    toast(error.message||String(error),true);
  }finally{
    done();
  }
}

function openSchedule(post){
  const suggested=post.scheduled_at||post.proposed_scheduled_at||nextSlot();
  const root=$('#modalRoot');
  if(!root)return;
  root.innerHTML=`<div class="xjw-modal"><div class="xjw-modal-bg" data-close-modal></div><form class="xjw-modal-card" id="scheduleForm">
    <h2>${post.status==='scheduled'?'修改排程時間':'安排貼文時間'}</h2>
    <p>${esc(post.title)}</p>
    <div class="xjw-schedule-presets"><button type="button" class="btn" data-schedule-preset="next">下一個固定時段</button><button type="button" class="btn" data-schedule-preset="following">再下一個固定時段</button><button type="button" class="btn green" data-publish-now-from-modal>立即發布</button></div>
    <label class="field full"><span>日期與時間（台灣時間）</span><input id="scheduleAt" type="datetime-local" required value="${esc(localInput(suggested))}"></label>
    <div class="xjw-warning">固定時段為週二19:30、週六09:30；也可自行修改。立即發布不受固定時段限制，但仍必須維持目前16項圖文核准有效。</div>
    <div class="xjw-modal-footer"><button type="button" class="btn" data-close-modal>取消</button><button class="btn primary" data-save-schedule>儲存排程</button></div>
  </form></div>`;

  const input=$('#scheduleAt');
  $$('[data-schedule-preset]').forEach(b=>b.addEventListener('click',()=>{
    input.value=localInput(nextSlot(b.dataset.schedulePreset));
  }));
  $('[data-publish-now-from-modal]')?.addEventListener('click',()=>{
    closeModal();
    publishNow(post.id);
  });
  $('#scheduleForm')?.addEventListener('submit',async e=>{
    e.preventDefault();
    const button=e.currentTarget.querySelector('[data-save-schedule]');
    const done=setButtonBusy(button,'儲存中…');
    const iso=taipeiLocalToIso(input.value);
    try{
      await api(`/posts/${encodeURIComponent(post.id)}/status`,{
        method:'POST',body:JSON.stringify({status:'scheduled',scheduled_at:iso})
      });
      closeModal();
      toast('排程已儲存');
      await load();
    }catch(error){
      toast(error.message||String(error),true);
      done();
    }
  });
}

async function changeStatus(id,status,button){
  const done=setButtonBusy(button,'更新中…');
  try{
    await api(`/posts/${encodeURIComponent(id)}/status`,{method:'POST',body:JSON.stringify({status})});
    toast(status==='pending_review'?'已送待審核':status==='draft'?'已退回草稿／取消排程':'狀態已更新');
    await load();
  }catch(error){
    toast(error.message||String(error),true);
    done();
  }
}

async function publishNow(id,button){
  if(!confirm('確認要立即發布這篇貼文？系統只會發布到已完成授權的平台，其他平台會轉為人工發布。'))return;
  const done=setButtonBusy(button,'發布中…');
  try{
    const result=await api(`/posts/${encodeURIComponent(id)}/publish-now`,{method:'POST',body:'{}',timeout:30000});
    toast(result?.message||'立即發布處理完成');
    await load();
  }catch(error){
    toast(error.message||String(error),true);
    done();
  }
}

function debounce(fn,ms=320){
  let timer;
  return(...args)=>{
    clearTimeout(timer);
    timer=setTimeout(()=>fn(...args),ms);
  };
}

async function loadMe(){
  try{
    state.me=await api('/me',{timeout:12000});
    $('#userState').textContent=state.me?.display_name||state.me?.email||'已登入';
  }catch(error){
    $('#userState').textContent='登入驗證失敗';
    toast(error.message||String(error),true);
  }
}

function bind(){
  document.addEventListener('click',e=>{
    const close=e.target.closest('[data-close-modal]');
    if(close){closeModal();return;}
    const refresh=e.target.closest('[data-refresh]');
    if(refresh){load();return;}
    const more=e.target.closest('[data-load-more]');
    if(more){load({append:true});return;}
    const add=e.target.closest('[data-add-post]');
    if(add){openPostForm();return;}
    const metric=e.target.closest('[data-filter-status]');
    if(metric){
      state.status=state.status===metric.dataset.filterStatus?'all':metric.dataset.filterStatus;
      $('#statusFilter').value=state.status;
      load();
      return;
    }
    const view=e.target.closest('[data-post-view],[data-post-deliveries]');
    if(view){
      const id=view.dataset.postView||view.dataset.postDeliveries;
      const post=state.items.find(p=>p.id===id);
      if(post)openPostView(post,view);
      return;
    }
    const edit=e.target.closest('[data-post-edit]');
    if(edit){
      const post=state.items.find(p=>p.id===edit.dataset.postEdit);
      if(post)openPostForm(post);
      return;
    }
    const status=e.target.closest('[data-post-status]');
    if(status&&!status.disabled){changeStatus(status.dataset.id,status.dataset.postStatus,status);return;}
    const schedule=e.target.closest('[data-post-schedule]');
    if(schedule){
      const post=state.items.find(p=>p.id===schedule.dataset.postSchedule);
      if(post)openSchedule(post);
      return;
    }
    const publish=e.target.closest('[data-post-publish-now]');
    if(publish){publishNow(publish.dataset.postPublishNow,publish);}
  });

  const search=debounce(value=>{
    state.filter=value;
    load();
  },340);
  $('#searchInput')?.addEventListener('input',e=>search(e.target.value));
  $('#statusFilter')?.addEventListener('change',e=>{
    state.status=e.target.value;
    load();
  });
  $('#clearFilters')?.addEventListener('click',()=>{
    state.filter='';
    state.status='all';
    $('#searchInput').value='';
    $('#statusFilter').value='all';
    load();
  });
}

async function init(){
  bind();
  renderPlatforms();
  if(window.XJWPublishingReadiness?.run)await window.XJWPublishingReadiness.run({full:false});
  await Promise.allSettled([loadMe(),load()]);
  document.documentElement.dataset.publishingRuntime='20260814-standalone-v17-review-flow';
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',init,{once:true});
}else{
  init();
}
