const fs=require('fs'),assert=require('assert/strict'),crypto=require('crypto');
const {validate}=require('./metricool-free-evidence.cjs');
const receiptPath=process.env.RECEIPT_FILE;
if(!/^ops\/metricool-free-evidence\/[a-zA-Z0-9_-]+\.json$/.test(receiptPath||''))throw Error('Invalid receipt path');
const receipt=JSON.parse(fs.readFileSync(receiptPath));
assert.equal(receipt.source,'official_metricool_connector');assert.equal(receipt.brandId,'6889683');
assert(receipt.batch&&receipt.posts?.length&&receipt.posts.length<=20);
const read=p=>JSON.parse(fs.readFileSync(p))[0].results;
const posts=read('free-before.json'),gates=read('free-gates.json'),links=read('free-links.json');
const q=x=>x==null?'NULL':"'"+String(x).replaceAll("'","''")+"'";
const sql=[`CREATE TABLE IF NOT EXISTS social_metricool_evidence(batch TEXT,post_id TEXT,evidence_json TEXT,before_json TEXT,verified_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(batch,post_id));`];
const leases=[];
async function imageBytes(url){const u=new URL(url);if(u.protocol!=='https:'||!['raw.githubusercontent.com','static.metricool.com'].includes(u.hostname))throw Error('Untrusted image host');const r=await fetch(u,{redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok||!/^image\//.test(r.headers.get('content-type')||''))throw Error('Image unavailable');return Buffer.from(await r.arrayBuffer())}
(async()=>{
 for(const e of receipt.posts){
  const p=posts.find(x=>x.id===e.d1Id),g=gates.find(x=>x.post_id===e.d1Id),l=links.find(x=>x.post_id===e.d1Id);
  const state=validate(p,g,l,e);
  if(!Number.isFinite(Date.parse(e.verifiedAt))||Math.abs(Date.now()-Date.parse(e.verifiedAt))>6*3600000)throw Error('Evidence stale');
  const [source,remote]=await Promise.all([imageBytes(e.imageSource),imageBytes(e.remote.media[0])]);
  if(!source.equals(remote)||crypto.createHash('sha256').update(source).digest('hex')!==e.imageSHA256)throw Error('Image pixels/file changed');
  const existed=awaitAlreadyApplied(receipt.batch,e.d1Id);if(existed)continue;
  leases.push(`INSERT INTO social_metricool_import_guard(token,passed) SELECT ${q(receipt.batch+':'+p.id)},CASE WHEN EXISTS(SELECT 1 FROM social_posts p JOIN social_metricool_sync m ON p.id=m.post_id WHERE p.id=${q(p.id)} AND p.updated_at=${q(p.updated_at)} AND m.updated_at=${q(l.updated_at)} AND m.uuid=${q(l.uuid)}) THEN 1 ELSE 0 END;`);
  sql.push(`INSERT INTO social_metricool_evidence(batch,post_id,evidence_json,before_json,verified_at) VALUES(${q(receipt.batch)},${q(p.id)},${q(JSON.stringify(e))},${q(JSON.stringify({post:p,gate:g,mapping:l}))},${q(e.verifiedAt)});`);
  sql.push(`UPDATE social_metricool_sync SET metricool_id=${Number(e.remote.id)},uuid=${q(e.remote.uuid)},state=${q(state)},publication_at=${q(e.publicationAt)},content_fingerprint=${q(e.sourceFingerprint)},template_json=${q(JSON.stringify(e.remote))},last_sync_at=${q(e.verifiedAt)},last_error=${q(state==='failed'?'平台回報ERROR；保留逐平台結果，不重試':'')},updated_at=datetime('now') WHERE post_id=${q(p.id)} AND uuid=${q(l.uuid)} AND updated_at=${q(l.updated_at)};`);
  if(state==='scheduled')sql.push(`UPDATE social_posts SET status='scheduled',scheduled_at=${q(e.publicationAt)},proposed_scheduled_at=${q(e.publicationAt)},updated_at=datetime('now') WHERE id=${q(p.id)} AND updated_at=${q(p.updated_at)} AND status IN ('approved','scheduled');`);
  if(e.result==='result'){
   for(const x of e.remote.providers){const platform={facebook:'Facebook',instagram:'Instagram',threads:'Threads'}[x.network],status=x.status==='PUBLISHED'?'published':x.status==='ERROR'?'failed':'pending';sql.push(`INSERT INTO social_publish_deliveries(post_id,platform,status,remote_id,response_json,error_text,published_at) VALUES(${q(p.id)},${q(platform)},${q(status)},${q(x.id||'')},${q(JSON.stringify(x))},${q(x.status==='ERROR'?x.detailedStatus||'ERROR':'')},${q(x.status==='PUBLISHED'?e.verifiedAt:null)}) ON CONFLICT(post_id,platform) DO UPDATE SET status=excluded.status,remote_id=excluded.remote_id,response_json=excluded.response_json,error_text=excluded.error_text,published_at=COALESCE(excluded.published_at,social_publish_deliveries.published_at),updated_at=datetime('now');`)}
   if(state==='published')sql.push(`UPDATE social_posts SET status='published',published_at=COALESCE(published_at,${q(e.verifiedAt)}),scheduled_at=NULL,updated_at=datetime('now') WHERE id=${q(p.id)} AND updated_at=${q(p.updated_at)} AND status IN ('approved','scheduled','manual_required');`);
   else if(state==='failed')sql.push(`UPDATE social_posts SET status='manual_required',updated_at=datetime('now') WHERE id=${q(p.id)} AND status IN ('approved','scheduled');`);
  }
 }
 fs.writeFileSync('/tmp/metricool-free-evidence.sql',[`CREATE TABLE IF NOT EXISTS social_metricool_import_guard(token TEXT PRIMARY KEY,passed INTEGER NOT NULL CHECK(passed=1));`,...leases,...sql].join('\n'));
 console.log('PASS checked connector receipts, image bytes, current content lease, human approvals; no external publishing');
})().catch(e=>{console.error(e);process.exitCode=1});
function awaitAlreadyApplied(batch,id){const file='free-existing-evidence.json';return fs.existsSync(file)&&read(file).some(x=>x.batch===batch&&x.post_id===id)}
