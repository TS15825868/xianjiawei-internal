import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHmac,createHash} from 'node:crypto';
import vm from 'node:vm';
import {businessInquirySchema,storeBusinessInquiry} from './business-inquiries.mjs';
import {businessInquiryCrmSchema,deliverBusinessInquiryCrm} from './business-inquiry-crm.mjs';
const secret='isolated-crm-key-not-a-real-secret-123456';
const scope='xjw-b2b-crm-v1';
const endpoint='https://script.google.com/macros/s/isolated_test/exec';
const source=readFileSync(new URL('../integrations/b2b-crm/Code.gs',import.meta.url),'utf8');
function fixture(t){
  const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());
  sqlite.exec(businessInquirySchema);sqlite.exec(businessInquiryCrmSchema);
  const DB={prepare:sql=>({bind:(...args)=>({first:async()=>sqlite.prepare(sql).get(...args),all:async()=>({results:sqlite.prepare(sql).all(...args)}),run:async()=>sqlite.prepare(sql).run(...args)})})};
  const data={id:'B2B-'+crypto.randomUUID(),source:'LINE',receivedAt:new Date().toISOString(),origin:null,category:'經銷',businessContact:'=HYPERLINK("test")',details:'隔離測試'};
  const env={DB,XJW_B2B_CRM_ENABLED:'true',XJW_B2B_INTAKE_ENABLED:'true',XJW_B2B_CRM_URL:endpoint,XJW_B2B_CRM_SECRET:secret};
  const row=()=>sqlite.prepare('SELECT * FROM business_inquiry_crm_delivery WHERE inquiry_id=?').get(data.id);
  return {sqlite,DB,data,env,row};
}
function gas(clock=Date.now){
  const props={XJW_B2B_CRM_ENABLED:'true',XJW_B2B_CRM_SECRET:secret,XJW_B2B_CRM_SPREADSHEET_ID:'isolated'};
  const rows=[];
  const sheet={getLastRow:()=>rows.length,setFrozenRows(){},getRange:(r,c,n,w)=>({getValues:()=>rows.slice(r-1,r-1+n).map(row=>row.slice(c-1,c-1+w)),setValues:values=>{for(let i=0;i<values.length;i++)rows[r-1+i]=values[i];}})};
  const context=vm.createContext({
    Date:class extends Date{static now(){return clock();}},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]})},
    SpreadsheetApp:{openById:id=>{assert.equal(id,'isolated');return {getSheetByName:n=>{assert.equal(n,'B2B商家合作');return sheet;}}},flush(){}},
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
    Utilities:{Charset:{UTF_8:'UTF-8'},DigestAlgorithm:{SHA_256:'SHA-256'},computeHmacSha256Signature:(v,k)=>Array.from(createHmac('sha256',k).update(v).digest()),computeDigest:(_,v)=>Array.from(createHash('sha256').update(v).digest())},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType:()=>JSON.parse(s)})}
  });
  vm.runInContext(source,context);context.setupB2bCrmSheet();
  return {rows,props,post:body=>context.doPost({postData:{contents:body}})};
}
test('real standalone GAS receiver is signed, separate, idempotent and safe for formulas; lost response retries without duplicate rows',async t=>{
  const {DB,data,env,row}=fixture(t);await storeBusinessInquiry(DB,data);
  let time=Date.now();const receiver=gas(()=>time);let calls=0;let lastBody='';
  const transport=async(url,init)=>{
    assert.equal(url,endpoint);assert.equal(init.method,'POST');lastBody=init.body;
    const ack=receiver.post(init.body);calls++;
    if(calls===1){assert.equal(ack.ok,true);throw Error('lost ACK');}
    return Response.json(ack);
  };
  assert.equal((await deliverBusinessInquiryCrm({...env,XJW_B2B_CRM_ENABLED:'false'},{transport})).enabled,false);
  assert.equal(calls,0);
  await deliverBusinessInquiryCrm(env,{transport,now:()=>time});
  assert.equal(row().state,'retry');assert.equal(receiver.rows.length,2);
  assert.equal(receiver.rows[1][6],"'"+data.businessContact);
  assert.equal(receiver.post(lastBody).duplicate,true);
  const tampered=JSON.parse(lastBody);tampered.payload+=' ';
  assert.equal(receiver.post(JSON.stringify(tampered)).ok,false);
  time+=15*60000-1;
  await deliverBusinessInquiryCrm(env,{transport,now:()=>time});
  assert.equal(calls,1);
  time+=1;
  await deliverBusinessInquiryCrm(env,{transport,now:()=>time});
  assert.equal(row().state,'sent');assert.equal(row().attempts,2);assert.equal(receiver.rows.length,2);
  await deliverBusinessInquiryCrm(env,{transport});assert.equal(calls,2);
});
test('only Google ContentService redirect is accepted; wrong receipt never marks delivery sent',async t=>{
  const {DB,data,env,row}=fixture(t);await storeBusinessInquiry(DB,data);
  let calls=0;
  await deliverBusinessInquiryCrm(env,{transport:async()=>{calls++;return new Response('',{status:302,headers:{location:'https://untrusted.invalid/collect'}})}});
  assert.equal(calls,1);assert.equal(row().state,'held');assert.equal(row().last_error,'unsafe_redirect');
  const other={...data,id:'B2B-'+crypto.randomUUID()};await storeBusinessInquiry(DB,other);
  await deliverBusinessInquiryCrm(env,{transport:async(url,init)=>{
    if(url===endpoint)return new Response('',{status:302,headers:{location:'https://script.googleusercontent.com/macros/echo?user_content_key=mock'}});
    assert.equal(init.method,'GET');assert.equal(init.body,undefined);
    return Response.json({ok:true,id:data.id,version:scope,duplicate:false});
  }});
  const wrong=await DB.prepare('SELECT state,last_error FROM business_inquiry_crm_delivery WHERE inquiry_id=?').bind(other.id).first();
  assert.equal(wrong.state,'retry');assert.equal(wrong.last_error,'invalid_ack');
});
test('receiver holds a conflicting event ID and never writes a second row',async t=>{
  const {DB,data,env}=fixture(t);await storeBusinessInquiry(DB,data);const receiver=gas();
  const transport=async(_url,init)=>Response.json(receiver.post(init.body));
  await deliverBusinessInquiryCrm(env,{transport});
  const payload=JSON.stringify({...data,details:'changed'});
  const timestamp=String(Date.now());
  const signature=createHmac('sha256',secret).update(scope+'\n'+timestamp+'\n'+payload).digest('hex');
  const ack=receiver.post(JSON.stringify({timestamp,payload,signature}));
  assert.equal(ack.error,'id_conflict');assert.equal(receiver.rows.length,2);
});

