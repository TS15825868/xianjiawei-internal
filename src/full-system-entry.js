import publishingApp from './publishing-content-audit-entry.js';
import productionApp from './production-entry.js';
import {publisherConfiguration} from './social-publisher.js';
import {probePublisherConnections} from './platform-connection-probe.js';
import {ensureFormalFirstPost,FIRST_POST_ID,FIRST_POST_SCHEDULED_AT,FIRST_POST_IMAGE_URL} from './social-first-post-bootstrap.js';

const VERSION='2026-09-14-full-system-entry-v6-platform-connection-health';
const HOME_PATH='/index.html';
const ERP_PATH='/erp.html';
const PUBLISHING_PATH='/publishing.html';
const SOCIAL_SCHEDULE_POLICY='週一／週三／週五 09:00（Asia/Taipei）；正常每週 3 篇；短影片若有合格成品只取代當週其中一篇，不另外增加篇數';
const SOCIAL_FIXED_FREQUENCY='每週 3 篇（週一／週三／週五 09:00，Asia/Taipei）';
const SOCIAL_FIRST_PUBLISH_AT='2026-09-04T09:00:00+08:00';
const SOCIAL_POLICY_VERSION='2026-09-03-social-publishing-v2-morning';
const HEADERS={'cache-control':'no-store','x-content-type-options':'nosniff','x-xianjiawei-full-system':VERSION};
const POST_STATUSES=new Set(['draft','pending_review','approved','scheduled','published','manual_required','failed']);

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{...HEADERS,'content-type':'application/json; charset=utf-8'}})}
function clean(value=''){return String(value??'').trim()}
function int(value,fallback=0){const n=Number(value);return Number.isFinite(n)?Math.trunc(n):fallback}
function isHomeUi(path){return path==='/'||path===HOME_PATH}
function isErpUi(path){return path==='/erp'||path==='/erp/'||path===ERP_PATH}
function isPublishingUi(path){return path==='/publishing'||path==='/publishing/'||path===PUBLISHING_PATH}
function isFullErpApi(path){
  return path==='/api/overview'||path==='/api/settings'||path==='/api/brand-content'||
    path==='/api/assets'||path.startsWith('/api/modules/')||path.startsWith('/media/');
}
function maintenanceNoLogin(env){return String(env?.TEMP_DISABLE_ACCESS||'').toLowerCase()==='true'}
function maintenanceProfile(){
  return{
    email:'maintenance-readonly@xianjiawei.local',
    display_name:'系統整理模式（唯讀）',
    role:'viewer',
    role_label:'僅檢視',
    active:1,
    maintenance_readonly:true,
    maintenance_no_login:true,
    version:VERSION
  };
}
function mapMaintenancePost(row){
  let platforms=[];try{platforms=JSON.parse(row.platforms_json||'[]')}catch{}
  return{
    id:row.id,
    title:row.title||'',
    headline:row.headline||'',
    copy:row.copy||'',
    category:row.category||'日常節奏',
    platforms,
    status:row.status||'draft',
    scheduled_at:row.scheduled_at||'',
    proposed_scheduled_at:row.proposed_scheduled_at||'',
    approved_by:row.approved_by||'',
    approved_at:row.approved_at||'',
    published_at:row.published_at||'',
    image_url:row.image_url||'',
    image_alt:row.image_alt||'',
    image_source:row.image_source||'官方素材',
    image_approved:Number(row.image_approved||0)===1,
    image_width:int(row.image_width),
    image_height:int(row.image_height),
    image_bytes:int(row.image_bytes),
    image_quality_status:row.image_quality_status||'unknown',
    created_by:row.created_by||'',
    created_at:row.created_at||'',
    updated_at:row.updated_at||'',
    owner_review_required:!['published','archived'].includes(row.status),
    auto_approve:false,
    auto_schedule:false,
    auto_publish:false,
    line_voom_manual_only:true,
    maintenance_readonly:true
  };
}
async function maintenancePosts(request,env){
  if(!env?.DB)return json({error:'D1 資料庫尚未綁定',maintenance_readonly:true},503);
  const url=new URL(request.url);
  const limit=Math.min(60,Math.max(1,int(url.searchParams.get('limit'),18)));
  const offset=Math.max(0,int(url.searchParams.get('offset'),0));
  const status=clean(url.searchParams.get('status'));
  const q=clean(url.searchParams.get('q')).slice(0,100);
  const where=["status<>'archived'"];
  const binds=[];
  if(POST_STATUSES.has(status)){where.push('status=?');binds.push(status)}
  if(q){
    where.push('(title LIKE ? OR headline LIKE ? OR copy LIKE ? OR category LIKE ? OR image_alt LIKE ?)');
    const like=`%${q}%`;binds.push(like,like,like,like,like);
  }
  const clause=where.join(' AND ');
  const fields='id,title,headline,copy,category,platforms_json,status,scheduled_at,proposed_scheduled_at,approved_by,approved_at,published_at,created_by,created_at,updated_at,image_url,image_alt,image_source,image_approved,image_width,image_height,image_bytes,image_quality_status';
  const [rows,totalRow,grouped]=await Promise.all([
    env.DB.prepare(`SELECT ${fields} FROM social_posts WHERE ${clause} ORDER BY updated_at DESC,created_at DESC,id DESC LIMIT ? OFFSET ?`).bind(...binds,limit,offset).all(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM social_posts WHERE ${clause}`).bind(...binds).first(),
    env.DB.prepare("SELECT status,COUNT(*) AS count FROM social_posts WHERE status<>'archived' GROUP BY status").all()
  ]);
  const counts={draft:0,pending_review:0,approved:0,scheduled:0,published:0,manual_required:0,failed:0};
  for(const row of grouped.results||[])counts[row.status]=Number(row.count||0);
  return json({
    items:(rows.results||[]).map(mapMaintenancePost),
    total:Number(totalRow?.count||0),limit,offset,counts,query:q,
    status:POST_STATUSES.has(status)?status:'all',
    maintenance_readonly:true,
    maintenance_no_login:true,
    version:VERSION
  });
}
async function maintenancePostById(env,id){
  if(!env?.DB)return json({error:'D1 資料庫尚未綁定',maintenance_readonly:true},503);
  const row=await env.DB.prepare("SELECT * FROM social_posts WHERE id=? AND status<>'archived' LIMIT 1").bind(id).first();
  return row?json(mapMaintenancePost(row)):json({error:'找不到可檢視的貼文',maintenance_readonly:true},404);
}
async function maintenanceDeliveries(env,id){
  if(!env?.DB)return json({error:'D1 資料庫尚未綁定',maintenance_readonly:true},503);
  const post=await env.DB.prepare("SELECT id FROM social_posts WHERE id=? AND status<>'archived' LIMIT 1").bind(id).first();
  if(!post)return json({error:'找不到可檢視的貼文',maintenance_readonly:true},404);
  const rows=await env.DB.prepare('SELECT platform,status,attempt_count,last_attempt_at,published_at,remote_id,error_text,updated_at FROM social_publish_deliveries WHERE post_id=? ORDER BY platform').bind(id).all();
  return json({post_id:id,platforms:(rows.results||[]),maintenance_readonly:true,maintenance_no_login:true});
}
function maintenanceLocked(path,{privateRead=false}={}){
  return json({
    error:privateRead?'系統整理期間已暫時關閉登入；ERP／客戶／財務等內部資料不對外開放。':'系統整理期間目前為免登入唯讀模式；新增、修改、審核、排程與發布暫時鎖定。',
    code:privateRead?'XJW_MAINTENANCE_PRIVATE_READ_LOCKED':'XJW_MAINTENANCE_READ_ONLY',
    path,
    maintenance_readonly:true,
    maintenance_no_login:true
  },423);
}
function publicFirstPost(result){
  const post=result?.post||{};
  return{
    ok:Boolean(result?.ok),
    error:result?.ok?'':String(result?.error||''),
    removedInvalidCount:Array.isArray(result?.removed)?result.removed.length:0,
    id:post.id||FIRST_POST_ID,
    title:post.title||'',
    headline:post.headline||'',
    copy:post.copy||'',
    status:post.status||'',
    scheduled_at:post.scheduled_at||FIRST_POST_SCHEDULED_AT,
    platforms_json:post.platforms_json||'[]',
    image_url:post.image_url||FIRST_POST_IMAGE_URL,
    image_alt:post.image_alt||'',
    image_source:post.image_source||'',
    image_approved:Number(post.image_approved||0),
    image_width:Number(post.image_width||0),
    image_height:Number(post.image_height||0),
    image_bytes:Number(post.image_bytes||0),
    image_quality_status:post.image_quality_status||'',
    reviewGateReady:Boolean(result?.gate?.ready),
    reviewed_at:result?.gate?.reviewed_at||''
  };
}
async function serveAsset(request,env,target){
  if(!env?.ASSETS?.fetch)return json({error:'內部系統靜態資源尚未就緒',code:'XJW_ASSET_UNAVAILABLE'},503);
  const url=new URL(request.url);url.pathname=target;url.search='';url.hash='';
  const asset=await env.ASSETS.fetch(new Request(url.toString(),{method:'GET',headers:request.headers}));
  if(!asset.ok)return json({error:`${target} 載入失敗`,code:'XJW_ASSET_LOAD_FAILED',status:asset.status},503);
  const headers=new Headers(asset.headers);for(const [k,v] of Object.entries(HEADERS))headers.set(k,v);
  headers.set('x-xianjiawei-ui',target===HOME_PATH?'home':target===ERP_PATH?'erp':'publishing');
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
async function firstPostHealth(request,env,ctx){
  let upstream={};
  try{
    const url=new URL('/healthz',request.url);
    const response=await publishingApp.fetch(new Request(url,{method:'GET',headers:request.headers}),env,ctx);
    upstream=await response.json().catch(()=>({}));
  }catch{}
  const result=await ensureFormalFirstPost(env);
  return json({
    ok:Boolean(result?.ok),
    fullSystemVersion:VERSION,
    fixedPostingFrequency:SOCIAL_FIXED_FREQUENCY,
    socialFirstPublishAt:SOCIAL_FIRST_PUBLISH_AT,
    firstPost:publicFirstPost(result),
    socialPublisher:upstream?.socialPublisher||upstream?.publisher||null
  },result?.ok?200:503);
}
async function platformConnectionHealth(env){
  const probe=await probePublisherConnections(env);
  return json({
    ...probe,
    fullSystemVersion:VERSION,
    maintenance_readonly:maintenanceNoLogin(env),
    configuration:publisherConfiguration(env)
  });
}

export default{
  async fetch(request,env,ctx){
    const path=new URL(request.url).pathname;
    const maintenance=maintenanceNoLogin(env);

    if(maintenance&&['POST','PUT','PATCH','DELETE'].includes(request.method)&&path.startsWith('/api/'))return maintenanceLocked(path);

    if(request.method==='GET'&&path==='/healthz/social-first-post')return firstPostHealth(request,env,ctx);
    if(request.method==='GET'&&path==='/healthz/platform-connections')return platformConnectionHealth(env);
    if(request.method==='GET'&&isHomeUi(path))return serveAsset(request,env,HOME_PATH);
    if(request.method==='GET'&&isErpUi(path))return serveAsset(request,env,ERP_PATH);
    if(request.method==='GET'&&isPublishingUi(path))return serveAsset(request,env,PUBLISHING_PATH);

    if(maintenance&&request.method==='GET'){
      if(path==='/api/me')return json(maintenanceProfile());
      if(path==='/api/posts')return maintenancePosts(request,env);
      if(path==='/api/platform-authorization')return json({...publisherConfiguration(env),maintenance_readonly:true,maintenance_no_login:true,version:VERSION});
      const deliveryMatch=path.match(/^\/api\/posts\/([^/]+)\/deliveries$/);
      if(deliveryMatch)return maintenanceDeliveries(env,decodeURIComponent(deliveryMatch[1]));
      const postMatch=path.match(/^\/api\/posts\/([^/]+)$/);
      if(postMatch)return maintenancePostById(env,decodeURIComponent(postMatch[1]));
      if(path==='/api/settings'||path==='/api/overview'||path==='/api/brand-content'||path==='/api/assets'||path.startsWith('/api/modules/'))return maintenanceLocked(path,{privateRead:true});
      if(path.startsWith('/api/'))return maintenanceLocked(path,{privateRead:true});
    }

    // The current social schedule shown in ERP must always come from the latest formal policy.
    if(request.method==='GET'&&path==='/api/settings')return currentSettings(request,env,ctx);

    // Full ERP modules must bypass the historical publishing-only blocker.
    if(isFullErpApi(path))return productionApp.fetch(request,env,ctx);

    // Current publishing, review, regeneration and media-audit behavior stays on the latest chain.
    const response=await publishingApp.fetch(request,env,ctx);
    if(request.method==='GET'&&['/healthz','/healthz/core'].includes(path)){
      try{
        const body=await response.clone().json();
        const firstPost=await ensureFormalFirstPost(env);
        return json({...body,
          fullSystem:true,
          fullSystemVersion:VERSION,
          internalHomeEnabled:true,
          internalHomePath:'/',
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
          socialFirstPublishAt:SOCIAL_FIRST_PUBLISH_AT,
          platformConnectionProbePath:'/healthz/platform-connections',
          firstPost:publicFirstPost(firstPost),
          maintenanceNoLogin:maintenance,
          maintenanceReadOnly:maintenance
        },response.status);
      }catch{return response}
    }
    return response;
  },
  async scheduled(controller,env,ctx){
    const firstPost=await ensureFormalFirstPost(env);
    if(!firstPost?.ok)console.warn('first post bootstrap failed',String(firstPost?.error||'unknown'));
    if(typeof publishingApp.scheduled==='function')return publishingApp.scheduled(controller,env,ctx);
    if(typeof productionApp.scheduled==='function')return productionApp.scheduled(controller,env,ctx);
  }
};

export {VERSION,HOME_PATH,SOCIAL_SCHEDULE_POLICY,SOCIAL_FIXED_FREQUENCY,SOCIAL_FIRST_PUBLISH_AT,SOCIAL_POLICY_VERSION};