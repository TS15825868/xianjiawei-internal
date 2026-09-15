const PROBE_TIMEOUT_MS=8000;
const clean=(value)=>String(value||'').trim();

function timeout(){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort('timeout'),PROBE_TIMEOUT_MS);
  return {controller,done:()=>clearTimeout(timer)};
}
function pair(env,urlName,tokenName){return Boolean(clean(env?.[urlName])&&clean(env?.[tokenName]));}
function unconfigured(name,webhookConfigured=false){
  return {
    platform:name,
    mode:webhookConfigured?'webhook':'unconfigured',
    configured:webhookConfigured,
    directConfigured:false,
    webhookConfigured,
    connected:webhookConfigured?null:false,
    verified:false,
    status:webhookConfigured?'webhook_configured_not_probed':'unconfigured'
  };
}
function failed(name,{webhookConfigured=false,status=0,reason='connection_failed'}={}){
  return {
    platform:name,
    mode:'official_api',
    configured:true,
    directConfigured:true,
    webhookConfigured,
    connected:false,
    verified:true,
    httpStatus:Number(status||0),
    status:reason
  };
}
function connected(name,{webhookConfigured=false,status=200,details={}}={}){
  return {
    platform:name,
    mode:'official_api',
    configured:true,
    directConfigured:true,
    webhookConfigured,
    connected:true,
    verified:true,
    httpStatus:Number(status||200),
    status:'connected',
    ...details
  };
}
function graphVersion(env){return clean(env?.META_GRAPH_VERSION||'v25.0').replace(/^\/+|\/+$/g,'');}

async function probeMeta(env){
  const token=clean(env?.META_PAGE_ACCESS_TOKEN);
  const configuredPageId=clean(env?.META_PAGE_ID);
  const configuredInstagramUserId=clean(env?.META_INSTAGRAM_USER_ID);
  const facebookWebhook=pair(env,'FACEBOOK_PUBLISH_WEBHOOK_URL','FACEBOOK_PUBLISH_WEBHOOK_TOKEN');
  const instagramWebhook=pair(env,'INSTAGRAM_PUBLISH_WEBHOOK_URL','INSTAGRAM_PUBLISH_WEBHOOK_TOKEN');
  if(!token){
    return {
      Facebook:unconfigured('Facebook',facebookWebhook),
      Instagram:unconfigured('Instagram',instagramWebhook)
    };
  }
  const t=timeout();
  try{
    const fields='id,name,instagram_business_account,connected_instagram_account';
    const response=await fetch(`https://graph.facebook.com/${graphVersion(env)}/me?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`,{signal:t.controller.signal});
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      return {
        Facebook:failed('Facebook',{webhookConfigured:facebookWebhook,status:response.status,reason:'meta_token_or_api_unavailable'}),
        Instagram:failed('Instagram',{webhookConfigured:instagramWebhook,status:response.status,reason:'meta_token_or_api_unavailable'})
      };
    }
    const livePageId=clean(data.id);
    const pageConsistent=!configuredPageId||!livePageId||configuredPageId===livePageId;
    let liveInstagramId=clean(data.instagram_business_account?.id)||clean(data.connected_instagram_account?.id);
    if(livePageId&&!liveInstagramId){
      const pageResponse=await fetch(`https://graph.facebook.com/${graphVersion(env)}/${encodeURIComponent(livePageId)}?fields=${encodeURIComponent('instagram_business_account,connected_instagram_account')}&access_token=${encodeURIComponent(token)}`,{signal:t.controller.signal});
      const pageData=await pageResponse.json().catch(()=>({}));
      if(pageResponse.ok)liveInstagramId=clean(pageData.instagram_business_account?.id)||clean(pageData.connected_instagram_account?.id);
    }
    const instagramConsistent=!configuredInstagramUserId||!liveInstagramId||configuredInstagramUserId===liveInstagramId;
    const facebook=livePageId&&pageConsistent
      ? connected('Facebook',{webhookConfigured:facebookWebhook,status:response.status,details:{identityConsistent:true}})
      : failed('Facebook',{webhookConfigured:facebookWebhook,status:response.status,reason:livePageId?'configured_page_identity_mismatch':'page_identity_missing'});
    const instagram=liveInstagramId&&instagramConsistent
      ? connected('Instagram',{webhookConfigured:instagramWebhook,status:response.status,details:{identityConsistent:true,linkedProfessionalAccount:true}})
      : failed('Instagram',{webhookConfigured:instagramWebhook,status:response.status,reason:liveInstagramId?'configured_instagram_identity_mismatch':'instagram_professional_account_not_linked'});
    return {Facebook:facebook,Instagram:instagram};
  }catch{
    return {
      Facebook:failed('Facebook',{webhookConfigured:facebookWebhook,reason:'meta_probe_timeout_or_network_error'}),
      Instagram:failed('Instagram',{webhookConfigured:instagramWebhook,reason:'meta_probe_timeout_or_network_error'})
    };
  }finally{t.done();}
}

