import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import worker from './social-webhook-cloudflare-fallback.mjs';

const secret='test-only-secret';
const body=JSON.stringify({object:'page',entry:[{id:'12345',changes:[]}]});
function request(value=body,key=secret){return new Request('https://example.test/webhook',{method:'POST',headers:{'content-type':'application/json','x-hub-signature-256':'sha256='+createHmac('sha256',key).update(value).digest('hex')},body:value});}
function fixture(){const saved=new Set();let calls=0;const db={prepare(sql){assert.match(sql,/INSERT OR IGNORE/);return {bind(...args){return {args}}}},async batch(statements){calls++;return statements.map(s=>{const key=s.args.slice(0,3).join(':');const changes=saved.has(key)?0:1;saved.add(key);return {success:true,meta:{changes}}})}};return {db,saved,get calls(){return calls}};}
function env(f){return {XJW_CF_RECEIPT_ENABLED:'true',XJW_META_E2E_VERIFIED:'true',XJW_PRIMARY_OVERLAP_VERIFIED:'true',XJW_RECEIPT_D1:f.db,XJW_META_APP_SECRET:secret,XJW_META_VERIFY_TOKEN:'verify-test',XJW_SOCIAL_ALLOWED_ACCOUNTS:JSON.stringify({facebook:['12345']})};}
test('disabled by default; never stores or sends',async()=>{const r=await worker.fetch(request(),{});assert.equal(r.status,503);assert.equal((await r.json()).sent,false)});
test('valid signed receipt stores one unique event key',async()=>{const f=fixture();const e=env(f);const a=await worker.fetch(request(),e);assert.equal(a.status,200);assert.equal((await a.json()).sent,false);await worker.fetch(request(),e);assert.equal(f.saved.size,1)});
test('duplicate receipt with confirmed zero D1 changes stays idempotent',async()=>{
 const f=fixture();const e=env(f);
 assert.equal((await worker.fetch(request(),e)).status,200);
 const again=await worker.fetch(request(),e);
 assert.equal(again.status,200);assert.equal((await again.json()).sent,false);
 assert.equal(f.saved.size,1);assert.equal(f.calls,2);
});
test('failed or malformed D1 batch responses never falsely acknowledge a receipt',async()=>{
 const results=[
  undefined,[],[{success:false,meta:{changes:0}}],
  [{success:true}], [{success:true,meta:{changes:null}}],
  [{success:true,meta:{changes:-1}}],
  [{success:true,meta:{changes:2}}],
  [{success:true,meta:{changes:'1'}}],
  [{success:true,meta:{changes:1}},{success:true,meta:{changes:1}}]
 ];
 for(const bad of results){
  const f=fixture();f.db.batch=async()=>bad;
  const r=await worker.fetch(request(),env(f));
  assert.equal(r.status,503);
  assert.deepEqual(await r.json(),{accepted:false,code:'storage_unavailable',sent:false});
 }
});
test('partial multi-account batch confirmation fails closed',async()=>{
 const f=fixture(),e=env(f);
 e.XJW_SOCIAL_ALLOWED_ACCOUNTS=JSON.stringify({facebook:['12345','67890']});
 const raw=JSON.stringify({object:'page',entry:[{id:'12345',changes:[]},{id:'67890',changes:[]}]});
 for(const result of [
  [{success:true,meta:{changes:1}}],
  [{success:true,meta:{changes:1}},{success:false,meta:{changes:0}}]
 ]){
  f.db.batch=async()=>result;
  const r=await worker.fetch(request(raw),e);
  assert.equal(r.status,503);assert.equal((await r.json()).sent,false);
 }
});
test('invalid signature rejected before storage',async()=>{const f=fixture();const r=await worker.fetch(request(body,'wrong'),env(f));assert.equal(r.status,400);assert.equal(f.calls,0)});
test('unknown account rejected before storage',async()=>{const f=fixture();const value=JSON.stringify({object:'page',entry:[{id:'99999',changes:[]}]});const r=await worker.fetch(request(value),env(f));assert.equal(r.status,400);assert.equal(f.calls,0)});
test('database failure is not acknowledged',async()=>{const f=fixture();f.db.batch=async()=>{throw Error('offline')};const r=await worker.fetch(request(),env(f));assert.equal(r.status,503);assert.equal((await r.json()).sent,false)});
test('verification challenge is signed by configured verify token',async()=>{const f=fixture();const e=env(f);const good=await worker.fetch(new Request('https://example.test/?hub.mode=subscribe&hub.verify_token=verify-test&hub.challenge=123'),e);assert.equal(await good.text(),'123');const bad=await worker.fetch(new Request('https://example.test/?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123'),e);assert.equal(bad.status,400)});

