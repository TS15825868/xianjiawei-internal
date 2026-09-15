(()=>{
  const VERSION='2026-09-16-growth-intelligence-v3-priority';
  const STAGES=[
    ['new','新名單'],['researching','了解中'],['contacted','已聯絡'],['follow_up','持續跟進'],['trial','試喝／樣品'],['customer','已成交'],['repeat','回購客戶'],['dormant','暫緩／沉睡']
  ];
  const CUSTOMER_TYPES=[['B2C','一般顧客 B2C'],['B2B','通路／中藥行 B2B'],['partner','合作夥伴'],['other','其他']];
  const INTENTS=[['low','低'],['medium','中'],['high','高']];
  const CHANNELS=[['LINE OA','LINE OA'],['電話','電話'],['Facebook','Facebook'],['Instagram','Instagram'],['Threads','Threads'],['現場','現場／拜訪'],['Email','Email'],['其他','其他']];
  let pendingCustomerId='';
  let dashboardBusy=false;
  let customerPageBusy=false;
  const esc=(value='')=>String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[char]));
  const clean=(value='')=>String(value??'').trim();
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const stageLabel=(value='')=>Object.fromEntries(STAGES)[value]||value||'未分類';

  function notify(message,error=false){
    if(typeof window.toast==='function')window.toast(message,error);
    else console[error?'error':'log'](message);
  }
  function injectStyle(){
    if(document.getElementById('xjwGrowthStyle'))return;
    const style=document.createElement('style');
    style.id='xjwGrowthStyle';
    style.textContent=`
      .xjw-growth-panel{padding:18px;margin-top:16px}
      .xjw-growth-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}
      .xjw-growth-head h2{margin:0 0 4px;font-size:19px}.xjw-growth-head p{margin:0;color:#667085;font-size:13px}
      .xjw-growth-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:12px 0}
      .xjw-growth-metric{border:1px solid #e5e7eb;border-radius:14px;padding:12px;background:#fff}
      .xjw-growth-metric small{display:block;color:#667085;margin-bottom:5px}.xjw-growth-metric strong{font-size:24px;color:#0b1f3b}
      .xjw-growth-list{display:grid;gap:8px}.xjw-growth-row{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:10px 0;border-top:1px solid #eef0f2}
      .xjw-growth-row:first-child{border-top:0}.xjw-growth-row p{margin:3px 0 0;color:#667085;font-size:13px}
      .xjw-growth-actions{display:flex;gap:6px;flex-wrap:wrap}
      .xjw-growth-badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:5px}.xjw-growth-badge{font-size:12px;padding:3px 8px;border-radius:999px;background:#f2f4f7;color:#344054}
      .xjw-growth-score{background:#fff3dc;color:#7a4d00;font-weight:700}
      .xjw-growth-note{font-size:12px;color:#667085;margin-top:10px}
      .xjw-growth-section{grid-column:1/-1;border-top:1px solid #e5e7eb;margin-top:4px;padding-top:12px}.xjw-growth-section strong{color:#0b1f3b}.xjw-growth-section small{display:block;color:#667085;margin-top:3px}
      @media(max-width:720px){.xjw-growth-metrics{grid-template-columns:1fr}.xjw-growth-row{align-items:flex-start;flex-direction:column}}
    `;
    document.head.appendChild(style);
  }

  async function xjwApi(path,options={}){
    const response=await fetch(`/api${path}`,{credentials:'same-origin',cache:'no-store',...options,headers:{...(options.body?{'content-type':'application/json'}:{}),...(options.headers||{})}});
    const text=await response.text();let data=null;try{data=text?JSON.parse(text):null}catch{data={error:text}}
    if(!response.ok)throw new Error(data?.error||`HTTP ${response.status}`);return data;
  }

  function optionHtml(items,current=''){
    const known=new Set(items.map(([value])=>value));
    const extra=current&&!known.has(current)?`<option value="${esc(current)}" selected>${esc(current)}</option>`:'';
    return extra+items.map(([value,label])=>`<option value="${esc(value)}" ${String(current)===String(value)?'selected':''}>${esc(label)}</option>`).join('');
  }
  function fieldInput(name,label,value='',type='text',full=false){
    return `<label class="field ${full?'full':''}"><span>${esc(label)}</span><input name="${esc(name)}" type="${esc(type)}" value="${esc(value)}"></label>`;
  }
  function fieldSelect(name,label,items,value='',full=false){
    return `<label class="field ${full?'full':''}"><span>${esc(label)}</span><select name="${esc(name)}"><option value="">未設定</option>${optionHtml(items,value)}</select></label>`;
  }

  async function enhanceCustomerForm(form){
    if(form.dataset.growthEnhanced==='1')return;
    if(!form.querySelector('[name="phone"]')||!form.querySelector('[name="source"]'))return;
    form.dataset.growthEnhanced='1';
    let item={};
    const id=pendingCustomerId;
    pendingCustomerId='';
    if(id){try{item=await xjwApi(`/modules/customers/${encodeURIComponent(id)}`)||{}}catch(error){console.warn('growth customer fetch',error)}}
    const grid=form.querySelector('.form-grid');if(!grid)return;
    const node=document.createElement('div');node.className='xjw-growth-section';node.innerHTML='<strong>獲客／跟進智慧欄位</strong><small>把外部獲客概念轉成仙加味自己的客戶階段與下一步；只做內部管理，不自動群發陌生訊息。</small>';
    grid.appendChild(node);
    grid.insertAdjacentHTML('beforeend',[
      fieldSelect('customer_type','客戶類型',CUSTOMER_TYPES,item.customer_type||''),
      fieldSelect('lifecycle_stage','客戶階段',STAGES,item.lifecycle_stage||''),
      fieldSelect('intent_level','意向程度',INTENTS,item.intent_level||''),
      fieldSelect('preferred_channel','偏好聯絡方式',CHANNELS,item.preferred_channel||''),
      fieldInput('source_detail','來源細分',item.source_detail||'', 'text', true),
      fieldInput('interest_products','關注產品',item.interest_products||'', 'text', true),
      fieldInput('last_contact_date','上次聯絡日期',item.last_contact_date||'', 'date'),
      fieldInput('next_follow_up_date','下次跟進日期',item.next_follow_up_date||'', 'date'),
      fieldInput('owner','負責人',item.owner||''),
      fieldInput('tags','標籤',item.tags||'', 'text'),
      `<label class="field full"><span>下一步</span><textarea name="next_action">${esc(item.next_action||'')}</textarea></label>`,
      `<label class="field full"><span>聯絡限制</span><select name="contact_permission"><option value="">未設定</option><option value="normal" ${item.contact_permission==='normal'?'selected':''}>可正常聯絡</option><option value="reply_only" ${item.contact_permission==='reply_only'?'selected':''}>只回覆對方主動詢問</option><option value="do_not_contact" ${item.contact_permission==='do_not_contact'?'selected':''}>停止主動聯絡</option></select></label>`
    ].join(''));
  }

  function priorityScore(item){
    if(item.contact_permission==='do_not_contact'||item.contact_permission==='reply_only')return-1;
    let score=0;
    if(item.customer_type==='B2B')score+=25;
    if(item.intent_level==='high')score+=25;else if(item.intent_level==='medium')score+=12;
    if(clean(item.interest_products))score+=15;
    if(clean(item.source_detail))score+=5;
    if(clean(item.preferred_channel))score+=5;
    if(clean(item.phone)||clean(item.email))score+=5;
    if(item.lifecycle_stage==='trial')score+=15;else if(item.lifecycle_stage==='follow_up')score+=10;else if(item.lifecycle_stage==='contacted')score+=6;else if(item.lifecycle_stage==='researching')score+=4;
    if(clean(item.next_follow_up_date)){score+=5;if(item.next_follow_up_date<=today())score+=5;}
    return Math.min(100,score);
  }

  function pipeline(customers){
    const date=today();
    const active=customers.filter((item)=>item.contact_permission!=='do_not_contact');
    const proactive=active.filter((item)=>item.contact_permission!=='reply_only');
    const open=(item)=>!['customer','repeat','dormant'].includes(item.lifecycle_stage);
    const due=proactive.filter((item)=>item.next_follow_up_date&&item.next_follow_up_date<=date&&open(item)).sort((a,b)=>priorityScore(b)-priorityScore(a));
    const high=proactive.filter((item)=>item.intent_level==='high'&&open(item)).sort((a,b)=>priorityScore(b)-priorityScore(a));
    const b2b=proactive.filter((item)=>item.customer_type==='B2B'&&open(item)).sort((a,b)=>priorityScore(b)-priorityScore(a));
    return{due,high,b2b,active,proactive};
  }

  function outreachSuggestion(item){
    if(item.contact_permission==='do_not_contact')throw new Error('此客戶已設定停止主動聯絡');
    if(item.contact_permission==='reply_only')throw new Error('此客戶只允許回覆主動詢問，不建立主動開發文字');
    const name=clean(item.name);const product=clean(item.interest_products);const next=clean(item.next_action);
    if(item.customer_type==='B2B'){
      return `您好${name?`，${name}`:''}，我是仙加味。我們是以龜鹿系列為主的現代漢方生活品牌，目前有龜鹿膏、龜鹿飲、龜鹿湯塊、龜鹿膠與鹿茸粉。${product?`您這邊先前關注的是${product}，`:''}${next?`這次想接著跟您確認${next}。`:''}如果方便，我可以先把產品規格與合作方式整理給您參考；若目前沒有需求也沒關係，謝謝。`;
    }
    return `您好${name?`，${name}`:''}，這裡是仙加味。${product?`您之前有詢問${product}，`:''}${next?`關於${next}，`:''}如果還想了解產品規格、使用方式、試喝或下單，我可以再幫您整理；如果目前不需要，也不用特別回覆。`;
  }

  async function copySuggestion(customerId){
    const customer=await xjwApi(`/modules/customers/${encodeURIComponent(customerId)}`);
    const text=outreachSuggestion(customer);
    if(!navigator.clipboard?.writeText)throw new Error('目前瀏覽器無法直接複製，請開啟客戶資料手動整理');
    await navigator.clipboard.writeText(text);
    notify('建議聯絡文字已複製；請人工確認後再發送');
    return text;
  }

  function leadRows(items,{showSuggestion=true}={}){
    if(!items.length)return '<p class="xjw-growth-note">目前沒有符合條件的名單。</p>';
    return `<div class="xjw-growth-list">${items.slice(0,8).map((item)=>{const score=priorityScore(item);return`<div class="xjw-growth-row"><div><strong>${esc(item.name||item.id)}</strong><div class="xjw-growth-badges"><span class="xjw-growth-badge">${esc(stageLabel(item.lifecycle_stage))}</span>${score>=0?`<span class="xjw-growth-badge xjw-growth-score">優先 ${score}</span>`:''}${item.intent_level?`<span class="xjw-growth-badge">意向：${esc(item.intent_level==='high'?'高':item.intent_level==='medium'?'中':'低')}</span>`:''}${item.source?`<span class="xjw-growth-badge">${esc(item.source)}</span>`:''}</div><p>${esc(item.next_follow_up_date||'')} ${item.next_action?`｜${esc(item.next_action)}`:''}</p></div><div class="xjw-growth-actions">${showSuggestion&&item.contact_permission!=='reply_only'?`<button class="btn small" type="button" data-growth-suggest="${esc(item.id)}">建議文字</button>`:''}<button class="btn small" type="button" data-growth-task="${esc(item.id)}">建立任務</button><button class="btn small orange" type="button" data-growth-edit="${esc(item.id)}">開啟客戶</button></div></div>`}).join('')}</div>`;
  }

  async function ensureFollowupTask(customerId){
    const customer=await xjwApi(`/modules/customers/${encodeURIComponent(customerId)}`);
    if(customer.contact_permission==='do_not_contact'||customer.contact_permission==='reply_only')throw new Error('此客戶目前不列入主動跟進');
    if(!customer?.next_follow_up_date)throw new Error('這位客戶尚未設定下次跟進日期');
    const marker=`[growth:${customer.id}:${customer.next_follow_up_date}]`;
    const tasks=await xjwApi('/modules/tasks');
    const existing=(Array.isArray(tasks)?tasks:[]).find((task)=>task.status!=='completed'&&String(task.notes||'').includes(marker));
    if(existing){notify('這個跟進提醒已經存在，不重複建立');return existing;}
    const dueAt=new Date(`${customer.next_follow_up_date}T09:00:00+08:00`).toISOString();
    const body={
      title:`跟進｜${customer.name||customer.id}`,
      status:'todo',
      due_at:dueAt,
      assignee:customer.owner||'',
      notes:[`客戶：${customer.name||customer.id}`,customer.next_action?`下一步：${customer.next_action}`:'',customer.source?`來源：${customer.source}${customer.source_detail?`／${customer.source_detail}`:''}`:'',marker].filter(Boolean).join('\n')
    };
    const saved=await xjwApi('/modules/tasks',{method:'POST',body:JSON.stringify(body)});
    notify('已建立 ERP 跟進任務');
    return saved;
  }

  async function renderDashboardGrowth(){
    if(location.hash&&location.hash!=='#dashboard')return;
    const app=document.getElementById('app');if(!app||app.querySelector('[data-growth-dashboard]')||dashboardBusy)return;
    if(!app.querySelector('.metric-grid'))return;
    dashboardBusy=true;
    try{
      const customers=await xjwApi('/modules/customers');
      const p=pipeline(Array.isArray(customers)?customers:[]);
      const section=document.createElement('section');section.className='card xjw-growth-panel';section.dataset.growthDashboard=VERSION;
      section.innerHTML=`<div class="xjw-growth-head"><div><h2>客戶獲客／跟進</h2><p>把名單來源、意向與下一步集中到現有 ERP，不另開一套 CRM。</p></div><a class="btn" href="#customers">客戶管理</a></div><div class="xjw-growth-metrics"><div class="xjw-growth-metric"><small>今天以前待跟進</small><strong>${p.due.length}</strong></div><div class="xjw-growth-metric"><small>高意向未成交</small><strong>${p.high.length}</strong></div><div class="xjw-growth-metric"><small>B2B 開發中</small><strong>${p.b2b.length}</strong></div></div><h3>優先跟進</h3>${leadRows(p.due)}<div class="xjw-growth-note">「優先分數」只用來排工作順序，不代表成交機率。AI／智慧層只協助整理與建議；未經人工確認不會自動發陌生訊息。</div>`;
      app.appendChild(section);
    }catch(error){console.warn('growth dashboard',error)}finally{dashboardBusy=false;}
  }

  async function renderCustomerGrowth(){
    if(location.hash!=='#customers')return;
    const app=document.getElementById('app');if(!app||app.querySelector('[data-growth-customers]')||customerPageBusy)return;
    if(!document.getElementById('listRoot'))return;
    customerPageBusy=true;
    try{
      const customers=await xjwApi('/modules/customers');
      const list=Array.isArray(customers)?customers:[];const p=pipeline(list);
      const counts=STAGES.map(([value,label])=>[label,list.filter((item)=>item.lifecycle_stage===value).length]).filter(([,count])=>count>0);
      const section=document.createElement('section');section.className='card xjw-growth-panel';section.dataset.growthCustomers=VERSION;
      section.innerHTML=`<div class="xjw-growth-head"><div><h2>客戶階段總覽</h2><p>來源 → 聯絡 → 跟進 → 試喝／樣品 → 成交／回購。</p></div></div><div class="xjw-growth-badges">${counts.length?counts.map(([label,count])=>`<span class="xjw-growth-badge">${esc(label)} ${count}</span>`).join(''):'<span class="xjw-growth-badge">現有舊客戶可逐步補上階段，不強制一次重填</span>'}</div>${p.b2b.length?`<h3 style="margin-top:14px">B2B 精準開發優先順序</h3>${leadRows(p.b2b)}`:''}${p.due.length?`<h3 style="margin-top:14px">到期跟進</h3>${leadRows(p.due)}`:''}`;
      const toolbar=app.querySelector('.xjw-toolbar');
      if(toolbar)toolbar.insertAdjacentElement('afterend',section);else app.prepend(section);
    }catch(error){console.warn('growth customers',error)}finally{customerPageBusy=false;}
  }

  async function openGrowthCustomer(id){
    try{
      const item=await xjwApi(`/modules/customers/${encodeURIComponent(id)}`);
      pendingCustomerId=id;
      if(typeof window.openRecordForm==='function')window.openRecordForm('customers',item);
      else location.hash='customers';
    }catch(error){console.warn('growth edit',error);location.hash='customers';}
  }

  document.addEventListener('click',(event)=>{
    const edit=event.target.closest('[data-record-edit][data-module="customers"]');if(edit)pendingCustomerId=edit.dataset.recordEdit||'';
    const fab=event.target.closest('[data-fab="customers"]');if(fab)pendingCustomerId='';
    const growth=event.target.closest('[data-growth-edit]');if(growth){event.preventDefault();openGrowthCustomer(growth.dataset.growthEdit);return;}
    const task=event.target.closest('[data-growth-task]');if(task){event.preventDefault();task.disabled=true;ensureFollowupTask(task.dataset.growthTask).catch((error)=>notify(error.message||String(error),true)).finally(()=>{task.disabled=false;});return;}
    const suggest=event.target.closest('[data-growth-suggest]');if(suggest){event.preventDefault();suggest.disabled=true;copySuggestion(suggest.dataset.growthSuggest).catch((error)=>notify(error.message||String(error),true)).finally(()=>{suggest.disabled=false;});}
  },true);

  const observer=new MutationObserver(()=>{
    const form=document.getElementById('recordForm');if(form)enhanceCustomerForm(form);
    renderDashboardGrowth();renderCustomerGrowth();
  });
  injectStyle();
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('hashchange',()=>setTimeout(()=>{renderDashboardGrowth();renderCustomerGrowth();},100));
  setTimeout(()=>{renderDashboardGrowth();renderCustomerGrowth();},250);
  window.XJWGrowthIntelligence={version:VERSION,ensureFollowupTask,priorityScore,outreachSuggestion};
})();
