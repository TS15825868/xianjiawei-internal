import app from './worker.js';
import { uploadMedia, serveMedia } from './media-upload.js';
import { reconcileOfficialPostMedia } from './post-image-reconciler.js';
import { validateProductRecord, validatePostPayload, PRODUCT_AUTHORITY } from './product-authority.js';

const HEADERS={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store',
  'x-content-type-options':'nosniff',
  'x-xianjiawei-entry':'2026-08-18-post-image-self-heal-v1'
};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});
const clean=(value,fallback='')=>String(value??fallback).trim();
const MODULE_PREFIX={products:'PRD',customers:'CUS',visits:'VIS',orders:'ORD',inventory:'INV',purchases:'PUR',suppliers:'SUP',finance:'FIN',tasks:'TSK',documents:'DOC',templates:'TPL',assets:'AST'};
const WRITE_ROLES={products:['owner','admin'],customers:['owner','admin','sales'],visits:['owner','admin','sales'],orders:['owner','admin','sales','warehouse','accounting'],inventory:['owner','admin','warehouse'],purchases:['owner','admin','warehouse','accounting'],suppliers:['owner','admin','warehouse','accounting'],finance:['owner','admin','accounting'],tasks:['owner','admin','sales','warehouse','accounting','content'],documents:['owner','admin','content'],templates:['owner','admin','content'],assets:['owner','admin','content']};

function splitSqlStatements(sql){
  const source=String(sql||'');
  const output=[];
  let current='';
  let quote='';
  for(let index=0;index<source.length;index+=1){
    const char=source[index];
    if(quote){
      current+=char;
      if(char===quote){
        if(source[index+1]===quote){current+=source[index+1];index+=1;}
        else quote='';
      }
      continue;
    }
    if(char==="'"||char==='"'||char==='`'){quote=char;current+=char;continue;}
    if(char===';'){
      if(current.trim())output.push(current.trim());
      current='';
      continue;
    }
    current+=char;
  }
  if(current.trim())output.push(current.trim());
  return output;
}
function compatibleDb(db){
  if(!db)return db;
  return new Proxy(db,{
    get(target,property){
      if(property==='exec'){
        return async(sql)=>{
          const statements=splitSqlStatements(sql);
          if(!statements.length)return null;
          let last=null;
          for(const statement of statements)last=await target.prepare(statement).run();
          return last;
        };
      }
      const value=Reflect.get(target,property,target);
      return typeof value==='function'?value.bind(target):value;
    }
  });
}
function compatibleEnv(env){
  if(!env?.DB)return env;
  const db=compatibleDb(env.DB);
  return new Proxy(env,{get(target,property,receiver){if(property==='DB')return db;return Reflect.get(target,property,receiver);}});
}
function cleanRecord(value){
  if(!value||Array.isArray(value)||typeof value!=='object')throw new Error('資料格式錯誤');
  const output={};
  for(const [key,item] of Object.entries(value)){
    if(['__proto__','prototype','constructor','created_at','updated_at'].includes(key))continue;
    if(typeof item==='string')output[key]=item.trim();
    else if(typeof item==='number'||typeof item==='boolean'||item==null)output[key]=item;
    else if(Array.isArray(item))output[key]=item.slice(0,100);
  }
  if(JSON.stringify(output).length>120000)throw new Error('單筆資料過大');
  return output;
}
function canWrite(profile,module){return(WRITE_ROLES[module]||['owner','admin']).includes(profile?.role);}

