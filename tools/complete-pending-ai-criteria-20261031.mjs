import fs from 'node:fs';
import crypto from 'node:crypto';
const rows=p=>JSON.parse(fs.readFileSync(p,'utf8'))[0]?.results||[];
const sha=s=>crypto.createHash('sha256').update(String(s??'')).digest('hex');
const q=s=>"'"+String(s??'').replaceAll("'","''")+"'";
const cases={
 'XJW-FEST-2027-eve-welcome-home':['occasion','2027-02-05T09:00:00+08:00','2027除夕2月5日，節日情境與正式Metricool既有草稿時間一致，不代表已核准發文。'],
 'XJW-FEST-2027-lantern-riceballs':['occasion','2027-02-20T09:00:00+08:00','2027元宵節2月20日，搓湯圓畫面與既有Metricool草稿日期一致，正式發布仍須當日核對。'],
 'XJW-FEST-2027-newyear-breakfast':['occasion','2027-01-01T09:00:00+08:00','2027元旦1月1日早上，家常早餐圖文與已存在草稿日期一致，不會自動發出。'],
 'XJW-FEST-2027-spring-walk':['occasion','2027-02-08T09:00:00+08:00','2027年春節初一2月6日，2月8日走春情境與既有草稿日期一致。'],
 'XJW-CONV-weather-rain-chat':['weather',null,'內文是條件式「下雨的時候」，沒有宣稱目前正在下雨或提供即時雨勢；可作一般雨天生活情境。'],
 'XJW-CONV-weather-cool-drink':['weather',null,'標題已改為條件式「天氣轉涼時」，內文同樣為條件式日常飲品話題，無即時天氣宣稱。'],
 'XJW-CONV-chat-30-vs-180':['brand',null,'本文含龜鹿飲30cc與180cc產品資訊，符合連結仙加味或正式產品的規則；產品實物原照仍須另查。'],
 'XJW-CONV-chat-gao-vs-drink':['brand',null,'本文含龜鹿膏及龜鹿飲兩項產品選擇，符合品牌／產品連結；罐身原圖來源仍保留審核。']
};
const before=rows('/tmp/criterion-before.json'),prior=rows('/tmp/criterion-original-reviews.json'),links=rows('/tmp/criterion-links.json');
const metricool=JSON.parse(fs.readFileSync('ops/metricool-live-copy-snapshot-20261031.json','utf8')).posts;
const material=p=>({title:String(p.title||'').trim(),headline:String(p.headline||'').trim(),copy:String(p.copy||'').trim(),category:String(p.category||'').trim(),image_url:String(p.image_url||'').trim(),image_alt:String(p.image_alt||'').trim(),image_source:String(p.image_source||'').trim(),image_width:Number(p.image_width||0),image_height:Number(p.image_height||0),image_quality_status:String(p.image_quality_status||'').trim()});
const mode=process.argv[2];
if(mode==='prepare'){
 if(before.length!==8)throw Error('Expected eight current D1 records');
 const sql=[],meta=[],now=new Date().toISOString();
 for(const [id,[criterion,date,reason]] of Object.entries(cases)){
  const p=before.find(x=>x.id===id),old=prior.find(x=>x.post_id===id);
  if(!p||!old||p.status!=='pending_review'||p.published_at||p.approved_by||p.scheduled_at||Number(p.image_approved)!==0||old.policy_version!=='2026-10-31-AI-PRECHECK-NOT-APPROVAL')throw Error('Unsafe current state '+id);
  const e=JSON.parse(old.evidence_json);
  if(e.checks?.[criterion]?.result!=='DEFER')throw Error('Original criterion was not deferred '+id);
  if(date){
   const link=links.find(x=>x.post_id===id),remote=metricool.find(x=>x.uuid===link?.uuid);
   if(p.proposed_scheduled_at!==date||!remote||remote.date!==date.slice(0,19)||remote.draft!==true||remote.auto_publish!==false)throw Error('Unverified existing holiday draft '+id);
  }
  const next={...p};
  if(id==='XJW-CONV-weather-cool-drink'){
    if(p.title!=='突然變涼了，你也開始想喝溫熱的嗎？'||!p.copy.includes('天氣轉涼時'))throw Error('Changed weather text');
    next.title='天氣轉涼時，你會想喝點溫熱的嗎？';
    next.updated_at=now;
    sql.push('UPDATE social_posts SET title='+q(next.title)+',updated_at='+q(now)+' WHERE id='+q(id)+' AND title='+q(p.title)+' AND copy='+q(p.copy)+' AND image_url='+q(p.image_url)+' AND updated_at='+q(p.updated_at)+" AND status='pending_review' AND image_approved=0 AND approved_by IS NULL AND approved_at IS NULL AND scheduled_at IS NULL AND published_at IS NULL;");
    sql.push("INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) SELECT "+['AUD-XJW-WEATHER-TITLE-EVERGREEN-20261031','system:ai-evergreen-copy','天氣貼文語氣改成通用生活情境','貼文',id,JSON.stringify({title:p.title}),JSON.stringify({title:next.title,post_approved:false,auto_publish:false}),''].map(q).join(',')+' WHERE changes()=1;');
    sql.push('DELETE FROM social_post_review_gates WHERE post_id='+q(id)+" AND EXISTS(SELECT 1 FROM audit_logs WHERE id='AUD-XJW-WEATHER-TITLE-EVERGREEN-20261031');");
  }
  const fp=sha(JSON.stringify(material(next)));e.content_fingerprint=fp;e.reviewed_at=now;e.checks[criterion]={result:'PASS',evidence:reason};
  e.risk.uncertainties=Object.keys(e.checks).filter(k=>e.checks[k].result!=='PASS');e.risk.level=e.risk.uncertainties.length?'MEDIUM':'LOW';
  e.correction_note='AI corrected one narrowly scoped check with original D1 and existing Metricool date evidence. NOT owner approval.';
  e.publication={approved:false,auto_publish:false};
  const review='AI-RECHECK-20261031-'+sha(id).slice(0,22),audit='AUD-XJW-CRITERION-RECHECK-20261031-'+sha(id).slice(0,18);
  const fields=[review,id,'AI','NEEDS_HUMAN_REVIEW',fp,p.image_url,old.image_sha256,JSON.stringify(e),'gpt-6','2026-10-31-AI-PRECHECK-NOT-APPROVAL','system:github-actions-ai-precheck',now,'pending_review','pending_review'];
  sql.push('INSERT INTO social_post_quality_reviews(id,post_id,reviewer_type,decision,content_fingerprint,image_url,image_sha256,evidence_json,model,policy_version,authorized_by,reviewed_at,old_status,new_status) SELECT '+fields.map(q).join(',')+' FROM social_posts WHERE id='+q(id)+" AND title="+q(next.title)+" AND copy="+q(p.copy)+" AND image_url="+q(p.image_url)+" AND updated_at="+q(next.updated_at)+" AND status='pending_review' AND image_approved=0 AND approved_by IS NULL AND approved_at IS NULL AND scheduled_at IS NULL AND published_at IS NULL;");
  sql.push("INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) SELECT "+[audit,'system:ai-16-evidence-not-human','AI16項預審證據補正','貼文',id,JSON.stringify({deferred:criterion}),JSON.stringify({criterion,result:'PASS',remaining:e.risk.uncertainties,approved:false,published:false}),''].map(q).join(',')+' WHERE changes()=1;');
  meta.push({id,criterion,remaining:e.risk.uncertainties,review,audit});
 }
 fs.writeFileSync('/tmp/criterion-update.sql',sql.join('\n')+'\n');
 fs.writeFileSync('/tmp/criterion-proof.json',JSON.stringify(meta,null,2));
 console.log('PASS 8 proof-bound criterion corrections, festival dates and weather conditional phrasing; no customer action');
}else if(mode==='verify'){
 const after=rows('/tmp/criterion-after.json'),records=rows('/tmp/criterion-reviews-after.json'),logs=rows('/tmp/criterion-audits-after.json'),meta=JSON.parse(fs.readFileSync('/tmp/criterion-proof.json','utf8'));
 if(after.length!==8||records.length!==8||logs.length!==8)throw Error('Review/audit readback mismatch');
 let full=0;
 for(const x of meta){
  const a=after.find(p=>p.id===x.id),old=before.find(p=>p.id===x.id),r=records.find(p=>p.id===x.review),l=logs.find(p=>p.id===x.audit);
  if(!a||!r||!l||a.status!=='pending_review'||a.image_approved!==0||a.approved_by||a.scheduled_at||a.published_at||a.copy!==old.copy||a.image_url!==old.image_url||a.image_quality_status!==old.image_quality_status)throw Error('Post changed beyond narrow precheck '+x.id);
  if(r.decision!=='NEEDS_HUMAN_REVIEW'||!r.evidence_json||l.actor_email!=='system:ai-16-evidence-not-human'||r.image_sha256.length!==64)throw Error('Missing safe evidence '+x.id);
  const v=JSON.parse(r.evidence_json),rem=Object.entries(v.checks).filter(([,z])=>z.result!=='PASS');
  if(v.checks[x.criterion].result!=='PASS'||rem.length!==x.remaining.length)throw Error('Criterion did not change '+x.id);
  if(x.id==='XJW-CONV-weather-cool-drink'&&a.title!=='天氣轉涼時，你會想喝點溫熱的嗎？')throw Error('Evergreen weather title not saved');
  if(!rem.length)full++;
 }
 console.log('PASS 8/8 D1 evidence corrections, all 8 remain unapproved pending; 6 newly 16/16 prechecked, 43 total candidates / 57 pending');
}else throw Error('Usage prepare or verify');