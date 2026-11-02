// Evidence-only rejection. Never grants approval, scheduling or publication authority.
const CHECKS=['brand','product','specification','pricing_activity','season','weather','occasion','location','scene_environment','temperature','expression','action','mascot_companions','physical_scale','duplicate','compliance_final'];
const clean=x=>String(x??'').trim();
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
export function validateRejection(e,row,fp,profile){
 if(!['owner','admin'].includes(profile?.role)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(profile.email)))throw Error('只有正式管理者能記錄AI reject證據');
 if(!['draft','pending_review'].includes(row.status)||row.published_at||row.scheduled_at||clean(row.approved_by)||Number(row.image_approved||0))throw Error('reject僅接受未核准且未排程的草稿或待審貼文');
 if(e?.requested_decision!=='reject'||e.reviewer_type!=='AI'||!clean(e.model)||e.post_id!==row.id||e.content_fingerprint!==fp||e.image_url!==row.image_url||!/^[a-f0-9]{64}$/.test(e.image_sha256||''))throw Error('reject證據身分、圖文版本或圖片雜湊不完整');
 if(CHECKS.some(k=>!['PASS','DEFER','FAIL'].includes(e.checks?.[k]?.result)||clean(e.checks[k].evidence).length<12)||!CHECKS.some(k=>e.checks[k].result==='FAIL'))throw Error('reject須有16項逐項證據及至少一項確定不合格；證據不足請使用defer');
 if(e.publication?.approved!==false||e.publication?.auto_publish!==false)throw Error('reject不得授權發布');
 const time=Date.parse(e.reviewed_at);if(!Number.isFinite(time)||time>Date.now()+60000||Date.now()-time>86400000)throw Error('reject審核時間已過期或不正確');
}
export async function recordAiRejection(env,row,e,profile,{fingerprint,ensureAiSchema,imageHash}){
 const fp=await fingerprint(row);validateRejection(e,row,fp,profile);
 const external=await env.DB.prepare('SELECT state,metricool_id FROM social_metricool_sync WHERE post_id=? LIMIT 1').bind(row.id).first();
 if(external&&!['pending_review','draft'].includes(clean(external.state)))throw Error('外部排程或狀態不明，禁止寫入reject');
 const delivery=await env.DB.prepare("SELECT platform,status FROM social_publish_deliveries WHERE post_id=? AND (COALESCE(attempt_count,0)>0 OR last_attempt_at IS NOT NULL OR published_at IS NOT NULL OR TRIM(COALESCE(remote_id,''))<>'' OR status IN ('sending','retry','published','manual_required','permanent_failed')) LIMIT 1").bind(row.id).first();
 if(delivery)throw Error('已有發送嘗試或平台回執，須先核對，不寫入reject');
 if(await imageHash(row.image_url)!==e.image_sha256)throw Error('成圖內容與reject審核雜湊不一致');
 await ensureAiSchema(env);
 const serialized=JSON.stringify(e),id='AI-REJECT-'+await digest(serialized);
 const prior=await env.DB.prepare('SELECT id,decision,content_fingerprint,image_url,evidence_json FROM social_post_quality_reviews WHERE id=? LIMIT 1').bind(id).first();
 if(prior){if(prior.content_fingerprint!==fp||prior.image_url!==row.image_url||prior.evidence_json!==serialized||prior.decision!=='REJECTED')throw Error('既有reject證據不一致');return{ok:true,review_id:id,decision:'REJECTED',status:row.status,idempotent:true,human_review_required:true,auto_schedule:false,auto_publish:false};}
 const now=new Date().toISOString(),policy='2026-11-02-ai-rejection-only-v1';
 const failures=CHECKS.filter(k=>e.checks[k].result==='FAIL').map(k=>k+': '+e.checks[k].evidence);
 const saved=await env.DB.batch([
  env.DB.prepare("UPDATE social_posts SET review_note=?,updated_at=? WHERE id=? AND updated_at=? AND status IN ('draft','pending_review') AND published_at IS NULL AND (scheduled_at IS NULL OR scheduled_at='') AND (approved_by IS NULL OR approved_by='') AND COALESCE(image_approved,0)=0 AND NOT EXISTS(SELECT 1 FROM social_metricool_sync WHERE post_id=social_posts.id AND state NOT IN ('pending_review','draft')) AND NOT EXISTS(SELECT 1 FROM social_publish_deliveries WHERE post_id=social_posts.id AND (COALESCE(attempt_count,0)>0 OR last_attempt_at IS NOT NULL OR published_at IS NOT NULL OR TRIM(COALESCE(remote_id,''))<>'' OR status IN ('sending','retry','published','manual_required','permanent_failed')))").bind('AI審核：REJECTED；'+failures.join('；'),now,row.id,row.updated_at),
  env.DB.prepare("INSERT INTO social_post_quality_reviews(id,post_id,reviewer_type,decision,content_fingerprint,image_url,image_sha256,evidence_json,model,policy_version,authorized_by,reviewed_at,old_status,new_status) SELECT ?,?,'AI','REJECTED',?,?,?,?,?,?,?,?,?,? WHERE changes()=1 AND EXISTS(SELECT 1 FROM social_posts WHERE id=? AND updated_at=? AND status=? AND COALESCE(image_approved,0)=0 AND (approved_by IS NULL OR approved_by=''))").bind(id,row.id,fp,row.image_url,e.image_sha256,serialized,e.model,policy,profile.email,e.reviewed_at,row.status,row.status,row.id,now,row.status)
 ]);
 if(saved[0]?.meta?.changes!==1||saved[1]?.meta?.changes!==1)throw Error('reject寫入時版本已變更或證據未成功保存');
 return{ok:true,review_id:id,reviewer_type:'AI',decision:'REJECTED',status:row.status,human_review_required:true,auto_schedule:false,auto_publish:false};
}
