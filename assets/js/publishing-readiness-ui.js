(()=>{
  'use strict';
  const VERSION='20260809-publishing-readiness-ui-v2-fast-core-background-platforms';
  const MUTATION_SELECTOR='[data-add-post],[data-post-edit],[data-post-status],[data-post-schedule],[data-post-publish-now],[data-submit-post],[data-save-schedule],[data-publish-now-from-modal],[data-manual-package]';
  let safeMode=true,report=null,running=null,lastFullProbe=0;
  const $=s=>document.querySelector(s);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function timeoutFetch(url,ms=7000){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),ms);
    return fetch(url,{credentials:'same-origin',cache:'no-store',signal:controller.signal}).finally(()=>clearTimeout(timer));
  }
  async function readJson(response){const text=await response.text();let data={};try{data=text?JSON.parse(text):{}}catch{}return{response,data,text}}
  function statusChip(label,item){
    const ok=item?.ok===true,manual=item?.mode==='manual',cls=ok?'ok':manual?'manual':'bad';
    const detail=ok?(item.latencyMs!=null?`${item.latencyMs}ms`:'正常'):manual?'人工':'異常';
    return`<span class="readiness-chip ${cls}"><strong>${esc(label)}</strong><small>${esc(detail)}</small></span>`;
  }
  function render(){
    const root=$('#readinessSummary');if(!root)return;
    if(!report){root.innerHTML='<span class="readiness-chip checking"><strong>系統診斷</strong><small>檢查中…</small></span>';return}
    const base=[statusChip('Worker',report.worker),statusChip('D1',report.d1),statusChip('Access',report.access),statusChip('登入',report.login)];
    const p=report.platformProbe?.platforms||{};
    if(!Object.keys(p).length)base.push('<span class="readiness-chip checking"><strong>平台 API</strong><small>背景檢查中</small></span>');
    for(const name of ['Facebook','Instagram','LINE OA','LINE VOOM','Google 商家'])if(p[name])base.push(statusChip(name,p[name]));
    root.innerHTML=base.join('');
  }
  function applySafeMode(){
    document.documentElement.dataset.publishingSafeMode=safeMode?'true':'false';
    document.querySelectorAll(MUTATION_SELECTOR).forEach(button=>{
      if(safeMode){
        if(!button.disabled)button.dataset.xjwSafetyDisabled='1';
        button.disabled=true;
        if(!button.dataset.xjwOfflineDisabled)button.title='核心服務尚未通過安全診斷，目前僅供查看。';
      }else if(button.dataset.xjwSafetyDisabled==='1'&&!button.dataset.xjwOfflineDisabled){
        delete button.dataset.xjwSafetyDisabled;
        button.disabled=false;
        if(button.title==='核心服務尚未通過安全診斷，目前僅供查看。')button.removeAttribute('title');
      }
    });
    const state=$('#connectionState');
    if(state&&safeMode&&document.documentElement.dataset.publishingOffline!=='true'){
      state.textContent='安全檢查中｜暫停寫入';state.classList.add('safe-mode');
    }else if(state&&!safeMode)state.classList.remove('safe-mode');
  }
  async function run({full=false}={}){
    if(running)return running;
    running=(async()=>{
      render();safeMode=true;applySafeMode();
      try{
        const core=await timeoutFetch('/healthz/core',4500);if(!core.ok)throw new Error(`Worker HTTP ${core.status}`);
        const readiness=await timeoutFetch(`/healthz/readiness${full?'?probe=1':''}`,full?10000:6500);
        const parsed=await readJson(readiness);report=parsed.data||{};
        if(full)lastFullProbe=Date.now();
        safeMode=!Boolean(report.ok);
      }catch(error){
        report={ok:false,worker:{ok:navigator.onLine!==false},d1:{ok:false,error:String(error?.message||error)},access:{ok:false},login:{ok:false},safeMode:true};
        safeMode=true;
      }
      render();applySafeMode();
      document.dispatchEvent(new CustomEvent('xjw-publishing-readiness',{detail:{report,safeMode,version:VERSION}}));
      return report;
    })().finally(()=>{running=null});
    return running;
  }
  function schedulePlatformProbe(delay=900){setTimeout(()=>{if(Date.now()-lastFullProbe>5*60*1000)run({full:true})},delay)}
  document.addEventListener('click',event=>{if(event.target.closest('[data-diagnose]'))run({full:true})});
  document.addEventListener('xjw-publishing-list-rendered',applySafeMode);
  document.addEventListener('DOMContentLoaded',()=>{render();applySafeMode();run({full:false}).then(()=>schedulePlatformProbe(900))});
  const coreTimer=setInterval(()=>run({full:false}),60000);if(typeof coreTimer?.unref==='function')coreTimer.unref();
  const platformTimer=setInterval(()=>run({full:true}),5*60*1000);if(typeof platformTimer?.unref==='function')platformTimer.unref();
  window.XJWPublishingReadiness={version:VERSION,run,getReport:()=>report,isSafeMode:()=>safeMode,applySafeMode,schedulePlatformProbe};
})();
