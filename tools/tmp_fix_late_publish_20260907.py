from pathlib import Path
p=Path("src/social-publisher.js")
s=p.read_text("utf-8")
old="const RETRY_DELAYS_MINUTES=[5,15,30,60,180,360,720,1440];\nconst sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));"
new="const RETRY_DELAYS_MINUTES=[5,15,30,60,180,360,720,1440];\nconst MAX_SCHEDULE_LATENESS_MINUTES=15;\nconst sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));"
if old not in s:
    raise SystemExit("missing constant anchor")
s=s.replace(old,new,1)
anchor="async function publishOne(env,post,now){"
helper="""function scheduleLatenessMinutes(post,now){
  const scheduled=Date.parse(clean(post?.scheduled_at));
  if(!Number.isFinite(scheduled))return 0;
  return Math.max(0,(now.getTime()-scheduled)/60000);
}
async function expireLateScheduledPost(env,post,now){
  const platforms=parsePlatforms(post.platforms_json);
  const rows=await env.DB.prepare('SELECT platform,status,remote_id,published_at FROM social_publish_deliveries WHERE post_id=?').bind(post.id).all();
  const byPlatform=new Map((rows.results||[]).map((row)=>[row.platform,row]));
  const publishedPlatforms=platforms.filter((platform)=>byPlatform.get(platform)?.status==='published');
  const unresolvedPlatforms=platforms.filter((platform)=>!publishedPlatforms.includes(platform));
  const nowIso=now.toISOString();
  const lateness=Math.round(scheduleLatenessMinutes(post,now)*10)/10;
  const reason=`\\u5df2\\u8d85\\u904e\\u6b63\\u5f0f\\u6392\\u7a0b ${MAX_SCHEDULE_LATENESS_MINUTES} \\u5206\\u9418\\u81ea\\u52d5\\u767c\\u5e03\\u7a97\\u53e3\\uff08\\u76ee\\u524d\\u5ef6\\u9072\\u7d04 ${lateness} \\u5206\\u9418\\uff09\\uff1b\\u70ba\\u907f\\u514d\\u975e\\u9810\\u671f\\u665a\\u767c\\uff0c\\u7cfb\\u7d71\\u5df2\\u505c\\u6b62\\u81ea\\u52d5\\u88dc\\u767c\\u3002`;
  if(publishedPlatforms.length){
    for(const platform of unresolvedPlatforms){
      await env.DB.prepare(`INSERT INTO social_publish_deliveries(post_id,platform,status,attempt_count,last_attempt_at,published_at,remote_id,response_json,error_text,created_at,updated_at) VALUES(?,?,'manual_required',0,NULL,NULL,'','',?,?,?) ON CONFLICT(post_id,platform) DO UPDATE SET status='manual_required',response_json='',error_text=excluded.error_text,updated_at=excluded.updated_at`).bind(post.id,platform,reason,nowIso,nowIso).run();
    }
    await env.DB.prepare("UPDATE social_posts SET status='manual_required',scheduled_at=NULL,published_at=NULL,updated_at=? WHERE id=?").bind(nowIso,post.id).run();
    return{id:post.id,ok:false,manual_required:true,expired:true,reason:'schedule_late_cutoff',lateness_minutes:lateness,published_platforms:publishedPlatforms,manual_required_platforms:unresolvedPlatforms};
  }
  await env.DB.prepare("UPDATE social_posts SET status='pending_review',scheduled_at=NULL,approved_by=NULL,approved_at=NULL,image_approved=0,updated_at=? WHERE id=?").bind(nowIso,post.id).run();
  try{await env.DB.prepare('DELETE FROM social_post_review_gates WHERE post_id=?').bind(post.id).run();}catch{}
  return{id:post.id,ok:false,expired:true,reason:'schedule_late_cutoff',lateness_minutes:lateness,returned_to:'pending_review',message:reason};
}
"""
if anchor not in s:
    raise SystemExit("missing publishOne anchor")
s=s.replace(anchor,helper+anchor,1)
old_cfg="return{cronEnabled:true,approvalGate:true,onlyScheduledDuePosts:true,idempotencyProtection:true,perPlatformDeliveryTracking:true,retryBackoffEnabled:true,maximumRetryAttempts:MAX_RETRY_ATTEMPTS,requestTimeoutSeconds:REQUEST_TIMEOUT_MS/1000,officialApiPreferred:true,webhookFallbackEnabled:true,shortVideoReelsSupported:true,lineVoomManualOnly:true,partialDeliveryStatus:'manual_required',platforms,fullyConfigured:Object.entries(platforms).filter(([name])=>name!=='LINE VOOM').every(([,item])=>item.ready)};"
new_cfg="return{cronEnabled:true,approvalGate:true,onlyScheduledDuePosts:true,idempotencyProtection:true,perPlatformDeliveryTracking:true,retryBackoffEnabled:true,maximumRetryAttempts:MAX_RETRY_ATTEMPTS,maximumScheduleLatenessMinutes:MAX_SCHEDULE_LATENESS_MINUTES,lateScheduleGuardEnabled:true,requestTimeoutSeconds:REQUEST_TIMEOUT_MS/1000,officialApiPreferred:true,webhookFallbackEnabled:true,shortVideoReelsSupported:true,lineVoomManualOnly:true,partialDeliveryStatus:'manual_required',platforms,fullyConfigured:Object.entries(platforms).filter(([name])=>name!=='LINE VOOM').every(([,item])=>item.ready)};"
if old_cfg not in s:
    raise SystemExit("missing config anchor")
s=s.replace(old_cfg,new_cfg,1)
old_due="""export async function publishDuePosts(env,now=new Date()){
  const rows=await env.DB.prepare("SELECT * FROM social_posts WHERE status='scheduled' AND scheduled_at IS NOT NULL AND datetime(scheduled_at)<=datetime(?) ORDER BY datetime(scheduled_at) ASC LIMIT 20").bind(now.toISOString()).all();
  const results=[];
  for(const post of rows.results||[]) results.push(await publishOne(env,post,now));
  return{checked_at:now.toISOString(),due_count:(rows.results||[]).length,results};
}"""
new_due="""export async function publishDuePosts(env,now=new Date()){
  const rows=await env.DB.prepare("SELECT * FROM social_posts WHERE status='scheduled' AND scheduled_at IS NOT NULL AND datetime(scheduled_at)<=datetime(?) ORDER BY datetime(scheduled_at) ASC LIMIT 20").bind(now.toISOString()).all();
  const results=[];
  for(const post of rows.results||[]){
    if(scheduleLatenessMinutes(post,now)>MAX_SCHEDULE_LATENESS_MINUTES)results.push(await expireLateScheduledPost(env,post,now));
    else results.push(await publishOne(env,post,now));
  }
  return{checked_at:now.toISOString(),due_count:(rows.results||[]).length,maximum_schedule_lateness_minutes:MAX_SCHEDULE_LATENESS_MINUTES,results};
}"""
if old_due not in s:
    raise SystemExit("missing due anchor")
s=s.replace(old_due,new_due,1)
p.write_text(s,"utf-8")
