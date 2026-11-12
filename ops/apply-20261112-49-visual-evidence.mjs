import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {createD1Transport} from '../tools/d1-http-transport.mjs';
const require=createRequire(import.meta.url);
const {fingerprint}=require('../tools/metricool-free-evidence.cjs');
const req=JSON.parse(fs.readFileSync('ops/request-20261112-49-visual-evidence-write.json','utf8'));
if(req.schema!=='xjw-current-49-ai-visual-partial-evidence-v1'||req.rows.length!==49||new Set(req.rows.map(x=>x.id)).size!==49||req.allowApproval!==false||req.allowPublication!==false)throw Error('Unsafe review scope');
const dbid=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];
const query=createD1Transport({token:process.env.CLOUDFLARE_API_TOKEN,accountId:process.env.CLOUDFLARE_ACCOUNT_ID,databaseId:dbid,timeoutMs:45000});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const q=x=>x==null?'NULL':"'"+String(x).replaceAll("'","''")+"'";
const rows=async s=>(await query(s))[0].results;
const prefix='https://raw.githubusercontent.com/TS15825868/xianjiawei-internal/main/';
const [posts,reviews]=await Promise.all([
rows("SELECT * FROM social_posts WHERE status='pending_review'"),
rows("SELECT * FROM (SELECT *,ROW_NUMBER() OVER(PARTITION BY post_id ORDER BY reviewed_at DESC,rowid DESC) AS rank FROM social_post_quality_reviews) WHERE rank=1")
]);
if(posts.length!==49||new Set(posts.map(p=>p.id)).size!==49)throw Error('Live pending scope changed; no writes');
const postMap=new Map(posts.map(p=>[p.id,p])),reviewMap=new Map(reviews.map(p=>[p.post_id,p]));
const verified=[],skipped=[];
for(const a of req.rows){
 try{
 const p=postMap.get(a.id),r=reviewMap.get(a.id);
 if(!p||!r||p.title!==a.expectedTitle||p.copy!==a.expectedCopy||p.approved_at||p.scheduled_at||p.published_at||r.decision!=='NEEDS_HUMAN_REVIEW'||fingerprint(p)!==r.content_fingerprint||r.image_url!==p.image_url||r.image_sha256!==a.expectedSha)throw Error('Current copy, image, review or state changed');
 if(!p.image_url.startsWith(prefix))throw Error('Unexpected image source');
 const path=p.image_url.slice(prefix.length).split('?')[0];
 if(!/^(assets\/post-images\/|media\/social-candidates\/)/.test(path)||path.split('/').includes('..'))throw Error('Unsafe image path');
 const data=fs.readFileSync(path);
 if(sha(data)!==a.expectedSha)throw Error('Image byte fingerprint differs from inspected image');
 const e=JSON.parse(r.evidence_json);
 if(e.checks?.duplicate?.result!=='DEFER'||e.content_fingerprint!==r.content_fingerprint||e.image_sha256!==a.expectedSha)throw Error('Latest duplicate or evidence binding changed');
 if(e.current_image_visual_observation?.request==='ops/request-20261112-49-visual-evidence-write.json'){skipped.push({id:a.id,reason:'Already recorded for same version'});continue;}
 const now=new Date().toISOString();
 e.current_image_visual_observation={request:'ops/request-20261112-49-visual-evidence-write.json',reviewed_at:now,source:a.sourceGalleryCell,sha256:a.expectedSha,bytes:data.length,observation:a.observation,potentialTopicOverlap:a.potentialTopicOverlap,scope:'Actual image viewed; does not certify full historical dedup or manual approval'};
 const priorDuplicate=e.checks.duplicate;
 e.checks.duplicate={...priorDuplicate,result:'DEFER',current_image_visual_observation:a.observation,available_source_comparison:'See 20261112-current-vs-archived-all-49 and ten-pairs-actual-visual-findings; those reports predate five updated images, so they cannot certify this current image against all historical media.',remaining_gap:'15 inaccessible historical media plus possible older carousel children; do not mark PASS or AI_APPROVED'};
 e.reviewed_at=now;e.inherited_from_review_id=r.id;
 const proof=JSON.stringify(e),id='AI-DEFER-'+sha(proof);
 const s="INSERT INTO social_post_quality_reviews(id,post_id,reviewer_type,decision,content_fingerprint,image_url,image_sha256,evidence_json,model,policy_version,authorized_by,reviewed_at,old_status,new_status) SELECT "+[id,p.id,'AI','NEEDS_HUMAN_REVIEW',r.content_fingerprint,p.image_url,a.expectedSha,proof,'ChatGPT','2026-10-31-ai-deferral-only-v1',r.authorized_by,now,'pending_review','pending_review'].map(q).join(',')+" WHERE EXISTS(SELECT 1 FROM social_posts WHERE id="+q(p.id)+" AND updated_at="+q(p.updated_at)+" AND status='pending_review' AND approved_at IS NULL AND scheduled_at IS NULL AND published_at IS NULL) AND "+q(r.id)+"=(SELECT id FROM social_post_quality_reviews WHERE post_id="+q(p.id)+" ORDER BY reviewed_at DESC,rowid DESC LIMIT 1)";
 const w=await query(s);
 const back=(await rows("SELECT id,evidence_json,image_sha256 FROM social_post_quality_reviews WHERE post_id="+q(p.id)+" ORDER BY reviewed_at DESC,rowid DESC LIMIT 1"))[0];
 if(w[0]?.meta?.changes!==1||back?.id!==id||back.evidence_json!==proof||back.image_sha256!==a.expectedSha)throw Error('CAS or exact readback failed');
 verified.push({id:p.id,reviewId:id,imageSha:a.expectedSha,missing:Object.keys(e.checks).filter(k=>e.checks[k].result!=='PASS')});
 }catch(e){skipped.push({id:a.id,reason:String(e.message)});}
}
const counts=await rows('SELECT status,COUNT(*) count FROM social_posts GROUP BY status');
const receipt={schema:'xjw-49-visual-observation-d1-receipt-v1',capturedAt:new Date().toISOString(),verifiedCount:verified.length,skippedCount:skipped.length,verified,skipped,counts,aiApprovals:0,humanApprovals:0,schedules:0,publications:0};
fs.mkdirSync('ops/receipts',{recursive:true});
fs.writeFileSync('ops/receipts/20261112-49-visual-observation-d1.json',JSON.stringify(receipt,null,2)+'\n');
console.log('VISUAL_OBSERVATION_D1_RECEIPT',JSON.stringify(receipt));
