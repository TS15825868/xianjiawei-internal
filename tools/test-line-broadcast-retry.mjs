import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lineBroadcastRetryKey,publishPostById} from '../src/social-publisher.js';

const uuidV4=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const post={id:'P-LINE-20261026-STABLE',status:'approved',headline:'正式已核准草稿',
 copy:'本輪只測試 LINE 安全重試，不向真正顧客發送',image_url:'https://assets.example.test/line.webp',
 platforms_json:JSON.stringify(['LINE OA'])};
function fakeDb({prior=null}={}){
 let writes=[];
 const DB={prepare(sql){let args=[];
  return {bind(...v){args=v;return this},
   async first(){
    if(sql.includes('FROM social_metricool_sync'))return null;
    if(sql.includes('FROM social_posts'))return {...post};
    if(sql.includes('FROM social_publish_deliveries'))return prior;
    throw Error('Unexpected read SQL: '+sql);
   },
   async run(){writes.push({sql,args});return{success:true,meta:{changes:1}}}};
 }};
 return {DB,get writes(){return writes}};
}
test('retry key is RFC-compatible stable UUIDv4 based on one approved LINE broadcast',async()=>{
 const a=await lineBroadcastRetryKey(post),b=await lineBroadcastRetryKey({...post});
 assert.match(a,uuidV4);
 assert.equal(a,b);
 assert.equal(a,await lineBroadcastRetryKey({...post,copy:'changed after approval'}));
 assert.notEqual(a,await lineBroadcastRetryKey({...post,id:'different-post'}));
 assert.equal(a.length,36);
});
test('all outbound retries reuse exactly same LINE key after an ambiguous response',async()=>{
 const prior={status:'retry',attempt_count:1,
  created_at:'2026-10-26T00:00:00.000Z',last_attempt_at:'2026-10-26T00:00:00.000Z'};
 const originalFetch=globalThis.fetch;
 const keys=[];let seen=0;
 globalThis.fetch=async(url,options)=>{
  assert.equal(url,'https://api.line.me/v2/bot/message/broadcast');
  assert.equal(options.method,'POST');
  keys.push(options.headers['x-line-retry-key']);
  return ++seen===1
   ?new Response('temporary error',{status:500})
   :new Response('{"message":"The retry key is already accepted"}',
       {status:409,headers:{'x-line-accepted-request-id':'accepted-line-request-1'}});
 };
 try{
  const env={DB:fakeDb().DB,LINE_CHANNEL_ACCESS_TOKEN:'local-test-only'};
  const r1=await publishPostById(env,post.id,new Date('2026-10-26T00:00:00.000Z'));
  assert.equal(r1.results[0].ok,false);
  assert.equal(r1.results[0].retryable,true);
  const env2={DB:fakeDb({prior}).DB,LINE_CHANNEL_ACCESS_TOKEN:'local-test-only'};
  const r2=await publishPostById(env2,post.id,new Date('2026-10-26T00:06:00.000Z'));
  assert.equal(r2.results[0].ok,true);
  assert.equal(r2.results[0].already_accepted,true);
  assert.equal(r2.results[0].remote_id,'accepted-line-request-1');
  assert.equal(keys.length,2);
  assert.equal(keys[0],keys[1],'retries MUST use the original retry key');
  assert.match(keys[0],uuidV4);
 }finally{globalThis.fetch=originalFetch}
});
test('LINE 409 without official accepted-request-id is a human review, not assumed success',async()=>{
 const save=globalThis.fetch;
 globalThis.fetch=async()=>new Response('{"message":"conflict"}',{status:409});
 try{
  const env={DB:fakeDb().DB,LINE_CHANNEL_ACCESS_TOKEN:'local-test-only'};
  const r=await publishPostById(env,post.id,new Date('2026-10-26T00:00:00.000Z'));
  assert.equal(r.results[0].ok,false);
  assert.equal(r.results[0].manual_required,true);
  assert.equal(r.results[0].retryable,false);
 }finally{globalThis.fetch=save}
});
test('unknown LINE outcome cannot retry after retry-key 24-hour protection window',async()=>{
 const save=globalThis.fetch;
 globalThis.fetch=()=>assert.fail('No external broadcast should occur');
 try{
  const env={DB:fakeDb({prior:{status:'retry',attempt_count:1,
   created_at:'2026-10-24T00:00:00.000Z',
   last_attempt_at:'2026-10-24T00:00:00.000Z'}}).DB,
   LINE_CHANNEL_ACCESS_TOKEN:'local-test-only'};
  const r=await publishPostById(env,post.id,new Date('2026-10-26T00:00:00.000Z'));
  assert.equal(r.ok,false);
  assert.equal(r.results[0].reason,'line_retry_window_expired_manual_verification');
 }finally{globalThis.fetch=save}
});
test('missing original delivery time never silently resets retry-key safety',async()=>{
 const save=globalThis.fetch;
 globalThis.fetch=()=>assert.fail('Never send with unverified first-attempt time');
 try{
  const env={DB:fakeDb({prior:{status:'retry',attempt_count:1,last_attempt_at:'2026-10-26T00:00:00.000Z'}}).DB,
    LINE_CHANNEL_ACCESS_TOKEN:'local-test-only'};
  const r=await publishPostById(env,post.id,new Date('2026-10-26T00:06:00.000Z'));
  assert.equal(r.results[0].reason,'line_retry_window_expired_manual_verification');
 }finally{globalThis.fetch=save}
});
