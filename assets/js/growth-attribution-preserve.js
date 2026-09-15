(()=>{
  const VERSION='2026-09-16-growth-attribution-preserve-v1';
  async function req(path){const r=await fetch(`/api${path}`,{credentials:'same-origin',cache:'no-store'}),t=await r.text();let d;try{d=t?JSON.parse(t):null}catch{d=null}if(!r.ok)throw new Error(d?.error||`HTTP ${r.status}`);return d}
  async function preserve(form){
    if(form.dataset.attributionPreserved==='1')return;
    const campaign=form.querySelector('[name="campaign_tag"]'),origin=form.querySelector('[name="lead_origin"]'),line=form.querySelector('[name="line_oa_status"]');
    if(!campaign||!origin||!line)return;form.dataset.attributionPreserved='1';
    const name=form.querySelector('[name="name"]')?.value.trim()||'',phone=form.querySelector('[name="phone"]')?.value.trim()||'',email=form.querySelector('[name="email"]')?.value.trim().toLowerCase()||'';
    if(!name&&!phone&&!email)return;
    try{const list=await req('/modules/customers'),item=(Array.isArray(list)?list:[]).find(i=>(phone&&String(i.phone||'').trim()===phone)||(email&&String(i.email||'').trim().toLowerCase()===email)||(name&&String(i.name||'').trim()===name));if(!item)return;if(!campaign.value&&item.campaign_tag)campaign.value=item.campaign_tag;if(!origin.value&&item.lead_origin)origin.value=item.lead_origin;if(!line.value&&item.line_oa_status)line.value=item.line_oa_status;}catch(error){console.warn('attribution preserve',error)}
  }
  const observer=new MutationObserver(()=>{const form=document.getElementById('recordForm');if(form)preserve(form)});observer.observe(document.documentElement,{childList:true,subtree:true});setTimeout(()=>{const form=document.getElementById('recordForm');if(form)preserve(form)},300);window.XJWGrowthAttributionPreserve={version:VERSION};
})();
