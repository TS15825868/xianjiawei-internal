import fs from 'node:fs';import crypto from 'node:crypto';
const req=JSON.parse(fs.readFileSync('ops/request-trial-first-linked-draft-archive-20261107.json','utf8'));
const id='XJW-CONV-chat-trial-first',historyId='3957491164539558820_78424002938',remoteId=413607595,uuid='5662205195050239362';
if(req.scope!=='archive-repeated-trial-angle-with-safe-remote-draft-hold'||req.target!==id||req.remoteId!==remoteId||req.uuid!==uuid||req.archiveAuthorized!==true||req.publishAuthorized!==false||req.deleteRemoteAuthorized!==false)throw Error('Unsafe request');
const copySha='fdf45d7dc56c9019da9fad6413e3a7e28c3a57f02a45f7a1ea0a8fb0f13c0708',imageSha='47fad428d814e3c20cdce1e4c617793c1977b30038ccaef88d4ff729f4464954',title='想先了解，再決定也可以';
const h=JSON.parse(fs.readFileSync('ops/metricool-instagram-threads-published-history-20261105.json','utf8')).records.instagram.find(x=>x.postId===historyId);
if(!h||!h.permalink?.startsWith('https://www.instagram.com/p/')||!h.content.includes('先試喝，再決定')||!h.content.includes('初次認識'))throw Error('Published trial editorial provenance missing');
const acct=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN,db=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];if(!acct||!token||!db)throw Error('D1 credentials absent');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const quote=x=>x===null||x===undefined?'NULL':typeof x==='number'?String(x):"'"+String(x).replaceAll("'","''")+"'";
function sql(s,...v){let i=0;const ret=s.replace(/\?/g,()=>quote(v[i++]));if(i!==v.length)throw Error('SQL binding mismatch');return ret}
async function exec(s){const url='https://api.cloudflare.com/client/v4/accounts/'+acct+'/d1/database/'+db+'/query';const r=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql:s}),signal:AbortSignal.timeout(45000)});const v=await r.json();if(!r.ok||!v.success||!Array.isArray(v.result)||v.result.some(x=>x.success===false))throw Error('D1 API failure '+JSON.stringify(v.errors||[]).slice(0,200));return v.result}
async function one(s,...a){return(await exec(sql(s,...a)))[0]?.results?.[0]||null}
const report={scope:req.scope,postId:id,metricoolId:remoteId,remoteIsDraft:true,remoteAutoPublish:false,deletedRemote:false,archived:false,readback:false,published:false,approved:false};
try{
 const [post,link]=await Promise.all([one('SELECT * FROM social_posts WHERE id=?',id),one('SELECT * FROM social_metricool_sync WHERE post_id=?',id)]);
 if(!post||post.status!=='pending_review'||post.title!==title||sha(post.copy||'')!==copySha||!post.image_url.endsWith('/XJW-CONV-chat-trial-first-scene-v1.jpg')||post.approved_at||post.approved_by||post.scheduled_at||post.published_at||Number(post.image_approved||0)!==0)throw Error('Current pending row edition changed');
 if(!link||Number(link.metricool_id)!==remoteId||String(link.uuid)!==uuid||link.state!=='pending_review'||Number(link.attempts||0)!==0)throw Error('Current external link not safe');
 const remote=JSON.parse(link.template_json||'{}');
 if(remote.id!==remoteId||remote.uuid!==uuid||remote.draft!==true||remote.autoPublish!==false||remote.text!==post.copy||remote.providers?.length!==3||remote.providers.some(x=>x.status!=='PENDING'))throw Error('Saved remote draft is not proven stopped/current');
 const ai=await one('SELECT id,decision,image_sha256,image_url FROM social_post_quality_reviews WHERE post_id=? ORDER BY reviewed_at DESC LIMIT 1',id);
 if(!ai||ai.decision!=='NEEDS_HUMAN_REVIEW'||ai.image_sha256!==imageSha||ai.image_url!==post.image_url)throw Error('Current D1 visual proof changed');
 const f=await fetch(post.image_url,{signal:AbortSignal.timeout(30000)});if(!f.ok||sha(Buffer.from(await f.arrayBuffer()))!==imageSha)throw Error('Current original image changed');
 if(await one('SELECT post_id FROM social_publish_deliveries WHERE post_id=? LIMIT 1',id))throw Error('Delivery record exists');
 const now=new Date().toISOString(),audit='AUD-'+crypto.randomUUID();
 const cancel=sql("UPDATE social_metricool_sync SET state='cancel_required',last_error=?,updated_at=? WHERE post_id=? AND metricool_id=? AND uuid=? AND state='pending_review' AND COALESCE(attempts,0)=0",'因重複已發布試喝角度而封存；Metricool遠端既有草稿仍停發，待可安全刪除後再清理',now,id,remoteId,uuid);
 const archive=sql("UPDATE social_posts SET status='archived',proposed_scheduled_at=NULL,review_note=?,updated_at=? WHERE id=? AND updated_at=? AND status='pending_review' AND image_url=? AND approved_at IS NULL AND approved_by IS NULL AND scheduled_at IS NULL AND published_at IS NULL AND NOT EXISTS(SELECT 1 FROM social_publish_deliveries WHERE post_id=social_posts.id) AND EXISTS(SELECT 1 FROM social_metricool_sync WHERE post_id=social_posts.id AND metricool_id=? AND uuid=? AND state='cancel_required')",'已封存：試喝初次認識角度已有正式Instagram貼文；Metricool既有草稿維持停發且標記cancel_required；歷史圖片與審核證據保留。',now,id,post.updated_at,post.image_url,remoteId,uuid);
 const log=sql("INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) SELECT ?,'chatgpt-work:AI','已發布試喝主題重複稿安全封存與遠端草稿停發鎖（非核准）','貼文',?,?,?,'' WHERE changes()=1",audit,id,JSON.stringify({post:'pending_review',remoteState:link.state,externalId:remoteId}),JSON.stringify({post:'archived',remoteState:'cancel_required',publishedHistory:h.permalink,remoteDraftStillExists:true,autoPublish:false}));
 const saved=await exec([cancel,archive,log].join(';\n'));if(saved.some(x=>x.meta?.changes!==1))throw Error('D1 CAS state/audit mismatch');
 const [pBack,lBack]=await Promise.all([one('SELECT status,image_url,approved_by,approved_at,scheduled_at,published_at FROM social_posts WHERE id=?',id),one('SELECT state,metricool_id,uuid FROM social_metricool_sync WHERE post_id=?',id)]);
 if(pBack?.status!=='archived'||pBack.image_url!==post.image_url||pBack.approved_by||pBack.approved_at||pBack.scheduled_at||pBack.published_at||lBack?.state!=='cancel_required'||Number(lBack.metricool_id)!==remoteId||lBack.uuid!==uuid)throw Error('Readback failed');
 report.archived=true;report.readback=true;report.audit=audit;report.publishedHistory=h.permalink;
}catch(e){report.blocked=String(e.message||e)}
report.counts=(await exec('SELECT status,COUNT(*) count FROM social_posts GROUP BY status'))[0]?.results||[];
fs.writeFileSync('trial-first-archive-result.json',JSON.stringify(report,null,2)+'\n');console.log('TRIAL_FIRST_ARCHIVE_RESULT',JSON.stringify(report));
