// One-time public brand history retrieval; no post approval, publishing, or account secrets exposed.
const RUN='XJW-META-HISTORY-20261105-V1';
function safeUrl(value){try{const u=new URL(String(value||''));if(u.protocol!=='https:')return '';for(const k of [...u.searchParams.keys()])if(/access.?token|secret|auth|api.?key/i.test(k))u.searchParams.delete(k);return u.toString().slice(0,1500)}catch{return''}}
function media(x){const u=x?.media_url||x?.media?.image?.src||x?.thumbnail_url||x?.full_picture;return {id:String(x?.id||'').slice(0,80),url:safeUrl(u),type:String(x?.media_type||'').slice(0,30)}}
function fbPost(x){const arr=x?.attachments?.data||[];return{id:String(x.id).slice(0,80),date:String(x.created_time||'').slice(0,45),text:String(x.message||'').slice(0,1800),permalink:safeUrl(x.permalink_url),images:[media({full_picture:x.full_picture}),...arr.map(media),...arr.flatMap(a=>(a.subattachments?.data||[]).map(media))].filter(m=>m.url),carouselFullyExpanded:!arr.some(a=>a.subattachments?.paging?.next)}}
function igPost(x){return{id:String(x.id).slice(0,80),date:String(x.timestamp||'').slice(0,45),text:String(x.caption||'').slice(0,1800),permalink:safeUrl(x.permalink),images:[media(x),...(x.children?.data||[]).map(media)].filter(m=>m.url),carouselFullyExpanded:!x.children?.paging?.next}}
function statusCode(status){return status===401||status===403?'permission_or_token':status===429?'rate_limit':status>=500?'platform_unavailable':'graph_field_or_account'}
async function graph(path,token,fetcher){const url='https://graph.facebook.com'+path;const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),9000);try{const r=await fetcher(url,{method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:ctrl.signal});if(!r.ok)return{ok:false,error:statusCode(r.status)};const b=await r.json();return b&&typeof b==='object'&&(Array.isArray(b.data)||b.id)?{ok:true,data:b}:{ok:false,error:'unexpected_shape'}}catch{return{ok:false,error:'network_or_timeout'}}finally{clearTimeout(timer)}}
async function commit(db,report){const row=JSON.stringify(report);const w=await db.prepare("UPDATE social_meta_history_readonly SET status=?,result_json=?,completed_at=? WHERE run_id=? AND status='running'").bind(report.summary.status,row,new Date().toISOString(),RUN).run();if(w?.success===false)return{ok:false,error:'d1_write_unconfirmed'};return{ok:true,summary:report.summary}}
export async function collectMetaHistoryOnce(env,{fetcher=fetch}={}){
  if(env?.XJW_META_HISTORY_READONLY_DATE!=='2026-11-05')return{skipped:'disabled'};
  const db=env.DB;if(!db?.prepare)return{skipped:'d1_missing'};
  await db.prepare("CREATE TABLE IF NOT EXISTS social_meta_history_readonly(run_id TEXT PRIMARY KEY,status TEXT NOT NULL,result_json TEXT NOT NULL DEFAULT '{}',created_at TEXT,completed_at TEXT)").run();
  const found=await db.prepare('SELECT status FROM social_meta_history_readonly WHERE run_id=?').bind(RUN).first();
  if(found)return{skipped:'already_attempted',status:found.status};
  const claim=await db.prepare("INSERT OR IGNORE INTO social_meta_history_readonly(run_id,status,created_at) VALUES(?,'running',?)").bind(RUN,new Date().toISOString()).run();
  if(Number(claim?.meta?.changes)!==1)return{skipped:'duplicate_claim'};
  const summary={id:RUN,status:'partial',facebook:'unavailable',instagram:'unavailable',threads:'not_configured',completeThreePlatforms:false,readOnly:true,approvedOrPublished:0};
  const report={summary,facebook:[],instagram:[]};
  try{
    const token=String(env.META_PAGE_ACCESS_TOKEN||'');
    if(!token){summary.status='unavailable';summary.facebook='token_missing';summary.instagram='token_missing';return await commit(db,report)}
    const version=/^v\d+\.\d+$/.test(env.META_GRAPH_VERSION||'')?env.META_GRAPH_VERSION:'v25.0';
    const me=await graph('/'+version+'/me?fields=id,instagram_business_account,connected_instagram_account',token,fetcher);
    if(!me.ok){summary.status='unavailable';summary.facebook=me.error;summary.instagram='account_not_verified';return await commit(db,report)}
    const page=String(me.data.id||'');
    const ig=String(me.data.instagram_business_account?.id||me.data.connected_instagram_account?.id||env.META_INSTAGRAM_USER_ID||'');
    if(!/^\d+$/.test(page)){summary.status='unavailable';summary.facebook='invalid_page_id';return await commit(db,report)}
    const fbFields='id,message,created_time,permalink_url,full_picture,attachments{media,subattachments{media}}';
    const f=await graph('/'+version+'/'+page+'/posts?fields='+encodeURIComponent(fbFields)+'&limit=100',token,fetcher);
    if(f.ok){report.facebook=f.data.data.map(fbPost);summary.facebook='read';summary.facebookCount=report.facebook.length;summary.facebookHasMore=!!f.data.paging?.next}
    else summary.facebook=f.error;
    if(/^\d+$/.test(ig)){
      const fields='id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{media_type,media_url,thumbnail_url}';
      const g=await graph('/'+version+'/'+ig+'/media?fields='+encodeURIComponent(fields)+'&limit=100',token,fetcher);
      if(g.ok){report.instagram=g.data.data.map(igPost);summary.instagram='read';summary.instagramCount=report.instagram.length;summary.instagramHasMore=!!g.data.paging?.next}
      else summary.instagram=g.error;
    }else summary.instagram='linked_account_missing';
    summary.carouselIncomplete=!![...report.facebook,...report.instagram].find(p=>!p.carouselFullyExpanded);
    summary.status=summary.facebook==='read'||summary.instagram==='read'?'partial_threads_unverified':'unavailable';
    return await commit(db,report);
  }catch{return await commit(db,{summary:{...summary,status:'unavailable',reason:'unexpected_readonly_failure'},facebook:[],instagram:[]})}
}
export {RUN,fbPost,igPost,safeUrl};