import app,{gateState} from './publishing-review-gate-entry.js';
import { keepLineWarm } from './flexible-publish-entry.js';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { publisherConfiguration } from './social-publisher.js';
import { checkD1, runReadiness, VERSION as READINESS_VERSION } from './system-readiness.js';

const VERSION='2026-08-09-production-entry-v10-safe-readiness-fast-mobile';
const PUBLISHING_PATH='/publishing.html';
const REVIEW_GATE_VERSION='2026-08-09-publishing-review-gate-v2-edit-invalidates';
const RASTER_VERSION='2026-08-09-v7-raster-invalidates-review';
const FAST_API_VERSION='2026-08-09-fast-read-v1-shared-access';
const HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-xianjiawei-production-entry':VERSION};
const POST_STATUSES=new Set(['draft','pending_review','approved','scheduled','published','manual_required','failed']);
const MUTATING_METHODS=new Set(['POST','PUT','PATCH','DELETE']);
const accessProfiles=new Map();
const accessPromises=new Map();
const accessJwks=new Map();
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});
const clean=value=>String(value??'').trim();
const int=(value,fallback=0)=>{const n=Number(value);return Number.isFinite(n)?Math.trunc(n):fallback;};

function roleLabel(role){return({owner:'系統擁有者',admin:'管理員',sales:'業務',warehouse:'倉庫',accounting:'財務',content:'內容管理',viewer:'僅檢視'})[role]||role;}
function audienceValues(value){if(Array.isArray(value))return value.flatMap(audienceValues).filter(Boolean);return String(value||'').split(/[\s,]+/).map(clean).filter(Boolean);}
function decodeJwtPayload(token){
  try{const part=String(token||'').split('.')[1];if(!part)return null;const normalized=part.replace(/-/g,'+').replace(/_/g,'/');const padded=normalized.padEnd(Math.ceil(normalized.length/4)*4,'=');return JSON.parse(atob(padded));}catch{return null;}
}
function jwksFor(teamDomain){
  let jwks=accessJwks.get(teamDomain);
  if(!jwks){jwks=createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));accessJwks.set(teamDomain,jwks);}
  return jwks;
}
function trimAccessCaches(){
  while(accessProfiles.size>64)accessProfiles.delete(accessProfiles.keys().next().value);
  while(accessJwks.size>4)accessJwks.delete(accessJwks.keys().next().value);
}
async function verifyFastAccess(request,env){
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
    const unverified=decodeJwtPayload(token);
    let audiences=audienceValues(env.POLICY_AUD);
    if(String(env.ALLOW_TEAM_AUD_FALLBACK||'').toLowerCase()==='true'){
      const tokenAudiences=audienceValues(unverified?.aud);
      if(tokenAudiences.length)audiences=tokenAudiences;
    }
    const {payload}=await jwtVerify(token,jwksFor(teamDomain),{issuer:teamDomain,audience:audiences});
    const email=clean(payload.email).toLowerCase();
    if(!email)throw new Error('登入憑證沒有電子郵件');
    const profile=await env.DB.prepare('SELECT email,display_name,role,active FROM profiles WHERE lower(email)=? LIMIT 1').bind(email).first();
    if(!profile||Number(profile.active)!==1)throw new Error('此帳號尚未被加入仙加味內部系統');
    const tokenExpiry=Number(payload.exp||0)>0?Number(payload.exp)*1000:Date.now()+300000;
    const expiresAt=Math.min(tokenExpiry,Date.now()+300000);
    accessProfiles.set(token,{profile,expiresAt});trimAccessCaches();
    return profile;
  })().finally(()=>accessPromises.delete(token));
  accessPromises.set(token,pending);
  return pending;
}
function mapFastPost(row){
  let platforms=[];try{platforms=JSON.parse(row.platforms_json||'[]');}catch{}
  return{id:row.id,title:row.title||'',headline:row.headline||'',copy:row.copy||'',category:row.category||'日常節奏',platforms,status:row.status||'draft',scheduled_at:row.scheduled_at||'',proposed_scheduled_at:row.proposed_scheduled_at||'',approved_by:row.approved_by||'',approved_at:row.approved_at||'',published_at:row.published_at||'',image_url:row.image_url||'',image_alt:row.image_alt||'',image_source:row.image_source||'官方素材',image_approved:Number(row.image_approved||0)===1,image_width:int(row.image_width),image_height:int(row.image_height),image_bytes:int(row.image_bytes),image_quality_status:row.image_quality_status||'unknown',created_by:row.created_by||'',created_at:row.created_at||'',updated_at:row.updated_at||'',owner_review_required:!['published','archived'].includes(row.status),auto_approve:false,auto_schedule:false,auto_publish:false,line_voom_manual_only:true};
}
async function fastPostList(request,env){
  await verifyFastAccess(request,env);
  const url=new URL(request.url),limit=Math.min(60,Math.max(1,int(url.searchParams.get('limit'),18))),offset=Math.max(0,int(url.searchParams.get('offset'),0));
  const status=clean(url.searchParams.get('status')),q=clean(url.searchParams.get('q')).slice(0,100);
  const where=["status<>'archived'"];const binds=[];
  if(POST_STATUSES.has(status)){where.push('status=?');binds.push(status);}
  if(q){where.push('(title LIKE ? OR headline LIKE ? OR copy LIKE ? OR category LIKE ? OR image_alt LIKE ?)');const like=`%${q}%`;binds.push(like,like,like,like,like);}
  const clause=where.join(' AND ');
  const [rows,totalRow,grouped]=await Promise.all([
    env.DB.prepare(`SELECT * FROM social_posts WHERE ${clause} ORDER BY updated_at DESC,created_at DESC LIMIT ? OFFSET ?`).bind(...binds,limit,offset).all(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM social_posts WHERE ${clause}`).bind(...binds).first(),
    env.DB.prepare("SELECT status,COUNT(*) AS count FROM social_posts WHERE status<>'archived' GROUP BY status").all()
  ]);
  const counts={draft:0,pending_review:0,approved:0,scheduled:0,published:0,manual_required:0,failed:0};
  for(const row of grouped.results||[])counts[row.status]=Number(row.count||0);
  return json({items:(rows.results||[]).map(mapFastPost),total:Number(totalRow?.count||0),limit,offset,counts,query:q,status:POST_STATUSES.has(status)?status:'all',fast_api:FAST_API_VERSION});
}
async function fastMe(request,env){const profile=await verifyFastAccess(request,env);return json({...profile,role_label:roleLabel(profile.role),fast_api:FAST_API_VERSION});}
async function fastPlatformAuthorization(request,env){await verifyFastAccess(request,env);return json({...publisherConfiguration(env),fast_api:FAST_API_VERSION});}

async function mutationCoreGate(env){
  const d1=await checkD1(env);
  if(d1.ok)return null;
  return json({error:'系統目前處於安全模式，D1健康檢查未通過；新增、修改、審核、排程與發布已暫停。',code:'XJW_SAFE_MODE_D1_NOT_READY',retryable:true,d1:{ok:false,error:d1.error||'D1 unavailable'},checkedAt:new Date().toISOString()},503);
}

async function quarantineUngatedDuePosts(env,scheduledTime){
  if(!env?.DB)return{checked:0,quarantined:0};
  const at=new Date(scheduledTime||Date.now()).toISOString();
  const result=await env.DB.prepare("SELECT * FROM social_posts WHERE status='scheduled' AND scheduled_at IS NOT NULL AND datetime(scheduled_at)<=datetime(?)").bind(at).all();
  let quarantined=0;
  for(const row of result.results||[]){
    let gate={ok:false,reason:'正式圖文審核不存在'};
    try{gate=await gateState(env,row)}catch(error){gate={ok:false,reason:String(error?.message||error)}}
    if(gate.ok)continue;
    await env.DB.prepare("UPDATE social_posts SET status='draft',scheduled_at=NULL,approved_by=NULL,approved_at=NULL,image_approved=0,updated_at=? WHERE id=?").bind(new Date().toISOString(),row.id).run();
    quarantined+=1;
    try{await env.DB.prepare('INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) VALUES(?,?,?,?,?,?,?,?)').bind(`AUD-${crypto.randomUUID()}`,'system','排程發布前圖文守門退回草稿','貼文',row.id,JSON.stringify({status:'scheduled',scheduled_at:row.scheduled_at}),JSON.stringify({status:'draft',reason:gate.reason}),'').run()}catch{}
  }
  return{checked:(result.results||[]).length,quarantined};
}

async function productionHealth(request,env,ctx){
  const response=await app.fetch(request,env,ctx),raw=await response.text();
  let body={};
  try{body=raw?JSON.parse(raw):{}}catch{return new Response(raw,{status:response.status,headers:response.headers})}
  return new Response(JSON.stringify({
    ...body,
    service:'仙加味貼文審核發佈系統',
    productionEntry:'src/production-entry.js',
    productionEntryVersion:VERSION,
    uiRuntime:'20260809-standalone-v12-readiness-safe',
    standalonePublishingPath:PUBLISHING_PATH,
    publishingReviewGateVersion:REVIEW_GATE_VERSION,
    publishingReviewChecklistCount:16,
    copyImageMatchHardGate:true,
    editImmediatelyInvalidatesApproval:true,
    rasterizerVersion:RASTER_VERSION,
    rasterizerProductsV3Only:true,
    rasterizedImageRequiresReReview:true,
    serverPagedPostList:true,
    serverPageSize:18,
    fastReadApiVersion:FAST_API_VERSION,
    sharedAccessVerification:true,
    accessProfileCacheSeconds:300,
    parallelPostQueries:true,
    automaticSafeModeOnD1Failure:true,
    readinessVersion:READINESS_VERSION,
    lineKeepWarmIndependent:true,
    lineKeepWarmBeforePublishingScheduler:true,
    scheduledPublishRequiresCurrentReviewFingerprint:true,
    erpFrontendSeparated:true,
  }),{status:response.status,headers:HEADERS});
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url),path=url.pathname;
    if(request.method==='GET'&&path==='/healthz/core')return json({ok:true,worker:true,service:'仙加味貼文審核發佈系統',productionEntryVersion:VERSION,readinessVersion:READINESS_VERSION,checkedAt:new Date().toISOString()});
    if(request.method==='GET'&&path==='/healthz/readiness'){
      const probeExternal=['1','true','yes'].includes(String(url.searchParams.get('probe')||'').toLowerCase());
      const report=await runReadiness(request,env,ctx,app,{probeExternal});
      return json(report,report.ok?200:503);
    }
    if(request.method==='GET'&&path==='/healthz')return productionHealth(request,env,ctx);
    if(MUTATING_METHODS.has(request.method)&&path.startsWith('/api/')){
      const blocked=await mutationCoreGate(env);if(blocked)return blocked;
    }
    try{
      if(request.method==='GET'&&path==='/api/me')return await fastMe(request,env);
      if(request.method==='GET'&&path==='/api/posts')return await fastPostList(request,env);
      if(request.method==='GET'&&path==='/api/platform-authorization')return await fastPlatformAuthorization(request,env);
    }catch(error){
      const message=clean(error?.message||error),status=/登入|Access|帳號|憑證|電子郵件/.test(message)?401:/D1|database|資料庫/i.test(message)?503:500;
      return json({error:message||'快速讀取失敗',fast_api:FAST_API_VERSION},status);
    }
    return app.fetch(request,env,ctx)
  },
  async scheduled(controller,env,ctx){
    ctx.waitUntil(keepLineWarm());
    ctx.waitUntil((async()=>{
      const d1=await checkD1(env);
      if(!d1.ok){console.error('貼文排程安全模式：D1未就緒，本輪不發布，但LINE keep-warm不受影響',d1.error||'D1 unavailable');return;}
      try{
        const guarded=await quarantineUngatedDuePosts(env,controller?.scheduledTime||Date.now());
        if(guarded.quarantined)console.warn('仙加味排程圖文守門已退回草稿',JSON.stringify(guarded));
      }catch(error){
        console.warn('貼文排程守門檢查失敗，但LINE keep-warm不受影響',clean(error?.message||error));
      }
      try{
        if(typeof app.scheduled==='function')await app.scheduled(controller,env,ctx);
      }catch(error){
        console.error('貼文排程執行失敗',clean(error?.message||error));
      }
    })());
  }
};

export { VERSION, PUBLISHING_PATH, REVIEW_GATE_VERSION, RASTER_VERSION, FAST_API_VERSION, verifyFastAccess, fastPostList, fastMe, fastPlatformAuthorization, mutationCoreGate, quarantineUngatedDuePosts, productionHealth };
