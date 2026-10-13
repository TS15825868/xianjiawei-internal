const fs=require('fs'),crypto=require('crypto');
const m=JSON.parse(fs.readFileSync('ops/metricool-eight-recovery-20261013.json'));
const rows=p=>JSON.parse(fs.readFileSync(p))[0].results;
const before=rows('before.json'),gates=rows('gates.json');
const q=x=>x===null?'NULL':"'"+String(x).replaceAll("'","''")+"'";
const hash=o=>crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');
const material=p=>Object.fromEntries(['title','headline','copy','category','image_url','image_alt','image_source','image_width','image_height','image_quality_status'].map(k=>[k,typeof p[k]==='number'?p[k]:String(p[k]||'').trim()]));
if(m.posts.length!==8||new Set(m.posts.map(p=>p.uuid)).size!==8||m.posts.some(p=>p.originalId===394674560))throw Error('Unsafe scope');
const sql=[`CREATE TABLE IF NOT EXISTS social_metricool_sync(post_id TEXT PRIMARY KEY,metricool_id INTEGER,uuid TEXT UNIQUE,publication_at TEXT,content_fingerprint TEXT NOT NULL DEFAULT '',state TEXT NOT NULL DEFAULT 'pending_review',attempts INTEGER NOT NULL DEFAULT 0,last_error TEXT NOT NULL DEFAULT '',template_json TEXT NOT NULL DEFAULT '{}',lease_until TEXT,last_sync_at TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`,`CREATE TABLE IF NOT EXISTS metricool_recovery_audit(batch TEXT,post_id TEXT,before_json TEXT,reason TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(batch,post_id));`];
for(const x of m.posts){
 const p=before.find(p=>p.id===x.d1Id),g=gates.find(g=>g.post_id===x.d1Id);if(!p||p.status!=='approved'||p.scheduled_at||p.published_at||hash(material(p))!==x.fingerprint)throw Error('Source lease changed '+x.d1Id);
 if(x.humanApproved){if(!g||g.reviewed_by!==p.approved_by||!g.reviewed_by.includes('@')||g.content_fingerprint!==x.fingerprint||g.copy_image_match!==1||Object.values(JSON.parse(g.checklist_json)).filter(v=>v===true).length!==16)throw Error('Missing human evidence');}
 else if(!g||!g.reviewed_by.startsWith('chatgpt:'))throw Error('Unexpected reviewer');
 sql.push(`INSERT INTO metricool_recovery_audit(batch,post_id,before_json,reason) VALUES('20261013-eight-recovery',${q(p.id)},${q(JSON.stringify({post:p,gate:g}))},${q(x.humanApproved?'same reviewed content; bind existing Metricool UUID':'AI review is not human approval; return this scoped row to pending review')});`);
 const state=x.humanApproved?'scheduled':'pending_review';
 sql.push(`INSERT INTO social_metricool_sync(post_id,metricool_id,uuid,publication_at,content_fingerprint,state,template_json,last_sync_at) VALUES(${q(p.id)},${Number(x.metricoolId)},${q(x.uuid)},${q(x.publicationAt)},${q(x.fingerprint)},${q(state)},${q(JSON.stringify(x.template))},datetime('now'));`);
 if(x.humanApproved)sql.push(`UPDATE social_posts SET status='scheduled',scheduled_at=${q(x.publicationAt)},proposed_scheduled_at=${q(x.publicationAt)},updated_at=datetime('now') WHERE id=${q(p.id)} AND status='approved' AND updated_at=${q(p.updated_at)};`);
 else{sql.push(`DELETE FROM social_post_review_gates WHERE post_id=${q(p.id)};`);sql.push(`UPDATE social_posts SET status='pending_review',scheduled_at=NULL,proposed_scheduled_at=${q(x.publicationAt)},approved_by=NULL,approved_at=NULL,image_approved=0,review_note='需人工重新審核；先前僅為AI檢查，不等於人工核准。',updated_at=datetime('now') WHERE id=${q(p.id)} AND status='approved' AND updated_at=${q(p.updated_at)};`);}
}
sql.push(`CREATE TABLE IF NOT EXISTS social_metricool_control(setting_key TEXT PRIMARY KEY,setting_value TEXT NOT NULL DEFAULT '');`, `INSERT INTO social_metricool_control(setting_key,setting_value) VALUES('initialized','20261013-eight-recovery');`);
fs.writeFileSync('/tmp/metricool-eight.sql',sql.join('\n'));
console.log('PASS eight exact leases: two existing human approvals, six pending, no autoapproval, no new Metricool post');
