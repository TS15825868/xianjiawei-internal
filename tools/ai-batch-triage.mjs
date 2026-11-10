// 仙加味：完整待審批次分流（唯讀；絕不將缺證稿自動核准或發布）
// Usage: node tools/ai-batch-triage.mjs current-social-posts.json current-ai-reviews.json [output.json]
import fs from 'node:fs';
const [postsFile, reviewsFile, outputFile='ai-batch-triage.json'] = process.argv.slice(2);
if (!postsFile || !reviewsFile) throw Error('Usage: node tools/ai-batch-triage.mjs posts.json reviews.json [output.json]');
function rows(path) {
  const value = JSON.parse(fs.readFileSync(path,'utf8'));
  const result = Array.isArray(value) ? value[0]?.results : value?.results;
  if (!Array.isArray(result)) throw Error('Invalid D1 JSON: '+path);
  return result;
}
const posts=rows(postsFile), reviews=rows(reviewsFile);
const latest=new Map();
for (const r of reviews) if(r.post_id && !latest.has(r.post_id)) latest.set(r.post_id,r);
const prohibited=/治療|治癒|預防疾病|改善疾病|保證療效|補氣|生津|膠原蛋白|鈣質/;
const pending=posts.filter(p=>p.status==='pending_review');
const items=pending.map(p=>{
  const r=latest.get(p.id);
  const reasons=[];
  if(!r) reasons.push('missing_ai_review');
  if(!String(p.image_url||'').trim()) reasons.push('missing_image');
  if(prohibited.test([p.copy,p.headline,p.title].filter(Boolean).join(' '))) reasons.push('possible_compliance_issue');
  // 不從圖片品質或部分核准欄位推論第16項歷史去重已完成。
  const raw=[r?.checklist_json,r?.result_json,r?.review_note,r?.reason,r?.duplicate_status].filter(Boolean).join(' ');
  if(!/duplicate.{0,30}(PASS|passed|true)/i.test(raw)) reasons.push('historical_visual_dedup_not_verified');
  return {id:p.id,title:p.title||p.headline||'',updated_at:p.updated_at||null,reviewed_at:r?.reviewed_at||null,
    action:reasons.some(x=>x==='possible_compliance_issue'||x==='missing_image')?'needs_repair':'needs_evidence',
    reasons};
});
const report={generated_at:new Date().toISOString(),mode:'read_only_no_approval_no_publication',
 total_posts:posts.length,pending_count:pending.length,processed_count:items.length,
 needs_repair:items.filter(x=>x.action==='needs_repair').length,
 needs_evidence:items.filter(x=>x.action==='needs_evidence').length,
 items};
fs.writeFileSync(outputFile,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pending:report.pending_count,processed:report.processed_count,needs_repair:report.needs_repair,needs_evidence:report.needs_evidence,output:outputFile}));
