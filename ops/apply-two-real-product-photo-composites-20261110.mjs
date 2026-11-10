// Safe version-bound D1 swap of only two directly inspected authentic product photo composites.
// The local post remains pending_review, no auto approval, schedule or publication.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const {fingerprint}=createRequire(import.meta.url)('../tools/metricool-free-evidence.cjs');
const req=JSON.parse(fs.readFileSync('ops/request-apply-two-real-product-photo-composites-20261110.json','utf8'));
const ids=['XJW-CONV-chat-luerong-intro','XJW-CONV-chat-photo-size'];
if(req.scope!=='xjw-two-direct-verified-real-photo-composites-v1'||req.items?.length!==2||
 req.prohibitApproval!==true||req.prohibitSchedule!==true||req.prohibitPublish!==true||
 req.retainPriorQualityHistory!==true||req.items.some((x,i)=>x.id!==ids[i]||!x.fullDuplicateNotCertified||
 !x.newImageSHA256||x.newImageSHA256.length!==64||x.newImagePath.includes('..')))throw Error('Unsafe review change request');
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
const db=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];
if(!token||!account||!db)throw Error('Missing Cloudflare credentials');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const q=x=>x==null?'NULL':typeof x==='number'?String(x):"'"+String(x).replaceAll("'","''")+"'";
function sql(s,...v){let i=0;const str=s.replace(/\?/g,()=>q(v[i++]));if(i!==v.length)throw Error('SQL parameter mismatch');return str}
async function query(stmt){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+db+'/query',
 {method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql:stmt}),signal:AbortSignal.timeout(45000)});
 const j=await r.json();
 if(!r.ok||!j.success||!Array.isArray(j.result)||j.result.some(x=>x.success===false))throw Error('D1 error '+JSON.stringify(j.errors||[]).slice(0,160));
 return j.result;}
