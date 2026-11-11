// 仙加味：受保護的正式產品情境相片精準換版（只動待審稿，AI不核准也不發布）
// New source binaries must be committed to latest GitHub main BEFORE this D1 writer runs.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {createD1Transport} from './d1-http-transport.mjs';
const require=createRequire(import.meta.url),{fingerprint}=require('./metricool-free-evidence.cjs');
const requestPath=process.env.PENDING_IMAGE_PROMOTION_REQUEST;
if(!/^ops\/pending-image-promotion-requests\/[A-Za-z0-9_-]+\.json$/.test(requestPath||''))throw Error('Missing safe image promotion request');
const req=JSON.parse(fs.readFileSync(requestPath,'utf8'));
if(req.mode!=='official_photo_pending_only'||req.noAIApproval!==true||req.noHumanApproval!==true||
 req.noSchedule!==true||req.noPublication!==true||!Array.isArray(req.items)||
 req.items.length<1||req.items.length>10||new Set(req.items.map(x=>x.id)).size!==req.items.length)
 throw Error('Unsafe request or duplicate item');
const srcPrefix='https://raw.githubusercontent.com/TS15825868/xianjiawei-internal/main/';
const dbid=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];
const query=createD1Transport({token:process.env.CLOUDFLARE_API_TOKEN,accountId:process.env.CLOUDFLARE_ACCOUNT_ID,databaseId:dbid});
const q=x=>x==null?'NULL':typeof x==='number'&&Number.isFinite(x)?String(x):"'"+String(x).replaceAll("'","''")+"'";
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function one(sql){return(await query(sql))[0]?.results?.[0]||null}
const manifest=JSON.parse(fs.readFileSync('ops/visual-previews/20261110-official-source-composite-v8/manifest.json','utf8'));
const prepared=[];
for(const fix of req.items){
 if(!/^[A-Za-z0-9_-]+$/.test(fix.id||'')||
  !/^assets\/post-images\/2026-11-11\/formal-production\/[A-Za-z0-9_-]+-reviewed-v2\.jpg$/.test(fix.newImagePath||'')||
  !/^ops\/visual-previews\/20261110-official-source-composite-v8\/[A-Za-z0-9_-]+-wood_patch-preview\.jpg$/.test(fix.previewPath||'')||
  !/^[a-f0-9]{64}$/.test(fix.previewSHA256||'')||
  !/^[a-f0-9]{64}$/.test(fix.expectedImageSHA256||'')||
  !String(fix.expectedImageURL||'').startsWith(srcPrefix)||
  !String(fix.expectedUpdatedAt||'').trim())
  throw Error('Incomplete source and current D1 CAS lease');
 const m=manifest.previews.find(x=>x.id===fix.id&&x.approach==='wood_patch');
 if(!m||m.previewPath!==fix.previewPath||m.previewSHA256!==fix.previewSHA256||
 m.imageNotYetApproved!==true||m.officialPixelsPreservedExceptGeometricScale!==true||
 !m.productTypes?.includes(fix.productType)||
 manifest.sourceAssetDetails?.[fix.productType]?.blob!==fix.officialProductBlob)
  throw Error('Official source/visual inspection provenance missing or modified');
 const bytes=fs.readFileSync(fix.newImagePath);
 if(bytes.length<50000||sha(bytes)!==fix.previewSHA256||
  sha(fs.readFileSync(fix.previewPath))!==fix.previewSHA256)
  throw Error('Official full-sized final photo pixels not equal approved preview candidate');
 const p=await one('SELECT * FROM social_posts WHERE id='+q(fix.id));
 if(!p||p.status!=='pending_review'||p.published_at||p.scheduled_at||p.approved_by||p.approved_at||
  Number(p.image_approved||0)!==0||p.image_quality_status!=='clear'||
  p.updated_at!==fix.expectedUpdatedAt||p.image_url!==fix.expectedImageURL)
  throw Error('Latest post source changed; no image data may be overwritten');
 const [maps,delivery]=await Promise.all([
  one('SELECT COUNT(*) AS n FROM social_metricool_sync WHERE post_id='+q(fix.id)),
  one('SELECT COUNT(*) AS n FROM social_publish_deliveries WHERE post_id='+q(fix.id))
 ]);
 if(!maps||!delivery||Number(maps.n)!==0||Number(delivery.n)!==0)
  throw Error('The pending post has external mapping or delivery; stop safely');
 const prior=await one('SELECT * FROM social_post_quality_reviews WHERE post_id='+q(fix.id)+' ORDER BY reviewed_at DESC,id DESC LIMIT 1');
 if(prior?.decision!=='NEEDS_HUMAN_REVIEW'||prior.content_fingerprint!==fingerprint(p)||
  prior.image_url!==p.image_url||prior.image_sha256!==fix.expectedImageSHA256)
   throw Error('Latest immutable review changed or unbound');
 const currentMediaPath=p.image_url.slice(srcPrefix.length);
 if(!p.image_url.startsWith(srcPrefix)||!/^assets\\/post-images\\/[A-Za-z0-9./_-]+\\.(?:jpg|jpeg|png|webp)$/.test(currentMediaPath)||
    !fs.existsSync(currentMediaPath)||sha(fs.readFileSync(currentMediaPath))!==fix.expectedImageSHA256)
    throw Error('Original current media bytes drifted from latest D1 SHA');
 const e=JSON.parse(prior.evidence_json||'{}');
 if(e.checks?.duplicate?.result!=='DEFER'||e.checks?.compliance_final?.result!=='DEFER'||
    e.image_sha256!==prior.image_sha256)throw Error('Pending history/compliance evidence missing');
 const owner=await one('SELECT role,active FROM profiles WHERE email='+q(prior.authorized_by));
 if(!owner?.active||!['owner','admin'].includes(owner.role))
  throw Error('Existing source-bound owner delegation unavailable');
 prepared.push({fix,p,prior,e,bytes,newURL:srcPrefix+fix.newImagePath});
}
const before=(await query('SELECT status,COUNT(*) AS count FROM social_posts GROUP BY status ORDER BY status'))[0]?.results||[];
const receipt={schema:'xjw-pending-real-photo-v2-d1-receipt',requested:prepared.length,verified:0,complete:false,
 createdAt:new Date().toISOString(),aiApproval:0,humanApproval:0,scheduled:0,published:0,
 countsBefore:before,records:[]};
