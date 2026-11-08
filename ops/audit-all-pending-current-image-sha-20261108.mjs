// Read-only integrity audit for EVERY current pending social image against its latest review evidence.
// Inspect GitHub-checked-out actual bytes; no D1 mutation, AI approval, scheduling, or publishing.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {fingerprint}=require('../tools/metricool-free-evidence.cjs');
const req=JSON.parse(fs.readFileSync('ops/request-all-pending-image-sha-audit-20261108.json','utf8'));
if(req.scope!=='all-current-pending-image-sha-readonly'||req.mutateD1!==false||req.allowApproval!==false||req.allowPublication!==false)throw Error('Unsafe audit request');
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
const database=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];
if(!token||!account||!database)throw Error('D1 read credentials not available');
async function query(sql){
 const url='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+database+'/query';
 const response=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql}),signal:AbortSignal.timeout(45000)});
 const body=await response.json();
 if(!response.ok||!body.success||!Array.isArray(body.result)||body.result.some(x=>x.success===false))throw Error('D1 read failed: '+JSON.stringify(body.errors||[]).slice(0,180));
 return body.result[0]?.results||[];
}
const countSql='SELECT status, COUNT(*) AS count FROM social_posts GROUP BY status ORDER BY status';
const initialCounts=await query(countSql);
const pendingCount=Number(initialCounts.find(x=>x.status==='pending_review')?.count||0);
const posts=await query("SELECT * FROM social_posts WHERE status='pending_review' ORDER BY id");
const latest=await query("SELECT q.* FROM social_post_quality_reviews q WHERE q.post_id IN (SELECT id FROM social_posts WHERE status='pending_review') AND q.reviewed_at=(SELECT MAX(t.reviewed_at) FROM social_post_quality_reviews t WHERE t.post_id=q.post_id) ORDER BY q.post_id,q.reviewed_at,q.id");
const byId=new Map(latest.map(x=>[x.post_id,x]));
const rootPrefix='https://raw.githubusercontent.com/TS15825868/xianjiawei-internal/main/';
const base=process.cwd();
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const records=posts.map(p=>{
 const errors=[],record={id:p.id,title:p.title,imageUrl:p.image_url,errors};
 const review=byId.get(p.id);
 if(!review){errors.push('latest_review_missing');return record}
 record.reviewId=review.id;
 record.decision=review.decision;
 if(p.image_quality_status!=='clear'&&p.image_quality_status!=='passed')errors.push('image_quality_unresolved');
 if(!p.image_url||!p.image_url.startsWith(rootPrefix))errors.push('image_origin_not_this_github_main');
 if(review.image_url!==p.image_url)errors.push('review_image_url_stale');
 let evidence={};try{evidence=JSON.parse(review.evidence_json||'{}')}catch{errors.push('review_evidence_invalid_json')}
 const calculatedFingerprint=fingerprint(p);
 if(review.content_fingerprint!==calculatedFingerprint||evidence.content_fingerprint!==calculatedFingerprint)errors.push('review_fingerprint_stale');
 if(evidence.checks?.duplicate?.result!=='DEFER')errors.push('duplicate_decision_unexpected');
 if(!review.image_sha256||evidence.image_sha256!==review.image_sha256)errors.push('image_sha_evidence_missing_or_conflicting');
 if(p.image_url?.startsWith(rootPrefix)){
  try{
   const rel=decodeURIComponent(p.image_url.slice(rootPrefix.length));
   if(!/^(assets\/post-images|media\/social-candidates)\//.test(rel)||rel.split('/').includes('..')||rel.includes('\\'))throw Error('outside approved asset roots');
   const filePath=path.resolve(base,rel);
   if(!filePath.startsWith(base+path.sep))throw Error('invalid asset path');
   const bytes=fs.readFileSync(filePath);
   record.repoPath=rel;
   record.actualSha256=sha(bytes);
   record.expectedSha256=review.image_sha256||null;
   record.actualBytes=bytes.length;
   record.metadataBytes=p.image_bytes??null;
   if(record.actualSha256!==review.image_sha256)errors.push('live_main_image_bytes_changed');
   if(p.image_bytes!=null&&Number(p.image_bytes)!==bytes.length)errors.push('stored_image_byte_length_mismatch');
  }catch(e){errors.push('cannot_verify_main_image: '+String(e.message||e).slice(0,90))}
 }
 return record;
});
const finalCounts=await query(countSql);
const countsStable=JSON.stringify(initialCounts)===JSON.stringify(finalCounts);
const idsUnique=new Set(posts.map(x=>x.id)).size===posts.length;
const snapshotsComplete=posts.length===pendingCount&&idsUnique&&countsStable&&byId.size>=posts.length;
const dup=new Map();
for(const r of records){
 if(!r.actualSha256)continue;
 const list=dup.get(r.actualSha256)||[];
 list.push(r.id);dup.set(r.actualSha256,list);
}
const exactDuplicates=[...dup.entries()].filter(([,ids])=>ids.length>1).map(([hash,ids])=>({sha256:hash,ids}));
const verified=records.filter(r=>r.errors.length===0).length;
const failures=records.filter(r=>r.errors.length>0);
const output={schema:'xjw-current-pending-actual-github-image-bytes-v1',checkedAt:new Date().toISOString(),
 source:{d1:'live direct Cloudflare D1 read',git:'checked-out GitHub main original bytes',latestReview:'D1 latest per-post image SHA and fingerprint'},
 counts:initialCounts,checked:records.length,verified,failed:failures.length,exactDuplicateGroups:exactDuplicates,
 snapshotComplete:snapshotsComplete,noHistoricalUniquenessClaim:true,aiApprovals:0,humanApprovals:0,d1Writes:0,schedules:0,publications:0,
 limitations:['This verifies D1 review SHA matches current GitHub originals; it does NOT certify all historical published image uniqueness or available carousel children','Previously missing historical 15 private cache files are not treated as resolved'],
 records};
fs.writeFileSync('all-pending-current-image-sha-report.json',JSON.stringify(output,null,2)+'\n');
console.log('CURRENT_PENDING_IMAGE_SHA',JSON.stringify({counts:initialCounts,checked:records.length,verified,failed:failures.length,exactDuplicateGroups:exactDuplicates,snapshotComplete:snapshotsComplete,errors:failures.slice(0,20).map(x=>({id:x.id,errors:x.errors})),noApprovals:true,noPublication:true}));
if(!snapshotsComplete||failures.length||exactDuplicates.length)throw Error('Current pending source image integrity mismatch or duplicate requires review');