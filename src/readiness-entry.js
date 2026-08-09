import app from './production-entry.js';
import { publisherConfiguration } from './social-publisher.js';

const VERSION='2026-08-09-readiness-lock-v1';
const JSON_HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-xianjiawei-readiness-lock':VERSION};
const REQUIRED_TABLES=['profiles','social_posts','social_publish_deliveries'];
const WRITE_METHODS=new Set(['POST','PUT','PATCH','DELETE']);
let cached={at:0,value:null};

const clean=value=>String(value??'').trim();
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:JSON_HEADERS});
const forceReadOnly=env=>String(env?.XJW_FORCE_READ_ONLY||'').toLowerCase()==='1'||String(env?.XJW_FORCE_READ_ONLY||'').toLowerCase()==='true';

function isPublishingWrite(request){
  if(!WRITE_METHODS.has(request.method))return false;
  const path=new URL(request.url).pathname;
  return /^\/api\/posts(?:\/|$)/.test(path)||path==='/api/media-upload';
}

async function probe(env,{fresh=false}={}){
  const now=Date.now();
  if(!fresh&&cached.value&&now-cached.at<15000)return cached.value;
  const accessConfigured=Boolean(clean(env?.POLICY_AUD)&&clean(env?.TEAM_DOMAIN));
  const d1Bound=Boolean(env?.DB);
  let d1Read=false,tablesReady=false,dbError='';
  const tables={};
  for(const name of REQUIRED_TABLES)tables[name]=false;
  if(d1Bound){
    try{
      const ping=await env.DB.prepare('SELECT 1 AS ok').first();
      d1Read=Number(ping?.ok||0)===1;
      const marks=REQUIRED_TABLES.map(()=>'?').join(',');
      const result=await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN (${marks})`).bind(...REQUIRED_TABLES).all();
      for(const row of result.results||[])if(Object.hasOwn(tables,row.name))tables[row.name]=true;
      tablesReady=REQUIRED_TABLES.every(name=>tables[name]);
    }catch(error){dbError=clean(error?.message||error);}
  }
  let platformConfig={platforms:{},fullyConfigured:false};
  try{platformConfig=publisherConfiguration(env)||platformConfig;}catch{}
  const platforms={};
  for(const [name,item] of Object.entries(platformConfig.platforms||{}))platforms[name]={mode:item.mode||'unconfigured',ready:Boolean(item.ready),manualRequired:Boolean(item.manualRequired)};
  const lockedByOperator=forceReadOnly(env);
  const coreReady=Boolean(accessConfigured&&d1Bound&&d1Read&&tablesReady&&!lockedByOperator);
  const value={
    ok:coreReady,
    version:VERSION,
    checkedAt:new Date().toISOString(),
    mode:coreReady?'ready':'read_only',
    core:{worker:true,accessConfigured,d1Bound,d1Read,tablesReady,tables},
    automaticPlatformPublishingReady:Boolean(platformConfig.fullyConfigured),
    platforms,
    lockedByOperator,
    dbError:dbError||undefined,
  };
  cached={at:now,value};
  return value;
}

async function authorize(request,env,ctx){
  const url=new URL('/api/me',request.url);
  return app.fetch(new Request(url,{method:'GET',headers:request.headers}),env,ctx);
}

async function readinessResponse(request,env,ctx){
  const auth=await authorize(request,env,ctx);
  if(!auth.ok)return auth;
  return json(await probe(env,{fresh:true}));
}

async function healthResponse(request,env,ctx){
  const [base,readiness]=await Promise.all([app.fetch(request,env,ctx),probe(env,{fresh:true})]);
  let body={};
  try{body=await base.clone().json();}catch{}
  return json({...body,readinessLockVersion:VERSION,systemReadiness:readiness},base.status);
}

export default{
  async fetch(request,env,ctx){
    const path=new URL(request.url).pathname;
    if(request.method==='GET'&&path==='/healthz')return healthResponse(request,env,ctx);
    if(request.method==='GET'&&path==='/api/system/readiness')return readinessResponse(request,env,ctx);
    if(isPublishingWrite(request)){
      const auth=await authorize(request,env,ctx);
      if(!auth.ok)return auth;
      const readiness=await probe(env,{fresh:true});
      if(!readiness.ok)return json({error:'貼文系統目前處於安全唯讀模式',detail:'登入／D1／必要資料表尚未全部通過檢查；系統已自動禁止寫入、審核、排程與發布。',readiness},503);
    }
    return app.fetch(request,env,ctx);
  },
  async scheduled(controller,env,ctx){
    const readiness=await probe(env,{fresh:true});
    if(!readiness.ok){console.warn('仙加味貼文系統安全鎖：排程發布已暫停',JSON.stringify(readiness));return;}
    if(typeof app.scheduled==='function')return app.scheduled(controller,env,ctx);
  }
};

export { VERSION, REQUIRED_TABLES, isPublishingWrite, probe, forceReadOnly };
