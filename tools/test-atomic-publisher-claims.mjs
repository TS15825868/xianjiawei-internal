import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publishPostById,publishDuePosts} from '../src/social-publisher.js';

const id='P-ATOMIC-20261026-01',platform='Facebook',now=new Date('2026-10-26T00:00:00.000Z');
const post={id,status:'approved',headline:'仙加味已核准社群貼文',copy:'只有本地模擬，無真實對客發布',
 image_url:'https://assets.example.test/approved.webp',platforms_json:JSON.stringify([platform]),
 scheduled_at:now.toISOString()};
function fixture({firstStatus=null,throwOnSave=false}={}){
 let delivery=firstStatus?{
  status:firstStatus,post_id:id,platform,attempt_count:1,
  last_attempt_at:'2026-10-25T23:54:00.000Z',created_at:'2026-10-25T23:50:00.000Z'
 }:null;
 const updates=[];let claims=0,saveCalls=0;
 const DB={prepare(sql){let args=[];
  return{bind(...v){args=v;return this},
   async first(){
    if(sql.includes('FROM social_metricool_sync'))return null;
    if(sql.includes('FROM social_posts'))return {...post};
    if(sql.includes('FROM social_publish_deliveries'))return delivery?{...delivery}:null;
    throw Error('unexpected SELECT '+sql);
   },
   async all(){
    if(sql.includes("SELECT * FROM social_posts WHERE status='scheduled'"))return{results:[{...post,status:'scheduled'}]};
    if(sql.includes('FROM social_publish_deliveries'))return{results:delivery?[delivery]:[]};
    throw Error('unexpected list');
   },
   async run(){
    updates.push({sql,args});
    if(sql.startsWith('INSERT OR IGNORE INTO social_publish_deliveries')){
     claims++;
     if(delivery)return{success:true,meta:{changes:0}};
     delivery={post_id:id,platform,status:'sending',attempt_count:0,
      last_attempt_at:args[2],created_at:args[3]};
     return{success:true,meta:{changes:1}};
    }
    if(sql.startsWith("UPDATE social_publish_deliveries SET status='sending'")){
     claims++;
     if(!delivery||delivery.status!=='retry'||delivery.last_attempt_at!==args[4]||
       delivery.attempt_count!==args[5])return{success:true,meta:{changes:0}};
     delivery.status='sending';delivery.last_attempt_at=args[0];
     return{success:true,meta:{changes:1}};
    }
    if(sql.startsWith('INSERT INTO social_publish_deliveries')){
     saveCalls++;
     if(throwOnSave)throw Error('private D1 storage error');
     delivery={...delivery,status:args[2],remote_id:args[5],
       attempt_count:(delivery?.attempt_count||0)+1,last_attempt_at:args[3]};
     return{success:true,meta:{changes:1}};
    }
    if(sql.startsWith('UPDATE social_posts SET'))return{success:true,meta:{changes:1}};
    throw Error('unexpected mutation '+sql);
   }
  };
 }};
 return {DB,get delivery(){return delivery},get claims(){return claims},
  get saves(){return saveCalls},updates};
}
const env=db=>({DB:db.DB,META_PAGE_ACCESS_TOKEN:'local-test-token',META_PAGE_ID:'11111',
 META_INSTAGRAM_USER_ID:'22222'});
