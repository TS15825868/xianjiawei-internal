// One owner-directed post; reconcile already PUBLISHED real 3-provider Metricool URLs to D1.
// This script never sends posts to an external service and never fakes a 16/16 PASS.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const {fingerprint}=createRequire(import.meta.url)('../tools/metricool-free-evidence.cjs');
const req=JSON.parse(fs.readFileSync('ops/request-reconcile-owner-direct-published-20261110.json','utf8'));
const ext=req.metricool;
const exact=[
 ['facebook','https://facebook.com/1475619177921633/posts/1536234965193387','1536234965193387'],
 ['instagram','https://www.instagram.com/p/Dfi5QThiIer/','Dfi5QThiIer'],
 ['threads','https://www.threads.com/@xianjiawei.tw/post/Dfi5SZkiq8u','Dfi5SZkiq8u']];
if(req.schema!=='xjw-single-owner-direct-live-published-reconcile-v1'||
 req.id!=='XJW-CONV-chat-wanhua-morning'||req.ownerDirectExceptionOnly!==true||
 req.noClaimAll16Pass!==true||req.duplicateStillDeferred!==true||req.noFurtherExternalPublish!==true||
 req.originalD1Review!=='NEEDS_HUMAN_REVIEW'||req.expectedImageStatus!=='clear'||
 ext?.brandId!=='6889683'||ext.postId!==422664301||ext.uuid!=='2843164329541847045'||
 ext.scheduledAt!=='2026-11-10T11:00:00+08:00'||ext.draft!==false||ext.autoPublish!==true||
 ext.receipts?.length!==3||
 ext.receipts.some((v,i)=>v.platform!==exact[i][0]||v.url!==exact[i][1]||v.remoteId!==exact[i][2]||v.status!=='PUBLISHED'))
 throw Error('Owner-directed post or platform receipts outside verified scope');
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const db=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];
if(!account||!token||!db)throw Error('Cloudflare secrets missing');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const q=x=>x==null?'NULL':typeof x==='number'?String(x):"'"+String(x).replaceAll("'","''")+"'";
function sql(s,...v){let i=0;const out=s.replace(/\?/g,()=>q(v[i++]));if(i!==v.length)throw Error('bind mismatch');return out}
async function query(s){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+db+'/query',
 {method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
 body:JSON.stringify({sql:s}),signal:AbortSignal.timeout(45000)});
 const z=await r.json();if(!r.ok||!z.success||!Array.isArray(z.result)||z.result.some(x=>x.success===false))throw Error('D1 query failed '+JSON.stringify(z.errors||[]).slice(0,180));return z.result;}
