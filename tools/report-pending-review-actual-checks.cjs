// Read-only, live D1 exported post-by-post 16-check and evidence-version audit.
// Do not approve, archive, draft, schedule, publish or mutate anything.
'use strict';
const fs=require('node:fs');
const {fingerprint}=require('./metricool-free-evidence.cjs');
const keys=['brand','product','specification','pricing_activity','season','weather','occasion','location','scene_environment','temperature','expression','action','mascot_companions','physical_scale','duplicate','compliance_final'];
function rows(file){
  const j=JSON.parse(fs.readFileSync(file,'utf8'));
  return (Array.isArray(j)?j[0]?.results:j?.results)||[];
}
function status(v){
  if(v===true)return'PASS';
  if(v===false)return'FAIL';
  if(typeof v==='string')return v.toUpperCase().trim();
  if(v&&typeof v==='object')return status(v.result??v.status??v.decision);
  return'MISSING';
}
const posts=rows('current-social-posts.json').filter(p=>p.status==='pending_review');
const expectedCount=Number(rows('current-social-post-counts.json').find(x=>x.status==='pending_review')?.count??0);
if(!Number.isSafeInteger(expectedCount)||expectedCount<0||posts.length!==expectedCount)throw Error('D1 pending review inventory count mismatch; refuse partial evidence report');
const reviews=rows('current-ai-reviews.json');
const links=rows('current-metricool-sync.json');
const byPost=new Map();
for(const r of reviews){if(!byPost.has(r.post_id))byPost.set(r.post_id,r)}
const linked=new Map();
for(const l of links){const a=linked.get(l.post_id)||[];a.push({id:l.metricool_id,state:l.state});linked.set(l.post_id,a)}
const out={schema:'xjw-current-version-68-decision-evidence-v1',generatedAt:new Date().toISOString(),
source:'Cloudflare D1 complete live exports from audit-current-social-posts',
safeReadOnly:true,modifiedD1:false,approvals:0,archived:0,scheduled:0,published:0,
counts:{pending:posts.length,currentSourceBound:0,outdatedSourceReview:0,withoutCurrentReview:0,fully16Passed:0,duplicateDeferred:0,full16AllPassButReleaseUnverified:0},
checks:Object.fromEntries(keys.map(k=>[k,{PASS:0,DEFER:0,REJECT:0,OTHER:0}])),
records:[]};
for(const p of posts){
  const r=byPost.get(p.id),linkedRemote=linked.get(p.id)||[];
  const record={id:p.id,title:p.title,reviewId:r?.id||null,decision:r?.decision||'NO_REVIEW',currentBound:false,
    mediaShaEvidencePresent:false,checks:{},blockers:[],remoteLinks:linkedRemote};
  if(!r){
    out.counts.withoutCurrentReview++;record.blockers.push('missing_ai_review');
  }else{
    let e;try{e=JSON.parse(r.evidence_json||'{}')}catch{e={};record.blockers.push('invalid_review_json')}
    const fp=fingerprint(p);
    record.currentBound=(r.content_fingerprint===fp&&r.image_url===p.image_url&&e.content_fingerprint===fp);
    record.mediaShaEvidencePresent=/^[a-f0-9]{64}$/i.test(r.image_sha256||'')&&r.image_sha256===e.image_sha256;
    if(record.currentBound)out.counts.currentSourceBound++;
    else{out.counts.outdatedSourceReview++;record.blockers.push('review_not_current_bound')}
    if(!record.mediaShaEvidencePresent)record.blockers.push('media_sha_evidence_missing');
    for(const k of keys){
      const x=status(e.checks?.[k]),bucket=x==='PASS'?'PASS':x==='DEFER'?'DEFER':(['REJECT','REJECTED','FAIL','FAILED'].includes(x)?'REJECT':'OTHER');
      out.checks[k][bucket]++;
      record.checks[k]=x;
      if(x!=='PASS')record.blockers.push(k+':'+x);
    }
    if(record.checks.duplicate==='DEFER')out.counts.duplicateDeferred++;
    if(keys.every(k=>record.checks[k]==='PASS')&&record.currentBound&&record.mediaShaEvidencePresent){
      out.counts.fully16Passed++;
      record.blockers.push('automatic_release_runtime_and_platform_not_e2e_verified');
      out.counts.full16AllPassButReleaseUnverified++;
    }
    if(r.decision!=='AI_APPROVED')record.blockers.push('review_decision:'+r.decision);
  }
  if(linkedRemote.some(l=>['scheduled','published','unknown','awaiting_verification'].includes(l.state)))record.blockers.push('external_remote_mapping_requires_reconcile');
  if(!p.image_url||!p.image_alt)record.blockers.push('active_media_missing');
  if(p.approved_by||p.approved_at||p.published_at||p.scheduled_at)record.blockers.push('pending_has_unexpected_release_metadata');
  out.records.push(record);
}
out.counts.byDecision=out.records.reduce((a,r)=>(a[r.decision]=(a[r.decision]||0)+1,a),{});
out.counts.byBlocker=out.records.flatMap(x=>x.blockers).reduce((a,s)=>(a[s]=(a[s]||0)+1,a),{});
out.guards={noFakeApprovals:true,noReclassificationToHidePending:true,onlyEvidenceGroundedOutcomes:true,
sourceVersionRequired:true,doNotPromoteDefer:true};
fs.writeFileSync('pending-review-full-inventory.json',JSON.stringify(out,null,2)+'\n');
console.log('PENDING_REVIEW_CURRENT_EVIDENCE_COUNTS',JSON.stringify(out.counts));
console.log('PENDING_REVIEW_16_CHECK_AGGREGATE',JSON.stringify(out.checks));
console.log('PENDING_REVIEW_EVIDENCE_READY_IDS',JSON.stringify(out.records.filter(x=>x.blockers.length===1&&x.blockers[0]==='automatic_release_runtime_and_platform_not_e2e_verified').map(x=>x.id)));
console.log('PENDING_REVIEW_CURRENT_LIVE_TOTAL',posts.length);
