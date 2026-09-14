(()=>{
  'use strict';
  const VERSION='20260914-publishing-readiness-ui-v8-unified-platform-status';
  const MUTATION_SELECTOR='[data-add-post],[data-post-edit],[data-post-status],[data-post-schedule],[data-post-publish-now],[data-submit-post],[data-save-schedule],[data-publish-now-from-modal],[data-manual-package]';
  const PUBLISH_SELECTOR='[data-post-publish-now],[data-publish-now-from-modal]';
  let safeMode=true,publishReady=false,platformChecked=false,report=null,running=null,lastFullProbe=0;
  const $=s=>document.querySelector(s);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function timeoutFetch(url,ms=7000){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),ms);return fetch(url,{credentials:'same-origin',cache:'no-store',signal:controller.signal}).finally(()=>clearTimeout(timer))}
  async function readJson(response){const text=await response.text();let data={};try{data=text?JSON.parse(text):{}}catch{}return{response,data,text}}
  function statusChip(label,item){
    const ok=item?.ok===true,manual=item?.mode==='manual'||item?.manualRequired===true,degraded=item?.degraded===true,unconfigured=item?.unconfigured===true||item?.configured===false;
    const cls=manual?'manual':degraded?'manual':ok?'ok':'bad';
    const detail=manual?'人工':degraded?'備援':unconfigured?'未設定':ok?(item.latencyMs!=null?`${item.latencyMs}ms`:'已連線'):'異常';
    const reason=item?.reason||item?.error||item?.status||(Array.isArray(item?.missing)&&item.missing.length?`缺少 ${item.missing.join('、')}`:'');
    return`<span class="readiness-chip ${cls}"${reason?` title="${esc(reason)}"`:''}><strong>${esc(label)}</strong><small>${esc(detail)}</small></span>`;
  }
  function issue(label,item){
    if(!item||item.ok===true||item.mode==='manual'||item.configured===false||item.degraded===true||item.unconfigured===true)return'';
    const reason=item.error||item.reason||(Array.isArray(item.missing)&&item.missing.length?`缺少 ${item.missing.join('、')}`:'健康檢查未通過');
    return`<div class="readiness-issue"><strong>${esc(label)}</strong><span>${esc(reason)}</span></div>`;
  }
  function platformNote(label,item){
    if(item?.degraded===true)return`<div class="readiness-issue"><strong>${esc(label)}</strong><span>官方 API 尚未完整連結，目前既有 Webhook 備援可用，不會誤判成整體中斷。</span></div>`;
    if(item?.unconfigured===true||item?.configured===false)return`<div class="readiness-issue"><strong>${esc(label)}</strong><span>尚未設定正式發布連線；不影響其他已連線平台。</span></div>`;
    return'';
  }
  function renderPlatformSummary(probe){
    const root=$('#platformSummary');if(!root)return;
    const p=probe?.platforms||{};
    const names=['Facebook','Instagram','LINE OA','LINE VOOM','Google 商家'];
    const entries=names.filter(name=>p[name]).map(name=>{
      const item=p[name]||{};
      const manual=item.mode==='manual'||item.manualRequired===true;
      const degraded=item.degraded===true;
      const unconfigured=item.unconfigured===true||item.configured===false;
      const operational=item.ok===true||item.operational===true;
      const cls=operational&&!degraded?'ready':'manual';
      const text=manual?'人工發布':degraded?'Webhook 備援':unconfigured?'未設定':operational?'已連線':'連線異常';
      const reason=item.reason||item.error||item.status||'';
      return`<span class="platform-chip ${cls}"${reason?` title="${esc(reason)}"`:''}>${esc(name)}：${esc(text)}</span>`;
    });
    if(entries.length)root.innerHTML=entries.join('');
  }
  function render(){
    const root=$('#readinessSummary');if(!root)return;
    if(!report){root.innerHTML='<span class="readiness-chip checking"><strong>系統診斷</strong><small>背景檢查中…</small></span>';return}
    const base=[statusChip('Worker',report.worker),statusChip('D1',report.d1),statusChip('Access',report.access),statusChip('登入',report.login)],issues=[issue('Worker',report.worker),issue('D1',report.d1),issue('Cloudflare Access',report.access),issue('登入',report.login)].filter(Boolean);
    const p=report.platformProbe?.platforms||{};
    if(!Object.keys(p).length)base.push('<span class="readiness-chip checking"><strong>平台 API</strong><small>背景檢查中</small></span>');
    for(const name of ['Facebook','Instagram','LINE OA','LINE VOOM','Google 商家'])if(p[name]){
      base.push(statusChip(name,p[name]));
      const problem=issue(name,p[name]);if(problem)issues.push(problem);
      const note=platformNote(name,p[name]);if(note)issues.push(note);
    }
    if(report.platformProbeError)issues.push(`<div class="readiness-issue"><strong>平台 API</strong><span>${esc(report.platformProbeError)}</span></div>`);
    root.innerHTML=`<div class="readiness-chips">${base.join('')}</div>${issues.length?`<div class="readiness-issues">${issues.join('')}</div>`:''}`;
    if(report.platformProbe)renderPlatformSummary(report.platformProbe);
  }
  function applySafeMode(){
    document.documentElement.dataset.publishingSafeMode=safeMode?'true':'false';document.documentElement.dataset.publishingPublishReady=publishReady?'true':'false';
    document.querySelectorAll(MUTATION_SELECTOR).forEach(button=>{if(safeMode){if(!button.disabled)button.dataset.xjwSafetyDisabled='1';button.disabled=true;if(!button.dataset.xjwOfflineDisabled)button.title='核心服務尚未通過安全診斷，目前僅供查看。'}else if(button.dataset.xjwSafetyDisabled==='1'&&!button.dataset.xjwOfflineDisabled){delete button.dataset.xjwSafetyDisabled;button.disabled=false;if(button.title==='核心服務尚未通過安全診斷，目前僅供查看。')button.removeAttribute('title')}});
    document.querySelectorAll(PUBLISH_SELECTOR).forEach(button=>{if(!safeMode&&!publishReady){if(!button.disabled)button.dataset.xjwPlatformDisabled='1';button.disabled=true;button.title=platformChecked?'已設定的平台目前沒有可用的正式發布路徑，正式發布暫停。':'平台連線正在背景安全檢查，確認後自動開放正式發布。'}else if(button.dataset.xjwPlatformDisabled==='1'&&!button.dataset.xjwOfflineDisabled){delete button.dataset.xjwPlatformDisabled;button.disabled=false;if(/平台/.test(button.title||''))button.removeAttribute('title')}});
    const state=$('#connectionState');if(state&&safeMode&&document.documentElement.dataset.publishingOffline!=='true'){if(!/已連線|讀取貼文|載入更多/.test(state.textContent||''))state.textContent='安全檢查背景執行中｜資料可先載入';state.classList.add('safe-mode')}else if(state&&!safeMode){state.classList.remove('safe-mode');if(platformChecked&&!publishReady&&document.documentElement.dataset.publishingOffline!=='true'&&!/已連線/.test(state.textContent||''))state.textContent='核心正常｜平台發布暫停'}
  }
  async function run({full=false}={}){
    if(running)return running;
    running=(async()=>{
      const firstFull=full&&lastFullProbe===0;if(!report?.ok){safeMode=true;applySafeMode()}if(firstFull){platformChecked=false;publishReady=false;applySafeMode()}render();
      try{
        const core=await timeoutFetch('/healthz/core',4500);if(!core.ok)throw new Error(`Worker HTTP ${core.status}`);
        const readiness=await timeoutFetch(`/healthz/readiness${full?'?probe=1':''}`,full?15000:6500);
        const parsed=await readJson(readiness);report=parsed.data||{};safeMode=!Boolean(report.ok);
        if(full){lastFullProbe=Date.now();platformChecked=true;publishReady=Array.isArray(report.blockingPlatformFailures)?report.blockingPlatformFailures.length===0:true}
      }
      catch(error){if(full&&report?.ok){platformChecked=true;publishReady=false;report={...report,platformProbeError:String(error?.message||error)}}else{report={ok:false,worker:{ok:navigator.onLine!==false},d1:{ok:false,error:String(error?.message||error)},access:{ok:false},login:{ok:false},safeMode:true};safeMode=true;publishReady=false}}
      render();applySafeMode();document.dispatchEvent(new CustomEvent('xjw-publishing-readiness',{detail:{report,safeMode,publishReady,platformChecked,version:VERSION}}));return report
    })().finally(()=>{running=null});return running
  }
  function schedulePlatformProbe(delay=900){setTimeout(()=>{if(Date.now()-lastFullProbe>5*60*1000)run({full:true})},delay)}
  function publicRun(options={}){
    if(options?.full)return run({full:true});
    if(report)return Promise.resolve(report);
    queueMicrotask(()=>run({full:false}).then(()=>schedulePlatformProbe(900)).catch(()=>{}));
    return Promise.resolve({ok:null,bootDeferred:true,version:VERSION});
  }
  document.addEventListener('click',event=>{if(event.target.closest('[data-diagnose]'))run({full:true})});
  document.addEventListener('xjw-publishing-list-rendered',()=>{applySafeMode();if(report?.platformProbe)renderPlatformSummary(report.platformProbe)});
  document.addEventListener('DOMContentLoaded',()=>{render();applySafeMode();setTimeout(()=>run({full:false}).then(()=>schedulePlatformProbe(900)).catch(()=>{}),120)});
  const coreTimer=setInterval(()=>run({full:false}),60000);if(typeof coreTimer?.unref==='function')coreTimer.unref();const platformTimer=setInterval(()=>run({full:true}),5*60*1000);if(typeof platformTimer?.unref==='function')platformTimer.unref();
  window.XJWPublishingReadiness={version:VERSION,run:publicRun,runBlocking:run,getReport:()=>report,isSafeMode:()=>safeMode,isPublishReady:()=>publishReady,applySafeMode,schedulePlatformProbe};
})();
