'use strict';
const CHANNELS=['facebook','instagram','threads'];
const parse=s=>{try{return JSON.parse(s)}catch{return null}};
const sameTime=(a,b)=>Number.isFinite(Date.parse(a))&&Date.parse(a)===Date.parse(b);
function verifyPublishedReceipt(post,rows,p,fingerprint,options={}){
 if(!post||!p||p.schema!=='xjw-owner-directed-published-historical-audit-v1'||p.noFutureAuthority!==true||
  p.fullHistoricalDedupCertified!==false||p.aiApproved!==false||p.humanApproved!==false||
  post.id!==p.postId||post.status!=='published'||Number(post.image_approved)!==0||
  !sameTime(post.published_at,p.publicationAt)||fingerprint(post)!==p.fingerprint||
  !Array.isArray(rows)||rows.length!==3||new Set(rows.map(r=>r.platform)).size!==3)return false;
 return CHANNELS.every(ch=>{
  const r=rows.find(x=>x.platform===ch);if(!r)return false;
  const proof=parse(r.response_json),channels=parse(r.channels_json),review=parse(r.evidence_json);
  const checks=review?.checks||{};
  return r.post_id===p.postId&&Number(r.metricool_id)===p.metricoolId&&r.uuid===p.uuid&&
   r.state==='published'&&r.status==='published'&&r.remote_id===p.urls[ch]&&
   r.grant_id===p.grantId&&r.grant_schema==='xjw-owner-directed-scoped-release-v1'&&r.scope==='brand-social-only'&&
   r.owner_authorization_ref===p.ownerAuthorizationRef&&!r.revoked_at&&
   r.content_fingerprint===p.fingerprint&&r.grant_fp===p.fingerprint&&r.review_fp===p.fingerprint&&
   r.grant_sha===p.imageSha256&&r.image_sha256===p.imageSha256&&r.review_id===p.reviewId&&
   r.decision==='NEEDS_HUMAN_REVIEW'&&Object.keys(checks).length===16&&checks.duplicate?.result==='DEFER'&&
   Object.entries(checks).every(([k,v])=>v.result===(k==='duplicate'?'DEFER':'PASS'))&&
   [r.sync_at,r.delivery_at,r.grant_at].every(x=>sameTime(x,p.publicationAt))&&
   Number.isFinite(Date.parse(r.issued_at))&&Date.parse(r.issued_at)<=Date.parse(p.publicationAt)&&Date.parse(r.expires_at)>=Date.parse(p.publicationAt)&&
   Array.isArray(channels)&&channels.length===3&&CHANNELS.every(c=>channels.includes(c))&&
   proof?.network===ch&&proof.status==='PUBLISHED'&&proof.publicUrl===p.urls[ch]&&Number(proof.metricoolId)===p.metricoolId&&proof.uuid===p.uuid&&proof.ownerDirectException===true&&
   // Official Metricool connector reports have no internal AI duplicate tag.
   // That tag remains verified independently from all 16 immutable review checks.
   (proof.duplicate==='DEFER'||(options.allowOfficialMetricoolWithoutDuplicate===true&&
     !Object.hasOwn(proof,'duplicate')&&proof.source==='Metricool official connector'));
 });
}
module.exports={verifyPublishedReceipt};
