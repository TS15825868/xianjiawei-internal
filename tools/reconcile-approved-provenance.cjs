'use strict';
const fs=require('fs');
const crypto=require('crypto');
const REQUIRED=['brand','product','specification','pricing_activity','season','weather','occasion','location','scene_environment','temperature','expression','action','mascot_companions','physical_scale','duplicate','compliance_final'];
const rowsFrom=p=>JSON.parse(fs.readFileSync(p,'utf8')).flatMap(v=>v.results||[]);
const clean=v=>String(v??'').trim();
const material=r=>({title:clean(r?.title),headline:clean(r?.headline),copy:clean(r?.copy),category:clean(r?.category),image_url:clean(r?.image_url),image_alt:clean(r?.image_alt),image_source:clean(r?.image_source),image_width:Number(r?.image_width||0),image_height:Number(r?.image_height||0),image_quality_status:clean(r?.image_quality_status)});
const fingerprint=r=>crypto.createHash('sha256').update(JSON.stringify(material(r)),'utf8').digest('hex');
const isWeather=r=>/(天氣|悶熱|炎熱|下雨|雨天|溫差|換季|寒冷|轉涼|颱風|豪雨)/.test([r?.title,r?.headline,r?.copy,r?.category,r?.image_alt].filter(Boolean).join(' '));
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
const candidates=rowsFrom('/tmp/xjw-review-provenance-before.json');
const count={total:candidates.length,valid:0,skipped:{}};
const updates=[];
function skip(reason){count.skipped[reason]=(count.skipped[reason]||0)+1;}
for(const row of candidates){
 if(row.status!=='approved'||clean(row.approved_by)||!clean(row.approved_at)){skip('not_approved_with_missing_user');continue;}
 if(!row.reviewed_by||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.reviewed_by)||/^(?:ai|bot|chatgpt|assistant)[:\-]/i.test(row.reviewed_by)||Number(row.reviewer_active)!==1){skip('reviewer_not_verified');continue;}
 const reviewedAt=Date.parse(row.reviewed_at||'');
 if(!Number.isFinite(reviewedAt)||reviewedAt>Date.now()||!Number.isFinite(Date.parse(row.approved_at))){skip('bad_review_time');continue;}
 if(Math.abs(Date.parse(row.approved_at)-reviewedAt)>3600000){skip('approval_time_mismatch');continue;}
 let checklist;try{checklist=JSON.parse(row.checklist_json||'{}');}catch{skip('invalid_checklist');continue;}
 if(REQUIRED.some(k=>checklist[k]!==true)||Number(row.copy_image_match)!==1){skip('not_full_human_review');continue;}
 if(!clean(row.image_url)||Number(row.image_approved)!==1||clean(row.review_note).startsWith('AI審核：AI_APPROVED；')){skip('image_or_ai_only');continue;}
 const fp=fingerprint(row);
 if(fp!==clean(row.content_fingerprint)){skip('content_changed_since_review');continue;}
 if(isWeather(row)&&Date.now()-reviewedAt>12*60*60*1000){skip('weather_review_expired');continue;}
 count.valid++;
 updates.push("UPDATE social_posts SET approved_by="+q(row.reviewed_by)+" WHERE id="+q(row.id)+" AND status='approved' AND COALESCE(TRIM(approved_by),'')='' AND approved_at="+q(row.approved_at)+" AND image_approved=1 AND EXISTS (SELECT 1 FROM social_post_review_gates g WHERE g.post_id=social_posts.id AND g.content_fingerprint="+q(fp)+" AND g.reviewed_by="+q(row.reviewed_by)+" AND g.reviewed_at="+q(row.reviewed_at)+" AND g.copy_image_match=1);");
}
fs.writeFileSync('/tmp/xjw-review-provenance-repair.sql',updates.join('\n')+'\n');
console.log('Human review provenance eligibility counts:',JSON.stringify(count));
if(count.total<1)throw new Error('No approved provenance candidates; refusing to assert recovery');
if(process.env.REQUIRE_SOME_VALID==='1'&&count.valid===0)throw new Error('No safely recoverable manual approval metadata');
