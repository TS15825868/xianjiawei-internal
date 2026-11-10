// 仙加味｜全量待審證據分流。僅分析現版16項審核結果，絕不核准、刪除或發布。
// Usage: node tools/ai-batch-triage.mjs pending-review-full-inventory.json [output.json] [historical-link-gaps.json]
import fs from 'node:fs';
const [input='pending-review-full-inventory.json',output='ai-batch-triage.json',historyFile]=process.argv.slice(2);
const historical=historyFile?JSON.parse(fs.readFileSync(historyFile,'utf8')):null;
if(historical && (historical.schema!=='xjw-published-media-unreachable-links-evidence-v1'||!Array.isArray(historical.missing)||historical.noD1Writes!==true))
  throw Error('Untrusted historical gap snapshot; stop safely');
const historicalTargets=new Map();
for(const m of historical?.missing||[]){
  for(const id of m.priorityCheck||[]){
    const targets=historicalTargets.get(id)||[];
    // Historic 403 is a review target, not proof that media is gone or duplicate.
    targets.push({platform:m.platform,postId:m.postId,permalink:m.publishedPost,observedHttpStatus:m.httpStatus});
    historicalTargets.set(id,targets);
  }
}
const data=JSON.parse(fs.readFileSync(input,'utf8'));
if(!data.safeReadOnly||!Array.isArray(data.records)||!data.counts||data.records.length!==data.counts.pending)
  throw Error('Invalid or incomplete 16-check inventory; stop safely');
const issues=new Map();
const ids=new Set();
const items=data.records.map(r=>{
  if(typeof r.id!=='string'||!r.id.trim()||ids.has(r.id))throw Error('Missing or duplicate post ID in inventory');
  ids.add(r.id);
  const blockers=[...new Set(r.blockers||[])];
  const serious=blockers.filter(x=>/^(active_media_missing|pending_has_unexpected_release_metadata|invalid_review_json|external_remote_mapping_requires_reconcile|(?:brand|product|specification|pricing_activity|season|weather|occasion|location|scene_environment|temperature|expression|action|mascot_companions|physical_scale|compliance_final):(?:FAIL|REJECT))/.test(x));
  // 任何未能證明全部16項通過的候選都只能補證，不得誤列可發布。
  const ready=blockers.length===1 && blockers[0]==='automatic_release_runtime_and_platform_not_e2e_verified' && r.currentBound===true && r.mediaShaEvidencePresent===true && r.decision==='AI_APPROVED' && Object.values(r.checks||{}).length===16 && Object.values(r.checks).every(v=>v==='PASS');
  const complianceHold=blockers.includes('compliance_final:DEFER')||blockers.includes('compliance_final:MISSING');
  const action=serious.length?'investigate_or_repair':complianceHold?'verify_compliance_evidence':ready?'verify_release_gate':'recover_evidence';
  for(const b of blockers)issues.set(b,(issues.get(b)||0)+1);
  return {id:r.id,title:r.title||'',decision:r.decision,currentBound:r.currentBound===true,
    action,blockers,sourceRecheckTargets:historicalTargets.get(r.id)||[],automaticallyApproved:false};
});
const counts={investigate_or_repair:0,verify_compliance_evidence:0,recover_evidence:0,verify_release_gate:0};
for(const r of items)counts[r.action]++;
const queue=Object.fromEntries(Object.keys(counts).map(action=>[action,items.filter(r=>r.action===action)
  .sort((a,b)=>b.sourceRecheckTargets.length-a.sourceRecheckTargets.length).map(r=>r.id)]));
const result={schema:'xjw-safe-batch-triage-v5',generatedAt:new Date().toISOString(),
source:'existing 16-check current-version evidence inventory',mode:'read_only',
pending:items.length,processed:items.length,counts,queue,
historyGapContext:{snapshotDate:historical?.capturedOn||null,knownSourceCheckTargets:items.filter(r=>r.sourceRecheckTargets.length).length,
  unidentifiedHistoricalMedia:historical?.previousPrivateCacheUnavailable??null,
  preventsAutomaticDuplicateApproval:true},
blockers:Object.fromEntries([...issues].sort((a,b)=>b[1]-a[1])),
items};
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log('FULL_PENDING_TRIAGE',JSON.stringify({pending:result.pending,processed:result.processed,counts,topBlockers:Object.entries(result.blockers).slice(0,12)}));
