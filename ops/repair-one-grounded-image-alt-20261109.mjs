// Exact-version correction of one image-alt action mismatch. No media, copy, approvals or publishing changed.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const { fingerprint }=require('../tools/metricool-free-evidence.cjs');
const req=JSON.parse(fs.readFileSync('ops/request-one-grounded-image-alt-20261109.json','utf8'));
if(req.scope!=='one-grounded-image-alt-correction-20261109'||req.authorizeAltFix!==true||req.authorizeApproval!==false||req.authorizePublish!==false||req.items?.length!==1)throw Error('Unsafe request');
const fix=req.items[0];
if(fix.id!=='XJW-CONV-year-end-small-win'||!fix.expectedImageAlt.includes('關上整理好的食材抽屜')||!fix.imageAlt.includes('拉開食材抽屜')||fix.expectedImageAlt===fix.imageAlt)throw Error('Only verified original-drawer alt is allowed');
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN,db=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\\s*:\\s*"([a-f0-9-]+)"/)?.[1];
if(!account||!token||!db)throw Error('Missing D1 credentials');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const quote=x=>x==null?'NULL':typeof x==='number'?String(x):"'"+String(x).replaceAll("'","''")+"'";
const sql=(s,...v)=>{let i=0;const out=s.replace(/\\?/g,()=>quote(v[i++]));if(i!==v.length)throw Error('SQL bind mismatch');return out};
async function query(s){
  const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+db+'/query',{
    method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql:s}),signal:AbortSignal.timeout(45000)
  });const j=await r.json();
  if(!r.ok||!j.success||!Array.isArray(j.result)||j.result.some(x=>x.success===false))throw Error('D1 query failure '+JSON.stringify(j.errors||[]).slice(0,180));
  return j.result;
}
async function first(s,...params){return(await query(sql(s,...params)))[0]?.results?.[0]||null}
const out={schema:req.scope,id:fix.id,altUpdated:false,readback:false,approved:false,scheduled:false,published:false};
try{
  const post=await first('SELECT * FROM social_posts WHERE id=?',fix.id);
  if(!post||post.status!=='pending_review'||post.title!==fix.expectedTitle||post.copy!==fix.expectedCopy||post.image_url!==fix.expectedImageUrl||post.image_alt!==fix.expectedImageAlt||!['clear','passed'].includes(post.image_quality_status)||post.approved_by||post.approved_at||post.published_at||post.scheduled_at||Number(post.image_approved||0)!==0)throw Error('Live post differs from verified preimage; keep pending');
  const prior=await first('SELECT * FROM social_post_quality_reviews WHERE post_id=? ORDER BY reviewed_at DESC LIMIT 1',post.id);
  if(!prior||prior.decision!=='NEEDS_HUMAN_REVIEW'||prior.image_url!==post.image_url||!prior.image_sha256||prior.content_fingerprint!==fingerprint(post))throw Error('No current version-bound AI deferral');
  const e=JSON.parse(prior.evidence_json||'{}');
  if(e.content_fingerprint!==prior.content_fingerprint||e.image_sha256!==prior.image_sha256||e.checks?.duplicate?.result!=='DEFER')throw Error('Review evidence missing or not DEFER');
  const actor=await first('SELECT email,role,active FROM profiles WHERE email=?',prior.authorized_by);
  if(!actor?.active||!['admin','owner'].includes(actor.role))throw Error('Current review authorizer not verified');
  if(await first('SELECT post_id FROM social_metricool_sync WHERE post_id=? LIMIT 1',post.id))throw Error('Remote draft sync requires separate coordination');
  if(await first('SELECT post_id FROM social_publish_deliveries WHERE post_id=? LIMIT 1',post.id))throw Error('Existing delivery history requires separate review');
  const image=await fetch(post.image_url,{signal:AbortSignal.timeout(30000)});
  if(!image.ok)throw Error('Original verified image unreachable');
  if(hash(Buffer.from(await image.arrayBuffer()))!==prior.image_sha256)throw Error('Current original image bytes changed');
  const now=new Date().toISOString(),newPost={...post,image_alt:fix.imageAlt},newFingerprint=fingerprint(newPost);
  const newEvidence={...e,review_scope:'20261109-grounded-drawer-alt-correction-v1',reviewed_at:now,post_id:post.id,
    content_fingerprint:newFingerprint,inherited_from_review_id:prior.id,requested_decision:'defer',
    checks:{...e.checks,
      action:{result:'PASS',evidence:fix.evidence},
      scene_environment:{result:'PASS',evidence:fix.evidence},
      duplicate:{result:'DEFER',evidence:'圖片說明文字依正式原圖更正；完整歷史圖像/輪播及跨平台主題去重尚未結案，本項仍DEFER，不能核准。'}
    },
    publication:{...e.publication,approved:false,auto_publish:false,auto_schedule:false}};
  const reviewBody=JSON.stringify(newEvidence),reviewId='AI-DEFER-'+hash(reviewBody),auditId='AUD-'+crypto.randomUUID();
  const update=sql("UPDATE social_posts SET image_alt=?,updated_at=? WHERE id=? AND status='pending_review' AND updated_at=? AND title=? AND copy=? AND image_url=? AND image_alt=? AND image_quality_status IN ('clear','passed') AND approved_by IS NULL AND approved_at IS NULL AND scheduled_at IS NULL AND published_at IS NULL AND COALESCE(image_approved,0)=0",fix.imageAlt,now,post.id,post.updated_at,post.title,post.copy,post.image_url,post.image_alt);
  const insert=sql("INSERT INTO social_post_quality_reviews(id,post_id,reviewer_type,decision,content_fingerprint,image_url,image_sha256,evidence_json,model,policy_version,authorized_by,reviewed_at,old_status,new_status) SELECT ?,?,'AI','NEEDS_HUMAN_REVIEW',?,?,?,?,?,?,?,?, 'pending_review','pending_review' WHERE changes()=1 AND EXISTS(SELECT 1 FROM social_posts WHERE id=? AND status='pending_review' AND updated_at=? AND image_alt=? AND approved_by IS NULL AND approved_at IS NULL)",reviewId,post.id,newFingerprint,post.image_url,prior.image_sha256,reviewBody,prior.model||'ChatGPT','2026-10-31-ai-deferral-only-v1',actor.email,now,post.id,now,fix.imageAlt);
  const audit=sql("INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) SELECT ?,'chatgpt-work:AI','依正式原圖修正抽屜動作圖片說明（不核准發布）','貼文',?,?,?,'' WHERE changes()=1",auditId,post.id,JSON.stringify({imageAltSHA256:hash(post.image_alt),imageSha256:prior.image_sha256,reviewId:prior.id}),JSON.stringify({imageAltSHA256:hash(fix.imageAlt),imageSha256:prior.image_sha256,reviewId,duplicate:'DEFER',approved:false}));
  const writes=await query([update,insert,audit].join(';\\n'));
  if(writes.some(w=>w.meta?.changes!==1))throw Error('CAS or audit changes not exactly one');
  const [back,reviewBack]=await Promise.all([
    first('SELECT status,title,copy,image_url,image_alt,approved_at,approved_by,scheduled_at,published_at,image_quality_status,updated_at FROM social_posts WHERE id=?',post.id),
    first('SELECT decision,content_fingerprint,image_sha256,evidence_json FROM social_post_quality_reviews WHERE id=?',reviewId)
  ]);
  const be=JSON.parse(reviewBack?.evidence_json||'{}');
  if(back?.status!=='pending_review'||back.title!==post.title||back.copy!==post.copy||back.image_url!==post.image_url||back.image_alt!==fix.imageAlt||back.approved_at||back.approved_by||back.scheduled_at||back.published_at||reviewBack?.decision!=='NEEDS_HUMAN_REVIEW'||reviewBack.content_fingerprint!==newFingerprint||reviewBack.image_sha256!==prior.image_sha256||be.checks.duplicate.result!=='DEFER')throw Error('D1 readback mismatch');
  Object.assign(out,{altUpdated:true,readback:true,reviewId,imageSha256:prior.image_sha256});
}catch(error){out.blocker=String(error?.message||error).slice(0,350)}
out.counts=(await query('SELECT status,COUNT(*) AS count FROM social_posts GROUP BY status'))[0]?.results||[];
fs.writeFileSync('grounded-image-alt-readback.json',JSON.stringify(out,null,2)+'\\n');
console.log('GROUNDED_IMAGE_ALT_READBACK '+JSON.stringify(out));
if(!out.altUpdated||!out.readback)process.exitCode=1;
