import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import worker from './line-receipt-worker.mjs';
const secret='test-only-channel-secret',destination='U12345678901234567890123456789012';
const event={webhookEventId:'01JABCDEFGH123456789ABCDEF',type:'message',
  source:{type:'user',userId:'Uprivate'},replyToken:'secret-reply-token',
  message:{id:'123',type:'text',text:'不能洩漏的顧客訊息'}};
const body=(events=[event],d=destination)=>JSON.stringify({destination:d,events});
function request(raw=body(),key=secret){
 return new Request('https://example.test/webhook',{method:'POST',
  headers:{'content-type':'application/json',
   'x-line-signature':createHmac('sha256',key).update(raw).digest('base64')},body:raw});
}
function dbFixture(){
 const seen=new Set();let writes=0;
 const db={
  prepare(sql){assert.match(sql,/^INSERT OR IGNORE INTO xjw_line_receipt_inbox/);
   return {bind(...args){return {args}}}},
  async batch(items){writes++;return items.map(({args})=>{
   const changed=seen.has(args[0])?0:1;seen.add(args[0]);
   return {success:true,meta:{changes:changed}};
  });}
 };
 return {db,seen,get writes(){return writes}};
}
function ready(f){
 return {XJW_LINE_RECEIPT_ENABLED:'true',XJW_LINE_E2E_VERIFIED:'true',
  XJW_LINE_EXCLUSIVE_CALLBACK_CONFIRMED:'true',
  XJW_LINE_CHANNEL_SECRET:secret,XJW_LINE_DESTINATION:destination,
  XJW_LINE_RECEIPT_D1:f.db};
}
test('default is disabled; no D1 write or message send',async()=>{
 const f=dbFixture();const r=await worker.fetch(request(),{XJW_LINE_RECEIPT_D1:f.db});
 assert.equal(r.status,503);assert.deepEqual((await r.json()).sent,false);
 assert.equal(f.writes,0);
});
test('health says staging does not reply, handle orders, or replace official webhook',async()=>{
 const r=await worker.fetch(new Request('https://example.test/healthz'),{});
 assert.equal(r.status,200);const j=await r.json();
 assert.equal(j.receiptEnabled,false);assert.equal(j.customerReplies,false);
 assert.equal(j.handlesOrders,false);assert.equal(j.officialCallback,'not_verified_by_this_worker');
 assert.equal(j.productionWebhookUnchanged,undefined);
 assert.equal(r.headers.get('cache-control'),'no-store');
});
test('verify-only accepts signed empty LINE probe but refuses all customer events',async()=>{
 const f=dbFixture(),env={...ready(f),XJW_LINE_RECEIPT_ENABLED:'false',
  XJW_LINE_VERIFY_ONLY_ENABLED:'true'};
 const empty=await worker.fetch(request(body([])),env);
 assert.equal(empty.status,200);assert.equal((await empty.json()).stored,0);
 const real=await worker.fetch(request(),env);
 assert.equal(real.status,503);assert.equal((await real.json()).code,'verify_only_no_customer_receipt');
 assert.equal(f.writes,0);
});
test('signed empty event does not create database record even if enabled',async()=>{
 const f=dbFixture();const r=await worker.fetch(request(body([])),ready(f));
 assert.equal(r.status,200);assert.equal(f.writes,0);
});
test('tampered signatures and wrong keys are rejected before writing',async()=>{
 const f=dbFixture();
 for(const invalid of [request(body(),'invalid-key'),
  new Request('https://example.test/webhook',{method:'POST',body:body(),
   headers:{'x-line-signature':'bad'}})]){
  const r=await worker.fetch(invalid,ready(f));assert.equal(r.status,401);
 }
 assert.equal(f.writes,0);
});
test('missing handover gates never accept customer events',async()=>{
 const f=dbFixture();for(const name of ['XJW_LINE_E2E_VERIFIED','XJW_LINE_EXCLUSIVE_CALLBACK_CONFIRMED']){
  const env=ready(f);delete env[name];
  const r=await worker.fetch(request(),env);
  assert.equal(r.status,503);assert.equal((await r.json()).code,'handover_not_verified');
 }assert.equal(f.writes,0);
});
test('destination mismatch and malformed event ID do not write D1',async()=>{
 const f=dbFixture();for(const raw of [body([event],'Uwrong'),body([{...event,webhookEventId:null}]),
  body([{...event,webhookEventId:'bad$value'}])]){
  const r=await worker.fetch(request(raw),ready(f));assert.equal(r.status,400);
 }assert.equal(f.writes,0);
});
test('oversized or malformed payload rejected, no writes',async()=>{
 const f=dbFixture();const big=body([{...event,message:{text:'x'.repeat(66000)}}]);
 assert.equal((await worker.fetch(request(big),ready(f))).status,413);
 assert.equal((await worker.fetch(request('{'),ready(f))).status,400);
 assert.equal(f.writes,0);
});
test('verified event received and repeated webhook stored once',async()=>{
 const f=dbFixture(),env=ready(f);
 let res=await worker.fetch(request(),env);
 assert.equal(res.status,200);let reply=await res.json();
 assert.equal(reply.accepted,true);assert.equal(reply.sent,false);assert.equal(reply.stored,1);
 assert.equal(JSON.stringify(reply).includes('Uprivate'),false);
 res=await worker.fetch(request(),env);reply=await res.json();
 assert.equal(reply.stored,0);assert.equal(f.seen.size,1);assert.equal(f.writes,2);
});
test('multi-event receipt remains one transactional batch',async()=>{
 const f=dbFixture(),evt={...event,webhookEventId:'01JABCDEFGH987654321ABCDEF'};
 const r=await worker.fetch(request(body([event,evt])),ready(f));
 assert.equal(r.status,200);assert.equal((await r.json()).stored,2);
 assert.equal(f.writes,1);
});
test('storage uncertainty never acknowledges success or exposes errors',async()=>{
 for(const value of [undefined,[],[{success:false,meta:{changes:1}}],
  [{success:true}],[{success:true,meta:{changes:'1'}}],
  [{success:true,meta:{changes:-1}}],[{success:true,meta:{changes:2}}]]){
  const f=dbFixture();f.db.batch=async()=>value;
  const r=await worker.fetch(request(),ready(f));assert.equal(r.status,503);
  assert.equal((await r.json()).accepted,false);
 }
 const f=dbFixture();f.db.batch=async()=>{throw Error('private storage error')};
 const r=await worker.fetch(request(),ready(f));
 assert.equal(r.status,503);assert.equal((await r.text()).includes('private storage'),false);
});
test('methods/paths other than real LINE webhook cannot access D1',async()=>{
 const f=dbFixture(),env=ready(f);
 assert.equal((await worker.fetch(new Request('https://example.test/admin'),env)).status,404);
 assert.equal((await worker.fetch(new Request('https://example.test/webhook'),env)).status,405);
 assert.equal(f.writes,0);
});
