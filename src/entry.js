import app from './worker.js';

const HEADERS={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store',
  'x-content-type-options':'nosniff',
  'x-xianjiawei-entry':'2026-08-07-public-entry-v1'
};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});
const clean=(value,fallback='')=>String(value??fallback).trim();

async function authorize(request,env,ctx){
  const url=new URL('/api/me',request.url);
  return app.fetch(new Request(url,{method:'GET',headers:request.headers}),env,ctx);
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
    private_history_repository:'TS15825868/xianjiawei-internal-private'
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

export default{
  async fetch(request,env,ctx){
    const path=new URL(request.url).pathname;
    if(path==='/api/settings'&&request.method==='GET')return safeSettings(request,env,ctx);
    if(path==='/api/brand-content')return brandContent(request,env,ctx);
    return app.fetch(request,env,ctx);
  },
  async scheduled(controller,env,ctx){
    if(typeof app.scheduled==='function')return app.scheduled(controller,env,ctx);
  }
};
