import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import worker from './social-webhook-cloudflare-fallback.mjs';

const secret='test-only-secret';
const body=JSON.stringify({object:'page',entry:[{id:'12345',changes:[]}]});
function request(value=body,key=secret){return new Request('https://example.test/webhook',{method:'POST',headers:{'content-type':'application/json','x-hub-signature-256':'sha256='+createHmac('sha256',key).update(value).digest('hex')},body:value});}
function fixture(){const saved=new Set();let calls=0;const db={prepare(sql){assert.match(sql,/INSERT OR IGNORE/);return {bind(...args){return {args}}}},async batch(statements){calls++;for(const s of statements)saved.add(s.args.slice(0,3).join(':'));return statements.map(()=>({success:true}))}};return {db,saved,get calls(){return calls}};}
function env(f){return {XJW_CF_RECEIPT_ENABLED:'true',XJW_RECEIPT_D1:f.db,XJW_META_APP_SECRET:secret,XJW_META_VERIFY_TOKEN:'verify-test',XJW_SOCIAL_ALLOWED_ACCOUNTS:JSON.stringify({facebook:['12345']})};}
test('disabled by default; never stores or sends',async()=>{const r=await worker.fetch(request(),{});assert.equal(r.status,503);assert.equal((await r.json()).sent,false)});
test('valid signed receipt stores one unique event key',async()=>{const f=fixture();const e=env(f);const a=await worker.fetch(request(),e);assert.equal(a.status,200);assert.equal((await a.json()).sent,false);await worker.fetch(request(),e);assert.equal(f.saved.size,1)});
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