test('concurrent schedules claim one sender; abandoned claims recover and exhausted claims are held',async t=>{
  const {DB,data,env,row}=fixture(t);await storeBusinessInquiry(DB,data);
  let now=Date.now(),calls=0;
  const receiver=gas(()=>now);
  let release;const gate=new Promise(resolve=>{release=resolve;});
  const transport=async(_url,init)=>{calls++;await gate;return Response.json(receiver.post(init.body));};
  const first=deliverBusinessInquiryCrm(env,{transport,now:()=>now});
  const second=deliverBusinessInquiryCrm(env,{transport,now:()=>now});
  // A concurrent delivery can complete without contacting the receiver while
  // the winning claim is still in flight.
  await Promise.race([first,second]);assert.equal(calls,1);release();
  await Promise.all([first,second]);assert.equal(row().state,'sent');assert.equal(receiver.rows.length,2);
  const abandoned={...data,id:'B2B-'+crypto.randomUUID()};
  await storeBusinessInquiry(DB,abandoned);
  await DB.prepare("INSERT INTO business_inquiry_crm_delivery(inquiry_id,state,attempts,claim,lease_until) VALUES (?,'sending',1,'old',?)").bind(abandoned.id,now-1).run();
  await deliverBusinessInquiryCrm(env,{transport,now:()=>now});
  const recovered=await DB.prepare("SELECT state,attempts FROM business_inquiry_crm_delivery WHERE inquiry_id=?").bind(abandoned.id).first();
  assert.equal(recovered.state,'sent');assert.equal(recovered.attempts,2);
  const exhausted={...data,id:'B2B-'+crypto.randomUUID()};
  await storeBusinessInquiry(DB,exhausted);
  await DB.prepare("INSERT INTO business_inquiry_crm_delivery(inquiry_id,state,attempts,claim,lease_until) VALUES (?,'sending',8,'old',?)").bind(exhausted.id,now-1).run();
  await deliverBusinessInquiryCrm(env,{transport,now:()=>now});
  const held=await DB.prepare("SELECT state,last_error FROM business_inquiry_crm_delivery WHERE inquiry_id=?").bind(exhausted.id).first();
  assert.equal(held.state,'held');assert.equal(held.last_error,'retry_limit');assert.equal(calls,2);
});
