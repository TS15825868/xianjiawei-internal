import { publisherConfiguration } from './social-publisher.js';

const VERSION='2026-08-09-system-readiness-v3-shared-fast-login';
const CORE_TIMEOUT_MS=3500;
const PLATFORM_TIMEOUT_MS=5500;
const clean=value=>String(value??'').trim();
const now=()=>new Date().toISOString();

async function timed(name,work,timeoutMs=CORE_TIMEOUT_MS){
  const started=Date.now();
  let timer;
  try{
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${name} 檢查逾時`)),timeoutMs)});
    const value=await Promise.race([Promise.resolve().then(work),timeout]);
    return{ok:true,name,latencyMs:Date.now()-started,...(value&&typeof value==='object'?value:{value})};
  }catch(error){
    return{ok:false,name,latencyMs:Date.now()-started,error:clean(error?.message||error)};
  }finally{clearTimeout(timer)}
}

export async function checkD1(env){
  if(!env?.DB)return{ok:false,name:'D1',error:'D1 資料庫尚未綁定',latencyMs:0};
  return timed('D1',async()=>{
    const row=await env.DB.prepare('SELECT 1 AS ok').first();
    if(Number(row?.ok||0)!==1)throw new Error('D1 測試查詢沒有回傳預期結果');
    return{binding:true};
  });
}

export function checkAccessConfig(env){
  const missing=[];
  if(!clean(env?.TEAM_DOMAIN))missing.push('TEAM_DOMAIN');
  if(!clean(env?.POLICY_AUD))missing.push('POLICY_AUD');
  return{ok:missing.length===0,name:'Cloudflare Access',configured:missing.length===0,missing};
}

export async function checkCurrentLogin(request,env,ctx,app){
  if(!app?.fetch)return{ok:false,name:'登入',error:'登入驗證器未載入'};
  return timed('登入',async()=>{
    const url=new URL('/api/me',request.url);
    const response=await app.fetch(new Request(url,{method:'GET',headers:request.headers}),env,ctx);
    if(!response.ok){
      let detail='';try{detail=clean((await response.json())?.error)}catch{}
      throw new Error(detail||`HTTP ${response.status}`);
    }
    const profile=await response.json().catch(()=>({}));
    return{authenticated:true,role:clean(profile?.role||profile?.role_label)};
  },5000);
}

async function sharedLogin(loginCheck){
  if(typeof loginCheck!=='function')return null;
  return timed('登入',async()=>{
    const profile=await loginCheck();
    return{authenticated:true,role:clean(profile?.role||profile?.role_label),sharedFastAccess:true};
  },5000);
}

async function fetchProbe(url,options={},timeoutMs=PLATFORM_TIMEOUT_MS){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url,{...options,signal:controller.signal});
    const text=await response.text();
    let data={};try{data=text?JSON.parse(text):{}}catch{}
    if(!response.ok)throw new Error(data?.error?.message||data?.message||data?.error_description||`HTTP ${response.status}`);
    return{status:response.status,data};
  }finally{clearTimeout(timer)}
}

async function configuredProbe(name,work){
  const result=await timed(name,work,PLATFORM_TIMEOUT_MS);
  return{...result,configured:true,mode:'official_api'};
}
async function probeLine(env){
  const token=clean(env?.LINE_CHANNEL_ACCESS_TOKEN);
  if(!token)return{ok:false,mode:'manual',configured:false,reason:'LINE_CHANNEL_ACCESS_TOKEN 未設定'};
  return configuredProbe('LINE OA API',async()=>{await fetchProbe('https://api.line.me/v2/bot/info',{headers:{authorization:`Bearer ${token}`}});return{reachable:true}});
}
async function probeFacebook(env){
  const page=clean(env?.META_PAGE_ID),token=clean(env?.META_PAGE_ACCESS_TOKEN),version=clean(env?.META_GRAPH_VERSION||'v25.0').replace(/^\/+|\/+$/g,'');
  if(!page||!token)return{ok:false,mode:'manual',configured:false,reason:'Facebook Page ID／Access Token 未設定完整'};
  return configuredProbe('Facebook API',async()=>{await fetchProbe(`https://graph.facebook.com/${version}/${encodeURIComponent(page)}?fields=id,name&access_token=${encodeURIComponent(token)}`);return{reachable:true}});
}
async function probeInstagram(env){
  const user=clean(env?.META_INSTAGRAM_USER_ID),token=clean(env?.META_PAGE_ACCESS_TOKEN),version=clean(env?.META_GRAPH_VERSION||'v25.0').replace(/^\/+|\/+$/g,'');
  if(!user||!token)return{ok:false,mode:'manual',configured:false,reason:'Instagram User ID／Access Token 未設定完整'};
  return configuredProbe('Instagram API',async()=>{await fetchProbe(`https://graph.facebook.com/${version}/${encodeURIComponent(user)}?fields=id,username&access_token=${encodeURIComponent(token)}`);return{reachable:true}});
}
async function probeGoogle(env){
  const names=['GOOGLE_OAUTH_CLIENT_ID','GOOGLE_OAUTH_CLIENT_SECRET','GOOGLE_OAUTH_REFRESH_TOKEN','GOOGLE_BUSINESS_ACCOUNT_ID','GOOGLE_BUSINESS_LOCATION_ID'];
  const missing=names.filter(name=>!clean(env?.[name]));
  if(missing.length)return{ok:false,mode:'manual',configured:false,reason:`Google 商家設定未完成：${missing.join('、')}`};
  return configuredProbe('Google 商家 API',async()=>{
    const response=await fetchProbe('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clean(env.GOOGLE_OAUTH_CLIENT_ID),client_secret:clean(env.GOOGLE_OAUTH_CLIENT_SECRET),refresh_token:clean(env.GOOGLE_OAUTH_REFRESH_TOKEN),grant_type:'refresh_token'})});
    if(!clean(response?.data?.access_token))throw new Error('Google OAuth 未回傳 access token');
    return{reachable:true};
  });
}

export async function probePlatforms(env){
  const declared=publisherConfiguration(env);
  const [facebook,instagram,line,google]=await Promise.all([probeFacebook(env),probeInstagram(env),probeLine(env),probeGoogle(env)]);
  return{
    checkedAt:now(),
    declared,
    platforms:{
      Facebook:facebook,
      Instagram:instagram,
      'LINE OA':line,
      'LINE VOOM':{ok:true,mode:'manual',configured:true,reason:'LINE VOOM 依正式規則採人工發布'},
      'Google 商家':google,
    }
  };
}

export function blockingPlatformFailures(probe){
  const out=[];
  for(const [name,item] of Object.entries(probe?.platforms||{})){
    if(item?.mode==='manual'||item?.configured===false)continue;
    if(item?.configured===true&&item?.ok!==true)out.push({platform:name,error:item.error||item.reason||'API健康檢查未通過'});
  }
  return out;
}

export async function runReadiness(request,env,ctx,app,{probeExternal=false,loginCheck=null}={}){
  const access=checkAccessConfig(env);
  const loginPromise=typeof loginCheck==='function'?sharedLogin(loginCheck):checkCurrentLogin(request,env,ctx,app);
  const [d1,login]=await Promise.all([checkD1(env),loginPromise]);
  const result={
    ok:Boolean(d1.ok&&access.ok&&login?.ok),
    version:VERSION,
    checkedAt:now(),
    worker:{ok:true,name:'Worker',reachable:true},
    d1,
    access,
    login:login||{ok:false,name:'登入',error:'登入檢查沒有結果'},
    safeMode:Boolean(!(d1.ok&&access.ok&&login?.ok)),
  };
  if(probeExternal){
    result.platformProbe=await probePlatforms(env);
    result.blockingPlatformFailures=blockingPlatformFailures(result.platformProbe);
  }
  return result;
}

export { VERSION, CORE_TIMEOUT_MS, PLATFORM_TIMEOUT_MS };
