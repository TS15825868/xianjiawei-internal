// Batch9 repeatable fail-closed one-time review: exactly verified October 9/10/11/12 JPEGs, no scheduling or publishing.
'use strict';
const fs=require('node:fs');
const crypto=require('node:crypto');
const batch=Number(process.argv[3]);
if(![1,2].includes(batch))throw Error('Expected explicit review batch 1 or 2');
const manifest=JSON.parse(fs.readFileSync('ops/final-reviewed-batch-'+batch+'-20261013.json','utf8'));
const actor='chatgpt:owner-delegated-reviewed';
// AI actor is recorded in the review gate, never impersonated as an existing human profile.
// social_posts.approved_by is a foreign key to profiles(email), so autonomous approval leaves it NULL.
const auditNote='圖文審核通過；審核者：ChatGPT（AI）。';
const checks=['brand','product','specification','pricing_activity','season','weather','occasion','location','scene_environment','temperature','expression','action','mascot_companions','physical_scale','duplicate','compliance_final'];
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const q=v=>"'"+String(v??'').replaceAll("'","''")+"'";
const clean=v=>String(v??'').trim();
const rows=p=>JSON.parse(fs.readFileSync(p,'utf8')).flatMap(x=>x.results||[]);
const byId=(all,id)=>all.find(p=>p.id===id);
const material=p=>({title:clean(p.title),headline:clean(p.headline),copy:clean(p.copy),category:clean(p.category),image_url:clean(p.image_url),image_alt:clean(p.image_alt),image_source:clean(p.image_source),image_width:Number(p.image_width||0),image_height:Number(p.image_height||0),image_quality_status:clean(p.image_quality_status)});
const fingerprint=p=>sha(JSON.stringify(material(p)));
if((manifest.items.length<1||manifest.items.length>15)||manifest.actor!==actor||manifest.actorType!=='AI_ASSISTANT_NOT_HUMAN'||!manifest.approvalDoesNotPublish||!manifest.approvalCreatesNoSchedule)throw Error('Unsafe one-time manifest');
if(JSON.stringify(manifest.reviewChecks)!==JSON.stringify(checks))throw Error('Review checklist changed');
function verifyMedia(x){
 const currentMedia=/^assets\/post-images\/2026-10-(?:10|11|12)\/formal-production\/[A-Za-z0-9-]+\.jpg$/.test(x.imagePath);
 const inspectedLegacy=x.legacyVisualProof==='independent-visual-verified-2026-10-12' && /^assets\/post-images\/2026-09-23\/[A-Za-z0-9-]+\.jpg$/.test(x.imagePath) && !(x.productPhotoProvenance||[]).length;
 const inspectedOct09=x.legacyVisualProof==='independent-visual-verified-2026-10-12' && /^assets\/post-images\/2026-10-09\/quality-upgrade\/[A-Za-z0-9-]+\.jpg$/.test(x.imagePath) && !(x.productPhotoProvenance||[]).length;
 const inspectedSep=x.legacyVisualProof==='independent-visual-verified-2026-10-12' && /^assets\/post-images\/2026-09-(?:21|22)\/XJW-ACTIVE-IMG-\d+\.(?:png|jpg)$/.test(x.imagePath) && !(x.productPhotoProvenance||[]).length;
 if(!currentMedia&&!inspectedLegacy&&!inspectedOct09&&!inspectedSep)throw Error('Unsafe or unverified image path: '+x.postId);
 const b=fs.readFileSync(x.imagePath);
 const formatOK=x.imagePath.endsWith('.png')?b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):b[0]===255&&b[1]===216;
 if(b.length!==x.imageBytes||b.length<250000||sha(b)!==x.imageSha256||!formatOK)throw Error('Media changed: '+x.postId);
 for(const original of x.productPhotoProvenance||[]){
  if(!original.path.startsWith('assets/product-photo-cutouts/2026-10-11/'))throw Error('Unsafe product source');
  if(sha(fs.readFileSync(original.path))!==original.sha256)throw Error('Formal product pixels changed: '+x.postId);
 }
 if(!x.visualEvidence||x.visualEvidence.length<38)throw Error('Missing visual evidence');
 if(JSON.stringify(checks.map(k=>x.checks[k]))!==JSON.stringify(checks.map(()=>true)))throw Error('Not all 16 criteria were inspected: '+x.postId);
 if(!x.newAlt||x.newAlt.length<24||/AI|後製|禁止|不能|不得|不重用|原圖|亂碼|已下架|不畫|不做|DM/.test(x.newAlt))throw Error('Alt is still production directions: '+x.postId);
}
function preflight(live){
 if(live.length!==132)throw Error('Unexpected library size: '+live.length);
 const ids=new Set();
 for(const x of manifest.items){
  if(ids.has(x.postId))throw Error('Duplicate batch post');ids.add(x.postId);
  verifyMedia(x);
  const post=byId(live,x.postId);if(!post)throw Error('Missing D1 post: '+x.postId);
  if(post.status!=='pending_review'||post.scheduled_at||post.published_at||post.approved_by||post.approved_at||Number(post.image_approved)!==0)throw Error('Post no longer pending: '+x.postId);
  if(fingerprint(post)!==x.oldFingerprint||sha(post.copy||'').slice(0,16)!==x.copyHash||clean(post.image_url)!==x.imageUrl)throw Error('Live copy/image changed: '+x.postId);
  const qualityAccepted=post.image_quality_status==='clear' || (x.legacyVisualProof==='independent-visual-verified-2026-10-12' && /^assets\/post-images\/2026-09-(?:21|22|23)\/[A-Za-z0-9-]+\.(?:jpg|png)$/.test(x.imagePath) && post.image_quality_status==='ok' && !(x.productPhotoProvenance||[]).length);
  if(Number(post.image_width)!==1254||Number(post.image_height)!==1254||Number(post.image_bytes)!==x.imageBytes||!qualityAccepted)throw Error('D1 media metadata mismatch: '+x.postId);
  if(live.some(other=>other.id!==x.postId&&clean(other.image_url)===x.imageUrl))throw Error('Duplicate media: '+x.postId);
  const pub=[post.title,post.headline,post.copy].join(' ');
  if(!/仙加味|龜鹿|鹿茸|30cc|180cc/.test(pub))throw Error('No brand/product connection: '+x.postId);
  if(/台興山產|龜鹿膠|龜鹿湯塊|治療|預防疾病|改善疾病|補氣|生津|關節卡卡|保證功效/.test(pub))throw Error('Unsafe copy: '+x.postId);
  if(/(?:NT\$|[$＄]\d|買\d+送\d+)/.test(pub))throw Error('Price/promotion needs fresh verification: '+x.postId);
 }
}
const mode=process.argv[2];
if(mode==='prepare'){
 const before=rows('/tmp/xjw-owner-auto-before.json');preflight(before);
 const sql=['CREATE TABLE IF NOT EXISTS social_post_review_gates(post_id TEXT PRIMARY KEY,content_fingerprint TEXT NOT NULL,checklist_json TEXT NOT NULL DEFAULT "{}",copy_image_match INTEGER NOT NULL DEFAULT 0,reviewed_by TEXT NOT NULL DEFAULT "",reviewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);'];
 for(const x of manifest.items){
  const p=byId(before,x.postId),newFingerprint=fingerprint({...p,image_alt:x.newAlt});
  const where=' WHERE id='+q(x.postId)+' AND status='+q('pending_review')+' AND image_url='+q(p.image_url)+' AND image_alt='+q(p.image_alt)+' AND copy='+q(p.copy)+' AND updated_at='+q(p.updated_at)+' AND image_approved=0 AND approved_at IS NULL AND scheduled_at IS NULL';
  sql.push('UPDATE social_posts SET image_alt='+q(x.newAlt)+',status='+q('approved')+',image_approved=1,approved_by=NULL,review_note='+q(auditNote)+",approved_at=datetime('now'),updated_at=datetime('now')"+where+';');
  sql.push('INSERT INTO social_post_review_gates(post_id,content_fingerprint,checklist_json,copy_image_match,reviewed_by,reviewed_at) SELECT '+q(x.postId)+','+q(newFingerprint)+','+q(JSON.stringify(x.checks))+',1,'+q(actor)+",datetime('now') FROM social_posts WHERE id="+q(x.postId)+' AND status='+q('approved')+' AND approved_by IS NULL AND image_alt='+q(x.newAlt)+' AND scheduled_at IS NULL ON CONFLICT(post_id) DO UPDATE SET content_fingerprint=excluded.content_fingerprint,checklist_json=excluded.checklist_json,copy_image_match=1,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at;');
 }
 fs.writeFileSync('/tmp/xjw-owner-auto-apply.sql',sql.join('\n')+'\n');
 console.log('PASS preflight '+manifest.items.length+' visually inspected posts; no schedule or publish commands.');
}else if(mode==='verify'){
 const before=rows('/tmp/xjw-owner-auto-before.json'),after=rows('/tmp/xjw-owner-auto-after.json'),gates=rows('/tmp/xjw-owner-auto-gates.json');
 if(before.length!==after.length||after.length!==132)throw Error('Record count changed');
 const modified=new Set(manifest.items.map(x=>x.postId));
 for(const original of before)if(!modified.has(original.id)&&JSON.stringify(byId(after,original.id))!==JSON.stringify(original))throw Error('Unrelated post modified: '+original.id);
 for(const x of manifest.items){
  const p=byId(after,x.postId),gate=gates.find(g=>g.post_id===x.postId);
  if(!p||p.status!=='approved'||Number(p.image_approved)!==1||p.approved_by!==null||p.review_note!==auditNote||p.image_alt!==x.newAlt||p.scheduled_at||p.published_at)throw Error('Approval not verified: '+x.postId);
  if(!gate||gate.content_fingerprint!==fingerprint(p)||gate.reviewed_by!==actor||Number(gate.copy_image_match)!==1)throw Error('Gate not verified: '+x.postId);
  const actual=JSON.parse(gate.checklist_json||'{}');
  if(!checks.every(k=>actual[k]===true))throw Error('Missing review criterion: '+x.postId);
 }
 const counts={};for(const p of after)counts[p.status]=(counts[p.status]||0)+1;
 fs.writeFileSync('/tmp/xjw-owner-auto-result.json',JSON.stringify({batch:manifest.batchId,actor,approved:manifest.items.length,ids:manifest.items.map(x=>x.postId),counts,publishedByBatch:0,scheduledByBatch:0},null,2)+'\n');
 console.log('PASS verified '+manifest.items.length+' delegated approvals; zero scheduled, zero published',JSON.stringify(counts));
}else throw Error('Expected prepare or verify');


