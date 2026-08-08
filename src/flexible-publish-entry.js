import app from './authority-entry.js';
import { publishPostById, publisherConfiguration } from './social-publisher.js';

const HEADERS={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store',
  'x-content-type-options':'nosniff',
  'x-xianjiawei-flex-publish':'2026-08-08-v1'
};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});
const clean=(value)=>String(value??'').trim();

async function authorize(request,env,ctx){
  const url=new URL('/api/me',request.url);
  return app.fetch(new Request(url,{method:'GET',headers:request.headers}),env,ctx);
}
function parsePlatforms(value){
  try{const parsed=JSON.parse(value||'[]');return Array.isArray(parsed)?parsed.map(clean).filter(Boolean):[];}catch{return[];}
}
async function getPostRow(env,id){
  if(!env?.DB)return null;
  return env.DB.prepare('SELECT * FROM social_posts WHERE id=? LIMIT 1').bind(id).first();
}
async function markManualDelivery(env,id,platform,reason){
  const now=new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO social_publish_deliveries(post_id,platform,status,attempt_count,last_attempt_at,published_at,remote_id,response_json,error_text,created_at,updated_at)
    VALUES(?,?,'manual_required',0,NULL,NULL,'','',?,?,?)
    ON CONFLICT(post_id,platform) DO UPDATE SET
      status='manual_required',
      error_text=excluded.error_text,
      updated_at=excluded.updated_at
  `).bind(id,platform,reason,now,now).run();
}
async function audit(env,request,profile,id,before,after){
  try{
    await env.DB.prepare('INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) VALUES(?,?,?,?,?,?,?,?)')
      .bind(`AUD-${crypto.randomUUID()}`,profile?.email||'', '彈性立即發布','貼文',id,JSON.stringify(before||{}),JSON.stringify(after||{}),request.headers.get('cf-connecting-ip')||'').run();
  }catch(error){console.warn('flex publish audit failed',clean(error?.message||error));}
}
function platformReady(configuration,platform){
  return configuration?.platforms?.[platform]?.ready===true;
}
async function flexiblePublishNow(request,env,ctx,id){
  const authorization=await authorize(request,env,ctx);
  if(!authorization.ok)return authorization;
  const profile=await authorization.json();
  if(!['owner','admin','content'].includes(profile?.role))return json({error:'沒有發布貼文權限'},403);

  const before=await getPostRow(env,id);
  if(!before)return json({error:'找不到貼文'},404);
  if(!['approved','scheduled'].includes(before.status))return json({error:'貼文必須先審核通過，才能立即發布'},409);
  if(!before.image_url||Number(before.image_approved||0)!==1)return json({error:'貼文圖片尚未完成審核，不能立即發布'},409);

  const originalPlatforms=parsePlatforms(before.platforms_json);
  if(!originalPlatforms.length)return json({error:'尚未指定發布平台'},409);
  const configuration=publisherConfiguration(env);
  const automaticPlatforms=originalPlatforms.filter((platform)=>platformReady(configuration,platform));
  const manualPlatforms=originalPlatforms.filter((platform)=>!automaticPlatforms.includes(platform));
  const reason='此平台尚未完成官方自動發布授權，或目前採人工發布流程；請使用ERP手動發布包，完成後補登已發布。';

  for(const platform of manualPlatforms)await markManualDelivery(env,id,platform,reason);

  if(!automaticPlatforms.length){
    const after=await getPostRow(env,id);
    await audit(env,request,profile,id,before,{post:after,manual_platforms:manualPlatforms});
    return json({
      ok:true,
      partially_published:false,
      automatic_published:false,
      manual_required:true,
      id,
      status:after?.status||before.status,
      manual_platforms:manualPlatforms,
      message:`目前沒有可自動發布的平台；已轉為人工發布：${manualPlatforms.join('、')}。請使用「手動發布包」，完成後補登已發布。`,
      publisher:configuration
    });
  }

  const now=new Date().toISOString();
  await env.DB.prepare("UPDATE social_posts SET platforms_json=?,status='scheduled',scheduled_at=?,updated_at=? WHERE id=?")
    .bind(JSON.stringify(automaticPlatforms),now,now,id).run();

  let result;
  try{
    result=await publishPostById(env,id,new Date());
  }finally{
    await env.DB.prepare('UPDATE social_posts SET platforms_json=?,updated_at=? WHERE id=?')
      .bind(JSON.stringify(originalPlatforms),new Date().toISOString(),id).run();
  }

  const after=await getPostRow(env,id);
  await audit(env,request,profile,id,before,{post:after,result,automatic_platforms:automaticPlatforms,manual_platforms:manualPlatforms});

  if(!result?.ok){
    return json({
      error:'可自動發布的平台未全部完成；系統不會盲目重複補發。請先查看發布結果，再人工處理失敗平台。',
      id,
      automatic_platforms:automaticPlatforms,
      manual_platforms:manualPlatforms,
      manual_required:manualPlatforms.length>0,
      result
    },502);
  }

  return json({
    ok:true,
    partially_published:manualPlatforms.length>0,
    automatic_published:true,
    manual_required:manualPlatforms.length>0,
    id,
    status:after?.status||'published',
    automatic_platforms:automaticPlatforms,
    manual_platforms:manualPlatforms,
    message:manualPlatforms.length
      ? `已完成可自動發布平台：${automaticPlatforms.join('、')}；仍需人工發布：${manualPlatforms.join('、')}。`
      : `立即發布完成：${automaticPlatforms.join('、')}。`,
    result
  });
}

export default{
  async fetch(request,env,ctx){
    const path=new URL(request.url).pathname;
    const match=path.match(/^\/api\/posts\/([^/]+)\/publish-now$/);
    if(request.method==='POST'&&match){
      try{return await flexiblePublishNow(request,env,ctx,decodeURIComponent(match[1]));}
      catch(error){return json({error:clean(error?.message||error)||'立即發布失敗'},500);}
    }
    return app.fetch(request,env,ctx);
  },
  async scheduled(controller,env,ctx){
    if(typeof app.scheduled==='function')return app.scheduled(controller,env,ctx);
  }
};

export { flexiblePublishNow, platformReady };