const checkpoint=()=>fs.writeFileSync('/tmp/final-photo-pending-receipt.json',JSON.stringify(receipt,null,2)+'\n');
checkpoint();
try{
 for(const {fix,p,prior,e,bytes,newURL} of prepared){
  const now=new Date().toISOString();
  const imageSource='正式官網商品原圖'+fix.productType+'；原圖Git blob '+fix.officialProductBlob+
    '；產品與場景比例保留；20261111已逐張檢視；不代表歷史去重通過';
  const newPost={...p,image_url:newURL,image_source:imageSource,image_quality_status:'clear',image_bytes:bytes.length};
  const nextFp=fingerprint(newPost);
  const newReviewId='AI-IMAGE-V2-'+sha(fix.id+'|'+nextFp).slice(0,35);
  const ev={...e,post_id:fix.id,reviewer_type:'AI',model:'ChatGPT-source-bound-photo-v2',
    reviewed_at:now,content_fingerprint:nextFp,image_url:newURL,image_sha256:fix.previewSHA256,
    visual:{...e.visual,image_sha256:fix.previewSHA256},
    scene_composite_source:{preview:fix.previewPath,sha256:fix.previewSHA256,
      officialProductBlob:fix.officialProductBlob,productType:fix.productType,
      editorNotes:fix.visualInspection,originalProductLabelPreserved:true,
      sourceVisualVerified:true,fullHistoricalMediaDedup:false},
    checks:{...e.checks,
      product:{result:'PASS',evidence:'原始正式產品實物圖標籤與照片等比例融入生活場景，非AI重新設計；'+fix.visualInspection},
      physical_scale:{result:'PASS',evidence:'已直接檢查源照片與玻璃罐／商品實物尺寸：不變形、比例正確且不遮擋；'+fix.visualInspection},
      duplicate:{result:'DEFER',evidence:'132篇已發布文案無完全重複，但仍有歷史媒體缺證，原有DEFER不擅自覆蓋'},
      compliance_final:{result:'DEFER',evidence:'包裝圖片及圖文來源已核對，正式最後合規需連同歷史去重完成；不得代替人工核准'}
    },assessment:{decision:'NEEDS_HUMAN_REVIEW',reasons:['圖片重製完成，歷史視覺去重資料尚不完整；保留待審']}};
  const statement=`UPDATE social_posts SET image_url=${q(newURL)},image_source=${q(imageSource)},
    image_quality_status='clear',image_bytes=${bytes.length},
    review_note=${q('已核對真實商品照片與圖文；跨平台歷史圖片去重仍待補證，不自動核准發布')},
    updated_at=${q(now)}
    WHERE id=${q(fix.id)} AND status='pending_review' AND updated_at=${q(p.updated_at)}
    AND image_url=${q(p.image_url)} AND image_quality_status='clear'
    AND approved_by IS NULL AND approved_at IS NULL AND scheduled_at IS NULL AND published_at IS NULL
    AND COALESCE(image_approved,0)=0
    AND NOT EXISTS(SELECT 1 FROM social_metricool_sync m WHERE m.post_id=${q(fix.id)})
    AND NOT EXISTS(SELECT 1 FROM social_publish_deliveries d WHERE d.post_id=${q(fix.id)});
    INSERT INTO social_post_quality_reviews(
      id,post_id,reviewer_type,decision,content_fingerprint,image_url,image_sha256,evidence_json,
      model,policy_version,authorized_by,reviewed_at,old_status,new_status)
    SELECT ${[newReviewId,fix.id,'AI','NEEDS_HUMAN_REVIEW',nextFp,newURL,fix.previewSHA256,
      JSON.stringify(ev),ev.model,prior.policy_version,prior.authorized_by,now,
      'pending_review','pending_review'].map(q).join(',')}
    WHERE changes()=1 AND EXISTS(
      SELECT 1 FROM social_posts p WHERE p.id=${q(fix.id)} AND p.status='pending_review'
      AND p.updated_at=${q(now)} AND p.image_url=${q(newURL)}
      AND p.approved_by IS NULL AND p.published_at IS NULL)`;
  const result=await query(statement);
  if(result.length!==2||result[0]?.meta?.changes!==1||result[1]?.meta?.changes!==1)
    throw Error('Image and evidence D1 transaction did not mutate exactly one post/review');
  const [after,review]=await Promise.all([
    one('SELECT * FROM social_posts WHERE id='+q(fix.id)),
    one('SELECT * FROM social_post_quality_reviews WHERE id='+q(newReviewId))
  ]);
  if(!after||after.status!=='pending_review'||after.image_url!==newURL||
    after.image_bytes!==bytes.length||after.updated_at!==now||after.image_approved!==0||
    after.approved_by||after.approved_at||after.scheduled_at||after.published_at||
    fingerprint(after)!==nextFp||after.copy!==p.copy||after.title!==p.title||
    !review||review.decision!=='NEEDS_HUMAN_REVIEW'||review.content_fingerprint!==nextFp||
    review.image_sha256!==fix.previewSHA256||
    JSON.parse(review.evidence_json).checks?.duplicate?.result!=='DEFER')
    throw Error('Post/review content version or pending-only CAS readback failed');
  receipt.records.push({id:fix.id,status:'pending_review',newImageURL:newURL,
    newImageSHA256:fix.previewSHA256,imageBytes:bytes.length,
    currentFingerprint:nextFp,reviewId:newReviewId,duplicate:'DEFER',compliance_final:'DEFER',
    verified:true});
  receipt.verified++;checkpoint();
 }
 const counts=(await query('SELECT status,COUNT(*) AS count FROM social_posts GROUP BY status ORDER BY status'))[0]?.results||[];
 receipt.countsAfter=counts;
 if(JSON.stringify(before)!==JSON.stringify(counts))throw Error('Post status totals unexpectedly changed');
 receipt.complete=true;receipt.finishedAt=new Date().toISOString();checkpoint();
 console.log('VERIFIED_PENDING_REAL_PHOTO_UPDATE',JSON.stringify({verified:receipt.verified,complete:receipt.complete,approved:0,published:0}));
}catch(err){receipt.error=String(err?.message||'failed').slice(0,280);checkpoint();throw err}
