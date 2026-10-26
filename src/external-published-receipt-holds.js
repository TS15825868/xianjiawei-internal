// Verified public Metricool platform receipts, 2026-10-26.
// These two D1 draft IDs map to essentially the same already-public posts.
// Preserve the original D1 state; hold new processing pending reconciled
// remote receipts rather than fabricating a locally published status.
// Evidence is public platform URLs only; no private Metricool API key.
export const PUBLISHED_PLATFORM_RECEIPTS=Object.freeze([
  Object.freeze({
    postId:'XJW-CONV-live-hongludi-outing-20260929',
    publishedDate:'2026-10-01',
    metricoolId:384813552,
    publicUrls:Object.freeze({
      Facebook:'https://facebook.com/1475619177921633/posts/1496075599209324',
      Instagram:'https://www.instagram.com/p/Dd8DjQ8FJHo/',
      Threads:'https://www.threads.com/@xianjiawei.tw/post/Dd8Dl9iDQF9'
    })
  }),
  Object.freeze({
    postId:'XJW-CONV-brand-third-generation-note',
    publishedDate:'2026-10-03',
    metricoolId:386519368,
    publicUrls:Object.freeze({
      Facebook:'https://facebook.com/1475619177921633/posts/1498042925679258',
      Instagram:'https://www.instagram.com/p/DeA8Gj_jTCh/',
      Threads:'https://www.threads.com/@xianjiawei.tw/post/DeA8IE8CPKB'
    })
  })
]);
const byPost=new Map(PUBLISHED_PLATFORM_RECEIPTS.map(receipt=>[receipt.postId,receipt]));
export function publishedPlatformReceiptHold(row){
  const id=String(row?.id||'').trim(),status=String(row?.status||'').trim();
  if(!id||status==='published'||status==='archived')return null;
  const receipt=byPost.get(id);
  return receipt?{
    id,metricoolId:receipt.metricoolId,publishedDate:receipt.publishedDate,
    reason:`貼文已在 ${receipt.publishedDate} 取得 Facebook／Instagram／Threads 正式公開回執（Metricool ${receipt.metricoolId}）。請先核對並保全平台發布紀錄；禁止重製成新的待發文、重新核准／排程／立即發布。`
  }:null;
}