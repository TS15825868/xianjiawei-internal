import app from './production-entry.js';
import { VERSION as REVIEW_GATE_VERSION } from './publishing-review-gate-entry.js';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { publisherConfiguration } from './social-publisher.js';

const VERSION='20260817-publishing-center-app-v4-resilient-fast-access';
const UI_RUNTIME='publishing-center-app';
const PRODUCT_IMAGE_VERSION='products-v3-current-authority';
const POST_BANK_SYNC_VERSION='post-bank-sync-current-capabilities';
const FORMAL_MEDIA_RUNTIME='formal-media-policy-current';
const LATEST_POST_ZIP_MANIFEST='/data/latest-user-post-zip.json';
const CANONICAL_PUBLISHING_PATH='/publishing.html';
const LEGACY_BLOCK_MARKERS=Object.freeze(['/api/modules/','XJW_PUBLISHING_ONLY']);
const HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-xianjiawei-publishing-only':VERSION};
const FAST_READ_VERSION='2026-08-17-resilient-fast-read-v2';
const ACCESS_TIMEOUT_MS=3500;
const D1_TIMEOUT_MS=3500;
const POST_STATUSES=new Set(['draft','pending_review','approved','scheduled','published','manual_required','failed']);
const accessProfiles=new Map();
const accessPromises=new Map();
const accessJwks=new Map();
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});
const clean=value=>String(value??'').trim();
const int=(value,fallback=0)=>{const n=Number(value);return Number.isFinite(n)?Math.trunc(n):fallback;};

function allowedApi(path){
  return path==='/api/me'||path==='/api/platform-authorization'||path==='/api/media-upload'||path==='/api/posts'||path.startsWith('/api/posts/');
}
function blockedApi(path){return path.startsWith('/api/')&&!allowedApi(path)}
function publishingUiAlias(path){return path==='/'||path==='/index.html'||path==='/publishing'||path==='/publishing/'||path===CANONICAL_PUBLISHING_PATH}
function retiredPage(path){return /\.(?:html?)$/i.test(path)&&path!==CANONICAL_PUBLISHING_PATH&&path!=='/index.html'}

