import app from './flexible-publish-entry.js';

const VERSION='2026-08-09-publishing-review-gate-v1';
const REQUIRED_CHECKS=Object.freeze([
  'brand','product','specification','pricing_activity','season','weather','occasion','location',
  'scene_environment','temperature','expression','action','mascot_companions','physical_scale','duplicate','compliance_final'
]);
const PRODUCT_RULES=Object.freeze([
  {id:'guilu-gao',name:'龜鹿膏',terms:['龜鹿膏'],image:['guilu-gao','龜鹿膏']},
  {id:'guilu-drink-30',name:'龜鹿飲30cc玻璃罐',terms:['30cc','龜鹿飲30'],image:['guilu-drink-30','30cc','龜鹿飲30']},
  {id:'guilu-drink-180',name:'龜鹿飲180cc鋁袋',terms:['180cc','龜鹿飲180'],image:['guilu-drink-180','180cc','龜鹿飲180']},
  {id:'guilu-tangkuai',name:'龜鹿湯塊',terms:['龜鹿湯塊','湯塊'],image:['guilu-tangkuai','龜鹿湯塊','湯塊']},
  {id:'guilu-jiao',name:'龜鹿膠',terms:['龜鹿膠'],image:['guilu-jiao','龜鹿膠']},
  {id:'luerong-fen',name:'鹿茸粉',terms:['鹿茸粉'],image:['luerong-fen','鹿茸粉']},
]);
const HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-xianjiawei-publishing-review-gate':VERSION};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});
const clean=value=>String(value??'').trim();
let schemaPromise=null;