async function authorize(request,env,ctx){
  const url=new URL('/api/me',request.url);
  return app.fetch(new Request(url,{method:'GET',headers:request.headers}),compatibleEnv(env),ctx);
}
async function safeSettings(request,env,ctx){
  const authorization=await authorize(request,env,ctx);
  if(!authorization.ok)return authorization;
  const settings={
    schedule_policy:'週二 19:30、週六 09:30（Asia/Taipei）；立即發布不受固定時段限制',
    storage:'Cloudflare D1',
    secrets:'Cloudflare Worker Secrets',
    access:'Cloudflare Access',
    public_runtime_repository:'TS15825868/xianjiawei-internal',
    private_history_repository:'TS15825868/xianjiawei-internal-private',
    product_authority:PRODUCT_AUTHORITY
  };
  try{
    const result=await env.DB.prepare('SELECT setting_key,value_json,updated_by,updated_at FROM app_settings ORDER BY setting_key').all();
    for(const row of result.results||[]){
      if(/token|secret|password|credential|private.?key|api.?key/i.test(row.setting_key))continue;
      let value=row.value_json;
      try{value=JSON.parse(value);}catch{}
      settings[row.setting_key]={value,updated_by:row.updated_by||'',updated_at:row.updated_at||''};
    }
  }catch(error){
    settings.database_note=`設定表讀取略過：${clean(error?.message||error)}`;
  }
  return json({settings});
}
function cleanBrandItem(item){
  if(!item||Array.isArray(item)||typeof item!=='object')throw new Error('品牌內容格式錯誤');
  return{id:clean(item.id),title:clean(item.title),eyebrow:clean(item.eyebrow),summary:clean(item.summary),lineReply:clean(item.lineReply),websitePath:clean(item.websitePath),status:['draft','published','archived'].includes(clean(item.status))?clean(item.status):'draft',platforms:Array.isArray(item.platforms)?[...new Set(item.platforms.map(clean).filter(Boolean))].slice(0,10):[]};
}
function cleanBrandPayload(value){
  const body=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const items=Array.isArray(body.items)?body.items.slice(0,50).map(cleanBrandItem):[];
  const ids=new Set();
  for(const item of items){if(!item.id||!item.title)throw new Error('每筆品牌內容都必須有 id 與 title');if(ids.has(item.id))throw new Error(`品牌內容 id 重複：${item.id}`);ids.add(item.id);}
  return{version:clean(body.version,'2.0'),brand:clean(body.brand,'仙加味'),tagline:clean(body.tagline,'補養，是一種節奏。'),items};
}
async function brandContent(request,env,ctx){
  const authorization=await authorize(request,env,ctx);
  if(!authorization.ok)return authorization;
  const profile=await authorization.json();
  if(request.method==='GET'){
    const row=await env.DB.prepare("SELECT value_json,updated_by,updated_at FROM app_settings WHERE setting_key='brand_content_v2' LIMIT 1").first();
    if(!row)return json({version:'2.0',brand:'仙加味',tagline:'補養，是一種節奏。',items:[]});
    try{return json({...JSON.parse(row.value_json||'{}'),updatedBy:row.updated_by||'',updatedAt:row.updated_at||''});}catch{return json({version:'2.0',brand:'仙加味',tagline:'補養，是一種節奏。',items:[]});}
  }
  if(request.method!=='PUT')return json({error:'不支援的請求方法'},405);
  if(!['owner','admin','content'].includes(profile.role))return json({error:'沒有修改品牌內容的權限'},403);
  try{
    const payload=cleanBrandPayload(await request.json());
    const now=new Date().toISOString();
    await env.DB.prepare("INSERT INTO app_settings(setting_key,value_json,updated_by,updated_at) VALUES('brand_content_v2',?,?,?) ON CONFLICT(setting_key) DO UPDATE SET value_json=excluded.value_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at").bind(JSON.stringify(payload),profile.email,now).run();
    return json({...payload,updatedBy:profile.email,updatedAt:now});
  }catch(error){return json({error:clean(error?.message||error,'品牌內容格式錯誤')},400);}
}
async function createCompatibleRecord(request,env,ctx,module){
  const authorization=await authorize(request,env,ctx);
  if(!authorization.ok)return authorization;
  const profile=await authorization.json();
  if(!canWrite(profile,module))return json({error:'沒有新增資料權限'},403);
  try{
    const body=cleanRecord(await request.json());
    if(module==='products'){
      const errors=validateProductRecord(body);
      if(errors.length)return json({error:'正式產品規格檢查未通過',details:errors},400);
    }
    const id=clean(body.id)||`${MODULE_PREFIX[module]||'REC'}-${crypto.randomUUID()}`;
    delete body.id;
    const now=new Date().toISOString();
    await env.DB.prepare('INSERT INTO app_records(module,id,data_json,archived,created_by,created_at,updated_at) VALUES(?,?,?,0,?,?,?)').bind(module,id,JSON.stringify(body),profile.email,now,now).run();
    try{
      await env.DB.prepare('INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) VALUES(?,?,?,?,?,?,?,?)').bind(`AUD-${crypto.randomUUID()}`,profile.email,'新增',module,id,null,JSON.stringify({...body,id,created_at:now,updated_at:now}),request.headers.get('cf-connecting-ip')||'').run();
    }catch{}
    return json({...body,id,created_at:now,updated_at:now},201);
  }catch(error){return json({error:clean(error?.message||error,'新增資料失敗')},400);}
}

