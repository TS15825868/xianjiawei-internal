import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
let source=fs.readFileSync(new URL('../src/publishing-review-gate-entry.js',import.meta.url),'utf8');
source=source.replace("import app from './flexible-publish-entry.js';",`const app={fetch:async()=>Response.json(globalThis.imageTestProfile)};`)
.replace("import {assessAutopublishCandidate} from './ai-autopublish-policy.js';",'const assessAutopublishCandidate=()=>({});')
.replace("import {enqueueMetricool,metricoolOwns,metricoolImmediate} from './metricool-sync.js';",'const enqueueMetricool=async()=>({}),metricoolOwns=async()=>true,metricoolImmediate=async()=>({});')
.replace("import {imageHash,recordAiReview,aiGate} from './ai-quality-review.js';",'const imageHash=()=>"",recordAiReview=()=>{},aiGate=()=>{};')
.replace("import { publishedPlatformReceiptHold } from './external-published-receipt-holds.js';",'const publishedPlatformReceiptHold=row=>row.id==="RECEIPT"?{reason:"Published receipt"}:null;');
const {reviewExistingImage,imageReviewContext,validOriginalImageReview,fingerprint,REQUIRED_CHECKS}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
function fixture(){
 globalThis.imageTestProfile={email:'owner@example.com',role:'owner'};
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE social_posts(id TEXT PRIMARY KEY,title TEXT,headline TEXT,copy TEXT,category TEXT,status TEXT,image_url TEXT,image_alt TEXT,image_source TEXT,image_width INTEGER,image_height INTEGER,image_quality_status TEXT,updated_at TEXT,published_at TEXT,image_approved INTEGER,approved_by TEXT,approved_at TEXT,scheduled_at TEXT);
 CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_email TEXT,action TEXT,entity_type TEXT,entity_id TEXT,before_json TEXT,after_json TEXT,ip TEXT);
 CREATE TABLE social_metricool_sync(post_id TEXT,metricool_id TEXT,state TEXT);
 CREATE TABLE social_publish_deliveries(post_id TEXT,platform TEXT,attempt_count INTEGER,last_attempt_at TEXT,published_at TEXT,remote_id TEXT,status TEXT);
 CREATE TABLE social_post_review_gates(post_id TEXT PRIMARY KEY,content_fingerprint TEXT,checklist_json TEXT,copy_image_match INTEGER,reviewed_by TEXT,reviewed_at TEXT);
 INSERT INTO social_posts VALUES('P','仙加味工作日常','午後','仙加味小老闆在工作間整理筆記','生活','pending_review','https://example.com/xjw-conv-chat-quiet-work-audit-v1.jpg','小老闆、小鹿、小烏龜整理筆記','官方素材',1200,1200,'needs_rework','2026-10-30T00:00:00Z',NULL,1,'old@example.com','old',NULL);
 INSERT INTO social_post_review_gates(post_id) VALUES('P');`);
 const state={fail:false,beforeBatch:null};
 const env={DB:{exec:async sql=>db.exec(sql),prepare(sql){return {sql,args:[],bind(...args){this.args=args;return this},async first(){return db.prepare(sql).get(...this.args)||null},async all(){return {results:db.prepare(sql).all(...this.args)}},async run(){return {meta:{changes:db.prepare(sql).run(...this.args).changes}}}}},async batch(statements){state.beforeBatch?.();db.exec('BEGIN');try{const results=[];for(let i=0;i<statements.length;i++){if(state.fail&&i===1)throw Error('write failed');results.push(await statements[i].run())}db.exec('COMMIT');return results}catch(e){db.exec('ROLLBACK');throw e}}}};
 const row=()=>db.prepare('SELECT * FROM social_posts').get();
 const req=body=>new Request('https://example.com/api/posts/P/image-visual-review',{method:'POST',body:JSON.stringify(body)});
 const proof=async()=>({decision:'pass',expected_fingerprint:await fingerprint(row()),expected_updated_at:row().updated_at,visual_evidence:'實際檢視小老闆短黑髮、米白上衣與綠圍裙，紅色直式品牌章；小鹿與小烏龜分開陪伴，桌面筆記對應工作情境，無產品包裝與錯誤比例，畫面完整。',review_checklist:Object.fromEntries(REQUIRED_CHECKS.map(k=>[k,true])),copy_image_match:true});
 return {db,state,env,row,req,proof};
}
test('authenticated context exposes current fingerprint without approval',async()=>{const f=fixture();const r=await imageReviewContext(f.req({}),f.env,{},'P');assert.equal(r.status,200);assert.equal((await r.json()).expected_fingerprint,await fingerprint(f.row()));assert.equal(f.row().image_quality_status,'needs_rework')});
test('same URL pass persists evidence, invalidates approval, returns pending',async()=>{const f=fixture();const r=await reviewExistingImage(f.req(await f.proof()),f.env,{},'P');assert.equal(r.status,200);assert.equal(f.row().image_url,'https://example.com/xjw-conv-chat-quiet-work-audit-v1.jpg');assert.equal(f.row().status,'pending_review');assert.equal(f.row().approved_by,null);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM social_post_review_gates').get().n,0);assert(await validOriginalImageReview(f.env,f.row()));f.db.exec("UPDATE social_posts SET copy='changed'");assert.equal(await validOriginalImageReview(f.env,f.row()),false)});
test('reject retains blocking marker and evidence',async()=>{const f=fixture(),p=await f.proof();p.decision='reject';p.review_checklist={};assert.equal((await reviewExistingImage(f.req(p),f.env,{},'P')).status,200);assert.equal(f.row().image_quality_status,'needs_rework');assert.equal(await validOriginalImageReview(f.env,f.row()),false)});
test('missing evidence, missing checks, stale version cannot write',async()=>{for(const patch of [{visual_evidence:''},{review_checklist:{}},{expected_fingerprint:'stale'},{expected_updated_at:'stale'}]){const f=fixture();const r=await reviewExistingImage(f.req({...await f.proof(),...patch}),f.env,{},'P');assert(r.status>=400);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM audit_logs').get().n,0)}});
test('role and reviewer identity required',async()=>{for(const profile of [{email:'owner@example.com',role:'viewer'},{email:'AI',role:'owner'}]){const f=fixture();globalThis.imageTestProfile=profile;assert.equal((await reviewExistingImage(f.req(await f.proof()),f.env,{},'P')).status,403)}});
test('published state and external receipt never modified',async()=>{for(const mode of ['published','receipt','scheduled']){const f=fixture();if(mode==='published')f.db.exec("UPDATE social_posts SET published_at='now'");if(mode==='receipt')f.db.exec("UPDATE social_posts SET id='RECEIPT'");if(mode==='scheduled')f.db.exec("INSERT INTO social_metricool_sync VALUES('P','UUID','scheduled')");assert.equal((await reviewExistingImage(f.req(await f.proof()),f.env,{},mode==='receipt'?'RECEIPT':'P')).status,409);assert.equal(f.row().image_quality_status,'needs_rework')}});
test('concurrent content edit produces conflict and no audit or invalidation',async()=>{const f=fixture(),p=await f.proof();f.state.beforeBatch=()=>f.db.exec("UPDATE social_posts SET copy='concurrent edit'");assert.equal((await reviewExistingImage(f.req(p),f.env,{},'P')).status,409);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM audit_logs').get().n,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM social_post_review_gates').get().n,1)});
test('concurrent external schedule blocks transactional update',async()=>{const f=fixture();f.state.beforeBatch=()=>f.db.exec("INSERT INTO social_metricool_sync VALUES('P','UUID','scheduled')");assert.equal((await reviewExistingImage(f.req(await f.proof()),f.env,{},'P')).status,409)});
test('database evidence failure rolls back row and prior gate',async()=>{const f=fixture();f.state.fail=true;await assert.rejects(reviewExistingImage(f.req(await f.proof()),f.env,{},'P'),/write failed/);assert.equal(f.row().image_quality_status,'needs_rework');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM social_post_review_gates').get().n,1)});
test('two concurrent submissions yield one success, one conflict, one audit',async()=>{const f=fixture(),p=await f.proof();const responses=await Promise.all([reviewExistingImage(f.req(p),f.env,{},'P'),reviewExistingImage(f.req(p),f.env,{},'P')]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM audit_logs').get().n,1)});
test('historical filename holds clear only with matching full evidence; other errors remain',async()=>{
 const {auditOne}=await import('../src/publishing-content-audit-entry.js');const f=fixture();
 assert((await auditOne(f.env,f.row(),[],[])).errors.some(e=>e.includes('2026/10/17')));
 await reviewExistingImage(f.req(await f.proof()),f.env,{},'P');
 const audited=await auditOne(f.env,f.row(),[],[]);assert.equal(audited.ok,true,JSON.stringify(audited.errors));
 f.db.exec("UPDATE social_posts SET copy='治療疾病'");const changed=await auditOne(f.env,f.row(),[],[]);
 assert(changed.errors.some(e=>e.includes('2026/10/17')));assert(changed.errors.some(e=>e.includes('治療')));
});

test('uncertain platform delivery blocks precheck and a concurrent delivery blocks CAS',async()=>{
 for(const concurrent of [false,true]){const f=fixture(),p=await f.proof();const insert=()=>f.db.exec("INSERT INTO social_publish_deliveries VALUES('P','instagram',1,'now',NULL,NULL,'manual_required')");if(concurrent)f.state.beforeBatch=insert;else insert();assert.equal((await reviewExistingImage(f.req(p),f.env,{},'P')).status,409);assert.equal(f.row().image_quality_status,'needs_rework');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM audit_logs').get().n,0)}
});