async function authorize(request,env,ctx){
  const url=new URL('/api/me',request.url);
  return app.fetch(new Request(url,{method:'GET',headers:request.headers}),env,ctx);
}
async function ensureSchema(env){
  if(!env?.DB)throw new Error('D1 資料庫尚未綁定');
  if(schemaPromise)return schemaPromise;
  schemaPromise=env.DB.exec(`CREATE TABLE IF NOT EXISTS social_post_review_gates(
    post_id TEXT PRIMARY KEY,
    content_fingerprint TEXT NOT NULL,
    checklist_json TEXT NOT NULL DEFAULT '{}',
    copy_image_match INTEGER NOT NULL DEFAULT 0,
    reviewed_by TEXT NOT NULL DEFAULT '',
    reviewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`).catch(error=>{schemaPromise=null;throw error});
  return schemaPromise;
}
async function postRow(env,id){return env.DB.prepare('SELECT * FROM social_posts WHERE id=? LIMIT 1').bind(id).first();}
function postMaterial(row){return{
  title:clean(row?.title),headline:clean(row?.headline),copy:clean(row?.copy),category:clean(row?.category),
  image_url:clean(row?.image_url),image_alt:clean(row?.image_alt),image_source:clean(row?.image_source),
  image_width:Number(row?.image_width||0),image_height:Number(row?.image_height||0),image_quality_status:clean(row?.image_quality_status)
}}
async function fingerprint(row){
  const text=JSON.stringify(postMaterial(row));
  const bytes=new TextEncoder().encode(text);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
function productMatchErrors(row){
  const text=clean([row?.title,row?.headline,row?.copy,row?.category].join(' '));
  const image=clean([row?.image_url,row?.image_alt,row?.image_source].join(' '));
  const errors=[];
  for(const rule of PRODUCT_RULES){
    if(!rule.terms.some(term=>text.toLowerCase().includes(term.toLowerCase())))continue;
    if(!rule.image.some(term=>image.toLowerCase().includes(term.toLowerCase())))errors.push(`文案提到「${rule.name}」，但圖片網址／說明／來源沒有對應產品資訊`);
  }
  if(/30\s*cc/i.test(text+image)&&/(玻璃瓶|30\s*cc\s*[／/]\s*瓶|瓶裝)/i.test(text+image))errors.push('30cc正式名稱必須是小玻璃罐，不得使用玻璃瓶／瓶裝');
  if(/龜鹿湯塊/.test(text+image)&&/(300\s*g|600\s*g)/i.test(text+image))errors.push('龜鹿湯塊正式規格只有75g／盒｜8塊裝');
  if(!clean(row?.image_url))errors.push('缺少圖片');
  if(!clean(row?.image_alt))errors.push('缺少圖片說明，無法完成圖文一致審核');
  if(clean(row?.image_quality_status)==='low')errors.push('圖片解析度不足');
  return [...new Set(errors)];
}
function checklistFrom(body){
  const value=body?.review_checklist&&typeof body.review_checklist==='object'&&!Array.isArray(body.review_checklist)?body.review_checklist:{};
  const missing=REQUIRED_CHECKS.filter(key=>value[key]!==true);
  return{value,missing};
}
async function gateState(env,row){
  if(!row)return{ok:false,reason:'找不到貼文'};
  await ensureSchema(env);
  const gate=await env.DB.prepare('SELECT * FROM social_post_review_gates WHERE post_id=? LIMIT 1').bind(row.id).first();
  if(!gate)return{ok:false,reason:'尚未完成16項正式圖文審核'};
  const current=await fingerprint(row);
  if(gate.content_fingerprint!==current)return{ok:false,reason:'文案或圖片已變更，先前圖文審核已自動失效'};
  if(Number(gate.copy_image_match||0)!==1)return{ok:false,reason:'文案與圖片尚未確認一致'};
  return{ok:true,reviewed_at:gate.reviewed_at||'',reviewed_by:gate.reviewed_by||'',fingerprint:current};
}
async function saveGate(env,row,body,profile){
  const checklist=checklistFrom(body);
  if(checklist.missing.length)throw new Error(`16項圖文審核尚未完成：${checklist.missing.join('、')}`);
  if(body?.copy_image_match!==true)throw new Error('必須確認「文案與圖片一致」才能核准');
  const errors=productMatchErrors(row);
  if(errors.length)throw new Error(errors.join('；'));
  const fp=await fingerprint(row),now=new Date().toISOString();
  await ensureSchema(env);
  await env.DB.prepare(`INSERT INTO social_post_review_gates(post_id,content_fingerprint,checklist_json,copy_image_match,reviewed_by,reviewed_at)
    VALUES(?,?,?,?,?,?) ON CONFLICT(post_id) DO UPDATE SET content_fingerprint=excluded.content_fingerprint,checklist_json=excluded.checklist_json,copy_image_match=excluded.copy_image_match,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at`)
    .bind(row.id,fp,JSON.stringify(checklist.value),1,clean(profile?.email),now).run();
}
async function clearGate(env,id){try{await ensureSchema(env);await env.DB.prepare('DELETE FROM social_post_review_gates WHERE post_id=?').bind(id).run()}catch{}}
async function readBody(request){try{return await request.clone().json()}catch{return{}}}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url),path=url.pathname;
    if(request.method==='GET'&&path==='/healthz'){
      const response=await app.fetch(request,env,ctx),text=await response.text();let body={};
      try{body=text?JSON.parse(text):{}}catch{return response}
      return json({...body,publishingReviewGateVersion:VERSION,publishingReviewChecklistCount:REQUIRED_CHECKS.length,copyImageMatchHardGate:true},response.status);
    }
    const statusMatch=path.match(/^\/api\/posts\/([^/]+)\/status$/);
    const publishMatch=path.match(/^\/api\/posts\/([^/]+)\/publish-now$/);
    const postMatch=path.match(/^\/api\/posts\/([^/]+)$/);
    const gateMatch=path.match(/^\/api\/posts\/([^/]+)\/review-gate$/);
    if(gateMatch&&request.method==='GET'){
      const authorization=await authorize(request,env,ctx);if(!authorization.ok)return authorization;
      await ensureSchema(env);const id=decodeURIComponent(gateMatch[1]),row=await postRow(env,id);if(!row)return json({error:'找不到貼文'},404);
      return json({id,...await gateState(env,row),errors:productMatchErrors(row),required_checks:REQUIRED_CHECKS});
    }
    if(statusMatch&&request.method==='POST'){
      const authorization=await authorize(request,env,ctx);if(!authorization.ok)return authorization;
      const profile=await authorization.json(),id=decodeURIComponent(statusMatch[1]),body=await readBody(request),row=await postRow(env,id);
      if(!row)return json({error:'找不到貼文'},404);
      if(body?.status==='approved'){
        try{await saveGate(env,row,body,profile)}catch(error){return json({error:clean(error?.message||error)},409)}
        const response=await app.fetch(request,env,ctx);if(!response.ok)await clearGate(env,id);return response;
      }
      if(body?.status==='scheduled'||body?.status==='published'){
        const gate=await gateState(env,row);if(!gate.ok)return json({error:`正式發布守門：${gate.reason}`},409);
      }
      const response=await app.fetch(request,env,ctx);if(response.ok&&body?.status==='draft')await clearGate(env,id);return response;
    }
    if(publishMatch&&request.method==='POST'){
      const authorization=await authorize(request,env,ctx);if(!authorization.ok)return authorization;
      const id=decodeURIComponent(publishMatch[1]),row=await postRow(env,id);if(!row)return json({error:'找不到貼文'},404);
      const gate=await gateState(env,row);if(!gate.ok)return json({error:`正式發布守門：${gate.reason}`},409);
      const errors=productMatchErrors(row);if(errors.length)return json({error:'正式發布守門：圖文檢查未通過',details:errors},409);
      return app.fetch(request,env,ctx);
    }
    if(postMatch&&request.method==='PUT'){
      const id=decodeURIComponent(postMatch[1]),response=await app.fetch(request,env,ctx);if(response.ok)await clearGate(env,id);return response;
    }
    return app.fetch(request,env,ctx);
  },
  async scheduled(controller,env,ctx){
    if(typeof app.scheduled==='function')return app.scheduled(controller,env,ctx);
  }
};

export { VERSION, REQUIRED_CHECKS, PRODUCT_RULES, productMatchErrors, checklistFrom, fingerprint, gateState };
