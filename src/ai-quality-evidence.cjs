// Shared, deterministic evidence validation. This does not pretend to be a model.
const CHECKS=['brand','product','specification','pricing_activity','season','weather','occasion','location','scene_environment','temperature','expression','action','mascot_companions','physical_scale','duplicate','compliance_final'];
const sha=x=>/^[a-f0-9]{64}$/.test(x||'');
function assess(e,postId,fingerprint,imageUrl){
  const reasons=[];
  if(!e||e.reviewer_type!=='AI'||!String(e.model||'').trim()||e.post_id!==postId||e.content_fingerprint!==fingerprint||e.image_url!==imageUrl||!sha(e.image_sha256))return{decision:'NEEDS_HUMAN_REVIEW',reasons:['AI審核身分、版本或圖片雜湊證據不完整']};
  let failed=false;
  for(const key of CHECKS){const c=e.checks?.[key];if(c?.result==='FAIL')failed=true;if(c?.result!=='PASS'||String(c?.evidence||'').trim().length<12)reasons.push('未完整確認：'+key);}
  if(failed)return{decision:'REJECTED',reasons};
  if(e.risk?.level!=='LOW'||!Array.isArray(e.risk?.uncertainties)||e.risk.uncertainties.length||!Array.isArray(e.risk?.flags)||e.risk.flags.length)reasons.push('存在高風險或未確認事項');
  const v=e.visual;
  if(!v||v.image_sha256!==e.image_sha256||String(v.scene_summary||'').length<30||!sha(v.mascot_reference?.sha256)||!String(v.mascot_reference?.url||'').startsWith('https://'))reasons.push('缺少目前成圖及正式角色參考比對');
  if(typeof v?.products_visible!=='boolean')reasons.push('產品可見性未確認');
  if(v?.products_visible&&(!Array.isArray(v.product_assets)||!v.product_assets.length||v.product_assets.some(a=>!['guilu-gao','guilu-drink-30','guilu-drink-180','luerong-fen'].includes(a.product_id)||!sha(a.sha256)||!a.original_photo_verified||!a.url?.startsWith('https://')||!String(a.pixel_preservation_evidence||'').trim())))reasons.push('正式產品原圖、像素及比例來源未驗證');
  if(!Number.isFinite(Date.parse(e.reviewed_at||'')))reasons.push('審核時間不明');
  return{decision:reasons.length?'NEEDS_HUMAN_REVIEW':'AI_APPROVED',reasons};
}
module.exports={CHECKS,assess};
