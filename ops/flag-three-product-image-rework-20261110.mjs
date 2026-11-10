// Authoritative brand product comparison from current website main; mark only verified wrong AI product depictions.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const {fingerprint}=createRequire(import.meta.url)('../tools/metricool-free-evidence.cjs');
const req=JSON.parse(fs.readFileSync('ops/request-three-product-image-rework-20261110.json','utf8'));
const allowed=["XJW-CONV-cny-gift-choice","XJW-CONV-chat-picture-or-text","XJW-CONV-chat-glass-vs-pouch-storage"];
if(req.scope!=='xjw-three-direct-visual-product-rework-v1'||req.items?.length!==3||
 req.doNotApprove!==true||req.doNotSchedule!==true||req.doNotPublish!==true||
 req.keepOriginalImage!==true||req.items.some((x,i)=>x.id!==allowed[i]||x.visualFinding.length<120))
 throw Error('Unsafe request');
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
const db=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];
if(!account||!token||!db)throw Error('Cloudflare binding unavailable');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const q=x=>x==null?'NULL':typeof x==='number'?String(x):"'"+String(x).replaceAll("'","''")+"'";
function sql(s,...v){let i=0;const str=s.replace(/\?/g,()=>q(v[i++]));if(i!==v.length)throw Error('bind count');return str}
async function query(s){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+db+'/query',
 {method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql:s}),signal:AbortSignal.timeout(45000)});
 const z=await r.json();if(!r.ok||!z.success||!Array.isArray(z.result)||z.result.some(x=>x.success===false))throw Error('D1 '+JSON.stringify(z.errors||[]).slice(0,160));return z.result;}
