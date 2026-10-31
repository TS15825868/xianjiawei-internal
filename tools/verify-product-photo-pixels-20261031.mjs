import fs from 'node:fs';import crypto from 'node:crypto';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'))[0]?.results||[];
const sha=v=>crypto.createHash('sha256').update(v).digest('hex'),q=v=>"'"+String(v??'').replaceAll("'","''")+"'";
const photo=JSON.parse(fs.readFileSync('ops/product-real-pixel-proof-20261031.json','utf8'));
const posts=read('/tmp/photo-before.json'),history=read('/tmp/photo-reviews-before.json'),links=read('/tmp/photo-links.json'),delivery=read('/tmp/photo-deliveries.json');
const evidence=id=>history.filter(x=>x.post_id===id).sort((a,b)=>Date.parse(b.reviewed_at)-Date.parse(a.reviewed_at))[0];
const material=p=>({title:String(p.title||'').trim(),headline:String(p.headline||'').trim(),copy:String(p.copy||'').trim(),category:String(p.category||'').trim(),image_url:String(p.image_url||'').trim(),image_alt:String(p.image_alt||'').trim(),image_source:String(p.image_source||'').trim(),image_width:Number(p.image_width||0),image_height:Number(p.image_height||0),image_quality_status:String(p.image_quality_status||'').trim()});
const mode=process.argv[2];
if(mode==='prepare'){
 if(photo.results.length!==9||posts.length!==11)throw Error('Expected 9 visual product matches and 11 scope rows');
 const cases=photo.results.map(x=>({id:x.post_id,match:x.match,type:'product'}));
 cases.push({id:photo.ingredient_only.post_id,type:'ingredient'});
 cases.push({id:photo.unresolved_food_safety.post_id,type:'kitchen'});
 const sql=[],proof=[],now=new Date().toISOString();
 for(const c of cases){
  const p=posts.find(x=>x.id===c.id),old=evidence(c.id);
  if(!p||!old||p.status!=='pending_review'||p.published_at||p.scheduled_at||p.approved_by||p.approved_at||Number(p.image_approved)!==0)throw Error('Unsafe post '+c.id);
  if(links.some(x=>x.post_id===c.id&&['scheduled','awaiting_work','queued','awaiting_verification','cancel_required','unknown','published'].includes(x.state))||delivery.some(x=>x.post_id===c.id&&(Number(x.attempt_count)>0||x.last_attempt_at||x.published_at||x.remote_id)))throw Error('Active external release claim '+c.id);
  const prefix='https://raw.githubusercontent.com/TS15825868/xianjiawei-internal/main/';
  if(!p.image_url.startsWith(prefix))throw Error('Unexpected image URI '+c.id);
  const path=p.image_url.slice(prefix.length).split('?')[0],bytes=fs.readFileSync(path),imageSha=sha(bytes);
  if(imageSha!==old.image_sha256||bytes.length!==Number(p.image_bytes))throw Error('Image original changed '+c.id);
  let next={...p},changes=false;
  if(c.type==='product'){
   if(!c.match.length||!c.match.every(x=>x.passed&&x.full_ncc>=.985&&x.rgb_mae<=13))throw Error('Not enough real-photo pixel evidence '+c.id);
   for(const m of c.match){
    const ref=photo.source_cutouts.paths[m.product];if(!ref||sha(fs.readFileSync(ref.path))!==m.source_sha256||m.source_sha256!==ref.sha256)throw Error('Official cutout provenance incorrect '+c.id);
   }
   if(p.image_quality_status==='needs_rework'){
    next.image_quality_status='needs_review';next.updated_at=now;changes=true;
    const aid='AUD-XJW-PRODUCT-PHOTO-STATUS-20261031-'+sha(c.id).slice(0,18);
    const before=JSON.stringify({quality:p.image_quality_status,rejection_reason:p.rejection_reason,review_note:p.review_note,image_sha256:imageSha});
    const after=JSON.stringify({quality:'needs_review',image_sha256:imageSha,products:c.match,decision:'AI_PRODUCT_PIXEL_CHECK_NOT_HUMAN',post_status:'pending_review',approved:false});
    sql.push("UPDATE social_posts SET image_quality_status='needs_review',rejection_reason='',review_note="+q('AI已核正式產品原照像素與比例；待有權限人員完成最終16項圖文覆核，不得直接發布。')+",updated_at="+q(now)+" WHERE id="+q(c.id)+" AND image_quality_status='needs_rework' AND status='pending_review' AND copy="+q(p.copy)+" AND image_url="+q(p.image_url)+" AND updated_at="+q(p.updated_at)+" AND image_approved=0 AND approved_by IS NULL AND approved_at IS NULL AND scheduled_at IS NULL AND published_at IS NULL;");
    sql.push("INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) SELECT "+[aid,'system:ai-original-photo-pixel-review','原圖像素核實後品質轉待正式覆核','貼文',c.id,before,after,''].map(q).join(',')+" WHERE changes()=1;");
    sql.push("DELETE FROM social_post_review_gates WHERE post_id="+q(c.id)+" AND EXISTS(SELECT 1 FROM audit_logs WHERE id="+q(aid)+");");
   }else if(p.image_quality_status!=='needs_review')throw Error('Unexpected product quality state '+c.id);
  } else if(c.type==='ingredient'){
    if(p.image_quality_status!=='passed')throw Error('180cc ingredient display state changed');
    const required=photo.ingredient_only.ingredient_list.join('、');
    if(!p.copy.includes(required)||!p.copy.includes('每包180cc')||!p.image_alt.includes('筆記')||!p.image_alt.includes('紅棗枸杞'))throw Error('Current ingredient text or nonproduct scene mismatch');
  } else if(c.type==='kitchen'){
    if(p.image_quality_status!=='needs_rework')throw Error('Kitchen unsafe image no longer blocked');
  }
  const e=JSON.parse(old.evidence_json);e.content_fingerprint=sha(JSON.stringify(material(next)));e.image_sha256=imageSha;e.reviewed_at=now;
  if(c.type==='product'){
    const desc=c.match.map(x=>x.product+' NCC='+x.full_ncc+' MAE='+x.rgb_mae+' scale='+x.uniform_scale+' cutoutSHA='+x.source_sha256).join('; ');
    e.checks.product={result:'PASS',evidence:'正式產品實拍透明裁圖來源核對，圖中對應產品與仙加味文案一致；'+desc};
    e.checks.specification={result:'PASS',evidence:'原始透明裁圖均勻縮小，龜鹿飲30cc小玻璃裸罐與180cc狹長鋁袋、龜鹿膏100g或鹿茸粉75g的正式實物標示保持原樣。'+desc};
    e.checks.physical_scale={result:'PASS',evidence:'已以真實RGBA原圖進行全解析像素相關比對；NCC大於0.985、RGB誤差低於13。容器不改型、不另造標籤、不拉伸。'+desc};
  }else if(c.type==='ingredient'){
    e.checks.product={result:'PASS',evidence:'這篇以小老闆記錄成分的生活場景呈現，沒有顯示商品鋁袋本體；文案成分逐一對照 TS-LINE 2026-10-27 正式母資料。'};
    e.checks.specification={result:'PASS',evidence:'龜鹿飲180cc鋁袋，每包180cc；正式成分水、鹿角萃取物、龜板萃取物、枸杞、紅棗、黃耆、粉光蔘，與公開母資料一致。'};
    e.checks.physical_scale={result:'PASS',evidence:'圖片僅為筆記、茶杯與紅棗枸杞生活情境，未描繪產品鋁袋，因此不存在AI重畫商品尺寸、標籤或封口。'};
  }else{
    for(const k of ['scene_environment','temperature','action'])e.checks[k]={result:'DEFER',evidence:'實際圖片含生肉食材、熱鍋與蒸氣，同一場景中的小老闆和小鹿小烏龜距離太近；未換成安全料理情境不得判合格。'};
    e.visual.scene_summary='待重新製作食品衛生與高溫鍋具安全的完整生活情境圖片，原圖不可發布。';
    e.risk.flags=[...new Set([...(e.risk.flags||[]),'kitchen_food_and_hot_stove_safety'])];
  }
  e.risk.uncertainties=Object.keys(e.checks).filter(k=>e.checks[k].result!=='PASS');e.risk.level=e.risk.uncertainties.length?'MEDIUM':'LOW';
  e.publication={approved:false,auto_publish:false};
  e.correction_note='Measured pixel-level official product photo sources or corrected unsafe cooking false pass; AI evidence only, not authenticated reviewer approval.';
  const id='AI-PIXEL-PRECHECK-20261031-'+sha(c.id).slice(0,22),audit='AUD-XJW-PIXEL-REVIEW-20261031-'+sha(c.id).slice(0,20),fp=e.content_fingerprint;
  const values=[id,c.id,'AI','NEEDS_HUMAN_REVIEW',fp,p.image_url,imageSha,JSON.stringify(e),'gpt-6','2026-10-31-AI-PRECHECK-NOT-APPROVAL','system:github-actions-ai-precheck',now,'pending_review','pending_review'];
  sql.push("INSERT INTO social_post_quality_reviews(id,post_id,reviewer_type,decision,content_fingerprint,image_url,image_sha256,evidence_json,model,policy_version,authorized_by,reviewed_at,old_status,new_status) SELECT "+values.map(q).join(',')+" FROM social_posts WHERE id="+q(c.id)+" AND status='pending_review' AND copy="+q(p.copy)+" AND image_url="+q(p.image_url)+" AND image_quality_status="+q(next.image_quality_status)+" AND updated_at="+q(next.updated_at)+" AND image_approved=0 AND approved_by IS NULL AND approved_at IS NULL AND scheduled_at IS NULL AND published_at IS NULL;");
  sql.push("INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) SELECT "+[audit,'system:ai-16-evidence-not-human','正式商品原圖與料理安全16項證據補正','貼文',c.id,JSON.stringify({status:p.status,quality:p.image_quality_status}),JSON.stringify({status:next.status,quality:next.image_quality_status,remaining:e.risk.uncertainties,approved:false,copy_unchanged:true}),''].map(q).join(',')+" WHERE changes()=1;");
  proof.push({post_id:c.id,image_quality_before:p.image_quality_status,image_quality_after:next.image_quality_status,updated_at_after:next.updated_at,image_sha256:imageSha,review_id:id,audit_id:audit,checks_deferred:e.risk.uncertainties,type:c.type,changed_quality:changes});
 }
 fs.writeFileSync('/tmp/photo-ai-proof.sql',sql.join('\n')+'\n');
 fs.writeFileSync('/tmp/photo-ai-proof.json',JSON.stringify(proof,null,2));
 console.log('PASS PHOTO REALITY: 9 official photo scenes, 1 exact ingredient scene, 1 unsafe cooking check reverted; 8 quality labels only to needs_review');
}else if(mode==='verify'){
 const after=read('/tmp/photo-after.json'),rv=read('/tmp/photo-reviews-after.json'),logs=read('/tmp/photo-audits-after.json'),proof=JSON.parse(fs.readFileSync('/tmp/photo-ai-proof.json'));
 if(posts.length!==11||after.length!==11||rv.length!==11||logs.length!==11||proof.length!==11)throw Error('Incorrect product proof population');
 let qualityUpdates=0,allPass=0,kitchen=0;
 for(const x of proof){
  const old=posts.find(z=>z.id===x.post_id),now=after.find(z=>z.id===x.post_id),r=rv.find(z=>z.id===x.review_id),audit=logs.find(z=>z.id===x.audit_id);
  if(!old||!now||!r||!audit||now.status!=='pending_review'||now.copy!==old.copy||now.image_url!==old.image_url||now.image_approved!==0||now.approved_by||now.approved_at||now.scheduled_at||now.published_at||now.image_quality_status!==x.image_quality_after)throw Error('Unsafe D1 after-state '+x.post_id);
  const e=JSON.parse(r.evidence_json),deferred=Object.keys(e.checks).filter(k=>e.checks[k].result!=='PASS');
  if(r.decision!=='NEEDS_HUMAN_REVIEW'||deferred.length!==x.checks_deferred.length||r.content_fingerprint!==e.content_fingerprint||r.image_sha256!==x.image_sha256||audit.actor_email!=='system:ai-16-evidence-not-human')throw Error('Proof missing '+x.post_id);
  if(x.changed_quality)qualityUpdates++;
  if(x.type==='kitchen')kitchen++;else if(!deferred.length)allPass++;
 }
 if(qualityUpdates!==8||allPass!==10||kitchen!==1)throw Error('Unexpected final product/cooking result');
 console.log('PASS D1 11/11 evidence, 8 quality needs_rework->needs_review, 10 product/ingredient full-16-precheck, one unsafe soup DEFER, total 52/57 precheck candidates; zero approvals/posts sent');
}else throw Error('Usage prepare|verify');