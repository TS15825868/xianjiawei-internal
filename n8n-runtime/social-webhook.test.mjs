import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {receiveWebhook,verifiedSubscriptionChallenge} from './social-webhook.mjs';
import {socialTlsOptions} from './social-tls.mjs';
const config={appSecret:'test-only-secret',verifyToken:'test-verification',allowedAccounts:{facebook:['411869648852531']}};
const body=JSON.stringify({object:'page',entry:[{id:'411869648852531',changes:[]}]});
const signed=(value=body,secret=config.appSecret)=>new Request('https://example.com/webhook',{method:'POST',headers:{'content-type':'application/json','x-hub-signature-256':'sha256='+createHmac('sha256',secret).update(value).digest('hex')},body:value});
test('acknowledges only after awaited durable statement',async()=>{
 let persisted=false;const db={async query(sql,values){assert.match(sql,/ON CONFLICT DO NOTHING/);assert.equal(values[1],'facebook');await Promise.resolve();persisted=true;return {rowCount:1}}};
 const r=await receiveWebhook(signed(),config,db);assert.equal(persisted,true);assert.equal((await r.json()).sent,false);
});
test('duplicate receipt is acknowledged only when PostgreSQL confirms zero changes',async()=>{
 const r=await receiveWebhook(signed(),config,{query:async()=>({rowCount:0})});
 assert.equal(r.status,200);
 assert.equal((await r.json()).sent,false);
});
test('malformed, missing or impossible database receipt counts never return success',async()=>{
 for(const rowCount of [undefined,null,-1,2,'1',NaN]){
  await assert.rejects(receiveWebhook(signed(),config,{query:async()=>({rowCount})}),/storage_unavailable/);
 }
 await assert.rejects(receiveWebhook(signed(),config,{query:async()=>undefined}),/storage_unavailable/);
});
test('multi-account receipt accepts exactly the available verified account count',async()=>{
 const both={...config,allowedAccounts:{facebook:['411869648852531','1234567']}};
 const raw=JSON.stringify({object:'page',entry:[{id:'411869648852531'},{id:'1234567'}]});
 const r=await receiveWebhook(signed(raw),both,{query:async()=>({rowCount:2})});
 assert.equal(r.status,200);
});

test('storage failure does not acknowledge',async()=>{await assert.rejects(receiveWebhook(signed(),config,{query:async()=>{throw Error('offline')}}))});
test('invalid signature never touches storage',async()=>{await assert.rejects(receiveWebhook(signed(body,'wrong'),config,{query:()=>assert.fail()}),/signature_rejected/)});
test('valid signature for another account is rejected',async()=>{await assert.rejects(receiveWebhook(signed(body.replace('411869648852531','123')),config,{}),/account_rejected/)});
test('oversized signed payload is rejected',async()=>{await assert.rejects(receiveWebhook(signed(' '.repeat(65537)),config,{}),/payload_too_large/)});
test('challenge requires configured token and subscribe mode',async()=>{
 const r=await receiveWebhook(new Request('https://example.com/?hub.mode=subscribe&hub.verify_token=test-verification&hub.challenge=123'),config,null);assert.equal(await r.text(),'123');
 await assert.rejects(receiveWebhook(new Request('https://example.com/?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123'),config,null),/verification_rejected/);
});
test('TLS refuses admin, absent CA and arbitrary hosts',()=>{
 for(const c of [{user:'postgres'},{user:'xjw_social_worker'},{user:'xjw_social_worker',host:'attacker.example'}])assert.throws(()=>socialTlsOptions(c));
 const c=socialTlsOptions({user:'xjw_social_worker',host:'db.iphexhvjhsmelbgwzhhr.supabase.co',port:5432,password:'test-only',ca:'-----BEGIN CERTIFICATE-----\ntest'});
 assert.equal(c.ssl.rejectUnauthorized,true);assert.equal(c.max,1);assert.equal(c.connectionString,undefined);
});

