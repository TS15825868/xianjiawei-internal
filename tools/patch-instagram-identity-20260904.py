from pathlib import Path

p = Path('src/social-publisher.js')
t = p.read_text(encoding='utf-8')

old = """    const fields='id,name,instagram_business_account';
    const response=await fetch(`https://graph.facebook.com/${graphVersion(env)}/me?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`,{signal:timeout.controller.signal});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)return{pageId:configuredPageId,instagramUserId:configuredInstagramUserId,error:data?.error?.message||'Meta 身分解析失敗'};
    return{pageId:configuredPageId||clean(data.id),instagramUserId:configuredInstagramUserId||clean(data.instagram_business_account?.id),name:clean(data.name)};"""

new = """    const fields='id,name,instagram_business_account,connected_instagram_account';
    const response=await fetch(`https://graph.facebook.com/${graphVersion(env)}/me?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`,{signal:timeout.controller.signal});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)return{pageId:configuredPageId,instagramUserId:configuredInstagramUserId,error:data?.error?.message||'Meta 身分解析失敗'};
    const pageId=configuredPageId||clean(data.id);
    let instagramUserId=configuredInstagramUserId||clean(data.instagram_business_account?.id)||clean(data.connected_instagram_account?.id);
    if(pageId&&!instagramUserId){
      const pageFields='instagram_business_account,connected_instagram_account';
      const pageResponse=await fetch(`https://graph.facebook.com/${graphVersion(env)}/${encodeURIComponent(pageId)}?fields=${encodeURIComponent(pageFields)}&access_token=${encodeURIComponent(token)}`,{signal:timeout.controller.signal});
      const pageData=await pageResponse.json().catch(()=>({}));
      if(pageResponse.ok)instagramUserId=clean(pageData.instagram_business_account?.id)||clean(pageData.connected_instagram_account?.id);
    }
    return{pageId,instagramUserId,name:clean(data.name)};"""

if old not in t:
    raise SystemExit('instagram identity pattern not found')

t = t.replace(old, new, 1)
p.write_text(t, encoding='utf-8')
print('patched src/social-publisher.js')
