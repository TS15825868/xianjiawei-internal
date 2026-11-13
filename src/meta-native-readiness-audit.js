// One-shot, read-only official Meta capability and missing-media probe.
// Does not publish, change approvals, or expose tokens. The connected
// Metricool account IDs are the expected destination, not token assumptions.
import {safeUrl,fbPost,igPost} from './meta-history-readonly.js';
export const NATIVE_AUDIT_ID='XJW-META-NATIVE-READINESS-20261113-V1';
const expectedPage='411869648852531',expectedIg='xianjiawei.tw';
const numeric=x=>/^\d{5,25}$/.test(String(x||''));
const normalize=x=>String(x||'').trim().toLowerCase();
export async function probeNativeBrandRoute(env,{fetcher=fetch}={}){
 const token=String(env?.META_PAGE_ACCESS_TOKEN||'').trim();
 const version=/^v\d+\.\d+$/.test(env?.META_GRAPH_VERSION||'')?env.META_GRAPH_VERSION:'v25.0';
 const result={readOnly:true,publications:0,facebook:{expectedId:expectedPage},instagram:{expectedUsername:expectedIg},threads:{route:'Metricool',nativeAvailable:false},missingMedia:[],actualPublishVerified:false};
 if(!token)return {...result,reason:'page_token_missing'};
 const read=async(path)=>{
  try{
   const r=await fetcher('https://graph.facebook.com/'+version+'/'+path,{method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(8000)});
   const b=await r.json().catch(()=>({}));return r.ok&&!b.error?{ok:true,data:b}:{ok:false,status:r.status,errorCode:Number(b.error?.code||0)};
  }catch{return{ok:false,status:0,errorCode:0}}
 };
 const summary=r=>({ok:r.ok,status:r.status||0,errorCode:r.errorCode||0});
 const fields='id,name,instagram_business_account,connected_instagram_account';
 const me=await read('me?fields='+encodeURIComponent(fields));
 const page=String(me.data?.id||'');
 result.facebook={...result.facebook,identity:summary(me),identityMatches:page===expectedPage,configuredIdentityMatches:!env.META_PAGE_ID||String(env.META_PAGE_ID)===expectedPage,observedPageId:numeric(page)?page:null};
 if(!me.ok||page!==expectedPage||!result.facebook.configuredIdentityMatches)return {...result,reason:'facebook_identity_not_verified'};
 const [permissions,tasks,linked,missing]=await Promise.all([
  read('me/permissions'),read('me?fields=tasks'),read(expectedPage+'?fields='+encodeURIComponent(fields)),
  read(expectedPage+'_1446376627512555?fields='+encodeURIComponent('id,message,created_time,permalink_url,full_picture,attachments{media,subattachments{media}}'))
 ]);
 const granted=new Set((Array.isArray(permissions.data?.data)?permissions.data.data:[]).filter(x=>x.status==='granted').map(x=>x.permission));
 const taskSet=new Set(Array.isArray(tasks.data?.tasks)?tasks.data.tasks:[]);
 result.facebook={...result.facebook,permissions:summary(permissions),managePostsGranted:granted.has('pages_manage_posts'),tasks:summary(tasks),createContentTask:taskSet.has('CREATE_CONTENT')||taskSet.has('MANAGE'),authorizationEvidence:granted.has('pages_manage_posts')&&(taskSet.has('CREATE_CONTENT')||taskSet.has('MANAGE')),actualPublishVerified:false};
 if(missing.ok){const m=fbPost(missing.data);result.missingMedia.push({platform:'facebook',postId:m.id,permalink:m.permalink,images:m.images.map(x=>({...x,url:safeUrl(x.url)})).filter(x=>x.url),carouselFullyExpanded:m.carouselFullyExpanded});}
 else result.missingMedia.push({platform:'facebook',postId:expectedPage+'_1446376627512555',...summary(missing),images:[]});
 const linkedIds=[me.data?.instagram_business_account?.id,me.data?.connected_instagram_account?.id,linked.data?.instagram_business_account?.id,linked.data?.connected_instagram_account?.id].filter(numeric).map(String);
 const configured=numeric(env.META_INSTAGRAM_USER_ID)?String(env.META_INSTAGRAM_USER_ID):'';
 const distinct=[...new Set(linkedIds)];
 // A configured ID alone is not identity proof. Verify public username first.
 const candidate=distinct.length===1?distinct[0]:distinct.length===0?configured:'';
 result.instagram={...result.instagram,linkLookup:summary(linked),linkedIdPresent:distinct.length===1,configuredIdPresent:!!configured,identityConflict:distinct.length>1||!!(configured&&candidate&&configured!==candidate),contentPublishGranted:granted.has('instagram_content_publish')};
 if(!candidate||result.instagram.identityConflict)return {...result,reason:'instagram_link_missing_or_conflict'};
 const ig=await read(candidate+'?fields=id,username');
 result.instagram={...result.instagram,identity:summary(ig),identityMatches:ig.ok&&String(ig.data?.id)===candidate&&normalize(ig.data?.username)===expectedIg};
 if(!result.instagram.identityMatches)return {...result,reason:'instagram_identity_not_verified'};
 const [quota,history]=await Promise.all([
   read(candidate+'/content_publishing_limit?fields=config,quota_usage'),
   read(candidate+'/media?fields='+encodeURIComponent('id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{media_type,media_url,thumbnail_url}')+'&limit=100')
 ]);
 result.instagram={...result.instagram,publishingLimit:summary(quota),quotaUsage:Number.isFinite(quota.data?.data?.[0]?.quota_usage)?quota.data.data[0].quota_usage:null,authorizationEvidence:granted.has('instagram_content_publish')&&quota.ok,history:summary(history),historyHasMore:!!history.data?.paging?.next,actualPublishVerified:false};
 const wanted=new Set(['Dbr1T8YIJuk','Da-UX35lX6b']);
 for(const x of history.data?.data||[]){const m=igPost(x);if([...wanted].some(code=>m.permalink.includes('/'+code+'/')))result.missingMedia.push({platform:'instagram',postId:m.id,permalink:m.permalink,images:m.images,carouselFullyExpanded:m.carouselFullyExpanded});}
 return result;
}
export async function collectNativeBrandRouteOnce(env,{fetcher=fetch}={}){
 if(env?.XJW_META_NATIVE_AUDIT_DATE!=='2026-11-13')return{skipped:'disabled'};
 const db=env.DB;if(!db?.prepare)return{skipped:'db_missing'};
 await db.prepare("CREATE TABLE IF NOT EXISTS social_meta_history_readonly(run_id TEXT PRIMARY KEY,status TEXT NOT NULL,result_json TEXT NOT NULL DEFAULT '{}',created_at TEXT,completed_at TEXT)").run();
 const prior=await db.prepare('SELECT status FROM social_meta_history_readonly WHERE run_id=?').bind(NATIVE_AUDIT_ID).first();
 if(prior)return{skipped:'already_attempted',status:prior.status};
 const claim=await db.prepare("INSERT OR IGNORE INTO social_meta_history_readonly(run_id,status,created_at) VALUES(?,'running',?)").bind(NATIVE_AUDIT_ID,new Date().toISOString()).run();
 if(Number(claim?.meta?.changes)!==1)return{skipped:'duplicate_claim'};
 const report=await probeNativeBrandRoute(env,{fetcher});
 const w=await db.prepare("UPDATE social_meta_history_readonly SET status='completed',result_json=?,completed_at=? WHERE run_id=? AND status='running'").bind(JSON.stringify(report),new Date().toISOString(),NATIVE_AUDIT_ID).run();
 if(Number(w?.meta?.changes)!==1)throw Error('native route receipt not saved');
 return{ok:true};
}
