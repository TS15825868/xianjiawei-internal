import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createReceiptHandler} from './social-receipt-handler.mjs';
const env={XJW_RECEIPT_ENABLED:'true',XJW_META_E2E_VERIFIED:'true',XJW_PRIMARY_OVERLAP_VERIFIED:'true',XJW_META_APP_SECRET:'test-only',XJW_META_VERIFY_TOKEN:'test-verify',XJW_SOCIAL_ALLOWED_ACCOUNTS:'{"facebook":["411869648852531"]}',XJW_SOCIAL_DB_CONFIG:JSON.stringify({user:'xjw_social_worker',host:'db.iphexhvjhsmelbgwzhhr.supabase.co',port:5432,password:'test-only',ca:'-----BEGIN CERTIFICATE-----\ntest'})};
function request(secret=env.XJW_META_APP_SECRET){const body=JSON.stringify({object:'page',entry:[{id:'411869648852531',changes:[]}]});return new Request('https://example.test/webhook',{method:'POST',headers:{'content-type':'application/json','x-hub-signature-256':'sha256='+createHmac('sha256',secret).update(body).digest('hex')},body});}
const handler=(createPool,overrides={})=>createReceiptHandler({readEnv:k=>({...env,...overrides})[k],createPool});
test('disabled receiver never constructs pool or reads payload',async()=>{const h=handler(()=>assert.fail(),{XJW_RECEIPT_ENABLED:'false'});const r=await h(request());assert.equal(r.status,503);assert.equal((await r.json()).code,'receipt_disabled');});
test('invalid signature never constructs pool',async()=>{const r=await handler(()=>assert.fail())(request('wrong'));assert.equal(r.status,400);assert.equal((await r.json()).code,'signature_rejected');});
test('challenge works without database credentials',async()=>{const h=handler(()=>assert.fail(),{XJW_SOCIAL_DB_CONFIG:undefined});const r=await h(new Request('https://example.test/?hub.mode=subscribe&hub.verify_token=test-verify&hub.challenge=123'));assert.equal(await r.text(),'123');});
test('successive receipts share one verified pool',async()=>{let pools=0,queries=0;const h=handler(options=>{pools++;assert.equal(options.max,1);assert.equal(options.ssl.rejectUnauthorized,true);return {on(){},async query(){queries++;return {rowCount:1};}}});for(let i=0;i<2;i++){const r=await h(request());assert.equal(r.status,200);assert.equal((await r.json()).sent,false);}assert.equal(pools,1);assert.equal(queries,2);});
test('malformed database write acknowledgments return safe 503, never 200',async()=>{
 for(const result of [{}, {rowCount:-1}, {rowCount:2}, {rowCount:'1'}]){
  const h=handler(()=>({on(){},async query(){return result;}}));
  const r=await h(request());
  assert.equal(r.status,503);
  assert.equal((await r.json()).code,'receipt_unavailable');
 }
});

test('overlap gets 503 without second query and can retry after completion',async()=>{let release,entered;let queries=0;const started=new Promise(r=>entered=r);const blocked=new Promise(r=>release=r);const h=handler(()=>({on(){},async query(){queries++;entered();await blocked;return {rowCount:1};}}));const first=h(request());await started;const second=await h(request());assert.equal(second.status,503);assert.equal((await second.json()).code,'receipt_busy');assert.equal(queries,1);release();assert.equal((await first).status,200);assert.equal((await h(request())).status,200);assert.equal(queries,2);});
test('database errors are redacted and release admission slot',async()=>{let calls=0;const h=handler(()=>({on(){},async query(){if(calls++===0)throw Error('secret-password');return {rowCount:1};}}));const r=await h(request());assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/secret-password/);assert.equal((await h(request())).status,200);});

test('missing database configuration fails closed without exposing secrets',async()=>{const h=handler(()=>assert.fail('pool must not be created'),{XJW_SOCIAL_DB_CONFIG:undefined});const r=await h(request());assert.equal(r.status,503);assert.equal((await r.json()).code,'receipt_unavailable');assert.equal(r.headers.get('retry-after'),'5');});
test('invalid allowlist configuration fails closed without touching database',async()=>{const h=handler(()=>assert.fail('pool must not be created'),{XJW_SOCIAL_ALLOWED_ACCOUNTS:'{invalid'});const r=await h(request());assert.equal(r.status,503);assert.equal((await r.json()).code,'receipt_unavailable');});

test('misconfigured account allowlist fails 503 without opening PostgreSQL',async()=>{
 for(const value of ['{"facebook":"000411869648852531999"}','{"facebook":[411869648852531]}']){
  const h=handler(()=>assert.fail('pool must not be created'),{XJW_SOCIAL_ALLOWED_ACCOUNTS:value});
  const response=await h(request());
  assert.equal(response.status,503);
  assert.equal((await response.json()).code,'receipt_unavailable');
  assert.equal(response.headers.get('retry-after'),'5');
 }
});


