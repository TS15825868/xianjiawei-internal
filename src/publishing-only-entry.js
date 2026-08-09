import app from './production-entry.js';
import { VERSION as REVIEW_GATE_VERSION } from './publishing-review-gate-entry.js';

const VERSION='2026-08-09-publishing-only-entry-v2-regeneration-health';
const RETIRED_EXACT=new Set([
  '/api/overview',
  '/api/settings',
  '/api/users',
  '/api/audit',
  '/api/assets',
  '/api/brand-content'
]);
const RETIRED_PREFIXES=['/api/modules/'];
const HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-xianjiawei-publishing-only':VERSION};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});

function retired(path){
  return RETIRED_EXACT.has(path)||RETIRED_PREFIXES.some(prefix=>path.startsWith(prefix));
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(retired(url.pathname)){
      return json({
        error:'此功能目前已從正式系統移除。仙加味目前只保留貼文審核發佈系統。',
        code:'XJW_PUBLISHING_ONLY',
        publishing_path:'/publishing.html',
        version:VERSION
      },404);
    }
    const response=await app.fetch(request,env,ctx);
    if(request.method==='GET'&&['/healthz','/healthz/core'].includes(url.pathname)){
      try{
        const body=await response.clone().json();
        return json({
          ...body,
          publishingOnly:true,
          publishingOnlyVersion:VERSION,
          retiredErpApisBlocked:true,
          ...(url.pathname==='/healthz'?{
            publishingReviewGateVersion:REVIEW_GATE_VERSION,
            freeRegenerationRoundTrip:true,
            regenerationReturnsToPendingReview:true,
            regenerationStartEndpoint:'/api/posts/:id/regeneration-start',
            regenerationReadyEndpoint:'/api/posts/:id/regeneration-ready'
          }:{})
        },response.status);
      }catch{return response;}
    }
    return response;
  },
  async scheduled(controller,env,ctx){
    if(typeof app.scheduled==='function')return app.scheduled(controller,env,ctx);
  }
};
