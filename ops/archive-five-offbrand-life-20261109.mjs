// Preserve and archive only five visually checked life posts with no substantive XJW food/craft/product link.
// No AI approval, publishing, deletion, or stale-snapshot backfill. Guard every live D1 row.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const {fingerprint}=createRequire(import.meta.url)('../tools/metricool-free-evidence.cjs');
const req=JSON.parse(fs.readFileSync('ops/request-five-offbrand-life-20261109.json','utf8'));
const ids=['XJW-CAND-20270226','XJW-CAND-20270316','XJW-CAND-20270326','XJW-CAND-20270112','XJW-CAND-20270319'];
if(req.scope!=='five-nonbrand-lifestyle-editorial-archive-20261109'||req.allowArchive!==true||req.allowApproval!==false||req.allowPublish!==false||req.items?.map(x=>x.id).join('|')!==ids.join('|'))throw Error('Unsafe archive intent');
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN,db=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];
if(!account||!token||!db)throw Error('Missing D1 credentials');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const quote=x=>x==null?'NULL':typeof x==='number'?String(x):"'"+String(x).replaceAll("'","''")+"'";
const sql=(s,...v)=>{let i=0,z=s.replace(/\?/g,()=>quote(v[i++]));if(i!==v.length)throw Error('SQL placeholder mismatch');return z};
async function query(s){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+db+'/query',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql:s}),signal:AbortSignal.timeout(45000)});const j=await r.json();if(!r.ok||!j.success||!Array.isArray(j.result)||j.result.some(x=>x.success===false))throw Error('D1 request failure '+JSON.stringify(j.errors||[]).slice(0,180));return j.result}
async function first(s,...v){return(await query(sql(s,...v)))[0]?.results?.[0]||null}
const results=[];
for(const item of req.items){
 const out={id:item.id,archived:false,readback:false,approval:false,published:false};
 try{
  if(!item.reason||item.reason.length<40||!item.verifiedOriginalScene)throw Error('Missing source grounded editorial evidence');
  const p=await first('SELECT * FROM social_posts WHERE id=?',item.id);
  if(!p||p.status!=='pending_review'||p.title!==item.title||p.copy!==item.copy||p.image_url!==item.imageUrl||p.image_alt!==item.imageAlt||!['clear','passed'].includes(p.image_quality_status)||p.approved_by||p.approved_at||p.scheduled_at||p.published_at||Number(p.image_approved||0)!==0)throw Error('Current source changed or already approved; skip');
  const r=await first('SELECT * FROM social_post_quality_reviews WHERE post_id=? ORDER BY reviewed_at DESC LIMIT 1',item.id);
  if(!r||r.decision!=='NEEDS_HUMAN_REVIEW'||r.image_url!==p.image_url||r.content_fingerprint!==fingerprint(p)||!r.image_sha256)throw Error('Current-source review not verified');
  const e=JSON.parse(r.evidence_json||'{}');
  if(e.content_fingerprint!==r.content_fingerprint||e.image_sha256!==r.image_sha256||e.checks?.duplicate?.result!=='DEFER')throw Error('Current AI evidence inconsistent');
  const img=await fetch(p.image_url,{signal:AbortSignal.timeout(30000)});
  if(!img.ok||sha(Buffer.from(await img.arrayBuffer()))!==r.image_sha256)throw Error('Original image missing or changed');
  if(await first('SELECT post_id FROM social_metricool_sync WHERE post_id=? LIMIT 1',p.id))throw Error('A remote Metricool draft exists; requires coordinated action');
  if(await first('SELECT post_id FROM social_publish_deliveries WHERE post_id=? LIMIT 1',p.id))throw Error('Delivery record exists; requires receipt reconciliation');
  const now=new Date().toISOString(),aid='AUD-'+crypto.randomUUID();
  const update=sql("UPDATE social_posts SET status='archived',proposed_scheduled_at=NULL,review_note=?,updated_at=? WHERE id=? AND status='pending_review' AND updated_at=? AND title=? AND copy=? AND image_url=? AND image_alt=? AND approved_by IS NULL AND approved_at IS NULL AND scheduled_at IS NULL AND published_at IS NULL AND COALESCE(image_approved,0)=0 AND NOT EXISTS(SELECT 1 FROM social_metricool_sync WHERE post_id=social_posts.id) AND NOT EXISTS(SELECT 1 FROM social_publish_deliveries WHERE post_id=social_posts.id)",'編輯退件封存：'+item.reason+'。保留原圖及全部歷史，未核准未發布。',now,p.id,p.updated_at,p.title,p.copy,p.image_url,p.image_alt);
  const audit=sql("INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) SELECT ?,'chatgpt-work:AI','生活文案缺乏具體仙加味飲食文化／產品連結，退件封存','貼文',?,?,?,'' WHERE changes()=1",aid,p.id,JSON.stringify({status:p.status,copySHA:sha(p.copy),imageSHA:r.image_sha256}),JSON.stringify({status:'archived',reason:item.reason,preserveMedia:true,approve:false,publish:false}));
  const writes=await query(update+';\n'+audit);
  if(writes[0]?.meta?.changes!==1||writes[1]?.meta?.changes!==1)throw Error('D1 CAS or audit write incomplete');
  const back=await first('SELECT status,title,copy,image_url,image_alt,approved_by,approved_at,scheduled_at,published_at,proposed_scheduled_at FROM social_posts WHERE id=?',p.id);
  if(!back||back.status!=='archived'||back.title!==p.title||back.copy!==p.copy||back.image_url!==p.image_url||back.image_alt!==p.image_alt||back.approved_by||back.approved_at||back.scheduled_at||back.published_at||back.proposed_scheduled_at)throw Error('D1 archive/readback failed');
  out.archived=true;out.readback=true;out.auditId=aid;
 }catch(err){out.blocker=String(err?.message||err).slice(0,300)}
 results.push(out);
}
const counts=(await query('SELECT status,COUNT(*) AS count FROM social_posts GROUP BY status ORDER BY status'))[0]?.results||[];
const report={scope:req.scope,results,counts,archived:results.filter(x=>x.archived&&x.readback).length,blocked:results.filter(x=>x.blocker).length,deleted:0,approvals:0,scheduled:0,published:0};
fs.writeFileSync('five-offbrand-archive-readback.json',JSON.stringify(report,null,2)+'\n');
console.log('FIVE_OFFBRAND_ARCHIVE_READBACK '+JSON.stringify(report));
if(report.blocked)process.exitCode=1;
