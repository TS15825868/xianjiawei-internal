'use strict';
const fs=require('node:fs');
const audit=JSON.parse(fs.readFileSync('audits/full-library-image-quality-progress-20261009.json','utf8'));
const target=audit.results.filter(x=>x.decision==='regeneration_required');
if(target.length!==27) throw new Error('Audit scope changed; inspect latest audit before write: '+target.length);
const q=x=>"'"+String(x??'').replace(/'/g,"''")+"'";
const p='/tmp/full-library-visual-live.json';
const before=JSON.parse(fs.readFileSync(p,'utf8'));
const rows=(Array.isArray(before)?before[0]?.results:before?.results)||[];
const byId=new Map(rows.map(x=>[x.id,x]));
const applied=[],skipped=[],commands=[];
for(const t of target){
 const now=byId.get(t.post_id);
 if(!now || !['pending_review','draft'].includes(now.status) || Number(now.image_approved||0)!==0 || String(now.image_url||'')!==String(t.image_url||'')){
   skipped.push({id:t.post_id,reason:'not same unapproved draft/pending_review old image; preserve latest data'});
   continue;
 }
 const reason='圖像重審不合格：'+String(t.reason||'不符合圖文／角色／產品正式規格');
 const where="id="+q(t.post_id)+" AND status="+q(now.status)+" AND image_url="+q(t.image_url)+" AND image_approved=0";
 commands.push("UPDATE social_posts SET status='draft',image_url=NULL,media_id=NULL,image_alt='',image_source="+q('2026-10-10 已退回不合格舊圖，GitHub 原圖保留作為稽核記錄')+",image_quality_status='needs_regeneration',image_width=0,image_height=0,image_bytes=0,image_approved=0,approved_by=NULL,approved_at=NULL,scheduled_at=NULL,proposed_scheduled_at=NULL,rejection_reason="+q(reason)+",review_note="+q('2026-10-10 全庫正式視覺盤點，退回草稿重製；不得未審發布')+",updated_at=datetime('now') WHERE "+where+";");
 applied.push({id:t.post_id,oldStatus:now.status,oldImageUrl:t.image_url,reason:t.reason});
}
fs.writeFileSync('/tmp/full-library-visual-updates.sql',commands.join('\n')+'\n');
fs.writeFileSync('/tmp/full-library-visual-plan.json',JSON.stringify({audited:target.length,applied,skipped,rule:'only same unapproved draft/pending review image; no published, approved, scheduled or archived changes'},null,2));
console.log('PREPARED',JSON.stringify({audited:target.length,conditionalUpdates:applied.length,skipped:skipped.length}));
if(!commands.length)throw Error('No unchanged targeted images, abort writing');