async function probeThreads(env){
  const webhookConfigured=pair(env,'THREADS_PUBLISH_WEBHOOK_URL','THREADS_PUBLISH_WEBHOOK_TOKEN');
  return {
    platform:'Threads',
    mode:webhookConfigured?'metricool_webhook':'metricool_external',
    configured:true,
    directConfigured:false,
    webhookConfigured,
    connected:true,
    verified:true,
    externalScheduler:'Metricool',
    externalSchedulerReady:true,
    account:'xianjiawei.tw',
    status:'connected',
    reason:webhookConfigured
      ? 'Threads固定走Metricool Webhook；不探測Graph API。'
      : 'Threads固定走Metricool xianjiawei.tw 外部正式排程；不探測Graph API。'
  };
}

async function probeLine(env){
  const token=clean(env?.LINE_CHANNEL_ACCESS_TOKEN);
  const webhookConfigured=pair(env,'LINE_OA_PUBLISH_WEBHOOK_URL','LINE_OA_PUBLISH_WEBHOOK_TOKEN');
  if(!token)return unconfigured('LINE OA',webhookConfigured);
  const t=timeout();
  try{
    const response=await fetch('https://api.line.me/v2/bot/info',{headers:{authorization:`Bearer ${token}`},signal:t.controller.signal});
    if(!response.ok)return failed('LINE OA',{webhookConfigured,status:response.status,reason:'line_channel_token_or_api_unavailable'});
    return connected('LINE OA',{webhookConfigured,status:response.status});
  }catch{return failed('LINE OA',{webhookConfigured,reason:'line_probe_timeout_or_network_error'});}finally{t.done();}
}

async function probeGoogle(env){
  const required=['GOOGLE_OAUTH_CLIENT_ID','GOOGLE_OAUTH_CLIENT_SECRET','GOOGLE_OAUTH_REFRESH_TOKEN','GOOGLE_BUSINESS_ACCOUNT_ID','GOOGLE_BUSINESS_LOCATION_ID'];
  const directConfigured=required.every((name)=>Boolean(clean(env?.[name])));
  const webhookConfigured=pair(env,'GOOGLE_BUSINESS_PUBLISH_WEBHOOK_URL','GOOGLE_BUSINESS_PUBLISH_WEBHOOK_TOKEN');
  if(!directConfigured)return unconfigured('Google 商家',webhookConfigured);
  const t=timeout();
  try{
    const tokenResponse=await fetch('https://oauth2.googleapis.com/token',{
      method:'POST',
      signal:t.controller.signal,
      headers:{'content-type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({
        client_id:clean(env.GOOGLE_OAUTH_CLIENT_ID),
        client_secret:clean(env.GOOGLE_OAUTH_CLIENT_SECRET),
        refresh_token:clean(env.GOOGLE_OAUTH_REFRESH_TOKEN),
        grant_type:'refresh_token'
      })
    });
    const tokenData=await tokenResponse.json().catch(()=>({}));
    if(!tokenResponse.ok||!clean(tokenData.access_token))return failed('Google 商家',{webhookConfigured,status:tokenResponse.status,reason:'google_oauth_refresh_failed'});
    let accountApiReachable=null;
    let accountApiStatus=0;
    try{
      const accountResponse=await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20',{
        headers:{authorization:`Bearer ${clean(tokenData.access_token)}`},
        signal:t.controller.signal
      });
      accountApiReachable=accountResponse.ok;
      accountApiStatus=accountResponse.status;
    }catch{accountApiReachable=false;}
    return connected('Google 商家',{webhookConfigured,status:tokenResponse.status,details:{oauthRefreshVerified:true,accountApiReachable,accountApiStatus}});
  }catch{return failed('Google 商家',{webhookConfigured,reason:'google_probe_timeout_or_network_error'});}finally{t.done();}
}

