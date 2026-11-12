// Complete the 18 remaining holds without touching the 31 acknowledged posts.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createD1Transport} from '../tools/d1-http-transport.mjs';
import {duplicatePostErrors,productMatchErrors} from '../src/publishing-review-gate-entry.js';
const require=createRequire(import.meta.url),{fingerprint}=require('../tools/metricool-free-evidence.cjs');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const req=read('ops/request-owner-gap-followup-18-20261112.json');
const prior=read(req.baselineReceipt),auth=read(req.priorAuthorization);
if(req.schema!=='xjw-owner-gap-followup-18-v1'||req.rows.length!==18||prior.readyForHumanReview!==31||prior.held!==18||req.allowApproval!==false||req.allowPublication!==false||auth.allowAIApproval!==false||auth.allowHumanApproval!==false||auth.allowSchedule!==false||auth.allowPublish!==false)throw Error('Invalid authorized scope');
const expected=new Set(prior.heldRows.map(x=>x.id));
if(new Set(req.rows.map(x=>x.id)).size!==18||req.rows.some(x=>!expected.has(x.id)))throw Error('Scope differs from prior holds');
const img=read('ops/receipts/20261112-owner-gap-current-image-screen.json'),old=read('ops/history-cache-increment-20261107.json'),pairReview=read('ops/visual-review/20261112-ten-pairs-actual-visual-findings.json');
if(img.pendingScanned!==49||img.d1Mutations!==0||img.exactFileDuplicates!==0)throw Error('Missing prior source comparison');
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN,db=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];
const query=createD1Transport({token,accountId:account,databaseId:db,timeoutMs:45000});
const rows=async s=>(await query(s))[0].results;
const q=x=>x==null?'NULL':"'"+String(x).replaceAll("'","''")+"'";
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const checks=['brand','product','specification','pricing_activity','season','weather','occasion','location','scene_environment','temperature','expression','action','mascot_companions','physical_scale','duplicate','compliance_final'];
const prefix='https://raw.githubusercontent.com/TS15825868/xianjiawei-internal/main/';
function verifyAsset(p,hash){if(!p.image_url.startsWith(prefix))throw Error('Unexpected image source');const path=p.image_url.slice(prefix.length).split('?')[0];if(!/^(assets\/post-images\/|media\/social-candidates\/)/.test(path)||path.split('/').includes('..'))throw Error('Invalid source path');const data=fs.readFileSync(path);if(sha(data)!==hash)throw Error('Image bytes differ from actual visual observation');return data.length;}
const all=await rows('SELECT * FROM social_posts ORDER BY id');
const reviews=await rows("SELECT * FROM (SELECT *,ROW_NUMBER() OVER(PARTITION BY post_id ORDER BY reviewed_at DESC,rowid DESC) AS rank FROM social_post_quality_reviews) WHERE rank=1");
if(all.filter(p=>p.status==='pending_review').length!==49)throw Error('Live pending scope differs');
const pm=new Map(all.map(p=>[p.id,p])),rm=new Map(reviews.map(r=>[r.post_id,r])),am=new Map(auth.rows.map(a=>[a.id,a]));
// Reconfirm every current pending original is identical to the version already inspected.
// No new image is introduced by this batch.
for(const p of all.filter(p=>p.status==='pending_review')){const a=am.get(p.id);if(!a)throw Error('Unknown pending image');verifyAsset(p,a.imageSha);}
const updates=[],holds=[],candidates=[];
const liveNext=all.map(p=>{const a=req.rows.find(r=>r.id===p.id);return a?{...p,...a.fix,image_alt:a.fix.alt??p.image_alt}:p;});
for(const a of req.rows){
 try{
 const p=pm.get(a.id),r=rm.get(a.id);
 if(!p||!r||p.status!=='pending_review'||p.approved_by||p.approved_at||p.scheduled_at||p.published_at||Number(p.image_approved||0)||p.title!==a.expectedTitle||p.copy!==a.expectedCopy||r.id!==a.reviewId||r.image_sha256!==a.imageSha||r.image_url!==p.image_url||fingerprint(p)!==r.content_fingerprint)throw Error('Current version changed; do not overwrite');
 const e=JSON.parse(r.evidence_json);
 if(r.decision!=='NEEDS_HUMAN_REVIEW'||e.content_fingerprint!==r.content_fingerprint||e.image_sha256!==a.imageSha||e.current_image_visual_observation?.sha256!==a.imageSha||checks.some(k=>e.checks?.[k]?.result!==(k==='duplicate'?'DEFER':'PASS')))throw Error('Prior evidence not exactly 15/16');
 const next={...p,...a.fix,image_alt:a.fix.alt??p.image_alt};
 const errs=[...productMatchErrors(next),...await duplicatePostErrors(null,next,liveNext)];
 if(errs.length)throw Error('Current guard: '+errs.join('；'));
 const bytes=verifyAsset(p,a.imageSha);
 const ext=await rows("SELECT state,metricool_id FROM social_metricool_sync WHERE post_id="+q(p.id));
 const delivery=await rows("SELECT platform FROM social_publish_deliveries WHERE post_id="+q(p.id)+" AND (COALESCE(attempt_count,0)>0 OR last_attempt_at IS NOT NULL OR published_at IS NOT NULL OR TRIM(COALESCE(remote_id,''))<>'' OR status IN ('sending','retry','published','manual_required','permanent_failed'))");
 if(delivery.length||ext.some(x=>!['pending_review','draft'].includes(x.state)))throw Error('External sending or mapping needs reconciliation');
 const edit=fingerprint(next)!==fingerprint(p);
 if(edit&&ext.length)throw Error('Mapped draft must be synchronized before edit');
 if(!edit){candidates.push({a,p,r});continue;}
 const now=new Date().toISOString(),fp=fingerprint(next);
 const proof={...e,reviewed_at:now,content_fingerprint:fp,image_sha256:a.imageSha,image_url:p.image_url,image_bytes:bytes,inherited_from_review_id:r.id,checks:structuredClone(e.checks),current_image_visual_observation:{...e.current_image_visual_observation,sha256:a.imageSha,reviewed_at:now,source:'18 hold follow-up; same inspected image bytes, revised text/alt checked against visual observation',observation:a.observation},copy_scene_remediation:{request:'ops/request-owner-gap-followup-18-20261112.json',old_title:p.title,new_title:next.title,observation:a.observation,editorial_decision:req.editorialDecisions.find(x=>x.id===p.id)?.finding??null}};
 for(const k of ['scene_environment','action','occasion','compliance_final'])proof.checks[k]={...proof.checks[k],result:'PASS',evidence:'原圖SHA不變，已依實際畫面重新核對此項受影響文案與圖片說明。'+a.observation+'；新版標題：'+next.title+'。文案未加入產品優劣或療效宣稱。'};
 proof.checks.duplicate={...proof.checks.duplicate,result:'DEFER',evidence:'歷史缺件仍未核驗。新版文案需重新比對可取得的歷史文案；不宣稱完整AI去重通過。'};
 const serialized=JSON.stringify(proof),rid='AI-DEFER-'+sha(serialized);
 const update="UPDATE social_posts SET title="+q(next.title)+",headline="+q(next.headline)+",copy="+q(next.copy)+",image_alt="+q(next.image_alt)+",updated_at="+q(now)+" WHERE id="+q(p.id)+" AND updated_at="+q(p.updated_at)+" AND status='pending_review' AND title="+q(p.title)+" AND copy="+q(p.copy)+" AND image_url="+q(p.image_url)+" AND approved_by IS NULL AND approved_at IS NULL AND scheduled_at IS NULL AND published_at IS NULL AND COALESCE(image_approved,0)=0 AND NOT EXISTS(SELECT 1 FROM social_metricool_sync WHERE post_id=social_posts.id) AND NOT EXISTS(SELECT 1 FROM social_publish_deliveries WHERE post_id=social_posts.id) AND "+q(r.id)+"=(SELECT id FROM social_post_quality_reviews WHERE post_id=social_posts.id ORDER BY reviewed_at DESC,rowid DESC LIMIT 1)";
 const insert="INSERT INTO social_post_quality_reviews(id,post_id,reviewer_type,decision,content_fingerprint,image_url,image_sha256,evidence_json,model,policy_version,authorized_by,reviewed_at,old_status,new_status) SELECT "+[rid,p.id,'AI','NEEDS_HUMAN_REVIEW',fp,p.image_url,a.imageSha,serialized,r.model,r.policy_version,r.authorized_by,now,'pending_review','pending_review'].map(q).join(',')+" WHERE changes()=1 AND EXISTS(SELECT 1 FROM social_posts WHERE id="+q(p.id)+" AND updated_at="+q(now)+" AND status='pending_review')";
 const audit="INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) SELECT "+['AUD-'+crypto.randomUUID(),'chatgpt:owner-delegated','現版圖文情境修正','貼文',p.id,JSON.stringify({fingerprint:r.content_fingerprint,reviewId:r.id}),JSON.stringify({fingerprint:fp,reviewId:rid,imageSha:a.imageSha}), ''].map(q).join(',')+" WHERE changes()=1";
 const w=await query([update,insert,audit].join(';\n'));
 const back=(await rows("SELECT * FROM social_posts WHERE id="+q(p.id)))[0],review=(await rows("SELECT * FROM social_post_quality_reviews WHERE id="+q(rid)))[0];
 if(w.length!==3||w.some(x=>x.meta?.changes!==1)||!back||fingerprint(back)!==fp||back.status!=='pending_review'||review?.evidence_json!==serialized)throw Error('Edit CAS/readback failed; reconcile');
 updates.push({id:p.id,title:back.title,reviewId:rid,copyOrTitleChanged:p.title!==back.title||p.copy!==back.copy,altChanged:p.image_alt!==back.image_alt,readback:true});
 candidates.push({a,p:back,r:review});
 }catch(err){holds.push({id:a.id,reasons:[String(err.message)]});}
}
// A fresh caption screen is necessary because the 17 corrected texts/alt are new versions.
// Original image bytes remain identical to the prior 49-post comparison.
execFileSync(process.execPath,['ops/full-current-history-screen-20261107.mjs'],{stdio:'inherit'});
const current=read('all-active-history-dedup-screen.json');
if(current.activePosts!==49||current.historyRows<132||current.d1Mutations!==0)throw Error('Current caption history incomplete');
const currentMap=new Map(current.rows.map(x=>[x.id,x]));
const oldMap=new Map(old.records.map(x=>[x.id,x]));
const pairKey=(a,b)=>[a,b].sort().join('|');
const checkedPairs=new Set([...pairReview.pairs.filter(x=>x.visualDecision==='DISTINCT_IMAGE_IN_AVAILABLE_PAIR').map(x=>pairKey(x.current,x.reference)),...req.pairDecisions.map(x=>pairKey(x.a,x.b))]);
const ready=[];
for(const {a,p,r} of candidates){
 try{
 const c=currentMap.get(p.id),blockers=[];
 if(!c||c.copyImageFingerprint!==r.content_fingerprint||c.copySHA256!==sha(p.copy))throw Error('Fresh comparison does not match current content');
 if(c.highestPublishedSimilarity>=.16||c.highestPendingSimilarity>=.16)blockers.push('Current caption similarity: '+JSON.stringify({published:c.publishedCandidates.slice(0,2),pending:c.pendingCandidates.slice(0,2)}));
 for(const pair of img.imageNearPairs.filter(x=>x.current===p.id||x.reference===p.id))if(pair.exactFile||!checkedPairs.has(pairKey(pair.current,pair.reference)))blockers.push('Unresolved original image pair: '+JSON.stringify(pair));
 const sameOld=oldMap.get(p.id)?.sha256===a.imageSha;
 if(sameOld&&oldMap.get(p.id)?.exactHistoricalMatch!==false)blockers.push('Original historical SHA check not verified');
 if(blockers.length){holds.push({id:p.id,reasons:blockers});continue;}
 const now=new Date().toISOString();
 const record={schema:auth.schema,fingerprint:r.content_fingerprint,image_url:p.image_url,image_sha256:a.imageSha,ai_review_id:r.id,outcome:'owner_gap_accepted_for_human_review',scope:'Same current 49 original image bytes as prior 88-source screen; renewed published/pending caption check after targeted copy/alt correction. Prior 178-file comparison applies only to identical hashes. Missing sources remain unverified.',finding:a.observation,editorial_decision:req.editorialDecisions.find(x=>x.id===p.id)?.finding??null,authorization_ref:req.priorAuthorization,authorization_actor:'ChatGPT acting on explicit owner instruction; not authenticated human approval',historical_media_missing:15,older_carousel_children_may_be_missing:true,legacy178_same_sha:sameOld,additional_scope_limit:sameOld?'Prior 178 comparison bound to identical image SHA.':'Newer official image checked against currently readable repository sources; old scratch corpus not fully rechecked.',current_available_image_reference_count:img.referenceImages,current_published_caption_count:current.historyRows,ai_duplicate:'DEFER',ai_approved:false,human_approved:false,may_enter_human_review:true,auto_schedule:false,auto_publish:false,reviewed_at:now};
 const proof=JSON.stringify(record),id='HIST-OWNER-GAP-'+sha(p.id+'|'+r.id+'|'+a.imageSha);
 const s="INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,after_json,ip) SELECT "+[id,'chatgpt:owner-delegated','歷史缺件授權覆核','貼文',p.id,proof,''].map(q).join(',')+" WHERE EXISTS(SELECT 1 FROM social_posts WHERE id="+q(p.id)+" AND updated_at="+q(p.updated_at)+" AND status='pending_review' AND approved_by IS NULL AND approved_at IS NULL AND scheduled_at IS NULL AND published_at IS NULL AND COALESCE(image_approved,0)=0) AND "+q(r.id)+"=(SELECT id FROM social_post_quality_reviews WHERE post_id="+q(p.id)+" ORDER BY reviewed_at DESC,rowid DESC LIMIT 1)";
 const w=await query(s);
 const b=(await rows("SELECT id,after_json FROM audit_logs WHERE id="+q(id)+" AND entity_id="+q(p.id)))[0];
 if(w[0]?.meta?.changes!==1||b?.after_json!==proof)throw Error('Owner acknowledgement CAS/readback failed');
 ready.push({id:p.id,title:p.title,receipt:id,reviewId:r.id,readback:true});
 }catch(e){holds.push({id:p.id,reasons:[String(e.message)]});}
}
const counts=await rows("SELECT status,COUNT(*) count FROM social_posts GROUP BY status");
const receipt={schema:'xjw-owner-gap-followup-18-readback-v1',at:new Date().toISOString(),priorReady:31,updates,ready,heldRows:holds,newReady:ready.length,remaining:holds.length,totalReady:31+ready.length,counts,aiApprovals:0,humanApprovals:0,schedules:0,publications:0,fullHistoricalDedupCertified:false};
fs.writeFileSync('ops/receipts/20261112-owner-gap-followup-18-readback.json',JSON.stringify(receipt,null,2)+'\n');
console.log('OWNER_GAP_FOLLOWUP_RECEIPT',JSON.stringify(receipt));
