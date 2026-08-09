import app from './entry.js';
import { validateProductRecord, validatePostPayload } from './product-authority.js';

const HEADERS={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store',
  'x-content-type-options':'nosniff',
  'x-xianjiawei-authority-entry':'2026-08-09-post-paging-approval-gate-v3-batched'
};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});
const clean=(value)=>String(value??'').trim();
const int=(value,fallback=0)=>{const n=Number(value);return Number.isFinite(n)?Math.trunc(n):fallback;};

async function readJsonClone(request){try{return await request.clone().json();}catch{return null;}}
async function authorize(request,env,ctx){
  const url=new URL('/api/me',request.url);
  return app.fetch(new Request(url,{method:'GET',headers:request.headers}),env,ctx);
}
async function existingProduct(env,id){
  if(!env?.DB)return null;
  const row=await env.DB.prepare("SELECT data_json FROM app_records WHERE module='products' AND id=? AND archived=0 LIMIT 1").bind(id).first();
  if(!row)return null;
  try{return JSON.parse(row.data_json||'{}');}catch{return null;}
}
async function existingPost(env,id){
  if(!env?.DB)return null;
  const row=await env.DB.prepare('SELECT title,headline,copy,category,image_url,image_alt,image_source,image_quality_status FROM social_posts WHERE id=? LIMIT 1').bind(id).first();
  return row||null;
}
function mergeRecord(before,patch){
  if(!before||typeof before!=='object')return patch||{};
  if(!patch||typeof patch!=='object')return before;
  return {...before,...patch};
}
function mapPost(row){
  let platforms=[];try{platforms=JSON.parse(row.platforms_json||'[]');}catch{}
  return{id:row.id,title:row.title||'',headline:row.headline||'',copy:row.copy||'',category:row.category||'日常節奏',platforms,status:row.status||'draft',scheduled_at:row.scheduled_at||'',proposed_scheduled_at:row.proposed_scheduled_at||'',approved_by:row.approved_by||'',approved_at:row.approved_at||'',published_at:row.published_at||'',image_url:row.image_url||'',image_alt:row.image_alt||'',image_source:row.image_source||'官方素材',image_approved:Number(row.image_approved||0)===1,image_width:int(row.image_width),image_height:int(row.image_height),image_bytes:int(row.image_bytes),image_quality_status:row.image_quality_status||'unknown',created_by:row.created_by||'',created_at:row.created_at||'',updated_at:row.updated_at||'',owner_review_required:!['published','archived'].includes(row.status),auto_approve:false,auto_schedule:false,auto_publish:false,line_voom_manual_only:true};
}
async function queryPostPage(env,clause,binds,limit,offset){
  const rowsStmt=env.DB.prepare(`SELECT * FROM social_posts WHERE ${clause} ORDER BY datetime(updated_at) DESC,datetime(created_at) DESC LIMIT ? OFFSET ?`).bind(...binds,limit,offset);
  const totalStmt=env.DB.prepare(`SELECT COUNT(*) AS count FROM social_posts WHERE ${clause}`).bind(...binds);
  const groupedStmt=env.DB.prepare("SELECT status,COUNT(*) AS count FROM social_posts WHERE status<>'archived' GROUP BY status");
  if(typeof env.DB.batch==='function'){
    const [rows,total,grouped]=await env.DB.batch([rowsStmt,totalStmt,groupedStmt]);
    return{rows:rows?.results||[],total:Number(total?.results?.[0]?.count||0),grouped:grouped?.results||[],mode:'batch'};
  }
  const rows=await rowsStmt.all();
  const total=await totalStmt.first();
  const grouped=await groupedStmt.all();
  return{rows:rows.results||[],total:Number(total?.count||0),grouped:grouped.results||[],mode:'sequential'};
}
async function fastPostList(request,env,ctx){
  if(!env?.DB)return json({error:'D1資料庫尚未綁定'},503);
  const authorization=await authorize(request,env,ctx);if(!authorization.ok)return authorization;
  const url=new URL(request.url),limit=Math.min(60,Math.max(1,int(url.searchParams.get('limit'),18))),offset=Math.max(0,int(url.searchParams.get('offset'),0));
  const status=clean(url.searchParams.get('status')),q=clean(url.searchParams.get('q')).slice(0,100);
  const allowed=new Set(['draft','pending_review','approved','scheduled','published','manual_required','failed']);
  const where=["status<>'archived'"];const binds=[];
  if(allowed.has(status)){where.push('status=?');binds.push(status);}
  if(q){where.push('(title LIKE ? OR headline LIKE ? OR copy LIKE ? OR category LIKE ? OR image_alt LIKE ?)');const like=`%${q}%`;binds.push(like,like,like,like,like);}
  const clause=where.join(' AND ');
  let result;
  try{result=await queryPostPage(env,clause,binds,limit,offset)}catch(error){
    console.warn('D1 batch post list failed; retry sequential',clean(error?.message||error));
    const rows=await env.DB.prepare(`SELECT * FROM social_posts WHERE ${clause} ORDER BY datetime(updated_at) DESC,datetime(created_at) DESC LIMIT ? OFFSET ?`).bind(...binds,limit,offset).all();
    const total=await env.DB.prepare(`SELECT COUNT(*) AS count FROM social_posts WHERE ${clause}`).bind(...binds).first();
    const grouped=await env.DB.prepare("SELECT status,COUNT(*) AS count FROM social_posts WHERE status<>'archived' GROUP BY status").all();
    result={rows:rows.results||[],total:Number(total?.count||0),grouped:grouped.results||[],mode:'fallback'};
  }
  const counts={draft:0,pending_review:0,approved:0,scheduled:0,published:0,manual_required:0,failed:0};
  for(const row of result.grouped||[])counts[row.status]=Number(row.count||0);
  return json({items:(result.rows||[]).map(mapPost),total:result.total,limit,offset,counts,query:q,status:allowed.has(status)?status:'all',queryMode:result.mode});
}
async function validateMergedWrite(request,env){
  if(!['PUT','PATCH'].includes(request.method))return null;
  const path=new URL(request.url).pathname;
  const productMatch=path.match(/^\/api\/modules\/products\/([^/]+)$/),postMatch=path.match(/^\/api\/posts\/([^/]+)$/);
  if(!productMatch&&!postMatch)return null;
  const patch=await readJsonClone(request);if(!patch||Array.isArray(patch)||typeof patch!=='object')return null;
  if(productMatch){
    const id=decodeURIComponent(productMatch[1]),before=await existingProduct(env,id);if(!before)return null;
    const errors=validateProductRecord(mergeRecord(before,patch));if(errors.length)return json({error:'正式產品完整資料檢查未通過',details:errors,id},400);
  }
  if(postMatch){
    const id=decodeURIComponent(postMatch[1]),before=await existingPost(env,id);if(!before)return null;
    const errors=validatePostPayload(mergeRecord(before,patch));if(errors.length)return json({error:'貼文圖文／產品資料檢查未通過',details:errors,id},400);
  }
  return null;
}
async function validateApproval(request,env){
  if(request.method!=='POST')return null;
  const match=new URL(request.url).pathname.match(/^\/api\/posts\/([^/]+)\/status$/);if(!match)return null;
  const body=await readJsonClone(request);if(clean(body?.status)!=='approved')return null;
  const id=decodeURIComponent(match[1]),before=await existingPost(env,id);if(!before)return null;
  const errors=validatePostPayload(before);
  if(!clean(before.image_alt))errors.push('圖片說明不可空白；請寫清楚圖片對應的產品／情境後再審核。');
  if(clean(before.image_quality_status)==='low')errors.push('圖片解析度不足，不能審核通過。');
  if(errors.length)return json({error:'圖文審核未通過，請先修正圖片或文案',details:[...new Set(errors)],id},409);
  return null;
}

export default{
  async fetch(request,env,ctx){
    const path=new URL(request.url).pathname;
    try{
      if(request.method==='GET'&&path==='/api/posts')return await fastPostList(request,env,ctx);
      const approval=await validateApproval(request,env);if(approval)return approval;
      const error=await validateMergedWrite(request,env);if(error)return error;
    }catch(error){
      console.warn('authority validation failed',clean(error?.message||error));
      if(request.method==='GET'&&path==='/api/posts')return json({error:'貼文清單讀取失敗',detail:clean(error?.message||error)},500);
    }
    return app.fetch(request,env,ctx);
  },
  async scheduled(controller,env,ctx){if(typeof app.scheduled==='function')return app.scheduled(controller,env,ctx);}
};

export { validateMergedWrite, validateApproval, fastPostList, queryPostPage };
