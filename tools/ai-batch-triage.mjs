// 仙加味｜全量待審證據分流。僅分析現版16項審核結果，絕不核准、刪除或發布。
// Usage: node tools/ai-batch-triage.mjs pending-review-full-inventory.json [output.json]
import fs from 'node:fs';
const [input='pending-review-full-inventory.json',output='ai-batch-triage.json']=process.argv.slice(2);
const data=JSON.parse(fs.readFileSync(input,'utf8'));
if(!data.safeReadOnly||!Array.isArray(data.records)||!data.counts||data.records.length!==data.counts.pending)
  throw Error('Invalid or incomplete 16-check inventory; stop safely');
const issues=new Map();
const items=data.records.map(r=>{
  const blockers=[...new Set(r.blockers||[])];
  const serious=blockers.filter(x=>/^(active_media_missing|pending_has_unexpected_release_metadata|invalid_review_json|external_remote_mapping_requires_reconcile|(?:brand|product|specification|pricing_activity|season|weather|occasion|location|scene_environment|temperature|expression|action|mascot_companions|physical_scale|compliance_final):(?:FAIL|REJECT))/.test(x));
  const missing=blockers.filter(x=>x.startsWith('missing_')||x.includes('DEFER')||x.includes('MISSING')||x.includes('not_current_bound')||x.includes('sha_evidence_missing'));
  const action=serious.length?'investigate_or_repair':missing.length?'recover_evidence':'verify_release_gate';
  for(const b of blockers)issues.set(b,(issues.get(b)||0)+1);
  return {id:r.id,title:r.title||'',decision:r.decision,currentBound:r.currentBound===true,
    action,blockers,automaticallyApproved:false};
});
const counts={investigate_or_repair:0,recover_evidence:0,verify_release_gate:0};
for(const r of items)counts[r.action]++;
const result={schema:'xjw-safe-batch-triage-v2',generatedAt:new Date().toISOString(),
source:'existing 16-check current-version evidence inventory',mode:'read_only',
pending:items.length,processed:items.length,counts,
blockers:Object.fromEntries([...issues].sort((a,b)=>b[1]-a[1])),
items};
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log('FULL_PENDING_TRIAGE',JSON.stringify({pending:result.pending,processed:result.processed,counts,topBlockers:Object.entries(result.blockers).slice(0,12)}));