test('two concurrent workers use D1 atomic reservation; exactly one outbound POST',async()=>{
 const d=fixture(),e=env(d);
 const original=globalThis.fetch;let outbound=0,finish;
 const pending=new Promise(resolve=>{finish=resolve});
 globalThis.fetch=async()=>{
  outbound++;
  await pending;
  return new Response('{"id":"remote-123"}',{status:200});
 };
 try{
  const first=publishPostById(e,id,now);
  // Let first worker create claim and enter the waiting network request.
  for(let attempt=0;attempt<20&&outbound<1;attempt++)await new Promise(r=>setImmediate(r));
  assert.equal(outbound,1,'first worker entered remote POST');
  const second=await publishPostById(e,id,now);
  assert.equal(outbound,1,'second worker must not dispatch');
  assert.equal(second.ok,false);
  assert.equal(second.results[0].reason,'delivery_unconfirmed_or_in_flight');
  finish();
  const result=await first;
  assert.equal(result.results[0].ok,true);
  assert.equal(result.results[0].remote_id,'remote-123');
  assert.equal(d.delivery.status,'published');
  assert.equal(d.claims,1);
 }finally{finish?.();globalThis.fetch=original}
});
test('receipt D1 failure after confirmed outbound request never repeats public post',async()=>{
 const d=fixture({throwOnSave:true}),e=env(d),original=globalThis.fetch;
 let outbound=0;globalThis.fetch=async()=>{
  outbound++;return new Response('{"id":"remote-accept-234"}',{status:200});
 };
 try{
  const first=await publishPostById(e,id,now);
  assert.equal(outbound,1);
  assert.equal(first.ok,false,'unverified send must not be presented as overall publication success');
  assert.equal(first.manual_required,true);
  assert.equal(first.results[0].delivery_outcome_unverified,true);
  assert.equal(d.delivery.status,'sending','D1 reservation survives app receipt-save failure');
  const second=await publishPostById(e,id,new Date(now.getTime()+360000));
  assert.equal(second.ok,false);
  assert.equal(second.results[0].reason,'delivery_unconfirmed_or_in_flight');
  assert.equal(outbound,1,'no duplicate network POST');
 }finally{globalThis.fetch=original}
});
test('a previously confirmed retry requires atomic status compare-and-swap',async()=>{
 const d=fixture({firstStatus:'retry'}),e=env(d),saved=globalThis.fetch;
 let sent=0;globalThis.fetch=async()=>{sent++;return new Response('{"id":"remote-retry-1"}',{status:200})};
 try{
  const result=await publishPostById(e,id,now);
  assert.equal(result.results[0].ok,true);
  assert.equal(d.claims,1);assert.equal(sent,1);
  assert.equal(d.delivery.status,'published');
 }finally{globalThis.fetch=saved}
});
test('prior manual, published and ambiguous sending states never retry',async()=>{
 const saved=globalThis.fetch;globalThis.fetch=()=>assert.fail('never send');
 try{
  for(const status of ['manual_required','published','sending','pending']){
   const d=fixture({firstStatus:status});
   const result=await publishPostById(env(d),id,now);
   assert.equal(result.results[0].skipped,true,status);
   assert.equal(d.claims,0,status);
  }
 }finally{globalThis.fetch=saved}
});

test('legacy published record missing official remote ID must never be treated as a confirmed send',async()=>{
 const d=fixture({firstStatus:'published'}),save=globalThis.fetch;
 globalThis.fetch=()=>assert.fail('No duplicate send permitted');
 try{
  const r=await publishPostById(env(d),id,now);
  assert.equal(r.ok,false);
  assert.equal(r.manual_required,true);
  assert.equal(r.results[0].reason,'published_receipt_missing');
  assert.equal(r.results[0].delivery_outcome_unverified,true);
  assert.equal(d.claims,0);
  assert.ok(d.updates.some(x=>x.sql.startsWith("UPDATE social_posts SET status='manual_required'")));
  assert.ok(!d.updates.some(x=>x.sql.startsWith("UPDATE social_posts SET status='published'")));
 }finally{globalThis.fetch=save}
});
test('legacy published record with real remote ID is recognized without sending another request',async()=>{
 const d=fixture({firstStatus:'published'}),original=d.DB.prepare,save=globalThis.fetch;
 d.DB.prepare=function(sql){
  const statement=original.call(this,sql);
  if(sql.includes('FROM social_publish_deliveries')&&sql.includes('LIMIT 1')){
   const old=statement.first.bind(statement);
   statement.first=async()=>({...await old(),remote_id:'fb-remote-accepted-111'});
  }
  return statement;
 };
 globalThis.fetch=()=>assert.fail('No duplicate send permitted');
 try{
  const r=await publishPostById(env(d),id,now);
  assert.equal(r.results[0].reason,'published');
  assert.equal(r.results[0].skipped,true);
  assert.equal(r.ok,true);
  assert.ok(d.updates.some(x=>x.sql.startsWith("UPDATE social_posts SET status='published'")));
 }finally{globalThis.fetch=save}
});
test('overdue legacy published receipt without remote ID goes to human reconciliation',async()=>{
 const d=fixture({firstStatus:'published'}),save=globalThis.fetch;
 globalThis.fetch=()=>assert.fail('No external sends');
 try{
  const r=await publishDuePosts(env(d),new Date(now.getTime()+1200000));
  assert.equal(r.results[0].manual_required,true);
  assert.equal(r.results[0].published_platforms.length,0);
  assert.ok(r.results[0].uncertain_platforms.includes('Facebook'));
 }finally{globalThis.fetch=save}
});
