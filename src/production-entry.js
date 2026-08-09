import app,{gateState} from './publishing-review-gate-entry.js';

const VERSION='2026-08-09-production-entry-v1';

async function quarantineUngatedDuePosts(env,scheduledTime){
  if(!env?.DB)return{checked:0,quarantined:0};
  const at=new Date(scheduledTime||Date.now()).toISOString();
  const result=await env.DB.prepare("SELECT * FROM social_posts WHERE status='scheduled' AND scheduled_at IS NOT NULL AND datetime(scheduled_at)<=datetime(?)").bind(at).all();
  let quarantined=0;
  for(const row of result.results||[]){
    let gate={ok:false,reason:'正式圖文審核不存在'};
    try{gate=await gateState(env,row)}catch(error){gate={ok:false,reason:String(error?.message||error)}}
    if(gate.ok)continue;
    await env.DB.prepare("UPDATE social_posts SET status='draft',scheduled_at=NULL,approved_by=NULL,approved_at=NULL,image_approved=0,updated_at=? WHERE id=?").bind(new Date().toISOString(),row.id).run();
    quarantined+=1;
    try{await env.DB.prepare('INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) VALUES(?,?,?,?,?,?,?,?)').bind(`AUD-${crypto.randomUUID()}`,'system','排程發布前圖文守門退回草稿','貼文',row.id,JSON.stringify({status:'scheduled',scheduled_at:row.scheduled_at}),JSON.stringify({status:'draft',reason:gate.reason}),'').run()}catch{}
  }
  return{checked:(result.results||[]).length,quarantined};
}

export default{
  async fetch(request,env,ctx){return app.fetch(request,env,ctx)},
  async scheduled(controller,env,ctx){
    ctx.waitUntil((async()=>{
      const guarded=await quarantineUngatedDuePosts(env,controller?.scheduledTime||Date.now());
      if(guarded.quarantined)console.warn('仙加味排程圖文守門已退回草稿',JSON.stringify(guarded));
      if(typeof app.scheduled==='function')await app.scheduled(controller,env,ctx);
    })());
  }
};

export { VERSION, quarantineUngatedDuePosts };
