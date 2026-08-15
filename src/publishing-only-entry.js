import app from './production-entry.js';
import { VERSION as REVIEW_GATE_VERSION } from './publishing-review-gate-entry.js';

const VERSION='20260815-publishing-center-app-v2-canonical-route';
const UI_RUNTIME='publishing-center-app';
const PRODUCT_IMAGE_VERSION='products-v3-current-authority';
const POST_BANK_SYNC_VERSION='post-bank-sync-current-capabilities';
const FORMAL_MEDIA_RUNTIME='formal-media-policy-current';
const LATEST_POST_ZIP_MANIFEST='/data/latest-user-post-zip.json';
const LEGACY_BLOCK_MARKERS=Object.freeze(['/api/modules/','XJW_PUBLISHING_ONLY']);
const HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-xianjiawei-publishing-only':VERSION};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});
const redirect=location=>new Response(null,{status:302,headers:{location,'cache-control':'no-store','x-xianjiawei-publishing-only':VERSION}});

function allowedApi(path){
  return path==='/api/me'||path==='/api/platform-authorization'||path==='/api/media-upload'||path==='/api/posts'||path.startsWith('/api/posts/');
}
function blockedApi(path){return path.startsWith('/api/')&&!allowedApi(path)}
function retiredPage(path){
  if(path==='/'||path==='/index.html'||path==='/publishing'||path==='/publishing/')return false;
  return /\.(?:html?)$/i.test(path)&&path!=='/publishing.html';
}
async function currentMediaAuthority(request,env){
  const fallback={latestPostZip:'',latestPostZipCandidates:0,formalMediaApprovalBatch:'',latestPostZipBinaryStatus:'unknown'};
  if(!env?.ASSETS?.fetch)return fallback;
  try{const u=new URL(request.url);u.pathname=LATEST_POST_ZIP_MANIFEST;u.search='';const response=await env.ASSETS.fetch(new Request(u,{method:'GET'}));if(!response.ok)return fallback;const catalog=await response.json();return{latestPostZip:String(catalog?.source||''),latestPostZipCandidates:Number(catalog?.candidate_count||0),formalMediaApprovalBatch:String(catalog?.approval_batch||''),latestPostZipBinaryStatus:String(catalog?.binary_sync?.status||'unknown')}}catch{return fallback}
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url),path=url.pathname;
    if(request.method==='GET'&&(path==='/'||path==='/index.html'||path==='/publishing'||path==='/publishing/'))return redirect('/publishing.html');
    if(retiredPage(path))return redirect('/publishing.html');
    if(blockedApi(path))return json({error:'此功能目前已從正式 App 停用。仙加味目前只保留貼文中心系統。',code:'XJW_PUBLISHING_CENTER_ONLY',publishing_path:'/publishing.html',version:VERSION},404);
    if(request.method==='GET'&&path===LATEST_POST_ZIP_MANIFEST&&env?.ASSETS?.fetch){
      const asset=await env.ASSETS.fetch(request);
      if(asset.ok){const headers=new Headers(asset.headers);headers.set('cache-control','no-store');headers.set('x-xianjiawei-publishing-only',VERSION);return new Response(asset.body,{status:asset.status,headers})}
    }
    const response=await app.fetch(request,env,ctx);
    if(request.method==='GET'&&['/healthz','/healthz/core'].includes(path)){
      try{
        const [body,media]=await Promise.all([response.clone().json(),currentMediaAuthority(request,env)]);
        return json({...body,uiRuntime:UI_RUNTIME,productImageVersion:PRODUCT_IMAGE_VERSION,productImageAuthority:'products-v3-latest-original-product-photos',postBankSyncVersion:POST_BANK_SYNC_VERSION,postBankValidation:'capability-based',postBankSizePolicy:'current-catalog-dynamic-no-fixed-count',formalMediaRuntime:FORMAL_MEDIA_RUNTIME,latestPostZipManifest:LATEST_POST_ZIP_MANIFEST,latestPostZipDynamic:true,latestPostZip:media.latestPostZip,latestPostZipCandidates:media.latestPostZipCandidates,formalMediaApprovalBatch:media.formalMediaApprovalBatch,latestPostZipBinaryStatus:media.latestPostZipBinaryStatus,postImagePriority:'user_zip_approved',formalMediaDecisionOnPostCard:true,singleMediaAssistant:true,semanticImageMatchRequired:true,formalProductMediaPreferred:true,regenerateOnlyIfNoApprovedMatch:true,zipSourceMatchCanWaitForBinarySync:true,reviewItemsAfterMediaChange:16,guardVersionPolicy:'current-authority-not-historical-version-pin',publishingOnly:true,publishingOnlyVersion:VERSION,publishingCenterApp:true,erpUiDisabled:true,erpApisBlocked:true,rootRedirectsToPublishing:true,canonicalPublishingPath:'/publishing.html',legacyBlockMarkers:LEGACY_BLOCK_MARKERS,...(path==='/healthz'?{publishingReviewGateVersion:REVIEW_GATE_VERSION,freeRegenerationRoundTrip:true,regenerationReturnsToPendingReview:true,regenerationStartEndpoint:'/api/posts/:id/regeneration-start',regenerationReadyEndpoint:'/api/posts/:id/regeneration-ready'}:{})},response.status)
      }catch{return response}
    }
    return response;
  },
  async scheduled(controller,env,ctx){if(typeof app.scheduled==='function')return app.scheduled(controller,env,ctx)}
};

export { currentMediaAuthority, allowedApi, blockedApi };
