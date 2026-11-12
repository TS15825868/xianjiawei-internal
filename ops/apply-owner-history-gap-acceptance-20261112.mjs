// One-time owner-delegated historical gap acknowledgement. No AI or human approval, no publishing.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {createD1Transport} from '../tools/d1-http-transport.mjs';
import {duplicatePostErrors,productMatchErrors} from '../src/publishing-review-gate-entry.js';
const require=createRequire(import.meta.url),{fingerprint}=require('../tools/metricool-free-evidence.cjs');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const req=read('ops/request-owner-history-gap-acceptance-20261112.json');
if(req.schema!=='xjw-owner-delegated-historical-gap-acceptance-v1'||req.rows.length!==49||new Set(req.rows.map(r=>r.id)).size!==49||req.allowAIApproval!==false||req.allowHumanApproval!==false||req.allowSchedule!==false||req.allowPublish!==false||req.missingHistoricalMedia!==15)throw Error('Unsafe owner scope');
const currentImage=read('current-vs-archived-visual-report.json'),currentCopy=read('all-active-history-dedup-screen.json'),priorImage=read('ops/history-cache-increment-20261107.json'),priorPairs=read(req.knownPairReview),priorReceipt=read('ops/receipts/20261112-49-visual-observation-d1.json');
if(currentImage.pendingScanned!==49||currentCopy.activePosts!==49||currentCopy.historyRows<132||currentImage.d1Mutations!==0||currentCopy.d1Mutations!==0||priorReceipt.verifiedCount!==49)throw Error('Incomplete current source audit');
const db=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];
const query=createD1Transport({token:process.env.CLOUDFLARE_API_TOKEN,accountId:process.env.CLOUDFLARE_ACCOUNT_ID,databaseId:db,timeoutMs:45000});
const rows=async s=>(await query(s))[0].results;
const quote=x=>x==null?'NULL':"'"+String(x).replaceAll("'","''")+"'";
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const [posts,latest]=await Promise.all([rows("SELECT * FROM social_posts ORDER BY id"),rows("SELECT * FROM (SELECT *,ROW_NUMBER() OVER(PARTITION BY post_id ORDER BY reviewed_at DESC,rowid DESC) AS rank FROM social_post_quality_reviews) WHERE rank=1")]);
if(posts.filter(p=>p.status==='pending_review').length!==49)throw Error('Pending scope changed');
const pmap=new Map(posts.map(p=>[p.id,p])),rmap=new Map(latest.map(r=>[r.post_id,r])),cmap=new Map(currentCopy.rows.map(r=>[r.id,r])),oldMap=new Map(priorImage.records.map(r=>[r.id,r]));
const pairKey=(a,b)=>[a,b].sort().join('|');
const verifiedPairs=new Set(priorPairs.pairs.filter(p=>p.visualDecision==='DISTINCT_IMAGE_IN_AVAILABLE_PAIR').map(p=>pairKey(p.current,p.reference)));
const changed=new Set(req.rows.filter(a=>oldMap.get(a.id)?.sha256!==a.imageSha).map(a=>a.id));
const ready=[],held=[];
const CHECKS=['brand','product','specification','pricing_activity','season','weather','occasion','location','scene_environment','temperature','expression','action','mascot_companions','physical_scale','duplicate','compliance_final'];
for(const a of req.rows){
 try{
 const p=pmap.get(a.id),r=rmap.get(a.id),c=cmap.get(a.id);
 if(!p||!r||!c||p.status!=='pending_review'||p.approved_by||p.approved_at||p.scheduled_at||p.published_at||Number(p.image_approved||0)||p.title!==a.expectedTitle||p.copy!==a.expectedCopy||r.id!==a.reviewId||r.image_sha256!==a.imageSha||r.image_url!==p.image_url||fingerprint(p)!==r.content_fingerprint||c.copyImageFingerprint!==r.content_fingerprint||c.copySHA256!==sha(p.copy))throw Error('Version changed');
 const e=JSON.parse(r.evidence_json);
 if(r.decision!=='NEEDS_HUMAN_REVIEW'||e.content_fingerprint!==r.content_fingerprint||e.image_sha256!==a.imageSha||e.current_image_visual_observation?.sha256!==a.imageSha||CHECKS.some(k=>e.checks?.[k]?.result!==(k==='duplicate'?'DEFER':'PASS')))throw Error('Not exactly 15 PASS and 1 historical DEFER');
 const blockers=[...productMatchErrors(p),...await duplicatePostErrors(null,p,posts)];
 if(req.topicHoldIds.includes(a.id))blockers.push(req.topicHoldReason);
 if(c.highestPublishedSimilarity>=.16||c.highestPendingSimilarity>=.16)blockers.push('Current caption similarity requires editorial review: '+JSON.stringify({published:c.publishedCandidates.slice(0,2),pending:c.pendingCandidates.slice(0,2)}));
 if(!changed.has(a.id)&&oldMap.get(a.id)?.exactHistoricalMatch!==false)blockers.push('Prior exact historical comparison not verified');
 const pairs=currentImage.imageNearPairs.filter(x=>x.current===a.id||x.reference===a.id);
 for(const pair of pairs){
 if(pair.exactFile||changed.has(pair.current)||changed.has(pair.reference)||!verifiedPairs.has(pairKey(pair.current,pair.reference)))blockers.push('New or unresolved image pair: '+JSON.stringify(pair));
 }
 if(blockers.length){held.push({id:a.id,title:p.title,reasons:[...new Set(blockers)]});continue;}
 const path=p.image_url.replace('https://raw.githubusercontent.com/TS15825868/xianjiawei-internal/main/','').split('?')[0];
 if(!/^(assets\/post-images\/|media\/social-candidates\/)/.test(path)||path.split('/').includes('..')||sha(fs.readFileSync(path))!==a.imageSha)throw Error('Current source bytes changed');
 const now=new Date().toISOString();
 const record={schema:req.schema,fingerprint:r.content_fingerprint,image_url:p.image_url,image_sha256:a.imageSha,ai_review_id:r.id,outcome:'owner_gap_accepted_for_human_review',scope:'Owner-delegated acknowledgement of inaccessible historical sources only. Current repository source screen and 132 available published captions checked. Prior 178-file exact/perceptual screen applies only to same-hash images.',finding:a.observation,authorization_ref:'ops/request-owner-history-gap-acceptance-20261112.json',authorization_actor:'ChatGPT acting on explicit owner instruction; not authenticated human approval',historical_media_missing:15,older_carousel_children_may_be_missing:true,legacy178_same_sha:!changed.has(a.id),additional_scope_limit:changed.has(a.id)?'New image compared against currently readable repository archive/published files; previous scratch corpus of 178 files is not currently available for fresh comparison.':'Previous 178-file comparison bound to identical source SHA.',current_available_image_reference_count:currentImage.referenceImages,current_published_caption_count:currentCopy.historyRows,ai_duplicate:'DEFER',ai_approved:false,human_approved:false,may_enter_human_review:true,auto_schedule:false,auto_publish:false,reviewed_at:now};
 const proof=JSON.stringify(record),id='HIST-OWNER-GAP-'+sha(a.id+'|'+r.id+'|'+a.imageSha);
 const existing=(await rows("SELECT id,after_json FROM audit_logs WHERE id="+quote(id)))[0];
 if(existing){const prior=JSON.parse(existing.after_json);if(prior.fingerprint!==record.fingerprint||prior.image_sha256!==record.image_sha256||prior.ai_review_id!==r.id||prior.outcome!==record.outcome)throw Error('Conflicting existing acknowledgement');ready.push({id:a.id,title:p.title,receipt:id,readback:true,idempotent:true});continue;}
 const s="INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,after_json,ip) SELECT "+[id,'chatgpt:owner-delegated','歷史缺件授權覆核','貼文',p.id,proof,''].map(quote).join(',')+" WHERE EXISTS(SELECT 1 FROM social_posts WHERE id="+quote(p.id)+" AND updated_at="+quote(p.updated_at)+" AND status='pending_review' AND published_at IS NULL AND scheduled_at IS NULL AND approved_by IS NULL AND approved_at IS NULL AND COALESCE(image_approved,0)=0) AND "+quote(r.id)+"=(SELECT id FROM social_post_quality_reviews WHERE post_id="+quote(p.id)+" ORDER BY reviewed_at DESC,rowid DESC LIMIT 1)";
 const w=await query(s);
 const back=(await rows("SELECT id,after_json FROM audit_logs WHERE id="+quote(id)+" AND entity_id="+quote(p.id)))[0];
 if(w[0]?.meta?.changes!==1||back?.after_json!==proof)throw Error('Audit CAS or readback failed');
 ready.push({id:a.id,title:p.title,receipt:id,readback:true,legacy178SameSHA:!changed.has(a.id)});
 }catch(e){held.push({id:a.id,reasons:[String(e.message)]});}
}
const counts=await rows("SELECT status,COUNT(*) count FROM social_posts GROUP BY status");
const receipt={schema:'xjw-owner-historical-gap-readback-v1',at:new Date().toISOString(),readyForHumanReview:ready.length,held:held.length,ready,heldRows:held,counts,aiApprovals:0,humanApprovals:0,schedules:0,publications:0,fullHistoricalDedupCertified:false};
fs.writeFileSync('ops/receipts/20261112-owner-history-gap-readback.json',JSON.stringify(receipt,null,2)+'\n');
console.log('OWNER_GAP_READBACK',JSON.stringify(receipt));
