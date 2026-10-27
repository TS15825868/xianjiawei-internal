// 仙加味 AI 自動發布決策：預設拒絕，僅允許具備完整驗證的非敏感內容。
// 本模組不直接發送訊息、不改變現有審核狀態；供正式排程入口整合。
export const AUTOPUBLISH_POLICY_VERSION = '2026-10-27-owner-authorized-v1';
const BANNED = /(治療|根治|預防疾病|改善疾病|降血壓|降血糖|降血脂|冠心病|糖尿病|高血壓|關節|卡卡|疲勞|精神不濟|補氣|生津|膠原蛋白|鈣質|保證功效|台興山產)/;
const HIGH_RISK = /(價格|售價|優惠|折扣|特價|促銷|免運|贈送|買一送一|預購|現貨|新品上市|藥品|醫療|許可證|颱風|豪雨|即時天氣)/;
const ACTIVE = new Set(['approved','scheduled']);
const CHANNELS = new Set(['facebook','instagram','threads']);
export function assessAutopublishCandidate(post, checks = {}) {
  const reasons = [];
  const content = [post?.title,post?.headline,post?.copy,post?.image_alt].filter(Boolean).join(' ');
  if (!post || !ACTIVE.has(post.status)) reasons.push('未完成有效核准的貼文不可進入自動排程');
  if (!String(post?.approved_by||'').startsWith('ai:')) reasons.push('缺少已授權的 AI 核准來源');
  if (Number(post?.image_approved||0)!==1) reasons.push('正式圖片尚未核准');
  if (post?.published_at || post?.publishedAt) reasons.push('已有發布紀錄，不得重複發送');
  if (post?.externalStatus && ['unknown','published','awaiting_verification','cancel_required'].includes(post.externalStatus)) reasons.push('外部平台狀態未釐清或已發布');
  if (!String(post?.copy||'').trim()) reasons.push('缺少文案');
  if (post?.image_quality_status && !['ok','clear','approved','passed','high'].includes(String(post.image_quality_status).toLowerCase())) reasons.push('圖片品質尚未通過');
  if (BANNED.test(content)) reasons.push('疑似醫療療效或禁止公開用語');
  if (HIGH_RISK.test(content)) reasons.push('價格、促銷或時效敏感內容須另行驗證');
  if (!String(post?.image_url||'').startsWith('https://')) reasons.push('未提供可驗證的正式 HTTPS 圖片');
  if (!Array.isArray(post?.platforms) || !post.platforms.length || post.platforms.length>3 || post.platforms.some(p => !CHANNELS.has(String(p).toLowerCase())) || new Set((post.platforms||[]).map(p=>String(p).toLowerCase())).size!==(post.platforms||[]).length) reasons.push('平台清單不符合授權範圍或包含重複平台');
  for (const key of ['aiEvidenceValid','imageAuthentic','sceneMatches','productAuthorityValid','uniqueCopy','uniqueImage','rightsVerified','scheduledTimeValid','platformReady','quotaVerified','deliveryDedupReady']) {
    if (checks[key] !== true) reasons.push('未通過 '+key);
  }
  if (!checks.reviewedAt || !Number.isFinite(Date.parse(checks.reviewedAt)) || Date.now()-Date.parse(checks.reviewedAt)>24*3600000 || Date.parse(checks.reviewedAt)>Date.now()+60000) reasons.push('AI 審核證據逾期或不合法');
  return {ok:reasons.length===0,decision:reasons.length===0?'ELIGIBLE_FOR_SCHEDULING':'BLOCKED',reasons,policyVersion:AUTOPUBLISH_POLICY_VERSION};
}