async function one(s,...a){return(await query(sql(s,...a)))[0]?.results?.[0]||null;}
const report={postId:req.id,metricoolId:ext.postId,uuid:ext.uuid,sourceVersionVerified:false,d1Linked:false,d1Published:false,platformsRecorded:[],readback:false,externalPostCreates:0,ai16Approved:false};
try{
 const [p,link]=await Promise.all([
  one('SELECT * FROM social_posts WHERE id=?',req.id),
  one('SELECT * FROM social_metricool_sync WHERE post_id=? LIMIT 1',req.id)]);
 if(!p||p.status!=='pending_review'||p.title!==req.expectedTitle||p.copy!==req.expectedCopy||
 p.image_url!==req.expectedImageUrl||p.image_alt!==req.expectedImageAlt||p.image_quality_status!==req.expectedImageStatus||
 p.scheduled_at||p.published_at||p.approved_by||p.approved_at||Number(p.image_approved||0)!==0)throw Error('D1 source no longer pending in exact version; no changes');
 if(link)throw Error('Metricool mapping already exists; readback and reconcile manually; never double insert');
 const prior=await one('SELECT * FROM social_post_quality_reviews WHERE post_id=? ORDER BY reviewed_at DESC LIMIT 1',p.id);
 if(!prior||prior.decision!=='NEEDS_HUMAN_REVIEW'||prior.content_fingerprint!==fingerprint(p)||prior.image_url!==p.image_url||!prior.image_sha256)throw Error('Current source-bound AI review missing');
 const priorEv=JSON.parse(prior.evidence_json||'{}');
 if(priorEv.checks?.duplicate?.result!=='DEFER')throw Error('Historical duplicate check not currently DEFER; scope changed');
 const image=await fetch(p.image_url,{signal:AbortSignal.timeout(30000)});
 if(!image.ok||hash(Buffer.from(await image.arrayBuffer()))!==prior.image_sha256)throw Error('Original brand image bytes changed');
 if(await one('SELECT post_id FROM social_publish_deliveries WHERE post_id=? LIMIT 1',p.id))throw Error('Existing platform deliveries, reconcile instead of writing another');
 report.sourceVersionVerified=true;
 const now=new Date().toISOString();
 const externalTemplate={id:ext.postId,uuid:ext.uuid,text:p.copy,
  publicationDate:{dateTime:"2026-11-10T11:00:00",timezone:"Asia/Taipei"},
  media:[ext.mediaUrl],mediaAltText:[p.image_alt],draft:false,autoPublish:true,
  providers:ext.receipts.map(r=>({network:r.platform,status:'PUBLISHED',url:r.url})),
  owner_direct_single_post:true,duplicate_fully_verified:false,reviewer_impersonated:false};
 const insertLink=sql("INSERT INTO social_metricool_sync(post_id,metricool_id,uuid,publication_at,content_fingerprint,state,attempts,last_error,template_json,last_sync_at,updated_at) SELECT ?,?,?,?,?,'published',1,'',?,?,? WHERE NOT EXISTS(SELECT 1 FROM social_metricool_sync WHERE post_id=?) AND EXISTS(SELECT 1 FROM social_posts WHERE id=? AND status='pending_review' AND copy=? AND image_url=? AND approved_by IS NULL AND published_at IS NULL)",
 p.id,ext.postId,ext.uuid,ext.scheduledAt,prior.content_fingerprint,JSON.stringify(externalTemplate),now,now,p.id,p.id,p.copy,p.image_url);
 const inserts=ext.receipts.map(receipt=>{
 const response={source:'Metricool official connector',id:ext.postId,uuid:ext.uuid,provider:receipt.platform,
  platformStatus:'PUBLISHED',publicUrl:receipt.url,observedAt:now,ownerDirectException:true,
  historicalReviewDecision:'NEEDS_HUMAN_REVIEW',historicalDuplicateStatus:'DEFER'};
 return sql("INSERT INTO social_publish_deliveries(post_id,platform,status,attempt_count,last_attempt_at,published_at,remote_id,response_json,error_text,created_at,updated_at) SELECT ?,?,'published',1,?,?,?,?, '',?,? WHERE NOT EXISTS(SELECT 1 FROM social_publish_deliveries WHERE post_id=? AND platform=?) AND EXISTS(SELECT 1 FROM social_metricool_sync WHERE post_id=? AND metricool_id=? AND uuid=? AND state='published')",
 p.id,receipt.platform,now,now,receipt.url,JSON.stringify(response),now,now,p.id,receipt.platform,p.id,ext.postId,ext.uuid);
 });
 const published=sql("UPDATE social_posts SET status='published',published_at=?,scheduled_at=NULL,proposed_scheduled_at=NULL,review_note=?,updated_at=? WHERE id=? AND status='pending_review' AND updated_at=? AND title=? AND copy=? AND image_url=? AND image_alt=? AND image_quality_status=? AND approved_by IS NULL AND approved_at IS NULL AND published_at IS NULL AND scheduled_at IS NULL AND COALESCE(image_approved,0)=0 AND EXISTS(SELECT 1 FROM social_metricool_sync WHERE post_id=social_posts.id AND metricool_id=? AND uuid=? AND state='published') AND (SELECT COUNT(*) FROM social_publish_deliveries WHERE post_id=social_posts.id AND status='published' AND platform IN ('facebook','instagram','threads') AND TRIM(COALESCE(remote_id,''))<>'')=3",
 now,'使用者11/10明確單篇直接發布授權；Metricool三平台PUBLISHED實連回執，原AI歷史去重DEFER未改判、未冒充16/16核准。',now,p.id,p.updated_at,p.title,p.copy,p.image_url,p.image_alt,p.image_quality_status,ext.postId,ext.uuid);
 const audit=sql("INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) SELECT ?,'chatgpt-assistant:owner-direct-instruction','單篇使用者明確發布後三平台正式回執對帳；不偽造AI或人工16項核准','貼文',?,?,?,'' WHERE changes()=1",
 'AUD-'+crypto.randomUUID(),p.id,JSON.stringify({status:p.status,review:prior.id,duplicate:'DEFER',sourceImageSha:prior.image_sha256}),
 JSON.stringify({status:'published',verifiedAt:now,metricoolId:ext.postId,uuid:ext.uuid,providerReceipts:ext.receipts,ownerDirectException:true,all16ChecksNotPassed:true}));
 const out=await query([insertLink,...inserts,published,audit].join(';\n'));
 if(out.length!==6||out.some((x,i)=>x.meta?.changes!==1))throw Error('Expected exactly one write per mapping, 3 providers, local publish and audit; observed '+JSON.stringify(out.map(x=>x.meta?.changes)));
 const [back,l,delivery]=await Promise.all([
  one('SELECT status,copy,image_url,approved_by,approved_at,image_approved,scheduled_at,published_at FROM social_posts WHERE id=?',p.id),
  one('SELECT metricool_id,uuid,publication_at,state FROM social_metricool_sync WHERE post_id=?',p.id),
  query(sql('SELECT platform,status,remote_id,response_json FROM social_publish_deliveries WHERE post_id=? ORDER BY platform',p.id))
 ]);
 const rows=delivery[0]?.results||[];
 if(back?.status!=='published'||back.copy!==p.copy||back.image_url!==p.image_url||
 !back.published_at||back.approved_by||back.approved_at||Number(back.image_approved||0)!==0||
 l?.state!=='published'||Number(l.metricool_id)!==ext.postId||l.uuid!==ext.uuid||
 rows.length!==3||rows.some(x=>x.status!=='published'||!ext.receipts.some(r=>r.platform===x.platform&&r.url===x.remote_id)))
 throw Error('D1 exact provider or local publish readback mismatch');
 Object.assign(report,{d1Linked:true,d1Published:true,platformsRecorded:rows.map(x=>x.platform),readback:true,publishedAtVerified:back.published_at,externalUrls:ext.receipts.map(x=>x.url)});
}catch(err){report.blocker=String(err?.message||err).slice(0,650)}
report.counts=(await query('SELECT status,COUNT(*) AS count FROM social_posts GROUP BY status ORDER BY status'))[0]?.results||[];
fs.writeFileSync('owner-direct-published-reconcile-result.json',JSON.stringify(report,null,2)+'\n');
console.log('OWNER_DIRECT_PUBLISHED_RECONCILE '+JSON.stringify(report));
if(!report.readback)process.exitCode=1;
