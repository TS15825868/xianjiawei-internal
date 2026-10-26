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
// Read-only evidence for an additional real duplicate: the exact same
// already-public warning was posted twice on all three networks on Oct 23.
// This is an immutable safety reference, not a publishing instruction.
export const ALREADY_PUBLISHED_COPY_EVIDENCE=Object.freeze([{
  publicationDate:'2026-10-23',
  metricoolIds:[403318046,403326277],
  facebook:['https://facebook.com/1475619177921633/posts/1516859700464247','https://facebook.com/1475619177921633/posts/1516867403796810'],
  instagram:['https://www.instagram.com/p/DezYqE6FSvZ/','https://www.instagram.com/p/DezZzJfFWZg/'],
  threads:['https://www.threads.com/@xianjiawei.tw/post/DezYraUDUOy','https://www.threads.com/@xianjiawei.tw/post/DezZ0VBipjq'],
  copy:`🌧️ 風雨來了，平安最重要。

仙加味想提醒大家：

記得關好門窗、收好陽台物品，準備好飲水、食物與必要用品。

風雨期間盡量避免外出，也別忘了關心家中的長輩，以及獨自居住的親友。

希望大家都能平平安安地待在家裡。

願風雨平息，大家一切安好。❤️

仙加味｜補養，是一種節奏。

#仙加味 #颱風天注意安全 #平安最重要`
}]);
const normalizePublishedCopy=value=>String(value??'').normalize('NFC').replace(/\s+/gu,'').trim();
const publishedCopyNorms=new Map(ALREADY_PUBLISHED_COPY_EVIDENCE.map(record=>[normalizePublishedCopy(record.copy),record]));
const byPost=new Map(PUBLISHED_PLATFORM_RECEIPTS.map(receipt=>[receipt.postId,receipt]));
export function publishedPlatformReceiptHold(row){
  const id=String(row?.id||'').trim(),status=String(row?.status||'').trim();
  if(!id||status==='published'||status==='archived')return null;
  const receipt=byPost.get(id);
  if(receipt)return{
    id,metricoolId:receipt.metricoolId,publishedDate:receipt.publishedDate,
    reason:`貼文已在 ${receipt.publishedDate} 取得 Facebook／Instagram／Threads 正式公開回執（Metricool ${receipt.metricoolId}）。請先核對並保全平台發布紀錄；禁止重製成新的待發文、重新核准／排程／立即發布。`
  };
  // Exact remote-publication text, not just another local D1 row, is enough
  // to reject repeating a previously public warning under a new post ID.
  const prior=publishedCopyNorms.get(normalizePublishedCopy(row?.copy));
  return prior?{
    id,metricoolId:prior.metricoolIds[0],publishedDate:prior.publicationDate,
    reason:`這篇文案與已在三平台發布兩次的內容完全相同（Metricool ${prior.metricoolIds.join('／')}）；禁止再排程、重新生成或立即發布，請先進行重複發布對帳。`
  }:null;
}