test('two permitted accounts persist in one atomic batch',async()=>{
 const f=fixture();const e=env(f);e.XJW_SOCIAL_ALLOWED_ACCOUNTS=JSON.stringify({facebook:['12345','67890']});
 const value=JSON.stringify({object:'page',entry:[{id:'12345',changes:[]},{id:'67890',changes:[]}]});
 const r=await worker.fetch(request(value),e);
 assert.equal(r.status,200);assert.equal(f.calls,1);assert.equal(f.saved.size,2);
});
test('multi-account batch failure never acknowledges success',async()=>{
 const f=fixture();const e=env(f);e.XJW_SOCIAL_ALLOWED_ACCOUNTS=JSON.stringify({facebook:['12345','67890']});
 const value=JSON.stringify({object:'page',entry:[{id:'12345',changes:[]},{id:'67890',changes:[]}]});
 f.db.batch=async()=>{throw Error('transaction rolled back')};
 const r=await worker.fetch(request(value),e);
 assert.equal(r.status,503);assert.equal((await r.json()).sent,false);assert.equal(f.saved.size,0);
});

test('enabled flag alone cannot receive without Meta E2E verification',async()=>{
 const f=fixture();const e=env(f);delete e.XJW_META_E2E_VERIFIED;
 const r=await worker.fetch(request(),e);
 assert.equal(r.status,503);assert.equal((await r.json()).code,'verification_required');assert.equal(f.calls,0);
});
test('enabled flag and Meta E2E alone cannot receive without overlap verification',async()=>{
 const f=fixture();const e=env(f);delete e.XJW_PRIMARY_OVERLAP_VERIFIED;
 const r=await worker.fetch(request(),e);
 assert.equal(r.status,503);assert.equal((await r.json()).code,'verification_required');assert.equal(f.calls,0);
});


test('Cloudflare can opt into GET verification only without opening POST/D1',async()=>{
 const f=fixture(),e={
  XJW_CF_RECEIPT_ENABLED:'false',XJW_META_VERIFY_ONLY_ENABLED:'true',
  XJW_META_VERIFY_TOKEN:'verify-test'
 };
 const url='https://example.test/?hub.mode=subscribe&hub.verify_token=verify-test&hub.challenge=7821';
 const r=await worker.fetch(new Request(url),e);
 assert.equal(r.status,200);
 assert.match(r.headers.get('content-type'),/^text\/plain/);
 assert.equal(await r.text(),'7821');
 const post=await worker.fetch(request(),{...e,XJW_RECEIPT_D1:f.db});
 assert.equal(post.status,503);
 assert.equal((await post.json()).code,'disabled');
 assert.equal(f.calls,0);
});
test('Cloudflare verification-only refuses invalid GET without touching D1',async()=>{
 const f=fixture(),e={
  XJW_CF_RECEIPT_ENABLED:'false',XJW_META_VERIFY_ONLY_ENABLED:'true',
  XJW_META_VERIFY_TOKEN:'verify-test',XJW_RECEIPT_D1:f.db
 };
 const invalid=await worker.fetch(new Request('https://example.test/?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123'),e);
 assert.equal(invalid.status,400);
 assert.equal((await invalid.json()).code,'invalid_event');
 const unset=await worker.fetch(new Request('https://example.test/?hub.mode=subscribe&hub.verify_token=verify-test&hub.challenge=123'),{...e,XJW_META_VERIFY_TOKEN:undefined});
 assert.equal(unset.status,503);
 assert.equal((await unset.json()).code,'unconfigured');
 assert.equal(f.calls,0);
});
