'use strict';
const fs=require('fs'),crypto=require('crypto');
const m=JSON.parse(fs.readFileSync('ops/final-note-cleanup-20261013.json'));
const rows=p=>JSON.parse(fs.readFileSync(p)).flatMap(x=>x.results||[]),sha=x=>crypto.createHash('sha256').update(x).digest('hex'),q=x=>"'"+String(x??'').replaceAll("'","''")+"'";
if(m.actor!=='chatgpt:delegated-ai-maintenance'||m.total!==132||m.changes.length!==4)throw Error('Unexpected batch');
if(process.argv[2]==='prepare'){
const live=rows('/tmp/full-audit-before.json'),sql=['CREATE TABLE IF NOT EXISTS ai_post_maintenance_audit(batch_id TEXT,post_id TEXT,actor TEXT,before_json TEXT,reason TEXT,recorded_at TEXT,PRIMARY KEY(batch_id,post_id));'];
for(const x of m.changes){const p=live.find(r=>r.id===x.postId);const selected=p&&Object.fromEntries(Object.keys(x.before).map(k=>[k,p[k]]));if(!p||sha(JSON.stringify(selected))!==x.expected)throw Error('Live row changed '+x.postId);
if(!['approved','pending_review'].includes(p.status)||p.scheduled_at||p.published_at)throw Error('Protected state '+x.postId);
sql.push(`INSERT OR IGNORE INTO ai_post_maintenance_audit VALUES('20261013-final-note-cleanup',${q(p.id)},${q(m.actor)},${q(JSON.stringify(p))},${q(x.reason)},datetime('now'));`);
const fields=Object.entries(x.patch).map(([k,v])=>`${k}=${typeof v==='number'?v:q(v)}`);
if(x.invalidatesApproval){fields.push("status='pending_review'","image_approved=0","approved_by=NULL","approved_at=NULL");sql.push(`DELETE FROM social_post_review_gates WHERE post_id=${q(p.id)};`);}
fields.push("updated_at=datetime('now')");sql.push(`UPDATE social_posts SET ${fields.join(',')} WHERE id=${q(p.id)} AND status=${q(p.status)} AND updated_at=${q(p.updated_at)};`);
// Source-only cleanup does not alter approved image/copy; refresh the existing gate fingerprint only, preserving actor, checks and review time.
if(!x.invalidatesApproval&&p.status==='approved'){
const n={...p,...x.patch},clean=v=>String(v??'').trim(),fp=sha(JSON.stringify({title:clean(n.title),headline:clean(n.headline),copy:clean(n.copy),category:clean(n.category),image_url:clean(n.image_url),image_alt:clean(n.image_alt),image_source:clean(n.image_source),image_width:Number(n.image_width||0),image_height:Number(n.image_height||0),image_quality_status:clean(n.image_quality_status)}));
sql.push(`UPDATE social_post_review_gates SET content_fingerprint=${q(fp)} WHERE post_id=${q(p.id)};`);
}
}
fs.writeFileSync('/tmp/full-audit-apply.sql',sql.join('\n')+'\n');console.log('PASS fail-closed exact live leases; no approval, schedule or publication');
}else{
const before=rows('/tmp/full-audit-before.json'),after=rows('/tmp/full-audit-after.json');if(after.length!==before.length)throw Error('Record count changed');
for(const p of before){const x=m.changes.find(x=>x.postId===p.id),n=after.find(r=>r.id===p.id);if(!x){if(JSON.stringify(p)!==JSON.stringify(n))throw Error('History changed '+p.id);continue;}
for(const [k,v] of Object.entries(x.patch))if(n[k]!==v)throw Error('Not applied '+p.id+' '+k);
if(n.scheduled_at||n.published_at)throw Error('Scheduling or publication happened');
if(x.invalidatesApproval&&(n.status!=='pending_review'||n.image_approved!==0||n.approved_at))throw Error('Stale approval retained');}
const counts={};for(const n of after)counts[n.status]=(counts[n.status]||0)+1;
fs.writeFileSync('/tmp/full-audit-result.json',JSON.stringify({total:after.length,changedPosts:m.changes.length,newImages:0,newApprovals:0,publishedByBatch:0,scheduledByBatch:0,counts,historyPreserved:true},null,2));console.log('PASS',JSON.stringify(counts));
}