function audienceValues(value){
  if(Array.isArray(value))return value.flatMap(audienceValues).filter(Boolean);
  return String(value||'').split(/[\s,]+/).map(clean).filter(Boolean);
}
function withTimeout(work,timeoutMs,message){
  let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),timeoutMs)});
  return Promise.race([Promise.resolve(work),timeout]).finally(()=>clearTimeout(timer));
}
function jwksFor(teamDomain,{fresh=false}={}){
  if(fresh)accessJwks.delete(teamDomain);
  let jwks=accessJwks.get(teamDomain);
  if(!jwks){
    jwks=createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    accessJwks.set(teamDomain,jwks);
  }
  return jwks;
}
function trimAccessCaches(){
  while(accessProfiles.size>64)accessProfiles.delete(accessProfiles.keys().next().value);
  while(accessJwks.size>4)accessJwks.delete(accessJwks.keys().next().value);
}
function retryableAccessError(error){
  const message=clean(error?.message||error).toLowerCase();
  return /逾時|timeout|timed out|fetch|network|socket|econn|jwk.*timeout/.test(message);
}
async function verifiedAccessPayload(token,teamDomain,audiences){
  let lastError;
  for(let attempt=0;attempt<2;attempt++){
    try{
      return await withTimeout(
        jwtVerify(token,jwksFor(teamDomain,{fresh:attempt>0}),{issuer:teamDomain,audience:audiences}),
        ACCESS_TIMEOUT_MS,
        'Cloudflare Access 驗證服務暫時逾時'
      );
    }catch(error){
      lastError=error;
      if(attempt===0&&retryableAccessError(error))continue;
      throw error;
    }
  }
  throw lastError||new Error('Cloudflare Access 驗證失敗');
}
async function verifyResilientAccess(request,env){
  if(!env?.DB)throw new Error('D1 資料庫尚未綁定');
  if(!env.POLICY_AUD||!env.TEAM_DOMAIN)throw new Error('Cloudflare Access 驗證尚未設定完成');
  const token=request.headers.get('cf-access-jwt-assertion');
  if(!token)throw new Error('找不到 Cloudflare Access 登入憑證');
  const cached=accessProfiles.get(token);
  if(cached&&cached.expiresAt>Date.now())return cached.profile;
  if(cached)accessProfiles.delete(token);
  if(accessPromises.has(token))return accessPromises.get(token);
  const pending=(async()=>{
    const teamDomain=clean(env.TEAM_DOMAIN).replace(/\/$/,'');
    const audiences=audienceValues(env.POLICY_AUD);
    const {payload}=await verifiedAccessPayload(token,teamDomain,audiences);
    const email=clean(payload?.email).toLowerCase();
    if(!email)throw new Error('登入憑證沒有電子郵件');
    const profile=await withTimeout(
      env.DB.prepare('SELECT email,display_name,role,active FROM profiles WHERE lower(email)=? LIMIT 1').bind(email).first(),
      D1_TIMEOUT_MS,
      'D1 登入資料查詢暫時逾時'
    );
    if(!profile||Number(profile.active)!==1)throw new Error('此帳號尚未被加入仙加味內部系統');
    const tokenExpiry=Number(payload.exp||0)>0?Number(payload.exp)*1000:Date.now()+300000;
    const expiresAt=Math.min(tokenExpiry,Date.now()+300000);
    accessProfiles.set(token,{profile,expiresAt});
    trimAccessCaches();
    return profile;
  })().finally(()=>accessPromises.delete(token));
  accessPromises.set(token,pending);
  return pending;
}
function roleLabel(role){return({owner:'系統擁有者',admin:'管理員',sales:'業務',warehouse:'倉庫',accounting:'財務',content:'內容管理',viewer:'僅檢視'})[role]||role;}
function mapFastPost(row){
  let platforms=[];try{platforms=JSON.parse(row.platforms_json||'[]');}catch{}
  return{id:row.id,title:row.title||'',headline:row.headline||'',copy:row.copy||'',category:row.category||'日常節奏',platforms,status:row.status||'draft',scheduled_at:row.scheduled_at||'',proposed_scheduled_at:row.proposed_scheduled_at||'',approved_by:row.approved_by||'',approved_at:row.approved_at||'',published_at:row.published_at||'',image_url:row.image_url||'',image_alt:row.image_alt||'',image_source:row.image_source||'官方素材',image_approved:Number(row.image_approved||0)===1,image_width:int(row.image_width),image_height:int(row.image_height),image_bytes:int(row.image_bytes),image_quality_status:row.image_quality_status||'unknown',created_by:row.created_by||'',created_at:row.created_at||'',updated_at:row.updated_at||'',owner_review_required:!['published','archived'].includes(row.status),auto_approve:false,auto_schedule:false,auto_publish:false,line_voom_manual_only:true};
}
async function fastPostList(request,env){
  await verifyResilientAccess(request,env);
  const url=new URL(request.url),limit=Math.min(60,Math.max(1,int(url.searchParams.get('limit'),18))),offset=Math.max(0,int(url.searchParams.get('offset'),0));
  const status=clean(url.searchParams.get('status')),q=clean(url.searchParams.get('q')).slice(0,100);
  const where=["status<>'archived'"];const binds=[];
  if(POST_STATUSES.has(status)){where.push('status=?');binds.push(status);}
  if(q){where.push('(title LIKE ? OR headline LIKE ? OR copy LIKE ? OR category LIKE ? OR image_alt LIKE ?)');const like=`%${q}%`;binds.push(like,like,like,like,like);}
  const clause=where.join(' AND ');
  const fields='id,title,headline,copy,category,platforms_json,status,scheduled_at,approved_by,approved_at,published_at,created_by,created_at,updated_at,image_url,image_alt,image_source,image_approved,image_width,image_height,image_bytes,image_quality_status,proposed_scheduled_at';
  const rowsStmt=env.DB.prepare(`SELECT ${fields} FROM social_posts WHERE ${clause} ORDER BY updated_at DESC,created_at DESC,id DESC LIMIT ? OFFSET ?`).bind(...binds,limit,offset);
  const totalStmt=env.DB.prepare(`SELECT COUNT(*) AS count FROM social_posts WHERE ${clause}`).bind(...binds);
  const groupedStmt=env.DB.prepare("SELECT status,COUNT(*) AS count FROM social_posts WHERE status<>'archived' GROUP BY status");
  let rows,totalRow,grouped;
  if(typeof env.DB.batch==='function'){
    const result=await withTimeout(env.DB.batch([rowsStmt,totalStmt,groupedStmt]),D1_TIMEOUT_MS,'D1 貼文清單查詢暫時逾時');
    rows=result?.[0]||{results:[]};totalRow=result?.[1]?.results?.[0]||{};grouped=result?.[2]||{results:[]};
  }else{
    [rows,totalRow,grouped]=await withTimeout(Promise.all([rowsStmt.all(),totalStmt.first(),groupedStmt.all()]),D1_TIMEOUT_MS,'D1 貼文清單查詢暫時逾時');
  }
  const counts={draft:0,pending_review:0,approved:0,scheduled:0,published:0,manual_required:0,failed:0};
  for(const row of grouped.results||[])counts[row.status]=Number(row.count||0);
  return json({items:(rows.results||[]).map(mapFastPost),total:Number(totalRow?.count||0),limit,offset,counts,query:q,status:POST_STATUSES.has(status)?status:'all',fast_api:FAST_READ_VERSION});
}
async function fastMe(request,env){const profile=await verifyResilientAccess(request,env);return json({...profile,role_label:roleLabel(profile.role),fast_api:FAST_READ_VERSION});}
async function fastPlatformAuthorization(request,env){await verifyResilientAccess(request,env);return json({...publisherConfiguration(env),fast_api:FAST_READ_VERSION});}
function fastReadError(error){
  const message=clean(error?.message||error);
  const status=/登入|Access|帳號|憑證|電子郵件/.test(message)?401:/D1|database|資料庫/i.test(message)?503:500;
  return json({error:message||'快速讀取失敗',fast_api:FAST_READ_VERSION,retryable:/逾時|timeout|fetch|network|D1/i.test(message)},status);
}

