// Independent owner-delegated publication authorization. No human approval is synthesized.
// Only trusted server-side callers may supply persisted grants and verified quality.
export const DELEGATION_SCHEMA='xjw-owner-social-delegation-v1';
export const DELEGATION_END='2027-02-28T23:59:59+08:00';
export const DELEGATED_LATE_WINDOW_MS=5*60*1000;
const allowed=new Set(['facebook','instagram','threads']);
const sha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const channels=x=>Array.isArray(x)&&x.length>0&&x.length<=3&&new Set(x).size===x.length&&x.every(v=>allowed.has(v));
export function assessDelegatedPublication({grant,post,quality,publicationAt,now=Date.now(),enabled=false,phase='prepare'}={}){
  const deny=reason=>({ok:false,reason});
  if(enabled!==true)return deny('委任發布尚未啟用');
  if(!Number.isFinite(now)||!['prepare','dispatch'].includes(phase))return deny('驗證時間或階段無效');
  if(!grant||grant.schema!==DELEGATION_SCHEMA||grant.revoked_at||grant.scope!=='brand-social-only'||!grant.id||!grant.owner_authorization_ref)return deny('缺少有效獨立委任授權');
  const issued=Date.parse(grant.issued_at),expires=Date.parse(grant.expires_at),at=Date.parse(publicationAt);
  if(![issued,expires,at].every(Number.isFinite)||issued>now||expires<now||at<issued||at>expires||expires>Date.parse(DELEGATION_END))return deny('委任或發布時間超出授權');
  if(phase==='prepare'&&at<=now)return deny('預定發布時間已到，須重新安排');
  if(phase==='dispatch'&&(at>now||now-at>DELEGATED_LATE_WINDOW_MS))return deny('不在委任發布的到期窗口');
  if(!post||!['pending_review','approved','scheduled'].includes(post.status)||post.published_at||post.publishedAt)return deny('貼文狀態不允許委任發布');
  if(phase==='dispatch'&&(post.status!=='scheduled'||Date.parse(post.scheduled_at)!==at))return deny('尚未建立符合委任時間的正式排程');
  if(!quality?.ok||quality.decision!=='AI_APPROVED'||!quality.review_id||!sha(quality.fingerprint)||!sha(quality.image_sha256))return deny('缺少完整現版AI品質證據');
  if(grant.post_id!==post.id||grant.fingerprint!==quality.fingerprint||grant.image_sha256!==quality.image_sha256||grant.review_id!==quality.review_id||grant.publication_at!==publicationAt)return deny('委任與現版圖文或時間不一致');
  if(!channels(grant.channels)||!channels(quality.channels)||JSON.stringify([...grant.channels].sort())!==JSON.stringify([...quality.channels].sort()))return deny('委任平台與審核平台不一致');
  const reviewed=Date.parse(quality.reviewed_at);
  if(!Number.isFinite(reviewed)||reviewed>now||now-reviewed>86400000||at-reviewed>86400000)return deny('發布前須重新驗證AI品質');
  return {ok:true,reviewer_type:'AI_DELEGATED',authorization_id:grant.id,review_id:quality.review_id,fingerprint:quality.fingerprint,image_sha256:quality.image_sha256,channels:[...grant.channels],reviewed_at:quality.reviewed_at,publication_at:publicationAt};
}

