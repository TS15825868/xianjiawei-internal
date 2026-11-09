// Source-grounded editorial withdrawal of one visual-reviewed near-duplicate old photo recollection piece.
// Keep full creative, media, review, and audit history; never approve, delete, or publish.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const {fingerprint}=createRequire(import.meta.url)('../tools/metricool-free-evidence.cjs');
const req=JSON.parse(fs.readFileSync('ops/request-one-redundant-year-end-clean-20261109.json','utf8'));
const expected=['XJW-CONV-year-end-clean'];
if(req.scope!=='one-verified-old-photo-editorial-duplicate-20261109-v1'||req.allowArchive!==true||req.allowApproval!==false||req.allowPublish!==false||req.items?.map(x=>x.id).join('|')!==expected.join('|'))throw Error('Unsafe editorial archive request');
const acct=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN,db=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];
if(!acct||!token||!db)throw Error('Missing Cloudflare D1 credentials');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const quote=x=>x==null?'NULL':typeof x==='number'?String(x):"'"+String(x).replaceAll("'","''")+"'";
const sql=(s,...v)=>{let i=0;const output=s.replace(/\?/g,()=>quote(v[i++]));if(i!==v.length)throw Error('SQL placeholder mismatch');return output};
async function query(s){
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+acct+'/d1/database/'+db+'/query',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql:s}),signal:AbortSignal.timeout(45000)});
 const j=await r.json();if(!r.ok||!j.success||!Array.isArray(j.result)||j.result.some(x=>x.success===false))throw Error('D1 failed '+JSON.stringify(j.errors||[]).slice(0,200));return j.result;
}
async function first(s,...v){return(await query(sql(s,...v)))[0]?.results?.[0]||null}
const results=[];
for(const item of req.items){
 const result={id:item.id,archived:false,readback:false,approved:false,scheduled:false,published:false};
 try{
  if(typeof item.reason!=='string'||item.reason.length<45||item.originalImageViewed!==true)throw Error('Grounded image/editorial reason absent');
  const p=await first('SELECT * FROM social_posts WHERE id=?',item.id);
  if(!p||p.status!=='pending_review'||p.title!==item.title||p.copy!==item.copy||p.image_url!==item.imageUrl||p.image_alt!==item.imageAlt||!['clear','passed'].includes(p.image_quality_status)||p.approved_by||p.approved_at||p.scheduled_at||p.published_at||Number(p.image_approved||0)!==0)throw Error('Current source was edited or has approval/publishing metadata');
  const rev=await first('SELECT * FROM social_post_quality_reviews WHERE post_id=? ORDER BY reviewed_at DESC LIMIT 1',p.id);
  if(!rev||rev.decision!=='NEEDS_HUMAN_REVIEW'||rev.image_url!==p.image_url||rev.content_fingerprint!==fingerprint(p)||!rev.image_sha256)throw Error('Latest version-bound review missing');
  const ev=JSON.parse(rev.evidence_json||'{}');
  if(ev.content_fingerprint!==rev.content_fingerprint||ev.image_sha256!==rev.image_sha256||ev.checks?.duplicate?.result!=='DEFER')throw Error('AI source-bound evidence mismatch');
  if(await first('SELECT post_id FROM social_metricool_sync WHERE post_id=? LIMIT 1',p.id))throw Error('Existing Metricool link; cannot archive until reconciled');
  if(await first('SELECT post_id FROM social_publish_deliveries WHERE post_id=? LIMIT 1',p.id))throw Error('Existing delivery; cannot archive');
  const source=await fetch(p.image_url,{signal:AbortSignal.timeout(30000)});
  if(!source.ok||sha(Buffer.from(await source.arrayBuffer()))!==rev.image_sha256)throw Error('Original approved file changed/unreachable');
  const now=new Date().toISOString(),auditId='AUD-'+crypto.randomUUID();
  const update=sql("UPDATE social_posts SET status='archived',proposed_scheduled_at=NULL,review_note=?,updated_at=? WHERE id=? AND status='pending_review' AND updated_at=? AND title=? AND copy=? AND image_url=? AND image_alt=? AND approved_by IS NULL AND approved_at IS NULL AND scheduled_at IS NULL AND published_at IS NULL AND COALESCE(image_approved,0)=0 AND NOT EXISTS(SELECT 1 FROM social_metricool_sync WHERE post_id=social_posts.id) AND NOT EXISTS(SELECT 1 FROM social_publish_deliveries WHERE post_id=social_posts.id)",'正式編輯退件・保存舊版：'+item.reason+'；未經AI或人工核准，不發佈。',now,p.id,p.updated_at,p.title,p.copy,p.image_url,p.image_alt);
  const audit=sql("INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) SELECT ?,'chatgpt-work:AI','既有老照片與工具記憶角度重複，保留更具體石磨及老街景文章','貼文',?,?,?,'' WHERE changes()=1",auditId,p.id,JSON.stringify({status:p.status,copySha:sha(p.copy),imageSha:rev.image_sha256,reviewId:rev.id}),JSON.stringify({status:'archived',reason:item.reason,originalImageUrl:p.image_url,originalMediaRetained:true,approved:false,published:false}));
  const write=await query(update+';\n'+audit);
  if(write[0]?.meta?.changes!==1||write[1]?.meta?.changes!==1)throw Error('D1 CAS or audit write did not affect exactly one row');
  const back=await first('SELECT status,title,copy,image_url,image_alt,approved_by,approved_at,scheduled_at,published_at,proposed_scheduled_at FROM social_posts WHERE id=?',p.id);
  if(back?.status!=='archived'||back.title!==p.title||back.copy!==p.copy||back.image_url!==p.image_url||back.image_alt!==p.image_alt||back.approved_by||back.approved_at||back.scheduled_at||back.published_at||back.proposed_scheduled_at)throw Error('Archived D1 readback mismatch');
  result.archived=true;result.readback=true;result.auditId=auditId;
 }catch(e){result.blocker=String(e?.message||e).slice(0,450)}
 results.push(result);
}
const counts=(await query('SELECT status,COUNT(*) AS count FROM social_posts GROUP BY status ORDER BY status'))[0]?.results||[];
const report={schema:req.scope,results,counts,archived:results.filter(x=>x.archived&&x.readback).length,blocked:results.filter(x=>x.blocker).length,deleted:0,approved:0,scheduled:0,published:0};
fs.writeFileSync('one-redundant-year-end-clean-readback.json',JSON.stringify(report,null,2)+'\n');
console.log('ONE_REDUNDANT_YEAR_END_CLEAN_READBACK '+JSON.stringify(report));
if(report.blocked)process.exitCode=1;
