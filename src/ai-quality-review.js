import evidence from './ai-quality-evidence.cjs';
export const AI_POLICY_VERSION='2026-10-13-ai-evidence-v1';
export async function ensureAiSchema(env){await env.DB.prepare(`CREATE TABLE IF NOT EXISTS social_post_quality_reviews(id TEXT PRIMARY KEY,post_id TEXT NOT NULL,reviewer_type TEXT NOT NULL CHECK(reviewer_type IN ('AI','HUMAN')),decision TEXT NOT NULL CHECK(decision IN ('AI_APPROVED','HUMAN_APPROVED','PENDING_REVIEW','REJECTED','NEEDS_HUMAN_REVIEW')),content_fingerprint TEXT NOT NULL,image_url TEXT NOT NULL,image_sha256 TEXT NOT NULL,evidence_json TEXT NOT NULL,model TEXT NOT NULL,policy_version TEXT NOT NULL,authorized_by TEXT NOT NULL,reviewed_at TEXT NOT NULL,old_status TEXT NOT NULL,new_status TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run()}
export async function imageHash(url){const u=new URL(url);if(u.protocol!=='https:'||!['raw.githubusercontent.com','static.metricool.com'].includes(u.hostname))throw Error('圖片來源不在正式允許範圍');const r=await fetch(u,{redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok||!/^image\//.test(r.headers.get('content-type')||''))throw Error('圖片無法讀取');const b=await r.arrayBuffer();if(b.byteLength>12*1024*1024)throw Error('圖片過大');return[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(x=>x.toString(16).padStart(2,'0')).join('')}
export async function aiGate(env,row,fp){
  await ensureAiSchema(env);
  const r=await env.DB.prepare("SELECT * FROM social_post_quality_reviews WHERE post_id=? ORDER BY reviewed_at DESC,created_at DESC LIMIT 1").bind(row.id).first();
  if(!r||r.decision!=='AI_APPROVED'||r.policy_version!==AI_POLICY_VERSION||row.approved_by!==r.authorized_by)return{ok:false,reason:'未取得目前版本的完整AI審核證據'};
  let e;try{e=JSON.parse(r.evidence_json)}catch{return{ok:false,reason:'AI審核證據格式錯誤'}};
  const result=evidence.assess(e,row.id,fp,row.image_url);
  const reviewed=Date.parse(r.reviewed_at||'');
  if(!Number.isFinite(reviewed)||Math.abs(Date.now()-reviewed)>24*3600000)return{ok:false,reason:'AI審核紀錄已過期或時間不正確'};
  if(r.content_fingerprint!==fp||r.image_url!==row.image_url||r.image_sha256!==e.image_sha256)return{ok:false,reason:'AI審核紀錄與目前圖文不一致'};
  if(result.decision!=='AI_APPROVED')return{ok:false,reason:result.reasons.join('；')};
  return{ok:true,reviewer_type:'AI',decision:'AI_APPROVED',reviewed_by:`ai:${r.model}`,reviewed_at:r.reviewed_at,fingerprint:fp,image_sha256:r.image_sha256};
}
export async function recordAiReview(env,row,e,profile,checks){
  if(!['owner','admin'].includes(profile.role))throw Error('只有正式管理者能提交AI審核證據');
  if(!['draft','pending_review'].includes(row.status))throw Error('只接受未核准內容；已排程、已發布及歷史人工核准不得被覆蓋');
  const existing=await env.DB.prepare('SELECT state,metricool_id FROM social_metricool_sync WHERE post_id=? LIMIT 1').bind(row.id).first().catch(err=>{if(String(err).includes('no such table'))return null;throw err});
  if(existing&&(existing.metricool_id||['scheduled','awaiting_work','awaiting_verification','cancel_required','unknown','published'].includes(existing.state)))throw Error('已有外部排程紀錄，禁止覆蓋核准狀態');
  const fp=await checks.fingerprint(row),result=evidence.assess(e,row.id,fp,row.image_url);
  const errors=checks.productMatchErrors(row);errors.push(...await checks.duplicatePostErrors(env,row));
  if(/(治療|改善|關節|卡卡|疲勞|精神不濟|補氣|生津|膠原蛋白|鈣質|台興山產有限公司)/.test([row.title,row.headline,row.copy,row.image_alt].join(' ')))errors.push('療效／不適合公開的品牌用語阻擋');
  if(errors.length){result.decision='REJECTED';result.reasons.push(...errors)}
  // Tiered approval is fail-closed: commercial, new-product, weather and text-only cases need manual review.
  const material=[row.title,row.headline,row.copy,row.category,row.image_alt,row.review_note].join(' ');
  const highRisk=/(優惠|折扣|促銷|特價|限時|售價|價格|元整|批發|經銷|加盟|首次上架|新品上市|新上市|預購|現貨|免運|買一送一|折價|折扣碼|柒玄茶|龜鹿調飲粉|藥品|許可證|療效|醫療|代工|委託製造)/.test(material);
  const unsupportedClaims=/(保證|根治|預防疾病|改善疾病|醫治|促進關節|膠原蛋白|鈣質)/.test(material);
  if(unsupportedClaims){result.decision='REJECTED';result.reasons.push('禁止未經確認的醫療或食品功效宣稱')}
  if(result.decision==='AI_APPROVED'&&(highRisk||!String(row.image_url||'').trim()||checks.isWeatherPost(row))){
    result.decision='NEEDS_HUMAN_REVIEW';
    result.reasons.push(highRisk?'涉及商業／新商品／法規敏感內容':!String(row.image_url||'').trim()?'純文字發布平台尚未完成正式驗證':'天氣時效內容須人工確認');
  }
  if(result.decision==='AI_APPROVED'){
    if(await imageHash(row.image_url)!==e.image_sha256)throw Error('成圖內容與審核雜湊不一致');
    if(await imageHash(e.visual.mascot_reference.url)!==e.visual.mascot_reference.sha256)throw Error('角色原始參考雜湊不一致');
    for(const asset of e.visual.product_assets||[])if(await imageHash(asset.url)!==asset.sha256)throw Error('正式產品原圖雜湊不一致');
    if(checks.isWeatherPost(row)&&Date.now()-Date.parse(e.reviewed_at)>12*3600000){result.decision='NEEDS_HUMAN_REVIEW';result.reasons.push('天氣需重新查證')}
    if(Math.abs(Date.now()-Date.parse(e.reviewed_at))>24*3600000){result.decision='NEEDS_HUMAN_REVIEW';result.reasons.push('AI審核證據已過期')}
  }
  await ensureAiSchema(env);const id='AI-REVIEW-'+crypto.randomUUID(),now=new Date().toISOString(),approved=result.decision==='AI_APPROVED',next='pending_review';
  const saved=await env.DB.batch([
    env.DB.prepare('INSERT INTO social_post_quality_reviews(id,post_id,reviewer_type,decision,content_fingerprint,image_url,image_sha256,evidence_json,model,policy_version,authorized_by,reviewed_at,old_status,new_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,row.id,'AI',result.decision,fp,row.image_url,e?.image_sha256||'',JSON.stringify({...e,assessment:result}),e?.model||'unverified',AI_POLICY_VERSION,profile.email,e?.reviewed_at||now,row.status,next),
    // AI assessment is evidence only; clear human approval and scheduling.
    env.DB.prepare("UPDATE social_posts SET status=?,approved_by=?,approved_at=?,image_approved=?,scheduled_at=NULL,review_note=?,updated_at=? WHERE id=? AND updated_at=? AND status IN ('draft','pending_review')").bind(next,null,null,0,'AI審核：'+result.decision+'；'+result.reasons.join('；'),now,row.id,row.updated_at)
  ]);
  if(saved[1]?.meta?.changes!==1)throw Error('正式內容已變更；舊核准證據不生效');
  return{ok:true,review_id:id,reviewer_type:'AI',...result,status:next};
}
