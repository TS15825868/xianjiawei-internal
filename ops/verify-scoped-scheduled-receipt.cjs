'use strict';
const {verifyPublishedReceipt}=require('../tools/verify-owner-directed-published-receipt.cjs');
const channels=['facebook','instagram','threads'];
function verifyScheduledHistoricalReceipt(post,rows,p,fingerprint,now=Date.now()){
 if(!p||p.remoteScheduleVerified!==true||p.publicationVerified!==false||
    !(now>=Date.parse(p.publicationAt))||post?.status!=='published'||!Array.isArray(rows)||rows.length!==3)return false;
 const urls={};
 for(const ch of channels){
  const matches=rows.filter(r=>r.platform===ch);if(matches.length!==1)return false;
  const r=matches[0];let response;try{response=JSON.parse(r.response_json)}catch{return false}
  if(response?.source!=='Metricool connector'||!response.id||response.publicUrl!==r.remote_id||
     !(Date.parse(response.observedAt)>=Date.parse(p.publicationAt))||!(Date.parse(response.observedAt)<=now))return false;
  // Never trust a constructed URL, a planner link or another brand's receipt.
  // The actual connector result must supply the platform-specific public URL
  // and matching published identifier. No remote IDs are guessed in advance.
  const u=String(r.remote_id),id=String(response.id);
  if(ch==='facebook'&&(!/^https:\/\/(?:www\.)?facebook\.com\/1475619177921633\/posts\/\d+$/.test(u)||!u.endsWith('/'+id)))return false;
  if(ch==='instagram'&&(!/^https:\/\/www\.instagram\.com\/p\/[A-Za-z0-9_-]+\/$/.test(u)||id!==u))return false;
  if(ch==='threads'&&(!/^https:\/\/www\.threads\.com\/@xianjiawei\.tw\/post\/[A-Za-z0-9_-]+$/.test(u)||!/^\d+$/.test(id)))return false;
  urls[ch]=u;
 }
 return verifyPublishedReceipt(post,rows,{...p,urls},fingerprint);
}
module.exports={verifyScheduledHistoricalReceipt};
