// Three independently visual-reviewed duplicate editorial angles. No deletion, approval or publishing.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {fingerprint}=require('../tools/metricool-free-evidence.cjs');
const req=JSON.parse(fs.readFileSync('ops/request-three-editorial-overlaps-20261109.json','utf8'));
const intended=['XJW-CONV-chat-craft-years','XJW-CAND-20270122','XJW-CAND-20261208'];
if(req.scope!=='three-independently-reviewed-editorial-overlaps-20261109'||req.archive!==true||req.approve!==false||req.publish!==false||req.items?.length!==3||req.items.map(x=>x.archive.id).join('|')!==intended.join('|'))throw Error('Unsafe archival request');
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN,db=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];
if(!account||!token||!db)throw Error('D1 credentials missing');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const quote=x=>x==null?'NULL':typeof x==='number'?String(x):"'"+String(x).replaceAll("'","''")+"'";
function sql(t,...a){let i=0;const s=t.replace(/\?/g,()=>quote(a[i++]));if(i!==a.length)throw Error('SQL bind count mismatch');return s}
async function query(t){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+db+'/query',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql:t}),signal:AbortSignal.timeout(45000)});const d=await r.json();if(!r.ok||!d.success||!Array.isArray(d.result)||d.result.some(x=>x.success===false))throw Error('D1 query failed '+JSON.stringify(d.errors||[]).slice(0,240));return d.result}
async function first(t,...v){return(await query(sql(t,...v)))[0]?.results?.[0]||null}
const results=[];
for(const item of req.items){
 const out={id:item.archive.id,keep:item.keep.id,archived:false,readback:false,approval:false,publication:false};
 try{
  if(!item.reason||item.reason.length<45)throw Error('Meaningful editorial reason missing');
  const [a,k]=await Promise.all([first('SELECT * FROM social_posts WHERE id=?',item.archive.id),first('SELECT * FROM social_posts WHERE id=?',item.keep.id)]);
  for(const [p,e] of [[a,item.archive],[k,item.keep]]){
    if(!p||p.status!=='pending_review'||p.title!==e.title||p.copy!==e.copy||p.image_url!==e.imageUrl||p.image_alt!==e.imageAlt||!['clear','passed'].includes(p.image_quality_status)||p.approved_by||p.approved_at||p.scheduled_at||p.published_at||Number(p.image_approved||0)!==0)throw Error('Live source changed or approved for '+e.id);
    const review=await first('SELECT * FROM social_post_quality_reviews WHERE post_id=? ORDER BY reviewed_at DESC LIMIT 1',e.id);
    if(!review||review.decision!=='NEEDS_HUMAN_REVIEW'||review.image_url!==p.image_url||review.content_fingerprint!==fingerprint(p)||!review.image_sha256)throw Error('Current version-bound AI evidence not intact for '+e.id);
    const evidence=JSON.parse(review.evidence_json||'{}');
    if(evidence.content_fingerprint!==review.content_fingerprint||evidence.image_sha256!==review.image_sha256||evidence.checks?.duplicate?.result!=='DEFER')throw Error('Latest evidence not consistent for '+e.id);
    const img=await fetch(p.image_url,{signal:AbortSignal.timeout(30000)});
    if(!img.ok)throw Error('Original scene image unreachable for '+e.id);
    if(sha(Buffer.from(await img.arrayBuffer()))!==review.image_sha256)throw Error('Original scene SHA changed for '+e.id);
  }
  if(await first('SELECT post_id FROM social_metricool_sync WHERE post_id=? LIMIT 1',a.id))throw Error('Existing external Metricool draft mapping must be handled independently');
  if(await first('SELECT post_id FROM social_publish_deliveries WHERE post_id=? LIMIT 1',a.id))throw Error('Existing delivery record must be resolved separately');
  const now=new Date().toISOString(),auditId='AUD-'+crypto.randomUUID();
  const up=sql("UPDATE social_posts SET status='archived',proposed_scheduled_at=NULL,review_note=?,updated_at=? WHERE id=? AND status='pending_review' AND updated_at=? AND title=? AND copy=? AND image_url=? AND image_alt=? AND approved_by IS NULL AND approved_at IS NULL AND published_at IS NULL AND scheduled_at IS NULL AND COALESCE(image_approved,0)=0 AND NOT EXISTS(SELECT 1 FROM social_metricool_sync WHERE post_id=social_posts.id) AND NOT EXISTS(SELECT 1 FROM social_publish_deliveries WHERE post_id=social_posts.id)",'編輯去重封存（原文圖保留）：'+item.reason+'；保留更獨立的 '+k.id+'；未核准或發布。',now,a.id,a.updated_at,a.title,a.copy,a.image_url,a.image_alt);
  const audit=sql("INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) SELECT ?,'chatgpt-work:AI','原圖及現版文案檢視：實質重複角度封存','貼文',?,?,?,'' WHERE changes()=1",auditId,a.id,JSON.stringify({status:'pending_review',keep:k.id,oldFingerprint:fingerprint(a),imageUrl:a.image_url}),JSON.stringify({status:'archived',reason:item.reason,keep:k.id,noDeletion:true,approved:false,published:false}));
  const writes=await query(up+';\n'+audit);
  if(writes[0]?.meta?.changes!==1||writes[1]?.meta?.changes!==1)throw Error('D1 compare-and-set or audit row not written');
  const [back,keep]=await Promise.all([first('SELECT status,title,copy,image_url,image_alt,approved_by,approved_at,scheduled_at,published_at,proposed_scheduled_at FROM social_posts WHERE id=?',a.id),first('SELECT status,title,copy,image_url,approved_by,approved_at,scheduled_at,published_at FROM social_posts WHERE id=?',k.id)]);
  if(back?.status!=='archived'||back.title!==a.title||back.copy!==a.copy||back.image_url!==a.image_url||back.image_alt!==a.image_alt||back.proposed_scheduled_at||back.approved_by||back.approved_at||back.scheduled_at||back.published_at||keep?.status!=='pending_review'||keep.copy!==k.copy||keep.image_url!==k.image_url||keep.approved_by||keep.approved_at||keep.scheduled_at||keep.published_at)throw Error('D1 archive/readback mismatch');
  out.archived=true;out.readback=true;out.auditId=auditId;
 }catch(err){out.blocker=String(err?.message||err).slice(0,350)}
 results.push(out);
}
const counts=(await query('SELECT status,COUNT(*) AS count FROM social_posts GROUP BY status ORDER BY status'))[0]?.results||[];
const report={schema:req.scope,results,counts,archived:results.filter(x=>x.archived&&x.readback).length,blocked:results.filter(x=>x.blocker).length,deleted:0,approvals:0,scheduled:0,published:0};
fs.writeFileSync('three-editorial-archive-readback.json',JSON.stringify(report,null,2)+'\n');
console.log('THREE_EDITORIAL_ARCHIVE_READBACK '+JSON.stringify(report));
if(report.blocked)process.exitCode=1;
