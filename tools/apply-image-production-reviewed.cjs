const fs = require('node:fs');
const crypto = require('node:crypto');
const manifest = JSON.parse(fs.readFileSync('ops/post-image-production-reviewed-current.json', 'utf8'));
const mode = process.argv[2];
const rows = file => JSON.parse(fs.readFileSync(file, 'utf8')).flatMap(x => x.results || []);
const hash = text => crypto.createHash('sha256').update(text || '').digest('hex');
const quote = text => "'" + String(text ?? '').replaceAll("'", "''") + "'";
const url = item => 'https://raw.githubusercontent.com/TS15825868/xianjiawei-internal/main/' + item.path;
if (!manifest.items.length || manifest.items.length > 33) throw Error('Invalid batch size');
const ids = new Set(), hashes = new Set();
for (const item of manifest.items) {
  if (ids.has(item.postId) || hashes.has(item.sha256)) throw Error('Duplicate post/image');
  ids.add(item.postId); hashes.add(item.sha256);
  if (!/^assets\/post-images\/2026-10-10\/formal-production\/[A-Za-z0-9-]+\.jpg$/.test(item.path)) throw Error('Unsafe image path');
  const bytes = fs.readFileSync(item.path);
  if (bytes.length !== item.bytes || bytes.length < 250000 || hash(bytes) !== item.sha256) throw Error('Image bytes/hash mismatch: ' + item.postId);
  if (item.visualCheck !== 'pass' || item.width !== 1254 || item.height !== 1254) throw Error('Uninspected image: ' + item.postId);
  if ((item.productsShown || []).length && !item.productPhotoProvenance?.length) throw Error('Missing real photo provenance');
}
if (mode === 'prepare') {
  const live = rows('/tmp/image-production-before.json');
  const sql = [];
  for (const item of manifest.items) {
    const post = live.find(r => r.id === item.postId);
    if (!post || hash(post.copy).slice(0, 16) !== item.copyHash) throw Error('Live copy changed: ' + item.postId);
    if (post.image_url === url(item) && post.status === 'pending_review' && Number(post.image_approved) === 0) continue;
    if (post.status !== 'draft' || String(post.image_url || '').trim()) throw Error('Post is no longer an empty-image draft: ' + item.postId);
    sql.push(`UPDATE social_posts SET image_url=${quote(url(item))},media_id=NULL,image_alt=${quote(item.alt)},image_source='ChatGPT重新生成｜2026-10-10正式原照後製｜GitHub main｜人工待審核',image_width=1254,image_height=1254,image_bytes=${item.bytes},image_quality_status='clear',image_approved=0,status='pending_review',approved_by=NULL,approved_at=NULL,scheduled_at=NULL,rejection_reason='',updated_at=datetime('now') WHERE id=${quote(item.postId)} AND status='draft' AND TRIM(COALESCE(image_url,''))='' AND copy=${quote(post.copy)};`);
  }
  fs.writeFileSync('/tmp/image-production-apply.sql', sql.join('\n'));
  console.log('Validated exact live copies and empty-image drafts:', sql.length);
} else if (mode === 'verify') {
  const after = rows('/tmp/image-production-after.json');
  const before = rows('/tmp/image-production-before.json');
  for (const item of manifest.items) {
    const post = after.find(r => r.id === item.postId);
    if (!post || post.image_url !== url(item) || post.status !== 'pending_review' || Number(post.image_approved) !== 0 || post.scheduled_at || post.approved_at || post.approved_by) throw Error('Binding not verified: ' + item.postId);
    if (hash(post.copy).slice(0, 16) !== item.copyHash) throw Error('Copy changed during bind');
  }
  for (const post of before.filter(r => r.status === 'published' || r.status === 'archived')) {
    const current = after.find(r => r.id === post.id);
    if (JSON.stringify(current) !== JSON.stringify(post)) throw Error('Historical post changed: ' + post.id);
  }
  const pending = after.filter(r => r.status === 'draft' && !String(r.image_url || '').trim());
  const queue = JSON.parse(fs.readFileSync('ops/post-image-production-queue-current.json', 'utf8'));
  if (pending.some(r => !queue.items.some(x => x.postId === r.id && x.copyHash === hash(r.copy).slice(0, 16)))) throw Error('Queue needs fresh scene/copy reconciliation');
  queue.items = queue.items.filter(x => pending.some(r => r.id === x.postId));
  queue.total = queue.items.length;
  queue.updatedAt = new Date().toISOString();
  fs.writeFileSync('/tmp/image-production-remaining-queue.json', JSON.stringify(queue, null, 2) + '\n');
  const counts = Object.fromEntries([...new Set(after.map(r => r.status))].map(status => [status, after.filter(r => r.status === status).length]));
  fs.writeFileSync('/tmp/image-production-result.json', JSON.stringify({generatedAt:new Date().toISOString(),batch:manifest.version,verifiedBindings:manifest.items.length,remaining:pending.length,counts,historicalPostsPreserved:true,publishedByThisBatch:0}, null, 2));
  console.log('PASS exact bindings, human approval required, historical posts preserved', manifest.items.length, counts);
} else throw Error('Expected prepare or verify');