async function one(s,...a){return(await query(sql(s,...a)))[0]?.results?.[0]||null;}
const results=[];
for(const x of req.items){
 const rec={id:x.id,flagged:false,readback:false,publication:false};
 try{
 const [p,l]=await Promise.all([one('SELECT * FROM social_posts WHERE id=?',x.id),one('SELECT * FROM social_metricool_sync WHERE post_id=? LIMIT 1',x.id)]);
 if(!p||p.status!=='pending_review'||p.title!==x.expectedTitle||p.copy!==x.expectedCopy||
    p.image_url!==x.expectedImageUrl||p.image_alt!==x.expectedAlt||
    p.image_quality_status!=='clear'||p.published_at||p.scheduled_at||p.approved_by||p.approved_at||Number(p.image_approved||0)!==0)throw Error('Current D1 preimage no longer matches safe target');
 if(l||await one('SELECT post_id FROM social_publish_deliveries WHERE post_id=? LIMIT 1',x.id))throw Error('External scheduling or publication link exists');
 const a=await one('SELECT * FROM social_post_quality_reviews WHERE post_id=? ORDER BY reviewed_at DESC LIMIT 1',x.id);
 if(!a||a.decision!=='NEEDS_HUMAN_REVIEW'||a.content_fingerprint!==fingerprint(p)||a.image_url!==p.image_url||!a.image_sha256)throw Error('Current AI evidence not source bound');
 const original=await fetch(p.image_url,{signal:AbortSignal.timeout(30000)});
 if(!original.ok||sha(Buffer.from(await original.arrayBuffer()))!==a.image_sha256)throw Error('Image SHA changed');
 const now=new Date().toISOString();
 const newPost={...p,image_quality_status:'needs_rework'};
 const fp=fingerprint(newPost);
 const evidence={source:'direct original-scene and current main official product image side-by-side visual inspection',
  reviewed_at:now,model:'ChatGPT',post_id:x.id,content_fingerprint:fp,
  image_sha256:a.image_sha256,image_url:p.image_url,decision:'REJECTED',owner_authorization:'continue correcting pending posts',
  review_reason:x.visualFinding,official_reference:x.officialAsset,
  checks:{...JSON.parse(a.evidence_json||'{}').checks,
   product:{result:'REJECT',evidence:'產品本體非正式原圖合成，不能視為可正式發布：'+x.visualFinding},
   physical_scale:{result:'DEFER',evidence:'必須用官網正式商品原圖做等比例合成後重新覆核'},
   duplicate:{result:'DEFER',evidence:'已發布歷史媒體部分缺證，仍不可宣稱完整去重PASS'},
   compliance_final:{result:'DEFER',evidence:'商品圖不是正式原圖，需修復後重新16項圖文審核'}}};
 const reviewId='AI-REWORK-'+sha(JSON.stringify(evidence));
 const update=sql("UPDATE social_posts SET image_quality_status='needs_rework',review_note=?,updated_at=? WHERE id=? AND status='pending_review' AND updated_at=? AND title=? AND copy=? AND image_url=? AND image_alt=? AND image_quality_status='clear' AND approved_at IS NULL AND approved_by IS NULL AND scheduled_at IS NULL AND published_at IS NULL AND COALESCE(image_approved,0)=0",
 'AI品檢退回需修產品實物圖片：'+x.visualFinding+'；原始圖與正式文案保留。',now,x.id,p.updated_at,p.title,p.copy,p.image_url,p.image_alt);
 const insert=sql("INSERT INTO social_post_quality_reviews(id,post_id,reviewer_type,decision,content_fingerprint,image_url,image_sha256,evidence_json,model,policy_version,authorized_by,reviewed_at,old_status,new_status) SELECT ?,?,'AI','REJECTED',?,?,?,?,?,?,?,?,'pending_review','pending_review' WHERE changes()=1 AND EXISTS(SELECT 1 FROM social_posts WHERE id=? AND updated_at=? AND status='pending_review' AND image_quality_status='needs_rework')",
 reviewId,x.id,fp,p.image_url,a.image_sha256,JSON.stringify(evidence),'ChatGPT direct visual',a.policy_version||'2026-11-10-product-authenticity',a.authorized_by,now,x.id,now);
 const audit=sql("INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) SELECT ?,'chatgpt-work:AI','正式產品圖片實物不符退件待重製','貼文',?,?,?,'' WHERE changes()=1",
 'AUD-'+crypto.randomUUID(),x.id,JSON.stringify({quality:p.image_quality_status,review:a.id,sourceSha:a.image_sha256}),
 JSON.stringify({quality:'needs_rework',reviewId,official:x.officialAsset,reason:x.visualFinding,published:false,approve:false}));
 const w=await query(update+';\n'+insert+';\n'+audit);
 if(w.length!==3||w.some(v=>v.meta?.changes!==1))throw Error('D1 CAS/evidence/audit changed-count mismatch');
 const [b,rev]=await Promise.all([one('SELECT status,image_quality_status,image_url,approved_by,scheduled_at,published_at FROM social_posts WHERE id=?',x.id),
  one('SELECT decision,content_fingerprint,image_sha256 FROM social_post_quality_reviews WHERE id=?',reviewId)]);
 if(b?.status!=='pending_review'||b.image_quality_status!=='needs_rework'||b.image_url!==p.image_url||
 b.approved_by||b.scheduled_at||b.published_at||rev?.decision!=='REJECTED'||rev.content_fingerprint!==fp||
 rev.image_sha256!==a.image_sha256)throw Error('Post/review readback mismatch');
 Object.assign(rec,{flagged:true,readback:true,reviewId,originalImageSha:a.image_sha256});
 }catch(e){rec.blocker=String(e?.message||e).slice(0,350)}
 results.push(rec);
}
const counts=(await query('SELECT status,COUNT(*) AS count FROM social_posts GROUP BY status'))[0]?.results||[];
const report={scope:req.scope,results,counts,changed:results.filter(x=>x.flagged&&x.readback).length};
fs.writeFileSync('three-product-image-visual-rework-result.json',JSON.stringify(report,null,2)+'\n');
console.log('PRODUCT_IMAGE_VISUAL_REWORK '+JSON.stringify(report));
if(report.changed!==3)process.exitCode=1;
