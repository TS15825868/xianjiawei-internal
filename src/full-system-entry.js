import publishingApp from './publishing-content-audit-entry.js';
import productionApp from './production-entry.js';

const VERSION='2026-09-03-full-system-entry-v2-social-morning';
const ERP_PATH='/erp.html';
const PUBLISHING_PATH='/publishing.html';
const SOCIAL_SCHEDULE_POLICY='週一／週三／週五 09:00（Asia/Taipei）；正常每週 3 篇；短影片若有合格成品只取代當週其中一篇，不另外增加篇數';
const SOCIAL_FIXED_FREQUENCY='每週 3 篇（週一／週三／週五 09:00，Asia/Taipei）';
const SOCIAL_FIRST_PUBLISH_AT='2026-09-04T09:00:00+08:00';
const SOCIAL_POLICY_VERSION='2026-09-03-social-publishing-v2-morning';
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
async function currentSettings(request,env,ctx){
  const response=await productionApp.fetch(request,env,ctx);
  if(!response.ok)return response;
  try{
    const body=await response.clone().json();
    const settings=body?.settings&&typeof body.settings==='object'?body.settings:{};
    return json({...body,settings:{...settings,
      schedule_policy:SOCIAL_SCHEDULE_POLICY,
      fixed_posting_frequency:SOCIAL_FIXED_FREQUENCY,
      social_policy_version:SOCIAL_POLICY_VERSION,
      social_first_publish_at:SOCIAL_FIRST_PUBLISH_AT
    }},response.status);
  }catch{return response}
}

export default{
  async fetch(request,env,ctx){
    const path=new URL(request.url).pathname;
    if(request.method==='GET'&&isErpUi(path))return serveAsset(request,env,ERP_PATH);
    if(request.method==='GET'&&isPublishingUi(path))return serveAsset(request,env,PUBLISHING_PATH);

    // The current social schedule shown in ERP must always come from the latest formal policy.
    if(request.method==='GET'&&path==='/api/settings')return currentSettings(request,env,ctx);

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
          internalDeferredProductDataAllowed:true,
          fixedPostingFrequency:SOCIAL_FIXED_FREQUENCY,
          socialSchedulePolicy:SOCIAL_SCHEDULE_POLICY,
          socialPolicyVersion:SOCIAL_POLICY_VERSION,
          socialFirstPublishAt:SOCIAL_FIRST_PUBLISH_AT
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

export {VERSION,SOCIAL_SCHEDULE_POLICY,SOCIAL_FIXED_FREQUENCY,SOCIAL_FIRST_PUBLISH_AT,SOCIAL_POLICY_VERSION};
