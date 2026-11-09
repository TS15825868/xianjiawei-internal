// Exact-version D1 archival of a documented off-brand linked draft. Metricool remote stays draft, untouched.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const {fingerprint}=createRequire(import.meta.url)('../tools/metricool-free-evidence.cjs');
const req=JSON.parse(fs.readFileSync('ops/request-spring-walk-linked-safe-hold-20261109.json','utf8'));
if(req.scope!=='spring-walk-offbrand-linked-draft-safe-hold-v1' || req.id!=='XJW-FEST-2027-spring-walk' ||
 req.remoteId!==395780855 || req.uuid!=='7059549514727835567' || req.archiveAuthorized!==true ||
 req.publishAuthorized!==false || req.approveAuthorized!==false || req.deleteRemoteAuthorized!==false ||
 !req.reason || req.reason.length<90 || !req.imageInspectionDetails || req.imageInspectionDetails.length<95)throw Error('Unsafe request');
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const db=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];
if(!account||!token||!db)throw Error('D1 credentials missing');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const quote=x=>x==null?'NULL':typeof x==='number'?String(x):"'"+String(x).replaceAll("'","''")+"'";
function sql(s,...v){let i=0;const z=s.replace(/\?/g,()=>quote(v[i++]));if(i!==v.length)throw Error('SQL bind mismatch');return z;}
async function query(q){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+db+'/query',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql:q}),signal:AbortSignal.timeout(45000)});const j=await r.json();if(!r.ok||!j.success||!Array.isArray(j.result)||j.result.some(x=>x.success===false))throw Error('D1 error '+JSON.stringify(j.errors||[]).slice(0,200));return j.result;}
async function one(s,...v){return(await query(sql(s,...v)))[0]?.results?.[0]||null;}
const report={scope:req.scope,id:req.id,remoteId:req.remoteId,remoteExternalDeleted:false,remoteExternalChanged:false,remoteDraft:true,remoteAutoPublish:false,archived:false,readback:false,approvals:0,scheduled:0,published:0};
try{
 const [p,l]=await Promise.all([one('SELECT * FROM social_posts WHERE id=?',req.id),one('SELECT * FROM social_metricool_sync WHERE post_id=?',req.id)]);
 if(!p||p.status!=='pending_review'||p.title!==req.expectedTitle||p.copy!==req.expectedCopy||p.image_url!==req.expectedImageUrl||p.image_alt!==req.expectedImageAlt||!['clear','passed'].includes(p.image_quality_status)||p.approved_at||p.approved_by||p.published_at||p.scheduled_at||Number(p.image_approved||0)!==0)throw Error('Post edition is no longer unapproved current version');
 if(!l||Number(l.metricool_id)!==req.remoteId||String(l.uuid)!==req.uuid||l.state!=='pending_review'||Number(l.attempts||0)!==0)throw Error('Linked Metricool D1 state changed');
 const t=JSON.parse(l.template_json||'{}');
 if(Number(t.id)!==req.remoteId||String(t.uuid)!==req.uuid||t.text!==p.copy||t.draft!==true||t.autoPublish!==false||t.providers?.length!==3||t.providers.some(x=>x.status!=='PENDING'))throw Error('Remote draft template cannot prove safe hold');
 if(t.mediaAltText?.[0]&&t.mediaAltText[0]!==p.image_alt)throw Error('Remote image description changed');
 const a=await one('SELECT * FROM social_post_quality_reviews WHERE post_id=? ORDER BY reviewed_at DESC LIMIT 1',p.id);
 if(!a||a.decision!=='NEEDS_HUMAN_REVIEW'||a.content_fingerprint!==fingerprint(p)||a.image_url!==p.image_url||!a.image_sha256)throw Error('Current-source AI review missing');
 const e=JSON.parse(a.evidence_json||'{}');
 if(e.content_fingerprint!==a.content_fingerprint||e.image_sha256!==a.image_sha256||e.checks?.duplicate?.result!=='DEFER')throw Error('Version-bound AI evidence incompatible');
 if(await one('SELECT post_id FROM social_publish_deliveries WHERE post_id=? LIMIT 1',p.id))throw Error('Delivery record exists');
 const image=await fetch(p.image_url,{signal:AbortSignal.timeout(30000)});
 if(!image.ok||sha(Buffer.from(await image.arrayBuffer()))!==a.image_sha256)throw Error('Original image bytes mismatch');
 const now=new Date().toISOString(),auditId='AUD-'+crypto.randomUUID();
 const cancel=sql("UPDATE social_metricool_sync SET state='cancel_required',last_error=?,updated_at=? WHERE post_id=? AND metricool_id=? AND uuid=? AND state='pending_review' AND COALESCE(attempts,0)=0",'離題走春稿已標記待封存，Metricool原始草稿仍draft=true且autoPublish=false，不刪遠端不發布',now,p.id,req.remoteId,req.uuid);
 const archive=sql("UPDATE social_posts SET status='archived',proposed_scheduled_at=NULL,review_note=?,updated_at=? WHERE id=? AND status='pending_review' AND updated_at=? AND title=? AND copy=? AND image_url=? AND image_alt=? AND approved_at IS NULL AND approved_by IS NULL AND scheduled_at IS NULL AND published_at IS NULL AND COALESCE(image_approved,0)=0 AND NOT EXISTS(SELECT 1 FROM social_publish_deliveries WHERE post_id=social_posts.id) AND EXISTS(SELECT 1 FROM social_metricool_sync WHERE post_id=social_posts.id AND metricool_id=? AND uuid=? AND state='cancel_required')",'編輯退件（原圖文與歷史保留）：'+req.reason+'；外部草稿仍停發待清理。',now,p.id,p.updated_at,p.title,p.copy,p.image_url,p.image_alt,req.remoteId,req.uuid);
 const audit=sql("INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) SELECT ?,'chatgpt-work:AI','品牌離題生活稿安全封存與外部草稿停發鎖','貼文',?,?,?,'' WHERE changes()=1",auditId,p.id,JSON.stringify({status:p.status,metricoolId:req.remoteId,imageSha:a.image_sha256}),JSON.stringify({status:'archived',linkState:'cancel_required',externalDraftStillExists:true,remoteDeleted:false,reason:req.reason,imageInspectionDetails:req.imageInspectionDetails}));
 const w=await query(cancel+';\n'+archive+';\n'+audit);
 if(w.some(x=>x.meta?.changes!==1))throw Error('D1 compare-and-set/audit changes mismatch');
 const [pb,lb]=await Promise.all([one('SELECT status,title,copy,image_url,image_alt,proposed_scheduled_at,approved_by,approved_at,scheduled_at,published_at FROM social_posts WHERE id=?',p.id),one('SELECT state,metricool_id,uuid FROM social_metricool_sync WHERE post_id=?',p.id)]);
 if(pb?.status!=='archived'||pb.title!==p.title||pb.copy!==p.copy||pb.image_url!==p.image_url||pb.image_alt!==p.image_alt||pb.proposed_scheduled_at||pb.approved_at||pb.approved_by||pb.scheduled_at||pb.published_at||lb?.state!=='cancel_required'||Number(lb.metricool_id)!==req.remoteId||lb.uuid!==req.uuid)throw Error('D1 archival/readback failed');
 Object.assign(report,{archived:true,readback:true,auditId});
}catch(err){report.blocker=String(err?.message||err).slice(0,400);}
report.counts=(await query('SELECT status,COUNT(*) AS count FROM social_posts GROUP BY status ORDER BY status'))[0]?.results||[];
fs.writeFileSync('spring-walk-linked-safe-hold-result.json',JSON.stringify(report,null,2)+'\n');
console.log('SPRING_WALK_LINKED_SAFE_HOLD '+JSON.stringify(report));
if(!report.archived||!report.readback)process.exitCode=1;
