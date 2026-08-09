(()=>{
  'use strict';
  const VERSION='20260809-publishing-resilience-v1';
  const CACHE_PREFIX='xjw-publishing-cache:';
  const MAX_CACHE_AGE=24*60*60*1000;
  const originalFetch=window.fetch.bind(window);
  let usingCache=false;

  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const isGet=options=>String(options?.method||'GET').toUpperCase()==='GET';
  const apiUrl=input=>{try{return new URL(typeof input==='string'?input:input.url,location.href)}catch{return null}};
  const isSafeCachePath=url=>url&&url.origin===location.origin&&(/^\/api\/posts(?:\?|$)/.test(url.pathname+url.search)||url.pathname==='/api/platform-authorization');
  const key=url=>CACHE_PREFIX+btoa(unescape(encodeURIComponent(url.pathname+url.search))).replace(/=+$/,'');
  function writeCache(url,text,status,headers){
    if(!url||!text||status<200||status>=300)return;
    try{localStorage.setItem(key(url),JSON.stringify({at:Date.now(),text,status,contentType:headers.get('content-type')||'application/json'}))}catch{}
  }
  function readCache(url){
    try{
      const raw=localStorage.getItem(key(url));if(!raw)return null;
      const item=JSON.parse(raw);if(!item?.text||Date.now()-Number(item.at||0)>MAX_CACHE_AGE)return null;
      return item;
    }catch{return null}
  }
  function cachedResponse(url,item){
    usingCache=true;
    window.__XJW_PUBLISHING_CACHE_USED__=true;
    document.dispatchEvent(new CustomEvent('xjw-publishing-cache-used',{detail:{url:url.pathname+url.search,at:item.at}}));
    return new Response(item.text,{status:200,headers:{'content-type':item.contentType||'application/json','cache-control':'no-store','x-xjw-publishing-cache':'1'}});
  }
  async function attempt(input,options,url,attemptNo){
    const timeoutMs=Number(options?.xjwTimeout||7000);
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    let cleanup=()=>{};
    if(options?.signal){
      const abort=()=>controller.abort();
      if(options.signal.aborted)controller.abort();else options.signal.addEventListener('abort',abort,{once:true});
      cleanup=()=>options.signal.removeEventListener('abort',abort);
    }
    try{
      const forwarded={...options,signal:controller.signal};delete forwarded.xjwTimeout;
      const response=await originalFetch(input,forwarded);
      if(isGet(options)&&isSafeCachePath(url)&&response.ok){
        const clone=response.clone();clone.text().then(text=>writeCache(url,text,response.status,response.headers)).catch(()=>{});
      }
      if(isGet(options)&&attemptNo<2&&[408,425,429,500,502,503,504].includes(response.status))throw Object.assign(new Error(`HTTP ${response.status}`),{xjwRetryable:true});
      return response;
    }finally{clearTimeout(timer);cleanup()}
  }
  window.fetch=async function resilientFetch(input,options={}){
    const url=apiUrl(input),safeGet=isGet(options)&&url&&url.origin===location.origin&&url.pathname.startsWith('/api/');
    if(!safeGet)return originalFetch(input,options);
    let lastError=null;
    for(let i=0;i<3;i+=1){
      try{
        const response=await attempt(input,options,url,i);
        if(response.ok){usingCache=false;window.__XJW_PUBLISHING_CACHE_USED__=false;}
        return response;
      }catch(error){
        lastError=error;
        if(options?.signal?.aborted)break;
        if(i<2)await sleep(i===0?350:900);
      }
    }
    if(isSafeCachePath(url)){
      const cached=readCache(url);if(cached)return cachedResponse(url,cached);
    }
    throw lastError||new Error('系統暫時無法連線');
  };

  function setReadOnly(readOnly,message=''){
    document.documentElement.dataset.publishingOffline=readOnly?'true':'false';
    document.querySelectorAll('[data-add-post],[data-post-edit],[data-post-status],[data-post-schedule],[data-post-publish-now],[data-submit-post],[data-save-schedule],[data-publish-now-from-modal],[data-manual-package]').forEach(button=>{
      if(readOnly){button.dataset.xjwOfflineDisabled='1';button.disabled=true;button.title='目前使用快取資料，重新連線後才能修改或發布。'}
      else if(button.dataset.xjwOfflineDisabled==='1'){delete button.dataset.xjwOfflineDisabled;button.disabled=false;button.removeAttribute('title')}
    });
    const state=document.querySelector('#connectionState');
    if(state&&readOnly){state.textContent=message||'快取模式｜僅供查看';state.classList.add('cached')}
    if(state&&!readOnly)state.classList.remove('cached');
  }
  document.addEventListener('xjw-publishing-cache-used',event=>{
    const time=new Date(event.detail.at).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'});
    requestAnimationFrame(()=>setReadOnly(true,`暫時離線｜顯示 ${time} 快取，僅供查看`));
  });
  document.addEventListener('xjw-publishing-list-rendered',()=>{if(usingCache)setReadOnly(true)});
  window.addEventListener('offline',()=>setReadOnly(true,'目前離線｜保留畫面，僅供查看'));
  window.addEventListener('online',()=>{
    setReadOnly(false);
    const refresh=document.querySelector('[data-refresh]');
    if(refresh){setTimeout(()=>refresh.click(),250)}
  });
  const reconnect=setInterval(()=>{
    if(document.documentElement.dataset.publishingOffline==='true'&&navigator.onLine!==false){
      document.querySelector('[data-refresh]')?.click();
    }
  },30000);
  if(typeof reconnect?.unref==='function')reconnect.unref();
  window.XJWPublishingResilience={version:VERSION,isUsingCache:()=>usingCache,setReadOnly};
})();
