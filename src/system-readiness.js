import { publisherConfiguration } from './social-publisher.js';
import { probePublisherConnections } from './platform-connection-probe.js';

const VERSION='2026-09-14-system-readiness-v4-unified-platform-probe';
const CORE_TIMEOUT_MS=3500;
const PLATFORM_TIMEOUT_MS=12000;
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

function readinessPlatformItem(name,item={}){
  const manual=name==='LINE VOOM'||item.manualRequired===true||item.mode==='manual';
  const configured=manual||item.directConfigured===true||item.webhookConfigured===true;
  let reason='';
  if(manual)reason='依正式規則採人工發布';
  else if(item.degraded)reason='官方 API 目前未通過唯讀連線驗證，既有 Webhook 備援可用';
  else if(item.unconfigured)reason='尚未設定正式發布連線';
  else if(item.blockingFailure)reason='已設定的正式發布連線目前不可用，且沒有可用備援';
  return{
    ...item,
    ok:manual?true:item.operational===true,
    name,
    configured,
    mode:manual?'manual':item.mode||'unconfigured',
    reason:reason||item.status||'',
  };
}

export async function probePlatforms(env){
  const declared=publisherConfiguration(env);
  const probe=await timed('社群平台連線',()=>probePublisherConnections(env),PLATFORM_TIMEOUT_MS);
  if(!probe.ok){
    return{
      checkedAt:now(),
      declared,
      safe_read_only:true,
      publishes_content:false,
      platforms:{},
      probeError:probe.error||'社群平台連線檢查失敗',
      blockingPlatformFailures:[]
    };
  }
  const source=probe.platforms||{};
  const platforms={};
  for(const name of ['Facebook','Instagram','LINE OA','LINE VOOM','Google 商家']){
    platforms[name]=readinessPlatformItem(name,source[name]||{});
  }
  return{
    checkedAt:probe.checked_at||now(),
    declared,
    safe_read_only:probe.safe_read_only===true,
    publishes_content:probe.publishes_content===false?false:null,
    directCredentialsValid:probe.direct_credentials_valid===true,
    allAutomaticChannelsConfigured:probe.all_automatic_channels_configured===true,
    allConfiguredChannelsOperational:probe.all_configured_channels_operational===true,
    operationalPlatforms:probe.operational_platforms||[],
    degradedPlatforms:probe.degraded_platforms||[],
    unconfiguredPlatforms:probe.unconfigured_platforms||[],
    blockingPlatforms:probe.blocking_platforms||[],
    platforms
  };
}

export function blockingPlatformFailures(probe){
  const explicit=Array.isArray(probe?.blockingPlatforms)?probe.blockingPlatforms:[];
  if(explicit.length){
    return explicit.map(name=>({
      platform:name,
      error:probe?.platforms?.[name]?.reason||probe?.platforms?.[name]?.status||'已設定平台目前沒有可用正式發布路徑'
    }));
  }
  const out=[];
  for(const [name,item] of Object.entries(probe?.platforms||{})){
    if(item?.mode==='manual'||item?.configured===false)continue;
    if(item?.blockingFailure===true)out.push({platform:name,error:item.reason||item.status||'已設定平台目前沒有可用正式發布路徑'});
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