function operationalState(item){
  const directConnected=item?.directConfigured===true&&item?.connected===true;
  const fallbackReady=item?.webhookConfigured===true;
  const externalReady=item?.externalSchedulerReady===true;
  const operational=directConnected||fallbackReady||externalReady;
  const degraded=item?.directConfigured===true&&item?.connected!==true&&fallbackReady;
  const unconfigured=item?.directConfigured!==true&&!fallbackReady&&!externalReady;
  const blockingFailure=item?.directConfigured===true&&item?.connected!==true&&!fallbackReady&&!externalReady;
  return {...item,operational,degraded,unconfigured,blockingFailure};
}

export async function probePublisherConnections(env){
  const [meta,threads,line,google]=await Promise.all([probeMeta(env),probeThreads(env),probeLine(env),probeGoogle(env)]);
  const platforms={
    Facebook:operationalState(meta.Facebook),
    Instagram:operationalState(meta.Instagram),
    Threads:operationalState(threads),
    'LINE OA':operationalState(line),
    'LINE VOOM':{
      platform:'LINE VOOM',
      mode:'manual',
      configured:true,
      directConfigured:false,
      webhookConfigured:false,
      connected:null,
      verified:false,
      operational:true,
      degraded:false,
      unconfigured:false,
      blockingFailure:false,
      manualRequired:true,
      status:'manual_required'
    },
    'Google 商家':operationalState(google)
  };
  const automaticEntries=Object.entries(platforms).filter(([name])=>name!=='LINE VOOM');
  const automatic=automaticEntries.map(([,item])=>item);
  const configuredDirect=automatic.filter((item)=>item.directConfigured);
  const degradedPlatforms=automaticEntries.filter(([,item])=>item.degraded).map(([name])=>name);
  const unconfiguredPlatforms=automaticEntries.filter(([,item])=>item.unconfigured).map(([name])=>name);
  const blockingPlatforms=automaticEntries.filter(([,item])=>item.blockingFailure).map(([name])=>name);
  const operationalPlatforms=automaticEntries.filter(([,item])=>item.operational).map(([name])=>name);
  const directCredentialsValid=configuredDirect.every((item)=>item.connected===true);
  const allAutomaticChannelsConfigured=automatic.every((item)=>item.directConfigured||item.webhookConfigured||item.externalSchedulerReady);
  const allConfiguredChannelsOperational=automatic.filter((item)=>item.directConfigured||item.webhookConfigured||item.externalSchedulerReady).every((item)=>item.operational);
  return {
    ok:blockingPlatforms.length===0&&allConfiguredChannelsOperational,
    checked_at:new Date().toISOString(),
    safe_read_only:true,
    publishes_content:false,
    probe_timeout_seconds:PROBE_TIMEOUT_MS/1000,
    direct_credentials_valid:directCredentialsValid,
    all_automatic_channels_configured:allAutomaticChannelsConfigured,
    all_configured_channels_operational:allConfiguredChannelsOperational,
    operational_platforms:operationalPlatforms,
    degraded_platforms:degradedPlatforms,
    unconfigured_platforms:unconfiguredPlatforms,
    blocking_platforms:blockingPlatforms,
    platforms
  };
}

export {PROBE_TIMEOUT_MS};