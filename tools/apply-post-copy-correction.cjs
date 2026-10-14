const fs=require('fs'),assert=require('assert/strict');
const {fingerprint}=require('./metricool-free-evidence.cjs');
const file=process.env.CORRECTION_FILE;
if(!/^ops\/post-copy-corrections\/[A-Za-z0-9_-]+\.json$/.test(file||''))throw Error('Invalid correction path');
const request=JSON.parse(fs.readFileSync(file));
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.authorized_by||''))throw Error('Authorized owner/admin email required');
assert(request.batch&&request.items?.length===1);
const read=p=>JSON.parse(fs.readFileSync(p))[0].results;
const before=read('/tmp/post-copy-before.json'),links=read('/tmp/post-copy-links-before.json');
const q=x=>x==null?'NULL':"'" + String(x).replaceAll("'","''") + "'";
const item=request.items[0],post=before.find(x=>x.id===item.post_id),link=links.find(x=>x.post_id===item.post_id);
if(!post||!link)throw Error('Post or existing Metricool mapping missing');
if(post.status!==item.expected_status||fingerprint(post)!==item.expected_fingerprint||post.copy!==item.expected_copy)throw Error('Live D1 lease changed');
if(!item.new_copy||item.new_copy===post.copy||/LINE(?! OA)/.test(item.new_copy))throw Error('Corrected public copy must use LINE OA');
const remote=item.remote;
if(String(remote?.uuid)!==String(link.uuid)||remote?.draft!==true||remote?.autoPublish!==false||remote?.instagramData?.autoPublish!==false||remote?.text!==item.new_copy)throw Error('Verified Metricool draft does not match correction');
if(remote.providers?.length!==3||!['facebook','instagram','threads'].every(n=>remote.providers.some(x=>x.network===n)))throw Error('Three draft platforms required');
const next={...post,copy:item.new_copy},nextFingerprint=fingerprint(next);
const token=request.batch+':'+post.id;
const sql=[
 'CREATE TABLE IF NOT EXISTS social_post_copy_correction_guard(token TEXT PRIMARY KEY,passed INTEGER NOT NULL CHECK(passed=1));',
 `INSERT INTO social_post_copy_correction_guard(token,passed) SELECT ${q(token)},CASE WHEN EXISTS(SELECT 1 FROM social_posts p JOIN social_metricool_sync m ON p.id=m.post_id WHERE p.id=${q(post.id)} AND p.updated_at=${q(post.updated_at)} AND p.status=${q(item.expected_status)} AND m.uuid=${q(link.uuid)} AND m.updated_at=${q(link.updated_at)}) THEN 1 ELSE 0 END;`,
 `UPDATE social_posts SET copy=${q(item.new_copy)},status='pending_review',approved_by=NULL,scheduled_at=NULL,proposed_scheduled_at=NULL,review_note=${q('守門退回：'+item.reason)},updated_at=datetime('now') WHERE id=${q(post.id)} AND updated_at=${q(post.updated_at)} AND status=${q(item.expected_status)};`,
 `UPDATE social_metricool_sync SET metricool_id=${Number(remote.id)},content_fingerprint=${q(nextFingerprint)},state='pending_review',template_json=${q(JSON.stringify(remote))},last_error=${q('守門退回：'+item.reason)},last_sync_at=${q(item.verified_at)},updated_at=datetime('now') WHERE post_id=${q(post.id)} AND uuid=${q(link.uuid)} AND updated_at=${q(link.updated_at)};`
];
fs.writeFileSync('/tmp/post-copy-correction.sql',sql.join('\n'));
fs.writeFileSync('/tmp/post-copy-result.json',JSON.stringify({batch:request.batch,post_id:post.id,old_fingerprint:item.expected_fingerprint,new_fingerprint:nextFingerprint,metricool_id:remote.id,uuid:remote.uuid},null,2));
console.log('NEW_FINGERPRINT='+nextFingerprint);
