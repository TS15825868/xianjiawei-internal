from pathlib import Path

p = Path('src/social-publisher.js')
t = p.read_text(encoding='utf-8')
old = """async function dispatchPlatform(env,post,platform){
  const config=PLATFORM_CONFIG[platform];
  if(!config) return{platform,ok:false,retryable:false,error:'不支援的發布平台'};
  if(config.manual) return{platform,ok:false,retryable:false,manual_required:true,error:config.manualReason};
  if(config.direct&&directReadiness(env,config.direct)){
    if(config.direct==='facebook') return dispatchFacebook(env,post);
    if(config.direct==='instagram') return dispatchInstagram(env,post);
    if(config.direct==='line_oa') return dispatchLineOfficialAccount(env,post,platform);
    if(config.direct==='google_business') return dispatchGoogleBusiness(env,post);
  }
  if(webhookReady(env,config)) return dispatchWebhook(env,post,platform,config);
  return{platform,ok:false,retryable:false,manual_required:true,error:`尚未設定 ${platform} 官方 API 或 Webhook；已改走人工發布包，不阻擋其他已授權平台。`};
}"""
new = """async function dispatchPlatform(env,post,platform){
  const config=PLATFORM_CONFIG[platform];
  if(!config) return{platform,ok:false,retryable:false,error:'不支援的發布平台'};
  if(config.manual) return{platform,ok:false,retryable:false,manual_required:true,error:config.manualReason};
  if(config.direct&&directReadiness(env,config.direct)){
    let directResult=null;
    if(config.direct==='facebook') directResult=await dispatchFacebook(env,post);
    else if(config.direct==='instagram') directResult=await dispatchInstagram(env,post);
    else if(config.direct==='line_oa') directResult=await dispatchLineOfficialAccount(env,post,platform);
    else if(config.direct==='google_business') directResult=await dispatchGoogleBusiness(env,post);
    if(directResult?.ok) return directResult;
    const identityFallbackAllowed=platform==='Instagram'&&/解析 Instagram|Instagram (?:Business Account|專業帳號).*ID|缺少 META_INSTAGRAM_USER_ID/i.test(clean(directResult?.error));
    if(identityFallbackAllowed&&webhookReady(env,config)){
      const webhookResult=await dispatchWebhook(env,post,platform,config);
      return webhookResult.ok
        ? {...webhookResult,fallback_from:'official_api_identity',direct_error:clean(directResult?.error)}
        : {...webhookResult,direct_error:clean(directResult?.error)};
    }
    if(directResult) return directResult;
  }
  if(webhookReady(env,config)) return dispatchWebhook(env,post,platform,config);
  return{platform,ok:false,retryable:false,manual_required:true,error:`尚未設定 ${platform} 官方 API 或 Webhook；已改走人工發布包，不阻擋其他已授權平台。`};
}"""
if old not in t:
    raise SystemExit('dispatchPlatform target not found')
t = t.replace(old, new, 1)
p.write_text(t, encoding='utf-8')
print('patched Instagram identity failure webhook fallback')
