// Internal quality workflow only; never grants scheduling, publication or human approval.
const CHECKS=['brand','product','specification','pricing_activity','season','weather','occasion','location','scene_environment','temperature','expression','action','mascot_companions','physical_scale','duplicate','compliance_final'];
const parse=x=>{try{return JSON.parse(x)}catch{return null}};
export function classifyAiQualityFlow(row,review,notes,fp,auditOk){
 const out=(state,reason)=>({state,reason,quality_complete:state==='AI_QUALITY_COMPLETE'||state==='AI_QUALITY_COMPLETE_WITH_ACCEPTED_GAPS',human_quality_review_required:false,publication_authorized:false,auto_schedule:false,auto_publish:false});
 if(!row||!['draft','pending_review','approved'].includes(row.status))return out('NOT_IN_REVIEW','非未發布品質工作');
 if(!auditOk)return out('AI_REPAIR_REQUIRED','正式圖文檢查未通過，由AI修復');
 if(!review||review.reviewer_type!=='AI'||review.content_fingerprint!==fp||review.image_url!==row.image_url||!(/^[a-f0-9]{64}$/.test(review.image_sha256||'')))return out('AI_EVIDENCE_REQUIRED','目前版本缺少AI證據');
 const e=parse(review.evidence_json);
 if(!e||e.content_fingerprint!==fp||e.image_sha256!==review.image_sha256)return out('AI_EVIDENCE_REQUIRED','AI證據未綁定目前版本');
 if(review.decision==='REJECTED'||CHECKS.some(k=>e.checks?.[k]?.result==='FAIL'))return out('AI_REPAIR_REQUIRED','AI已判定不合格');
 if(review.decision==='AI_APPROVED'&&CHECKS.every(k=>e.checks?.[k]?.result==='PASS'))return out('AI_QUALITY_COMPLETE','目前版本完整AI品質審核通過');
 if(review.decision==='NEEDS_HUMAN_REVIEW'&&CHECKS.every(k=>e.checks?.[k]?.result===(k==='duplicate'?'DEFER':'PASS'))){
  const accepted=notes.some(n=>{const a=parse(n.after_json);return a?.schema==='xjw-owner-delegated-historical-gap-acceptance-v1'&&a.outcome==='owner_gap_accepted_for_human_review'&&a.fingerprint===fp&&a.image_url===row.image_url&&a.image_sha256===review.image_sha256&&a.ai_review_id===review.id&&a.historical_media_missing===15&&a.ai_approved===false&&a.human_approved===false&&a.auto_schedule===false&&a.auto_publish===false});
  if(accepted)return out('AI_QUALITY_COMPLETE_WITH_ACCEPTED_GAPS','AI品質流程完成；歷史缺件依既有授權保留，並非完整AI歷史去重通過');
 }
 return out('AI_EVIDENCE_REQUIRED','由AI補齊或修復證據，不列例行人工品質待審');
}