test('verification-only Meta GET handshake succeeds while all POST receipt/storage paths remain disabled',async()=>{
 let pools=0;
 const h=handler(()=>{pools++;throw Error('must not connect')},{
  XJW_RECEIPT_ENABLED:'false',XJW_META_VERIFY_ONLY_ENABLED:'true',
  XJW_SOCIAL_DB_CONFIG:undefined,XJW_META_APP_SECRET:undefined,
  XJW_SOCIAL_ALLOWED_ACCOUNTS:undefined
 });
 const url='https://example.test/?hub.mode=subscribe&hub.verify_token=test-verify&hub.challenge=123456789';
 const verified=await h(new Request(url));
 assert.equal(verified.status,200);
 assert.match(verified.headers.get('content-type')||'',/^text\/plain/);
 assert.equal(await verified.text(),'123456789');
 const response=await h(request());
 assert.equal(response.status,503);
 assert.equal((await response.json()).code,'receipt_disabled');
 assert.equal(pools,0);
});
test('verification-only opt-in refuses incorrect, absent or malformed Meta GET challenges',async()=>{
 let pools=0;
 const h=handler(()=>{pools++;throw Error('pool unavailable')},{XJW_RECEIPT_ENABLED:'false',XJW_META_VERIFY_ONLY_ENABLED:'true'});
 const bad=[
  'hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123',
  'hub.mode=subscribe&hub.verify_token=test-verify&hub.challenge=not-a-number',
  'hub.mode=unsubscribe&hub.verify_token=test-verify&hub.challenge=123',
  'hub.mode=subscribe&hub.verify_token=test-verify'
 ];
 for(const params of bad){
  const r=await h(new Request('https://example.test/?'+params));
  assert.equal(r.status,400);
  assert.equal((await r.json()).code,'verification_rejected');
 }
 assert.equal(pools,0);
 const unconfigured=handler(()=>assert.fail('must not connect'),{
  XJW_RECEIPT_ENABLED:'false',XJW_META_VERIFY_ONLY_ENABLED:'true',XJW_META_VERIFY_TOKEN:undefined
 });
 const r=await unconfigured(new Request('https://example.test/?hub.mode=subscribe&hub.verify_token=test-verify&hub.challenge=123'));
 assert.equal(r.status,503);
 assert.equal((await r.json()).code,'receipt_unavailable');
});
test('without explicit verification-only gate even correct Meta GET cannot handshake',async()=>{
 const h=handler(()=>assert.fail(),{XJW_RECEIPT_ENABLED:'false',XJW_META_VERIFY_ONLY_ENABLED:'false'});
 const r=await h(new Request('https://example.test/?hub.mode=subscribe&hub.verify_token=test-verify&hub.challenge=123'));
 assert.equal(r.status,503);
 assert.equal((await r.json()).code,'receipt_disabled');
});

test('turning receipt on without BOTH independent Meta E2E and overlap gates rejects even correctly signed POST before PostgreSQL',async()=>{
 const cases=[
  {XJW_META_E2E_VERIFIED:'false'},
  {XJW_PRIMARY_OVERLAP_VERIFIED:'false'},
  {XJW_META_E2E_VERIFIED:undefined},
  {XJW_PRIMARY_OVERLAP_VERIFIED:undefined},
  {XJW_META_E2E_VERIFIED:'TRUE'},
  {XJW_PRIMARY_OVERLAP_VERIFIED:'1'}
 ];
 for(const overrides of cases){
  let pools=0;
  const h=handler(()=>{pools++;throw Error('must not touch PostgreSQL')},overrides);
  const result=await h(request());
  assert.equal(result.status,503);
  assert.deepEqual(await result.json(),{accepted:false,code:'verification_required',sent:false});
  assert.equal(pools,0);
 }
});
test('verified-only GET challenge does not bypass receipt activation gates',async()=>{
 let pools=0;
 const h=handler(()=>{pools++;throw Error('must not touch PostgreSQL')},{
  XJW_RECEIPT_ENABLED:'false',XJW_META_VERIFY_ONLY_ENABLED:'true',
  XJW_META_E2E_VERIFIED:undefined,XJW_PRIMARY_OVERLAP_VERIFIED:undefined
 });
 const get=await h(new Request('https://example.test/?hub.mode=subscribe&hub.verify_token=test-verify&hub.challenge=1234'));
 assert.equal(get.status,200);
 assert.equal(await get.text(),'1234');
 const post=await h(request());
 assert.equal(post.status,503);
 assert.equal((await post.json()).code,'receipt_disabled');
 assert.equal(pools,0);
});