async function servePublishingAsset(request,env){
  if(!env?.ASSETS?.fetch)return json({error:'貼文中心靜態資源尚未就緒',code:'XJW_PUBLISHING_ASSET_UNAVAILABLE'},503);
  const u=new URL(request.url);u.pathname=CANONICAL_PUBLISHING_PATH;u.search='';u.hash='';
  const asset=await env.ASSETS.fetch(new Request(u.toString(),{method:'GET',headers:request.headers}));
  if(!asset.ok)return json({error:'貼文中心首頁載入失敗',code:'XJW_PUBLISHING_ASSET_LOAD_FAILED',status:asset.status},503);
  const headers=new Headers(asset.headers);
  headers.set('cache-control','no-store');
  headers.set('x-content-type-options','nosniff');
  headers.set('x-xianjiawei-publishing-only',VERSION);
  headers.set('x-xianjiawei-canonical-path',CANONICAL_PUBLISHING_PATH);
  headers.set('x-xianjiawei-route-mode','direct-no-redirect');
  return new Response(asset.body,{status:200,headers});
}

async function currentMediaAuthority(request,env){
  const fallback={latestPostZip:'',latestPostZipCandidates:0,formalMediaApprovalBatch:'',latestPostZipBinaryStatus:'unknown'};
  if(!env?.ASSETS?.fetch)return fallback;
  try{const u=new URL(request.url);u.pathname=LATEST_POST_ZIP_MANIFEST;u.search='';const response=await env.ASSETS.fetch(new Request(u,{method:'GET'}));if(!response.ok)return fallback;const catalog=await response.json();return{latestPostZip:String(catalog?.source||''),latestPostZipCandidates:Number(catalog?.candidate_count||0),formalMediaApprovalBatch:String(catalog?.approval_batch||''),latestPostZipBinaryStatus:String(catalog?.binary_sync?.status||'unknown')}}catch{return fallback}
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url),path=url.pathname;
    if(request.method==='GET'&&(publishingUiAlias(path)||retiredPage(path)))return servePublishingAsset(request,env);
    if(blockedApi(path))return json({error:'此功能目前已從正式 App 停用。仙加味目前只保留貼文中心系統。',code:'XJW_PUBLISHING_CENTER_ONLY',publishing_path:CANONICAL_PUBLISHING_PATH,version:VERSION},404);
    if(request.method==='GET'&&path===LATEST_POST_ZIP_MANIFEST&&env?.ASSETS?.fetch){
      const asset=await env.ASSETS.fetch(request);
      if(asset.ok){const headers=new Headers(asset.headers);headers.set('cache-control','no-store');headers.set('x-xianjiawei-publishing-only',VERSION);return new Response(asset.body,{status:asset.status,headers})}
    }
    if(request.method==='GET'&&path==='/api/me'){try{return await fastMe(request,env)}catch(error){return fastReadError(error)}}
    if(request.method==='GET'&&path==='/api/posts'){try{return await fastPostList(request,env)}catch(error){return fastReadError(error)}}
    if(request.method==='GET'&&path==='/api/platform-authorization'){try{return await fastPlatformAuthorization(request,env)}catch(error){return fastReadError(error)}}
    const response=await app.fetch(request,env,ctx);
    if(request.method==='GET'&&['/healthz','/healthz/core'].includes(path)){
      try{
        const [body,media]=await Promise.all([response.clone().json(),currentMediaAuthority(request,env)]);
        return json({...body,uiRuntime:UI_RUNTIME,productImageVersion:PRODUCT_IMAGE_VERSION,productImageAuthority:'products-v3-latest-original-product-photos',postBankSyncVersion:POST_BANK_SYNC_VERSION,postBankValidation:'capability-based',postBankSizePolicy:'current-catalog-dynamic-no-fixed-count',formalMediaRuntime:FORMAL_MEDIA_RUNTIME,latestPostZipManifest:LATEST_POST_ZIP_MANIFEST,latestPostZipDynamic:true,latestPostZip:media.latestPostZip,latestPostZipCandidates:media.latestPostZipCandidates,formalMediaApprovalBatch:media.formalMediaApprovalBatch,latestPostZipBinaryStatus:media.latestPostZipBinaryStatus,postImagePriority:'user_zip_approved',formalMediaDecisionOnPostCard:true,singleMediaAssistant:true,semanticImageMatchRequired:true,formalProductMediaPreferred:true,regenerateOnlyIfNoApprovedMatch:true,zipSourceMatchCanWaitForBinarySync:true,reviewItemsAfterMediaChange:16,guardVersionPolicy:'current-authority-not-historical-version-pin',publishingOnly:true,publishingOnlyVersion:VERSION,publishingCenterApp:true,erpUiDisabled:true,erpApisBlocked:true,rootRedirectsToPublishing:false,rootServesPublishingDirectly:true,htmlHandling:'none',redirectLoopPrevention:true,canonicalPublishingPath:CANONICAL_PUBLISHING_PATH,legacyBlockMarkers:LEGACY_BLOCK_MARKERS,resilientFastRead:true,resilientFastReadVersion:FAST_READ_VERSION,accessVerificationTimeoutMs:ACCESS_TIMEOUT_MS,d1ReadTimeoutMs:D1_TIMEOUT_MS,...(path==='/healthz'?{publishingReviewGateVersion:REVIEW_GATE_VERSION,freeRegenerationRoundTrip:true,regenerationReturnsToPendingReview:true,regenerationStartEndpoint:'/api/posts/:id/regeneration-start',regenerationReadyEndpoint:'/api/posts/:id/regeneration-ready'}:{})},response.status)
      }catch{return response}
    }
    return response;
  },
  async scheduled(controller,env,ctx){if(typeof app.scheduled==='function')return app.scheduled(controller,env,ctx)}
};

export { currentMediaAuthority, allowedApi, blockedApi, publishingUiAlias, servePublishingAsset, verifyResilientAccess, fastPostList };
