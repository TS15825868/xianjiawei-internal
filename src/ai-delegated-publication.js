// Independent owner-delegated publication authorization. No human approval is synthesized.
// Only trusted server-side callers may supply persisted grants and verified quality.
export const DELEGATION_SCHEMA='xjw-owner-social-delegation-v1';
export const DELEGATION_END='2027-02-28T23:59:59+08:00';
const allowed=new Set(['facebook','instagram','threads']);
const sha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const channels=x=>Array.isArray(x)&&x.length>0&&x.length<=3&&new Set(x).size===x.length&&x.every(v=>allowed.has(v));
export function assessDelegatedPublication({grant,post,quality,publicationAt,now=Date.now(),enabled=false}={}){
  const deny=reason=>({ok:false,reason});
  if(enabled!==true)return deny('委任發布尚未啟用');
  if(!Number.isFinite(now))return deny('驗證時間無效');
  if(!grant||grant.schema!==DELEGATION_SCHEMA||grant.revoked_at||grant.scope!=='brand-social-only'||!grant.id||!grant.owner_authorization_ref)return deny('缺少有效獨立委任授權');
  const issued=Date.parse(grant.issued_at),expires=Date.parse(grant.expires_at),at=Date.parse(publicationAt);
  if(![issued,expires,at].every(Number.isFinite)||issued>now||expires<now||at<now||at>expires||expires>Date.parse(DELEGATION_END))return deny('委任或發布時間超出授權');
  if(!post||!['pending_review','approved','scheduled'].includes(post.status)||post.published_at||post.publishedAt)return deny('貼文狀態不允許委任發布');
  if(!quality?.ok||quality.decision!=='AI_APPROVED'||!quality.review_id||!sha(quality.fingerprint)||!sha(quality.image_sha256))return deny('缺少完整現版AI品質證據');
  if(grant.post_id!==post.id||grant.fingerprint!==quality.fingerprint||grant.image_sha256!==quality.image_sha256||grant.review_id!==quality.review_id||grant.publication_at!==publicationAt)return deny('委任與現版圖文或時間不一致');
  if(!channels(grant.channels)||!channels(quality.channels)||JSON.stringify([...grant.channels].sort())!==JSON.stringify([...quality.channels].sort()))return deny('委任平台與審核平台不一致');
  const reviewed=Date.parse(quality.reviewed_at);
  if(!Number.isFinite(reviewed)||reviewed>now||now-reviewed>86400000||at-reviewed>86400000)return deny('發布前須重新驗證AI品質');
  return {ok:true,reviewer_type:'AI_DELEGATED',authorization_id:grant.id,review_id:quality.review_id,fingerprint:quality.fingerprint,image_sha256:quality.image_sha256,channels:[...grant.channels],reviewed_at:quality.reviewed_at,publication_at:publicationAt};
}