async function one(s,...v){return (await query(sql(s,...v)))[0]?.results?.[0]||null}
const result=[];
for(const fix of req.items){
 const out={id:fix.id,imageRepaired:false,reviewUpdated:false,readback:false,approved:false,published:false};
 try{
  const [p,l,d]=await Promise.all([
   one('SELECT * FROM social_posts WHERE id=?',fix.id),
   one('SELECT post_id FROM social_metricool_sync WHERE post_id=? LIMIT 1',fix.id),
   one('SELECT post_id FROM social_publish_deliveries WHERE post_id=? LIMIT 1',fix.id)]);
  if(!p||p.status!=='pending_review'||p.title!==fix.title||p.copy!==fix.expectedCopy||
     p.image_url!==fix.expectedImageUrl||p.image_alt!==fix.expectedImageAlt||
     p.image_quality_status!=='needs_rework'||p.updated_at!==fix.expectedUpdatedAt||
     Number(p.image_approved||0)!==0||p.approved_by||p.approved_at||p.scheduled_at||p.published_at||
     l||d)throw Error('Current D1 CAS preimage changed or externally mapped');
  const prior=await one('SELECT * FROM social_post_quality_reviews WHERE post_id=? ORDER BY reviewed_at DESC LIMIT 1',p.id);
  if(!prior||prior.decision!=='REJECTED'||prior.content_fingerprint!==fingerprint(p)||
     prior.image_url!==p.image_url||!prior.image_sha256)throw Error('Current source-bound image rejection review missing');
  const preEv=JSON.parse(prior.evidence_json||'{}');
  if(preEv.checks?.product?.result!=='REJECT'||preEv.checks?.duplicate?.result!=='DEFER')throw Error('Wrong source review; historical duplicate state cannot be passed');
  const [beforeImg,newImg]=await Promise.all([fetch(p.image_url,{signal:AbortSignal.timeout(30000)}),fetch(fix.newImageUrl,{signal:AbortSignal.timeout(30000)})]);
  if(!beforeImg.ok||!newImg.ok)throw Error('Old or new original source image unavailable');
  if(sha(Buffer.from(await beforeImg.arrayBuffer()))!==prior.image_sha256)throw Error('Original rejected image bytes changed');
  if(sha(Buffer.from(await newImg.arrayBuffer()))!==fix.newImageSHA256)throw Error('New staged reviewed composite bytes changed');
  const now=new Date().toISOString();
  const newSource='官網最新正式商品原圖等比合成；'+fix.formalProductImageRepo+'/'+fix.formalProductImagePath+
   '；商品原圖Git Blob '+fix.formalProductBlobSHA+'；場景合成首版專用，非AI重畫產品';
  const newPost={...p,image_url:fix.newImageUrl,image_source:newSource,image_quality_status:'clear'};
  const fp=fingerprint(newPost);
  const proof={...preEv,review_scope:'20261110-repaired-authentic-product-image-v1',
    post_id:p.id,reviewed_at:now,content_fingerprint:fp,image_sha256:fix.newImageSHA256,
    image_url:fix.newImageUrl,previous_rejected_review_id:prior.id,source_image_sha256:prior.image_sha256,
    product_authority:{repo:fix.formalProductImageRepo,path:fix.formalProductImagePath,blobSha:fix.formalProductBlobSHA},
    direct_visual_inspection:fix.inspection,requested_decision:'defer',
    checks:{...preEv.checks,
      product:{result:'PASS',evidence:'正式官網商品實物PNG原圖按原始長寬比縮小、覆蓋已確認錯誤AI產品，保持標籤與瓶型；'+fix.inspection},
      physical_scale:{result:'PASS',evidence:'產品小型等比縮放，源圖片內實物外觀與官網正式原圖一致，無放大成日常飲料瓶'},
      duplicate:{result:'DEFER',evidence:'跨平台歷史仍有15個私人媒體快取映射、3筆公開原圖與老輪播子圖缺證；只修圖，不冒稱完整歷史去重PASS'},
      compliance_final:{result:'DEFER',evidence:'真實包裝重製已完成，但完整16項去重未結案；保持待審且不得排程或發布'}},
    publication:{approved:false,scheduled:false,published:false,autoPublish:false}};
  const reviewId='AI-DEFER-'+sha(JSON.stringify(proof));
  const update=sql("UPDATE social_posts SET image_url=?,image_source=?,image_quality_status='clear',review_note=?,updated_at=? WHERE id=? AND status='pending_review' AND updated_at=? AND title=? AND copy=? AND image_url=? AND image_alt=? AND image_quality_status='needs_rework' AND approved_by IS NULL AND approved_at IS NULL AND scheduled_at IS NULL AND published_at IS NULL AND COALESCE(image_approved,0)=0",
   fix.newImageUrl,newSource,'產品實物圖片已以正式原圖等比例合成修復，歷史去重待補證，保持AI-DEFER。',now,p.id,p.updated_at,p.title,p.copy,p.image_url,p.image_alt);
  const insert=sql("INSERT INTO social_post_quality_reviews(id,post_id,reviewer_type,decision,content_fingerprint,image_url,image_sha256,evidence_json,model,policy_version,authorized_by,reviewed_at,old_status,new_status) SELECT ?,?,'AI','NEEDS_HUMAN_REVIEW',?,?,?,?,?,?,?,?,'pending_review','pending_review' WHERE changes()=1 AND EXISTS(SELECT 1 FROM social_posts WHERE id=? AND status='pending_review' AND updated_at=? AND image_url=?)",
   reviewId,p.id,fp,fix.newImageUrl,fix.newImageSHA256,JSON.stringify(proof),prior.model||'ChatGPT direct photo comparison',prior.policy_version||'2026-11-10',prior.authorized_by,now,p.id,now,fix.newImageUrl);
  const audit=sql("INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) SELECT ?,'chatgpt-work:AI','修正商品AI假包裝：正式原圖合成／版本綁定AI待審證據，不核准不發布','貼文',?,?,?,'' WHERE changes()=1",
   'AUD-'+crypto.randomUUID(),p.id,JSON.stringify({image:p.image_url,sha:prior.image_sha256,review:prior.id,quality:'needs_rework'}),
   JSON.stringify({image:fix.newImageUrl,sha:fix.newImageSHA256,review:reviewId,quality:'clear',formalProduct:fix.formalProductImagePath,duplicate:'DEFER',approved:false,published:false}));
  const writes=await query([update,insert,audit].join(';\n'));
  if(writes.length!==3||writes.some(x=>x.meta?.changes!==1))throw Error('D1 CAS/review/audit expected 1 row per operation');
  const [after,rev]=await Promise.all([
   one('SELECT status,copy,image_url,image_quality_status,image_source,approved_by,approved_at,image_approved,scheduled_at,published_at FROM social_posts WHERE id=?',p.id),
   one('SELECT decision,content_fingerprint,image_url,image_sha256,evidence_json FROM social_post_quality_reviews WHERE id=?',reviewId)
  ]);
  const ev=JSON.parse(rev?.evidence_json||'{}');
  if(after?.status!=='pending_review'||after.image_url!==fix.newImageUrl||after.image_quality_status!=='clear'||
   after.copy!==p.copy||after.approved_by||after.approved_at||after.scheduled_at||after.published_at||
   Number(after.image_approved||0)!==0||rev?.decision!=='NEEDS_HUMAN_REVIEW'||
   rev.content_fingerprint!==fp||rev.image_sha256!==fix.newImageSHA256||
   ev.checks?.duplicate?.result!=='DEFER'||ev.checks?.product?.result!=='PASS')
   throw Error('Post or AI-DEFER review readback inconsistent');
  Object.assign(out,{imageRepaired:true,reviewUpdated:true,readback:true,reviewId,originalImageSha:prior.image_sha256,newImageSha:fix.newImageSHA256,newImageUrl:fix.newImageUrl});
 }catch(err){out.blocker=String(err?.message||err).slice(0,470)}
 result.push(out);
}
const counts=(await query('SELECT status,COUNT(*) AS count FROM social_posts GROUP BY status'))[0]?.results||[];
const report={scope:req.scope,items:result,success:result.filter(x=>x.readback).length,counts,approvals:0,scheduled:0,published:0};
fs.writeFileSync('two-original-photo-replacement-report.json',JSON.stringify(report,null,2)+'\n');
console.log('TWO_OFFICIAL_PRODUCT_IMAGE_REPAIRS '+JSON.stringify(report));
if(report.success!==2)process.exitCode=1;
