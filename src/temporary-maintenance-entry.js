import app from './full-system-entry.js';
import { publisherConfiguration } from './social-publisher.js';
import { checkD1 } from './system-readiness.js';

const VERSION='2026-09-14-temporary-maintenance-readonly-v1';
const MODE='publishing-readonly';
const HEADERS={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store',
  'x-content-type-options':'nosniff',
  'x-xianjiawei-maintenance':VERSION
};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});
const clean=value=>String(value??'').trim();
const int=(value,fallback=0)=>{const n=Number(value);return Number.isFinite(n)?Math.trunc(n):fallback;};
const POST_STATUSES=new Set(['draft','pending_review','approved','scheduled','published','manual_required','failed']);

function maintenanceEnabled(env){
  return clean(env?.TEMP_ACCESS_MODE).toLowerCase()===MODE;
}
function maintenanceProfile(){
  return{
    email:'maintenance-readonly@xianjiawei.local',
    display_name:'系統整理模式（唯讀）',
    role:'viewer',
    role_label:'僅檢視',
    active:1,
    maintenance_readonly:true,
    temporary_access_mode:MODE,
    version:VERSION
  };
}
function mapPost(row){
  let platforms=[];
  try{platforms=JSON.parse(row.platforms_json||'[]');}catch{}
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
    line_voom_manual_only:true
  };
}
async function listPosts(request,env){
  if(!env?.DB)return json({error:'D1 資料庫尚未綁定'},503);
  const url=new URL(request.url);
  const limit=Math.min(60,Math.max(1,int(url.searchParams.get('limit'),18)));
  const offset=Math.max(0,int(url.searchParams.get('offset'),0));
  const status=clean(url.searchParams.get('status'));
  const q=clean(url.searchParams.get('q')).slice(0,100);
  const where=["status<>'archived'"];
  const binds=[];
  if(POST_STATUSES.has(status)){where.push('status=?');binds.push(status);}
  if(q){
    where.push('(title LIKE ? OR headline LIKE ? OR copy LIKE ? OR category LIKE ? OR image_alt LIKE ?)');
    const like=`%${q}%`;
    binds.push(like,like,like,like,like);
  }
  const clause=where.join(' AND ');
  const fields='id,title,headline,copy,category,platforms_json,status,scheduled_at,approved_by,approved_at,published_at,created_by,created_at,updated_at,image_url,image_alt,image_source,image_approved,image_width,image_height,image_bytes,image_quality_status,proposed_scheduled_at';
  const rows=await env.DB.prepare(`SELECT ${fields} FROM social_posts WHERE ${clause} ORDER BY updated_at DESC,created_at DESC,id DESC LIMIT ? OFFSET ?`).bind(...binds,limit,offset).all();
  const totalRow=await env.DB.prepare(`SELECT COUNT(*) AS count FROM social_posts WHERE ${clause}`).bind(...binds).first();
  const grouped=await env.DB.prepare("SELECT status,COUNT(*) AS count FROM social_posts WHERE status<>'archived' GROUP BY status").all();
  const counts={draft:0,pending_review:0,approved:0,scheduled:0,published:0,manual_required:0,failed:0};
  for(const row of grouped.results||[])counts[row.status]=Number(row.count||0);
  return json({
    items:(rows.results||[]).map(mapPost),
    total:Number(totalRow?.count||0),
    limit,offset,counts,query:q,
    status:POST_STATUSES.has(status)?status:'all',
    maintenance_readonly:true,
    version:VERSION
  });
}
async function getPost(env,id){
  if(!env?.DB)return json({error:'D1 資料庫尚未綁定'},503);
  const row=await env.DB.prepare("SELECT * FROM social_posts WHERE id=? AND status<>'archived' LIMIT 1").bind(id).first();
  return row?json(mapPost(row)):json({error:'找不到可檢視的貼文'},404);
}
async function getDeliveries(env,id){
  if(!env?.DB)return json({error:'D1 資料庫尚未綁定'},503);
  const post=await env.DB.prepare("SELECT id FROM social_posts WHERE id=? AND status<>'archived' LIMIT 1").bind(id).first();
  if(!post)return json({error:'找不到可檢視的貼文'},404);
  const rows=await env.DB.prepare('SELECT platform,status,attempt_count,last_attempt_at,published_at,remote_id,error_text,updated_at FROM social_publish_deliveries WHERE post_id=? ORDER BY platform').bind(id).all();
  return json({
    post_id:id,
    platforms:(rows.results||[]).map(row=>({
      platform:row.platform||'',
      status:row.status||'pending',
      attempt_count:Number(row.attempt_count||0),
      last_attempt_at:row.last_attempt_at||'',
      published_at:row.published_at||'',
      remote_id:row.remote_id||'',
      error_text:row.error_text||'',
      updated_at:row.updated_at||''
    })),
    maintenance_readonly:true
  });
}
async function readiness(env){
  let d1={ok:false,error:'D1 未檢查'};
  try{d1=await checkD1(env);}catch(error){d1={ok:false,error:clean(error?.message||error)};}
  return json({
    ok:Boolean(d1?.ok),
    maintenance_readonly:true,
    temporary_access_mode:MODE,
    access:{ok:true,mode:'temporarily-bypassed',note:'Cloudflare Access 暫停期間僅開放貼文中心唯讀驗收；所有寫入 API 鎖定'},
    d1,
    checkedAt:new Date().toISOString(),
    version:VERSION
  },d1?.ok?200:503);
}
function mutationLocked(path){
  return json({
    error:'系統整理期間為唯讀模式；新增、修改、審核、排程與發布暫時鎖定。',
    code:'XJW_TEMP_MAINTENANCE_READONLY',
    path,
    maintenance_readonly:true,
    version:VERSION
  },423);
}

export default{
  async fetch(request,env,ctx){
    if(!maintenanceEnabled(env))return app.fetch(request,env,ctx);
    const url=new URL(request.url),path=url.pathname;

    // During temporary Access bypass, never expose a public write surface.
    if(['POST','PUT','PATCH','DELETE'].includes(request.method)&&path.startsWith('/api/'))return mutationLocked(path);

    if(request.method==='GET'&&path==='/api/me')return json(maintenanceProfile());
    if(request.method==='GET'&&path==='/api/posts')return listPosts(request,env);
    if(request.method==='GET'&&path==='/api/platform-authorization'){
      const config=publisherConfiguration(env);
      return json({...config,maintenance_readonly:true,version:VERSION});
    }
    const deliveryMatch=path.match(/^\/api\/posts\/([^/]+)\/deliveries$/);
    if(request.method==='GET'&&deliveryMatch)return getDeliveries(env,decodeURIComponent(deliveryMatch[1]));
    const postMatch=path.match(/^\/api\/posts\/([^/]+)$/);
    if(request.method==='GET'&&postMatch)return getPost(env,decodeURIComponent(postMatch[1]));
    if(request.method==='GET'&&path==='/healthz/readiness')return readiness(env);

    return app.fetch(request,env,ctx);
  },
  async scheduled(controller,env,ctx){
    if(typeof app.scheduled==='function')return app.scheduled(controller,env,ctx);
  }
};

export {VERSION,MODE,maintenanceEnabled};
