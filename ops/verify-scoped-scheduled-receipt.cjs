'use strict';
const {verifyPublishedReceipt}=require('../tools/verify-owner-directed-published-receipt.cjs');
const channels=['facebook','instagram','threads'];
// Metricool can publish at the scheduled time and report the official platform
// receipts a few minutes later. Audit the real delivery timestamp; never mutate
// D1, mark an image approved, or extend this historic one-post authorization.
const MAX_RELEASE_LATENCY_MS=30*60*1000,MAX_RECEIPT_LAG_MS=60*60*1000;
function verifyScheduledHistoricalReceipt(post,rows,p,fingerprint,now=Date.now()){
 const scheduledAt=Date.parse(p?.publicationAt),actualAt=Date.parse(post?.published_at);
 if(!p||p.remoteScheduleVerified!==true||p.publicationVerified!==false||
    !Number.isFinite(scheduledAt)||!Number.isFinite(actualAt)||
    scheduledAt>now||actualAt<scheduledAt||actualAt>scheduledAt+MAX_RELEASE_LATENCY_MS||
    actualAt>now||post?.status!=='published'||!Array.isArray(rows)||rows.length!==3)return false;
 const urls={};
 for(const ch of channels){
  const matches=rows.filter(r=>r.platform===ch);if(matches.length!==1)return false;
  const r=matches[0];let response;try{response=JSON.parse(r.response_json)}catch{return false}
  const source=response?.source,observedAt=Date.parse(response?.observedAt);
  if(!['Metricool connector','Metricool official connector'].includes(source)||
     !response?.id||response.publicUrl!==r.remote_id||
     !Number.isFinite(observedAt)||observedAt<actualAt||observedAt>now||
     observedAt>actualAt+MAX_RECEIPT_LAG_MS||
     !Number.isFinite(Date.parse(r.delivery_at))||Date.parse(r.delivery_at)!==actualAt)return false;
  // Never trust a constructed URL, a planner link or another brand's receipt.
  // The actual connector result must supply the platform-specific public URL
  // and matching published identifier. No remote IDs are guessed in advance.
  const u=String(r.remote_id),id=String(response.id);
  if(ch==='facebook'&&(!/^https:\/\/(?:www\.)?facebook\.com\/1475619177921633\/posts\/\d+$/.test(u)||!u.endsWith('/'+id)))return false;
  if(ch==='instagram'&&(!/^https:\/\/www\.instagram\.com\/p\/[A-Za-z0-9_-]+\/$/.test(u)||id!==u))return false;
  if(ch==='threads'&&(!/^https:\/\/www\.threads\.com\/@xianjiawei\.tw\/post\/[A-Za-z0-9_-]+$/.test(u)||!/^\d+$/.test(id)))return false;
  urls[ch]=u;
 }
 // The historical grant and schedule retain their original time. Only the
 // verified audit inputs are projected onto that instant for the existing strict
 // grant, SHA, fingerprint, 16-check and three-channel receipt verifier.
 // Actual D1 publication/delivery times remain unchanged and independently checked.
 return verifyPublishedReceipt(
  {...post,published_at:p.publicationAt},
  rows.map(r=>({...r,delivery_at:p.publicationAt})),
  {...p,urls},fingerprint,
  {allowOfficialMetricoolWithoutDuplicate:
    p.postId==='XJW-CONV-chat-buy-first-look'&&
    p.grantId==='XJW-OWNER-DIRECT-20261120-buy-first-look-v1'&&
    p.publicationAt==='2026-11-20T10:00:00+08:00'}
 );
}
module.exports={verifyScheduledHistoricalReceipt};
