import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {receiveWebhook} from './social-webhook.mjs';
import {socialTlsOptions} from './social-tls.mjs';
const config={appSecret:'test-only-secret',verifyToken:'test-verification',allowedAccounts:{facebook:['411869648852531']}};
const body=JSON.stringify({object:'page',entry:[{id:'411869648852531',changes:[]}]});
const signed=(value=body,secret=config.appSecret)=>new Request('https://example.com/webhook',{method:'POST',headers:{'content-type':'application/json','x-hub-signature-256':'sha256='+createHmac('sha256',secret).update(value).digest('hex')},body:value});
test('acknowledges only after awaited durable statement',async()=>{
 let persisted=false;const db={async query(sql,values){assert.match(sql,/ON CONFLICT DO NOTHING/);assert.equal(values[1],'facebook');await Promise.resolve();persisted=true}};
 const r=await receiveWebhook(signed(),config,db);assert.equal(persisted,true);assert.equal((await r.json()).sent,false);
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
