(()=>{
  const VERSION='2026-09-16-growth-attribution-v1';
  const esc2=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  let busy=false;
  async function req(path){const r=await fetch(`/api${path}`,{credentials:'same-origin',cache:'no-store'}),t=await r.text();let d;try{d=t?JSON.parse(t):null}catch{d=null}if(!r.ok)throw new Error(d?.error||`HTTP ${r.status}`);return d}
  function addField(grid,html){grid.insertAdjacentHTML('beforeend',html)}
  function enhanceForm(form){
    if(form.dataset.growthAttribution==='1'||form.dataset.growthEnhanced!=='1')return;
    const grid=form.querySelector('.form-grid');if(!grid)return;form.dataset.growthAttribution='1';
    const marker=document.createElement('div');marker.className='xjw-growth-section';marker.innerHTML='<strong>來源歸因</strong><small>記錄這位客戶第一次從哪裡進來、哪個活動帶來，以及是否已加入仙加味 LINE OA。</small>';grid.appendChild(marker);
    addField(grid,'<label class="field"><span>活動／批次標籤</span><input name="campaign_tag" placeholder="例如：萬華拜訪202609"></label>');
    addField(grid,'<label class="field"><span>LINE OA 狀態</span><select name="line_oa_status"><option value="">未設定</option><option value="connected">已加入</option><option value="not_connected">尚未加入</option><option value="unknown">不確定</option></select></label>');
    addField(grid,'<label class="field full"><span>來源網址／來源說明</span><input name="lead_origin" placeholder="官網頁面、社群貼文、活動或公開商家來源"></label>');
    const notice=document.createElement('div');notice.className='xjw-warning';notice.dataset.duplicateCheck='1';notice.textContent='系統會依電話與 Email 提醒可能重複的既有客戶；不會自動刪除或合併。';grid.appendChild(notice);
    const check=async()=>{const phone=form.querySelector('[name="phone"]')?.value.trim()||'',email=form.querySelector('[name="email"]')?.value.trim().toLowerCase()||'';if(!phone&&!email){notice.textContent='系統會依電話與 Email 提醒可能重複的既有客戶；不會自動刪除或合併。';return}try{const customers=await req('/modules/customers'),dupes=(Array.isArray(customers)?customers:[]).filter(i=>(phone&&String(i.phone||'').trim()===phone)||(email&&String(i.email||'').trim().toLowerCase()===email));notice.textContent=dupes.length?`注意：找到 ${dupes.length} 筆可能重複的既有客戶，儲存前請先確認。`:'目前沒有找到相同電話或 Email 的既有客戶。'}catch{notice.textContent='目前無法完成重複檢查，仍可手動確認。'}};
    form.querySelector('[name="phone"]')?.addEventListener('blur',check);form.querySelector('[name="email"]')?.addEventListener('blur',check);
  }
  async function renderAttribution(){
    const hash=location.hash||'#dashboard';if(!['#dashboard','#customers'].includes(hash)||busy)return;
    const app=document.getElementById('app');if(!app||app.querySelector('[data-growth-attribution]'))return;
    const anchor=app.querySelector('[data-growth-dashboard],[data-growth-customers]');if(!anchor)return;busy=true;
    try{const customers=await req('/modules/customers'),items=Array.isArray(customers)?customers:[];const by={};for(const i of items){const key=String(i.source||'未標記').trim()||'未標記';by[key]=(by[key]||0)+1}const line=items.filter(i=>i.line_oa_status==='connected'||i.preferred_channel==='LINE OA').length;const campaigns=items.filter(i=>String(i.campaign_tag||'').trim()).length;const section=document.createElement('section');section.className='card xjw-growth-panel';section.dataset.growthAttribution=VERSION;section.innerHTML=`<div class="xjw-growth-head"><div><h2>來源歸因</h2><p>看得出客戶從哪裡來，才知道哪些內容、拜訪與導流值得繼續做。</p></div></div><div class="xjw-growth-metrics"><div class="xjw-growth-metric"><small>已加入／偏好 LINE OA</small><strong>${line}</strong></div><div class="xjw-growth-metric"><small>有活動標籤</small><strong>${campaigns}</strong></div><div class="xjw-growth-metric"><small>來源種類</small><strong>${Object.keys(by).length}</strong></div></div><div class="xjw-growth-badges">${Object.entries(by).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,v])=>`<span class="xjw-growth-badge">${esc2(k)} ${v}</span>`).join('')}</div><div class="xjw-growth-note">這裡只做來源分析與跟進管理；不把「大量名單」當成成功指標。</div>`;anchor.insertAdjacentElement('afterend',section)}catch(e){console.warn('growth attribution',e)}finally{busy=false}
  }
  const observer=new MutationObserver(()=>{const form=document.getElementById('recordForm');if(form)enhanceForm(form);renderAttribution()});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('hashchange',()=>setTimeout(renderAttribution,150));setTimeout(renderAttribution,400);
  window.XJWGrowthAttribution={version:VERSION};
})();