// Persist standing delegation separately from human approval. A grant is
// issued only by an authenticated owner/admin operating under the recorded
// owner mandate; never accept a caller-provided quality result or authority.
export const STANDING_AUTHORIZATION_REF='owner-chat-2026-11-12-brand-social-through-2027-02-28';
export async function ensureDelegationSchema(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS social_post_delegated_publication(
    id TEXT PRIMARY KEY, post_id TEXT NOT NULL UNIQUE, schema TEXT NOT NULL,
    scope TEXT NOT NULL, owner_authorization_ref TEXT NOT NULL,
    issued_by TEXT NOT NULL, issued_at TEXT NOT NULL, expires_at TEXT NOT NULL,
    fingerprint TEXT NOT NULL, image_sha256 TEXT NOT NULL, review_id TEXT NOT NULL,
    channels_json TEXT NOT NULL, publication_at TEXT NOT NULL, revoked_at TEXT
  )`).run();
}
export async function readDelegatedGrant(env,postId){
  try{
    const row=await env.DB.prepare('SELECT * FROM social_post_delegated_publication WHERE post_id=? LIMIT 1').bind(postId).first();
    return row?{...row,channels:JSON.parse(row.channels_json)}:null;
  }catch(error){if(/no such table/i.test(String(error)))return null;throw error;}
}
export async function prepareDelegatedGrant(env,post,publicationAt,profile,{fingerprint,verifyQuality,checkContent,now=Date.now()}={}){
  if(!['owner','admin'].includes(profile?.role)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile?.email||''))throw Error('需要正式管理者身分');
  if(post?.status!=='pending_review'||post.published_at||post.scheduled_at||post.approved_by||post.approved_at)throw Error('只接受未發布且未排程的AI品質候選');
  if(typeof fingerprint!=='function'||typeof verifyQuality!=='function'||typeof checkContent!=='function')throw Error('缺少伺服器驗證');
  const fp=await fingerprint(post);
  const quality=await verifyQuality(env,post,fp);
  const errors=await checkContent(env,post);
  if(!Array.isArray(errors)||errors.length)throw Error('現版圖文安全檢查未通過');
  const grant={id:crypto.randomUUID(),schema:DELEGATION_SCHEMA,scope:'brand-social-only',owner_authorization_ref:STANDING_AUTHORIZATION_REF,issued_by:profile.email,issued_at:new Date(now).toISOString(),expires_at:DELEGATION_END,post_id:post.id,fingerprint:fp,image_sha256:quality.image_sha256,review_id:quality.review_id,channels:quality.channels,publication_at:publicationAt};
  const assessment=assessDelegatedPublication({grant,post,quality,publicationAt,now,enabled:true});
  if(!assessment.ok)throw Error(assessment.reason);
  // All existing mappings/attempts require reconciliation, never overwrite.
  const mapping=await env.DB.prepare('SELECT post_id FROM social_metricool_sync WHERE post_id=?').bind(post.id).first();
  const delivery=await env.DB.prepare('SELECT post_id FROM social_publish_deliveries WHERE post_id=? LIMIT 1').bind(post.id).first();
  if(mapping||delivery)throw Error('已有外部排程或交付紀錄，須先核對');
  await ensureDelegationSchema(env);
  const saved=await env.DB.prepare(`INSERT INTO social_post_delegated_publication(id,post_id,schema,scope,owner_authorization_ref,issued_by,issued_at,expires_at,fingerprint,image_sha256,review_id,channels_json,publication_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM social_posts WHERE id=? AND updated_at=? AND status='pending_review' AND published_at IS NULL AND scheduled_at IS NULL AND approved_by IS NULL AND approved_at IS NULL) AND EXISTS(SELECT 1 FROM social_post_quality_reviews WHERE id=? AND post_id=? AND decision='AI_APPROVED' AND content_fingerprint=? AND NOT EXISTS(SELECT 1 FROM social_post_quality_reviews newer WHERE newer.post_id=? AND (newer.reviewed_at>social_post_quality_reviews.reviewed_at OR (newer.reviewed_at=social_post_quality_reviews.reviewed_at AND newer.created_at>social_post_quality_reviews.created_at)))) AND NOT EXISTS(SELECT 1 FROM social_metricool_sync WHERE post_id=?) AND NOT EXISTS(SELECT 1 FROM social_publish_deliveries WHERE post_id=?) ON CONFLICT(post_id) DO NOTHING`).bind(grant.id,post.id,grant.schema,grant.scope,grant.owner_authorization_ref,grant.issued_by,grant.issued_at,grant.expires_at,fp,grant.image_sha256,grant.review_id,JSON.stringify(grant.channels),publicationAt,post.id,post.updated_at,grant.review_id,post.id,fp,post.id,post.id,post.id).run();
  if(Number(saved?.meta?.changes)!==1)throw Error('版本已變更或已有委任紀錄；禁止覆寫');
  const stored=await readDelegatedGrant(env,post.id);
  if(stored?.id!==grant.id||stored.fingerprint!==fp||stored.review_id!==grant.review_id||stored.publication_at!==publicationAt)throw Error('委任授權讀回未確認');
  return {ok:true,authorization_id:stored.id,post_id:post.id,publication_at:publicationAt,reviewer_type:'AI_DELEGATED',human_approved:false,auto_schedule:false,auto_publish:false};
}

 // Actual dispatch verification always reads the persisted authorization, never
 // a browser-provided approval. No network send occurs in this function.
export async function verifyDelegatedDispatch(env,post,{fingerprint,verifyQuality,checkContent,now=Date.now()}={}){
  if(env?.XJW_AI_DELEGATED_PUBLICATION_ENABLED!=='true')return {ok:false,reason:'委任發布執行開關未啟用'};
  if(!post?.id||typeof fingerprint!=='function'||typeof verifyQuality!=='function'||typeof checkContent!=='function')return {ok:false,reason:'缺少正式發布驗證'};
  const grant=await readDelegatedGrant(env,post.id);
  if(!grant||grant.owner_authorization_ref!==STANDING_AUTHORIZATION_REF)return {ok:false,reason:'沒有可查證的正式委任授權'};
  const fp=await fingerprint(post);
  const quality=await verifyQuality(env,post,fp);
  const result=assessDelegatedPublication({grant,post,quality,publicationAt:grant.publication_at,now,enabled:true,phase:'dispatch'});
  if(!result.ok)return result;
  const errors=await checkContent(env,post);
  if(!Array.isArray(errors)||errors.length)return {ok:false,reason:'現版圖文或去重檢查未通過'};
  return result;
}
