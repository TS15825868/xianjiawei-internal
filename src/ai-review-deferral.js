// Evidence-only deferral: cannot approve, schedule, publish, or modify reviewed posts.
const CHECKS=['brand','product','specification','pricing_activity','season','weather','occasion','location','scene_environment','temperature','expression','action','mascot_companions','physical_scale','duplicate','compliance_final'];
const clean=x=>String(x??'').trim();
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
export function validateDeferral(e,row,fp,profile){
 if(!['owner','admin'].includes(profile?.role)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(profile.email)))throw Error('只有正式管理者能記錄AI defer證據');
 if(row.status!=='pending_review'||row.published_at||row.scheduled_at||clean(row.approved_by)||Number(row.image_approved||0))throw Error('defer僅接受未核准且未排程的待審貼文');
 if(e?.requested_decision!=='defer'||e.reviewer_type!=='AI'||!clean(e.model)||e.post_id!==row.id||e.content_fingerprint!==fp||e.image_url!==row.image_url||!/^[a-f0-9]{64}$/.test(e.image_sha256||''))throw Error('defer證據身分、圖文版本或圖片雜湊不完整');
 if(CHECKS.some(k=>!['PASS','DEFER'].includes(e.checks?.[k]?.result)||clean(e.checks[k].evidence).length<12)||!CHECKS.some(k=>e.checks[k].result==='DEFER'))throw Error('defer須有16項逐項證據及至少一項未確認；FAIL請走不合格審核');
 if(!Array.isArray(e.risk?.uncertainties)||!e.risk.uncertainties.length||e.publication?.approved!==false||e.publication?.auto_publish!==false)throw Error('defer須列明證據缺口，且不得授權發布');
 const time=Date.parse(e.reviewed_at);if(!Number.isFinite(time)||time>Date.now()+60000||Date.now()-time>86400000)throw Error('defer審核時間已過期或不正確');
}
export async function recordAiDeferral(env,row,e,profile,{fingerprint,ensureAiSchema}){
 const fp=await fingerprint(row);validateDeferral(e,row,fp,profile);
 // An external draft may retain its original ID. Unknown/scheduled/public receipts never qualify.
 const external=await env.DB.prepare('SELECT state,metricool_id FROM social_metricool_sync WHERE post_id=? LIMIT 1').bind(row.id).first();
 if(external&&!['pending_review','draft'].includes(clean(external.state)))throw Error('外部排程或狀態不明，禁止寫入defer');
 const delivery=await env.DB.prepare("SELECT platform,status FROM social_publish_deliveries WHERE post_id=? AND (COALESCE(attempt_count,0)>0 OR last_attempt_at IS NOT NULL OR published_at IS NOT NULL OR TRIM(COALESCE(remote_id,''))<>'' OR status IN ('sending','retry','published','manual_required','permanent_failed')) LIMIT 1").bind(row.id).first();
 if(delivery)throw Error('已有發送嘗試或平台回執，須先核對，不寫入defer');
 await ensureAiSchema(env);
 const serialized=JSON.stringify(e),id='AI-DEFER-'+await digest(serialized);
 const prior=await env.DB.prepare('SELECT id,decision,content_fingerprint,image_url,evidence_json FROM social_post_quality_reviews WHERE id=? LIMIT 1').bind(id).first();
 if(prior){if(prior.content_fingerprint!==fp||prior.image_url!==row.image_url||prior.evidence_json!==serialized||prior.decision!=='NEEDS_HUMAN_REVIEW')throw Error('既有defer證據不一致');return{ok:true,review_id:id,decision:'NEEDS_HUMAN_REVIEW',status:'pending_review',idempotent:true,human_review_required:true,auto_schedule:false,auto_publish:false};}
 const now=new Date().toISOString(),policy='2026-10-31-ai-deferral-only-v1';
 const saved=await env.DB.batch([
  env.DB.prepare("UPDATE social_posts SET review_note=?,updated_at=? WHERE id=? AND updated_at=? AND status='pending_review' AND published_at IS NULL AND (scheduled_at IS NULL OR scheduled_at='') AND (approved_by IS NULL OR approved_by='') AND COALESCE(image_approved,0)=0 AND NOT EXISTS(SELECT 1 FROM social_metricool_sync WHERE post_id=social_posts.id AND state NOT IN ('pending_review','draft')) AND NOT EXISTS(SELECT 1 FROM social_publish_deliveries WHERE post_id=social_posts.id AND (COALESCE(attempt_count,0)>0 OR last_attempt_at IS NOT NULL OR published_at IS NOT NULL OR TRIM(COALESCE(remote_id,''))<>'' OR status IN ('sending','retry','published','manual_required','permanent_failed')))").bind('AI審核：NEEDS_HUMAN_REVIEW；'+e.risk.uncertainties.join('；'),now,row.id,row.updated_at),
  env.DB.prepare("INSERT INTO social_post_quality_reviews(id,post_id,reviewer_type,decision,content_fingerprint,image_url,image_sha256,evidence_json,model,policy_version,authorized_by,reviewed_at,old_status,new_status) SELECT ?,?,'AI','NEEDS_HUMAN_REVIEW',?,?,?,?,?,?,?,?, 'pending_review','pending_review' WHERE changes()=1 AND EXISTS(SELECT 1 FROM social_posts WHERE id=? AND updated_at=? AND status='pending_review' AND COALESCE(image_approved,0)=0 AND (approved_by IS NULL OR approved_by=''))").bind(id,row.id,fp,row.image_url,e.image_sha256,serialized,e.model,policy,profile.email,e.reviewed_at,row.id,now)
 ]);
 if(saved[0]?.meta?.changes!==1||saved[1]?.meta?.changes!==1)throw Error('defer寫入時版本已變更或證據未成功保存');
 return{ok:true,review_id:id,reviewer_type:'AI',decision:'NEEDS_HUMAN_REVIEW',status:'pending_review',human_review_required:true,auto_schedule:false,auto_publish:false};
}
