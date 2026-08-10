import app from './production-entry.js';
import { VERSION as REVIEW_GATE_VERSION } from './publishing-review-gate-entry.js';

const VERSION='2026-08-10-publishing-only-entry-v12-latest-user-media';
const UI_RUNTIME='20260810-standalone-v22-latest-user-media';
const PRODUCT_IMAGE_VERSION='20260810-products-v3-latest-originals-v3';
const POST_BANK_SYNC_VERSION='2026-08-10-post-bank-sync-v5-retired-assets-removed';
const FORMAL_MEDIA_RUNTIME='20260810-formal-media-policy-v5-latest-user-batch';
const FORMAL_MEDIA_APPROVAL_BATCH='20260810-latest-user-dm-and-trial';
const LATEST_POST_ZIP='2.zip';
const LATEST_POST_ZIP_CANDIDATES=22;
const KNOWN_REGENERATION_MINIMUM=121;
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
    if(request.method==='GET'&&url.pathname==='/data/latest-user-post-zip.json'&&env?.ASSETS?.fetch){
      const asset=await env.ASSETS.fetch(request);
      if(asset.ok){
        const headers=new Headers(asset.headers);
        headers.set('cache-control','no-store');
        headers.set('x-xianjiawei-publishing-only',VERSION);
        return new Response(asset.body,{status:asset.status,headers});
      }
    }
    const response=await app.fetch(request,env,ctx);
    if(request.method==='GET'&&['/healthz','/healthz/core'].includes(url.pathname)){
      try{
        const body=await response.clone().json();
        return json({
          ...body,
          uiRuntime:UI_RUNTIME,
          productImageVersion:PRODUCT_IMAGE_VERSION,
          productImageAuthority:'products-v3-latest-original-product-photos',
          postBankSyncVersion:POST_BANK_SYNC_VERSION,
          formalMediaRuntime:FORMAL_MEDIA_RUNTIME,
          formalMediaApprovalBatch:FORMAL_MEDIA_APPROVAL_BATCH,
          latestPostZip:LATEST_POST_ZIP,
          latestPostZipCandidates:LATEST_POST_ZIP_CANDIDATES,
          postImagePriority:'user_zip_approved',
          formalMediaDecisionOnPostCard:true,
          singleMediaAssistant:true,
          semanticImageMatchRequired:true,
          formalProductMediaPreferred:true,
          regenerateOnlyIfNoApprovedMatch:true,
          zipSourceMatchCanWaitForBinarySync:true,
          reviewItemsAfterMediaChange:16,
          knownRegenerationMinimum:KNOWN_REGENERATION_MINIMUM,
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
