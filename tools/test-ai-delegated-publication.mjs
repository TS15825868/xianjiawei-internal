import test from 'node:test';
import assert from 'node:assert/strict';
import {assessDelegatedPublication,DELEGATION_SCHEMA,DELEGATION_END,prepareDelegatedGrant,readDelegatedGrant} from '../src/ai-delegated-publication.js';
const now=Date.parse('2026-11-13T01:00:00Z'),at='2026-11-13T02:00:00Z';
const quality={ok:true,decision:'AI_APPROVED',review_id:'review-1',fingerprint:'a'.repeat(64),image_sha256:'b'.repeat(64),channels:['facebook','instagram','threads'],reviewed_at:new Date(now).toISOString()};
const grant={id:'grant-1',schema:DELEGATION_SCHEMA,scope:'brand-social-only',owner_authorization_ref:'owner-authorization',issued_at:new Date(now-1000).toISOString(),expires_at:DELEGATION_END,post_id:'post-1',fingerprint:quality.fingerprint,image_sha256:quality.image_sha256,review_id:quality.review_id,channels:quality.channels,publication_at:at};
const input={grant,quality,post:{id:'post-1',status:'pending_review'},publicationAt:at,now,enabled:true};
test('delegated publication is separate from human approval',()=>assert.equal(assessDelegatedPublication(input).reviewer_type,'AI_DELEGATED'));
test('default off and missing grant fail closed',()=>{assert.equal(assessDelegatedPublication({...input,enabled:false}).ok,false);assert.equal(assessDelegatedPublication({...input,grant:null}).ok,false)});
test('changed or revoked grant cannot publish',()=>{for(const change of [{revoked_at:at},{fingerprint:'c'.repeat(64)},{image_sha256:'c'.repeat(64)},{review_id:'other'},{channels:['facebook']},{expires_at:'2027-03-01T00:00:00+08:00'},{publication_at:'2026-11-13T03:00:00Z'}])assert.equal(assessDelegatedPublication({...input,grant:{...grant,...change}}).ok,false)});
test('historical gaps and expired quality cannot authorize publication',()=>{for(const change of [{decision:'NEEDS_HUMAN_REVIEW'},{reviewed_at:'2026-11-11T00:00:00Z'},{review_id:null}])assert.equal(assessDelegatedPublication({...input,quality:{...quality,...change}}).ok,false)});
test('published posts and customer scope are blocked',()=>{assert.equal(assessDelegatedPublication({...input,post:{...input.post,published_at:at}}).ok,false);assert.equal(assessDelegatedPublication({...input,grant:{...grant,scope:'customer'}}).ok,false)});

test('persisted grant requires current quality, role, matching content and no delivery',async()=>{
  const sqlite=await import('node:sqlite').catch(()=>null);if(!sqlite)return;
  const db=new sqlite.DatabaseSync(':memory:');
  const DB={prepare(sql){let args=[];return {bind(...v){args=v;return this},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}}},async first(){return db.prepare(sql).get(...args)||null}}}};
  try{
    db.exec("CREATE TABLE social_posts(id TEXT PRIMARY KEY,updated_at TEXT,status TEXT,published_at TEXT,scheduled_at TEXT,approved_by TEXT,approved_at TEXT); CREATE TABLE social_post_quality_reviews(id TEXT PRIMARY KEY,post_id TEXT,decision TEXT,content_fingerprint TEXT,reviewed_at TEXT,created_at TEXT); CREATE TABLE social_metricool_sync(post_id TEXT); CREATE TABLE social_publish_deliveries(post_id TEXT);");
    db.prepare("INSERT INTO social_posts(id,updated_at,status) VALUES(?,?,'pending_review')").run('post-1','v1');
    db.prepare("INSERT INTO social_post_quality_reviews VALUES(?,?,?,?,?,?)").run(quality.review_id,'post-1','AI_APPROVED',quality.fingerprint,quality.reviewed_at,quality.reviewed_at);
    const post={id:'post-1',status:'pending_review',updated_at:'v1'};
    const deps={fingerprint:async()=>quality.fingerprint,verifyQuality:async()=>quality,checkContent:async()=>[],now};
    const profile={role:'owner',email:'owner@example.com'};
    await assert.rejects(()=>prepareDelegatedGrant({DB},post,at,{role:'content',email:profile.email},deps),/管理者/);
    await assert.rejects(()=>prepareDelegatedGrant({DB},post,at,profile,{...deps,verifyQuality:async()=>({...quality,decision:'NEEDS_HUMAN_REVIEW'})}),/完整現版/);
    db.prepare("INSERT INTO social_publish_deliveries VALUES(?)").run(post.id);
    await assert.rejects(()=>prepareDelegatedGrant({DB},post,at,profile,deps),/外部排程或交付/);
    db.exec("DELETE FROM social_publish_deliveries");
    await assert.rejects(()=>prepareDelegatedGrant({DB},{...post,updated_at:'stale'},at,profile,deps),/版本已變更/);
    const result=await prepareDelegatedGrant({DB},post,at,profile,deps);
    assert.equal(result.ok,true);assert.equal(result.human_approved,false);assert.equal(result.auto_publish,false);assert.equal(result.auto_schedule,false);
    const saved=await readDelegatedGrant({DB},post.id);
    assert.equal(saved.id,result.authorization_id);assert.equal(saved.fingerprint,quality.fingerprint);
    assert.equal(db.prepare("SELECT status FROM social_posts WHERE id=?").get(post.id).status,'pending_review');
    await assert.rejects(()=>prepareDelegatedGrant({DB},post,at,profile,deps),/禁止覆寫/);
  }finally{db.close()}
});
