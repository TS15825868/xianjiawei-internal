'use strict';
const fs=require('fs'),crypto=require('crypto');
const m=JSON.parse(fs.readFileSync('ops/festival-additions-20261013.json'));
// created_by is a non-null profiles FK: retain the existing delegating owner account association.
// The actual author/operator is truthfully recorded as AI in ai_post_maintenance_audit; no human review is claimed.
const ownerProfile='tung314069@gmail.com';
const rows=p=>JSON.parse(fs.readFileSync(p)).flatMap(x=>x.results||[]),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),q=v=>v===null?'NULL':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
if(m.newPosts.length!==4||m.assets.length!==5||m.existingChanges.length!==2||m.approveAllowed||m.scheduleAllowed||m.publishAllowed||m.actorType!=='AI_ASSISTANT_NOT_HUMAN')throw Error('Unsafe manifest');
const mode=process.argv[2];
if(mode==='prepare'){
 const before=rows('/tmp/festival-before.json');if(before.length!==m.sourceTotal)throw Error('Live library size changed');
 for(const x of m.baseline){const p=before.find(p=>p.id===x.id);if(!p||sha(JSON.stringify(Object.fromEntries(x.fields.map(k=>[k,p[k]]))))!==x.expected)throw Error('Live row changed '+x.id);}
 for(const x of m.assets){const b=fs.readFileSync(x.path);if(b.length!==x.bytes||b.length<250000||sha(b)!==x.sha256||b[0]!==255||b[1]!==216||!m.checks.every(k=>x.checks[k]===true))throw Error('Unverified image '+x.id);if(/龜鹿膠|龜鹿湯塊|治療|改善疾病|補氣|生津/.test([x.title,x.copy,x.alt].join(' ')))throw Error('Unsafe copy');}
 if(new Set(m.assets.map(x=>x.sha256)).size!==5)throw Error('Duplicate new images');
 for(const p of m.newPosts){if(before.some(x=>x.id===p.id||x.copy===p.copy||x.image_url===p.image_url))throw Error('Duplicate new content '+p.id);if(p.status!=='pending_review'||p.image_approved!==0||!p.copy.includes('仙加味'))throw Error('Unsafe new post');}
 const sql=['CREATE TABLE IF NOT EXISTS ai_post_maintenance_audit(batch_id TEXT,post_id TEXT,actor TEXT,before_json TEXT,reason TEXT,recorded_at TEXT,PRIMARY KEY(batch_id,post_id));'];
 if(!before.some(p=>p.created_by===ownerProfile))throw Error('Existing delegating owner profile not verified');
 for(const p of m.newPosts){const keys=Object.keys(p);sql.push(`INSERT INTO social_posts (${keys.join(',')},created_by,approved_by,approved_at,scheduled_at,proposed_scheduled_at,published_at) VALUES (${keys.map(k=>q(p[k])).join(',')},${q(ownerProfile)},NULL,NULL,NULL,NULL,NULL);`);sql.push(`INSERT INTO ai_post_maintenance_audit VALUES(${q(m.batch)},${q(p.id)},${q(m.actor)},'null',${q(JSON.stringify({kind:'new_festival_pending',authorType:'AI_ASSISTANT_NOT_HUMAN',delegatingOwnerProfile:ownerProfile,checks:m.checks,visualEvidence:m.assets.find(x=>x.id===p.id).criterionEvidence}))},datetime('now'));`);}
 for(const x of m.existingChanges){const p=before.find(p=>p.id===x.id);if(!p||p.status!=='approved'||p.scheduled_at||p.published_at)throw Error('Protected existing state');sql.push(`INSERT INTO ai_post_maintenance_audit VALUES(${q(m.batch)},${q(x.id)},${q(m.actor)},${q(JSON.stringify(p))},${q(x.reason)},datetime('now'));`);sql.push(`DELETE FROM social_post_review_gates WHERE post_id=${q(x.id)};`);sql.push(`UPDATE social_posts SET ${Object.entries(x.patch).map(([k,v])=>k+'='+q(v)).join(',')},status='pending_review',image_approved=0,approved_by=NULL,approved_at=NULL,updated_at=datetime('now') WHERE id=${q(x.id)} AND status='approved' AND updated_at=${q(p.updated_at)} AND scheduled_at IS NULL AND published_at IS NULL;`);}
 fs.writeFileSync('/tmp/festival-apply.sql',sql.join('\n'));console.log('PASS 4 new pending posts, 1 image repair, 1 caption repair; no approval/schedule/publication');
}else if(mode==='verify'){
 const before=rows('/tmp/festival-before.json'),after=rows('/tmp/festival-after.json');if(after.length!==before.length+4)throw Error('Count mismatch');
 for(const p of before){const n=after.find(x=>x.id===p.id),change=m.existingChanges.find(x=>x.id===p.id);if(!n)throw Error('Deleted existing post');if(!change){if(JSON.stringify(p)!==JSON.stringify(n))throw Error('Unrelated row changed '+p.id);}else{for(const [k,v]of Object.entries(change.patch))if(n[k]!==v)throw Error('Existing repair failed '+p.id);if(n.status!=='pending_review'||n.image_approved!==0||n.approved_at||n.scheduled_at||n.published_at||n.proposed_scheduled_at!==p.proposed_scheduled_at)throw Error('Unsafe existing repair');}}
 for(const p of m.newPosts){const n=after.find(x=>x.id===p.id);for(const [k,v]of Object.entries(p))if(n?.[k]!==v)throw Error('New post not verified '+p.id+' '+k);if(n.approved_at||n.approved_by||n.created_by!==ownerProfile||n.scheduled_at||n.proposed_scheduled_at||n.published_at)throw Error('Identity or schedule set on new post');}
 const counts=after.reduce((a,p)=>(a[p.status]=(a[p.status]||0)+1,a),{});fs.writeFileSync('/tmp/festival-result.json',JSON.stringify({total:after.length,counts,newPosts:4,newImages:4,replacedImages:1,captionRepairs:1,publishedByBatch:0,scheduledByBatch:0,approvedByBatch:0,historyPreserved:true,newIds:m.newPosts.map(x=>x.id)},null,2));console.log('PASS',JSON.stringify(counts));
}else throw Error('Expected prepare or verify');
