import publishingApp from './publishing-content-audit-entry.js';
import productionApp from './production-entry.js';

const VERSION='2026-08-22-full-system-entry-v1';
const ERP_PATH='/erp.html';
const PUBLISHING_PATH='/publishing.html';
const HEADERS={'cache-control':'no-store','x-content-type-options':'nosniff','x-xianjiawei-full-system':VERSION};

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{...HEADERS,'content-type':'application/json; charset=utf-8'}})}
function isErpUi(path){return path==='/'||path==='/index.html'||path==='/erp'||path==='/erp/'||path===ERP_PATH}
function isPublishingUi(path){return path==='/publishing'||path==='/publishing/'||path===PUBLISHING_PATH}
function isFullErpApi(path){
  return path==='/api/overview'||path==='/api/settings'||path==='/api/brand-content'||
    path==='/api/assets'||path.startsWith('/api/modules/')||path.startsWith('/media/');
}
async function serveAsset(request,env,target){
  if(!env?.ASSETS?.fetch)return json({error:'內部系統靜態資源尚未就緒',code:'XJW_ASSET_UNAVAILABLE'},503);
  const url=new URL(request.url);url.pathname=target;url.search='';url.hash='';
  const asset=await env.ASSETS.fetch(new Request(url.toString(),{method:'GET',headers:request.headers}));
  if(!asset.ok)return json({error:`${target} 載入失敗`,code:'XJW_ASSET_LOAD_FAILED',status:asset.status},503);
  const headers=new Headers(asset.headers);for(const [k,v] of Object.entries(HEADERS))headers.set(k,v);
  headers.set('x-xianjiawei-ui',target===ERP_PATH?'erp':'publishing');
  return new Response(asset.body,{status:200,headers});
}

export default{
  async fetch(request,env,ctx){
    const path=new URL(request.url).pathname;
    if(request.method==='GET'&&isErpUi(path))return serveAsset(request,env,ERP_PATH);
    if(request.method==='GET'&&isPublishingUi(path))return serveAsset(request,env,PUBLISHING_PATH);

    // Full ERP modules must bypass the historical publishing-only blocker.
    if(isFullErpApi(path))return productionApp.fetch(request,env,ctx);

    // Current publishing, review, regeneration and media-audit behavior stays on the latest chain.
    const response=await publishingApp.fetch(request,env,ctx);
    if(request.method==='GET'&&['/healthz','/healthz/core'].includes(path)){
      try{
        const body=await response.clone().json();
        return json({...body,
          fullSystem:true,
          fullSystemVersion:VERSION,
          erpUiEnabled:true,
          erpPath:ERP_PATH,
          erpApisEnabled:true,
          publishingCenterEnabled:true,
          publishingPath:PUBLISHING_PATH,
          publishingCenterIndependent:true,
          qixuanPublicVisible:false,
          internalDeferredProductDataAllowed:true
        },response.status);
      }catch{return response}
    }
    return response;
  },
  async scheduled(controller,env,ctx){
    if(typeof publishingApp.scheduled==='function')return publishingApp.scheduled(controller,env,ctx);
    if(typeof productionApp.scheduled==='function')return productionApp.scheduled(controller,env,ctx);
  }
};

export {VERSION};