async function validateForwardedWrite(request){
  if(!['POST','PUT','PATCH'].includes(request.method))return null;
  const path=new URL(request.url).pathname;
  const productMatch=path.match(/^\/api\/modules\/products(?:\/[^/]+)?$/);
  const postMatch=path.match(/^\/api\/posts(?:\/[^/]+)?$/);
  if(!productMatch&&!postMatch)return null;
  let body;
  try{body=await request.clone().json();}catch{return null;}
  const errors=productMatch?validateProductRecord(body,{partial:Boolean(path.match(/^\/api\/modules\/products\/[^/]+$/))}):validatePostPayload(body);
  return errors.length?json({error:'正式產品規格檢查未通過',details:errors},400):null;
}

export default{
  async fetch(request,env,ctx){
    const path=new URL(request.url).pathname;
    const mediaMatch=path.match(/^\/media\/([^/]+)$/);
    if(request.method==='GET'&&mediaMatch){
      try{return await serveMedia(request,compatibleEnv(env),decodeURIComponent(mediaMatch[1]));}
      catch{return new Response('Not Found',{status:404,headers:{'cache-control':'no-store'}});}
    }
    if(request.method==='POST'&&path==='/api/media-upload'){
      const authorization=await authorize(request,env,ctx);
      if(!authorization.ok)return authorization;
      const profile=await authorization.json();
      try{return await uploadMedia(request,compatibleEnv(env),profile);}
      catch(error){return json({error:clean(error?.message||error,'圖片上傳失敗')},500);}
    }
    if(request.method==='GET'&&path==='/api/posts'){
      const authorization=await authorize(request,env,ctx);
      if(!authorization.ok)return authorization;
      try{await reconcileOfficialPostMedia(compatibleEnv(env));}catch(error){console.warn('posting image self-heal failed',String(error?.message||error));}
    }
    const authorityError=await validateForwardedWrite(request);
    if(authorityError)return authorityError;
    const moduleCreate=path.match(/^\/api\/modules\/([^/]+)$/);
    if(request.method==='POST'&&moduleCreate&&WRITE_ROLES[moduleCreate[1]])return createCompatibleRecord(request,env,ctx,moduleCreate[1]);
    if(request.method==='POST'&&path==='/api/assets')return createCompatibleRecord(request,env,ctx,'assets');
    if(path==='/api/settings'&&request.method==='GET')return safeSettings(request,env,ctx);
    if(path==='/api/brand-content')return brandContent(request,env,ctx);
    return app.fetch(request,compatibleEnv(env),ctx);
  },
  async scheduled(controller,env,ctx){
    if(typeof app.scheduled==='function')return app.scheduled(controller,compatibleEnv(env),ctx);
  }
};
