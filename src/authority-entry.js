import app from './entry.js';
import { validateProductRecord, validatePostPayload } from './product-authority.js';

const HEADERS={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store',
  'x-content-type-options':'nosniff',
  'x-xianjiawei-authority-entry':'2026-08-08-merged-write-v1'
};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});
const clean=(value)=>String(value??'').trim();

async function readJsonClone(request){
  try{return await request.clone().json();}catch{return null;}
}
async function existingProduct(env,id){
  if(!env?.DB)return null;
  const row=await env.DB.prepare("SELECT data_json FROM app_records WHERE module='products' AND id=? AND archived=0 LIMIT 1").bind(id).first();
  if(!row)return null;
  try{return JSON.parse(row.data_json||'{}');}catch{return null;}
}
async function existingPost(env,id){
  if(!env?.DB)return null;
  const row=await env.DB.prepare('SELECT title,headline,copy,category,image_alt,image_source FROM social_posts WHERE id=? LIMIT 1').bind(id).first();
  return row||null;
}
function mergeRecord(before,patch){
  if(!before||typeof before!=='object')return patch||{};
  if(!patch||typeof patch!=='object')return before;
  return {...before,...patch};
}
async function validateMergedWrite(request,env){
  if(!['PUT','PATCH'].includes(request.method))return null;
  const path=new URL(request.url).pathname;
  const productMatch=path.match(/^\/api\/modules\/products\/([^/]+)$/);
  const postMatch=path.match(/^\/api\/posts\/([^/]+)$/);
  if(!productMatch&&!postMatch)return null;
  const patch=await readJsonClone(request);
  if(!patch||Array.isArray(patch)||typeof patch!=='object')return null;

  if(productMatch){
    const id=decodeURIComponent(productMatch[1]);
    const before=await existingProduct(env,id);
    if(!before)return null;
    const merged=mergeRecord(before,patch);
    const errors=validateProductRecord(merged);
    if(errors.length)return json({error:'正式產品完整資料檢查未通過',details:errors,id},400);
  }
  if(postMatch){
    const id=decodeURIComponent(postMatch[1]);
    const before=await existingPost(env,id);
    if(!before)return null;
    const merged=mergeRecord(before,patch);
    const errors=validatePostPayload(merged);
    if(errors.length)return json({error:'貼文正式產品資料檢查未通過',details:errors,id},400);
  }
  return null;
}

export default{
  async fetch(request,env,ctx){
    try{
      const error=await validateMergedWrite(request,env);
      if(error)return error;
    }catch(error){
      console.warn('merged authority validation skipped',clean(error?.message||error));
    }
    return app.fetch(request,env,ctx);
  },
  async scheduled(controller,env,ctx){
    if(typeof app.scheduled==='function')return app.scheduled(controller,env,ctx);
  }
};

export { validateMergedWrite };
