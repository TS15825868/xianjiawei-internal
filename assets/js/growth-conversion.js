(()=>{
  const VERSION='2026-09-16-growth-conversion-v1';
  let busy=false;
  const esc2=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function req(path){const r=await fetch(`/api${path}`,{credentials:'same-origin',cache:'no-store'}),t=await r.text();let d;try{d=t?JSON.parse(t):null}catch{d=null}if(!r.ok)throw new Error(d?.error||`HTTP ${r.status}`);return d}
  function reached(stage,target){
    const order=['new','researching','contacted','follow_up','trial','customer','repeat'];
    const a=order.indexOf(stage),b=order.indexOf(target);return a>=0&&b>=0&&a>=b;
  }
  function pct(n,d){return d>0?`${Math.round(n*100/d)}%`:'—'}
  async function render(){
    const hash=location.hash||'#dashboard';if(!['#dashboard','#customers'].includes(hash)||busy)return;
    const app=document.getElementById('app');if(!app||app.querySelector('[data-growth-conversion]'))return;
    const anchor=app.querySelector('[data-growth-attribution]');if(!anchor)return;busy=true;
    try{
      const customers=await req('/modules/customers'),items=(Array.isArray(customers)?customers:[]).filter(i=>i.lifecycle_stage);
      const trial=items.filter(i=>reached(i.lifecycle_stage,'trial')).length,customer=items.filter(i=>reached(i.lifecycle_stage,'customer')).length,repeat=items.filter(i=>i.lifecycle_stage==='repeat').length;
      const groups={};for(const i of items){const source=String(i.source||'未標記').trim()||'未標記';const g=groups[source]||(groups[source]={total:0,trial:0,customer:0,repeat:0});g.total++;if(reached(i.lifecycle_stage,'trial'))g.trial++;if(reached(i.lifecycle_stage,'customer'))g.customer++;if(i.lifecycle_stage==='repeat')g.repeat++;}
      const rows=Object.entries(groups).sort((a,b)=>b[1].total-a[1].total).slice(0,8);
      const section=document.createElement('section');section.className='card xjw-growth-panel';section.dataset.growthConversion=VERSION;
      section.innerHTML=`<div class="xjw-growth-head"><div><h2>來源 → 成交漏斗</h2><p>不看名單數量漂亮不漂亮，改看來源是否真的走到試喝／樣品、成交與回購。</p></div></div><div class="xjw-growth-metrics"><div class="xjw-growth-metric"><small>有階段資料</small><strong>${items.length}</strong></div><div class="xjw-growth-metric"><small>到試喝／樣品</small><strong>${trial}</strong><small>${pct(trial,items.length)}</small></div><div class="xjw-growth-metric"><small>到成交</small><strong>${customer}</strong><small>${pct(customer,items.length)}</small></div></div>${rows.length?`<div style="overflow:auto"><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:8px">來源</th><th style="text-align:right;padding:8px">有階段資料</th><th style="text-align:right;padding:8px">試喝／樣品+</th><th style="text-align:right;padding:8px">成交+</th><th style="text-align:right;padding:8px">回購</th></tr></thead><tbody>${rows.map(([source,g])=>`<tr><td style="padding:8px;border-top:1px solid #eef0f2">${esc2(source)}</td><td style="text-align:right;padding:8px;border-top:1px solid #eef0f2">${g.total}</td><td style="text-align:right;padding:8px;border-top:1px solid #eef0f2">${g.trial}</td><td style="text-align:right;padding:8px;border-top:1px solid #eef0f2">${g.customer}</td><td style="text-align:right;padding:8px;border-top:1px solid #eef0f2">${g.repeat}</td></tr>`).join('')}</tbody></table></div>`:'<p class="xjw-growth-note">目前尚未有足夠的客戶階段資料；既有客戶可逐步補，不需要一次重填。</p>'}<div class="xjw-growth-note">比例只使用已填 lifecycle_stage 的紀錄，未填舊資料不會硬算進分母；因此這是營運追蹤指標，不是保證成交率。</div>`;
      anchor.insertAdjacentElement('afterend',section);
    }catch(error){console.warn('growth conversion',error)}finally{busy=false}
  }
  const observer=new MutationObserver(render);observer.observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('hashchange',()=>setTimeout(render,150));setTimeout(render,600);window.XJWGrowthConversion={version:VERSION};
})();