test('string allowlist cannot authorize an account using substring inclusion',async()=>{
 const malformed={...config,allowedAccounts:{facebook:'000411869648852531999'}};
 await assert.rejects(receiveWebhook(signed(),malformed,{query:()=>assert.fail('unexpected database access')}),/configuration_missing/);
});
test('account allowlist requires a numeric-string array and exact ID match',async()=>{
 for(const allowed of [411869648852531,['411869648852531',411869648852531],{id:'411869648852531'}]){
  const malformed={...config,allowedAccounts:{facebook:allowed}};
  await assert.rejects(receiveWebhook(signed(),malformed,{query:()=>assert.fail('unexpected database access')}),/configuration_missing/);
 }
 await assert.rejects(receiveWebhook(signed(),{...config,allowedAccounts:{facebook:['000411869648852531999']}},{query:()=>assert.fail('unexpected database access')}),/account_rejected/);
});

test('shared IPv4 session pooler is permitted only with the dedicated project-scoped worker role',()=>{
 const host='aws-0-ap-northeast-1.pooler.supabase.com';
 const connection={host,port:5432,user:'xjw_social_worker.iphexhvjhsmelbgwzhhr',
  password:'test-only',ca:'-----BEGIN CERTIFICATE-----\\ntest'};
 const valid=socialTlsOptions(connection);
 assert.equal(valid.host,host);assert.equal(valid.port,5432);
 assert.equal(valid.user,'xjw_social_worker.iphexhvjhsmelbgwzhhr');
 assert.equal(valid.ssl.rejectUnauthorized,true);assert.equal(valid.max,1);
 for(const invalid of [
  {...connection,user:'postgres.iphexhvjhsmelbgwzhhr'},
  {...connection,user:'xjw_social_worker.otherproject'},
  {...connection,user:'xjw_social_worker'},
  {...connection,port:6543},
  {...connection,host:'db.otherproject.supabase.co'},
  {...connection,host:'aws-0-ap-southeast-1.pooler.supabase.com'}, // wrong project region
  {...connection,host:'aws-0-ap-northeast-1.pooler.supabase.com.attacker.example'},
  {...connection,ca:undefined},
 ])assert.throws(()=>socialTlsOptions(invalid),/Dedicated verified TLS/);
});
test('Render IPv4-only egress rejects direct Supabase DB while accepting shared pooler',()=>{
 const prev=process.env.RENDER_SERVICE_ID;
 process.env.RENDER_SERVICE_ID='srv-test-only';
 const common={port:5432,password:'test-only',ca:'-----BEGIN CERTIFICATE-----\\ntest'};
 try{
  assert.throws(()=>socialTlsOptions({...common,
   host:'db.iphexhvjhsmelbgwzhhr.supabase.co',user:'xjw_social_worker'}),/Dedicated verified TLS/);
  assert.equal(socialTlsOptions({...common,
   host:'aws-0-ap-northeast-1.pooler.supabase.com',
   user:'xjw_social_worker.iphexhvjhsmelbgwzhhr'}).ssl.rejectUnauthorized,true);
 }finally{
  if(prev===undefined)delete process.env.RENDER_SERVICE_ID;
  else process.env.RENDER_SERVICE_ID=prev;
 }
});


test('standalone Meta handshake requires configured verify token and GET',()=>{
 const verified=new Request('https://example.com/?hub.mode=subscribe&hub.verify_token=test-verification&hub.challenge=123');
 assert.equal(verifiedSubscriptionChallenge(verified,'test-verification'),'123');
 assert.throws(()=>verifiedSubscriptionChallenge(verified,''),/configuration_missing/);
 assert.throws(()=>verifiedSubscriptionChallenge(verified,'other-token'),/verification_rejected/);
 assert.throws(()=>verifiedSubscriptionChallenge(signed(),'test-verification'),/method_rejected/);
});
