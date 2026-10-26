import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publishPostById,publishDuePosts} from '../src/social-publisher.js';
const root='https://assets.example.test/official-post.webp';
const post=(platform)=>({id:'P-20261026-UNIQUE',status:'approved',
 headline:'仙加味生活情境',copy:'補養，是一種節奏。',image_url:root,
 platforms_json:JSON.stringify([platform])});
function fakeDb(platform,prior=null){
 const state={writes:[]};
 const DB={prepare(sql){let binds=[];
  return {bind(...a){binds=a;return this},
   async first(){
    if(sql.includes('FROM social_metricool_sync'))return null;
    if(sql.includes('FROM social_posts'))return post(platform);
    if(sql.includes('FROM social_publish_deliveries'))return prior;
    throw Error('unknown DB read');
   },
   async run(){state.writes.push({sql,binds});return{success:true,meta:{changes:1}}}};
 }};
 return {DB,state};
}
async function simulate(platform,env,respond,{prior=null}={}){
 const saved=globalThis.fetch;
 const requests=[];
 globalThis.fetch=async(url,opt)=>{requests.push({url:String(url),method:opt.method});return respond(url,opt)};
 try{
  const db=fakeDb(platform,prior),merged={...env,DB:db.DB};
  const report=await publishPostById(merged,post(platform).id,new Date('2026-10-26T00:00:00Z'));
  return {report,requests,db};
 }finally{globalThis.fetch=saved}
}
test('Facebook API 503 is an uncertain public POST, never blind-retried',async()=>{
 const env={META_PAGE_ACCESS_TOKEN:'fake',META_PAGE_ID:'11111',META_INSTAGRAM_USER_ID:'22222'};
 const {report,requests,db}=await simulate('Facebook',env,async()=>new Response('temporarily unavailable',{status:503}));
 assert.equal(requests.length,1);
 assert.equal(report.results[0].manual_required,true);
 assert.equal(report.results[0].retryable,false);
 assert.equal(report.results[0].delivery_outcome_unverified,true);
 assert.equal(report.results[0].ok,false);
 assert.ok(db.state.writes.some(x=>x.sql.includes('social_publish_deliveries')&&x.binds.includes('manual_required')));
});
test('Instagram API network loss after POST initiation requires official reconciliation',async()=>{
 const env={META_PAGE_ACCESS_TOKEN:'fake',META_PAGE_ID:'11111',META_INSTAGRAM_USER_ID:'22222'};
 const {report,requests}=await simulate('Instagram',env,async()=>{throw Error('lost network after server received request')});
 assert.equal(requests.length,1);
 assert.equal(report.results[0].manual_required,true);
 assert.equal(report.results[0].retryable,false);
 assert.equal(report.results[0].delivery_outcome_unverified,true);
});
test('Google Business local post 5xx requires manual remote verification',async()=>{
 const env={
  GOOGLE_OAUTH_CLIENT_ID:'fake',GOOGLE_OAUTH_CLIENT_SECRET:'fake',
  GOOGLE_OAUTH_REFRESH_TOKEN:'fake',GOOGLE_BUSINESS_ACCOUNT_ID:'112',
  GOOGLE_BUSINESS_LOCATION_ID:'445'
 };
 const {report,requests}=await simulate('Google 商家',env,async(url)=>{
  if(String(url).includes('oauth2.googleapis.com/token'))return new Response('{"access_token":"local-test-only"}',{status:200});
  return new Response('server may have accepted',{status:502});
 });
 assert.equal(requests.length,2);
 assert.equal(report.results[0].manual_required,true);
 assert.equal(report.results[0].retryable,false);
});
test('Webhook transport failure remains manual even if idempotency header is supplied',async()=>{
 const env={FACEBOOK_PUBLISH_WEBHOOK_URL:'https://webhook.example.test/post',FACEBOOK_PUBLISH_WEBHOOK_TOKEN:'fake'};
 const {report,requests}=await simulate('Facebook',env,async()=>{throw Error('connection timeout')});
 assert.equal(requests.length,1);
 assert.equal(report.results[0].manual_required,true);
 assert.equal(report.results[0].retryable,false);
});
test('previous manual-required post delivery cannot silently send again',async()=>{
 const env={META_PAGE_ACCESS_TOKEN:'fake',META_PAGE_ID:'11111',META_INSTAGRAM_USER_ID:'22222'};
 const {report,requests}=await simulate('Facebook',env,()=>assert.fail('No second network POST'),
  {prior:{status:'manual_required',attempt_count:1,last_attempt_at:'2026-10-25T01:00:00Z'}});
 assert.equal(requests.length,0);
 assert.equal(report.results[0].skipped,true);
 assert.equal(report.results[0].reason,'manual_required');
});
test('confirmed HTTP 2xx still records normal successful delivery',async()=>{
 const env={META_PAGE_ACCESS_TOKEN:'fake',META_PAGE_ID:'11111',META_INSTAGRAM_USER_ID:'22222'};
 const {report,requests}=await simulate('Facebook',env,async()=>new Response('{"id":"555_123"}',{status:200}));
 assert.equal(requests.length,1);
 assert.equal(report.results[0].ok,true);
 assert.equal(report.results[0].remote_id,'555_123');
 assert.notEqual(report.results[0].manual_required,true);
});

function fakeInvalidPlatformsDb(platforms_json,{scheduled=false}={}){
 const writes=[];
 const row={...post('Facebook'),platforms_json,status:scheduled?'scheduled':'approved',scheduled_at:'2026-10-26T00:00:00.000Z'};
 const DB={prepare(sql){return{
  bind(){return this;},
  async first(){
   if(sql.includes('FROM social_metricool_sync'))return null;
   if(sql.includes('FROM social_posts'))return row;
   if(sql.includes('FROM social_publish_deliveries'))return null;
   throw Error('unexpected read: '+sql);
  },
  async all(){if(sql.includes('FROM social_posts'))return{results:[row]};throw Error('unexpected list: '+sql);},
  async run(){writes.push(sql);return{success:true,meta:{changes:1}}}
 }}};
 return{DB,writes};
}
for(const platforms_json of ['[]','["unsupported-platform"]','invalid-json']){
 test('approved post with invalid platform list '+platforms_json+' cannot become published',async()=>{
  const db=fakeInvalidPlatformsDb(platforms_json);
  const report=await publishPostById({DB:db.DB},'P-20261026-UNIQUE',new Date('2026-10-26T00:02:00.000Z'));
  assert.equal(report.ok,false);
  assert.equal(report.blocked,true);
  assert.equal(report.reason,platforms_json==='[]'?'no_valid_platforms':'invalid_platform_selection');
  assert.equal(db.writes.length,0,'no delivery or published-state writes permitted');
 });
}
test('scheduled post with no valid platforms cannot become published',async()=>{
 const db=fakeInvalidPlatformsDb('[]',{scheduled:true});
 const report=await publishDuePosts({DB:db.DB},new Date('2026-10-26T00:02:00.000Z'));
 assert.equal(report.results[0].reason,'no_valid_platforms');
 assert.equal(db.writes.length,0);
});

test('Facebook HTTP 200 without official remote post ID stays pending manual verification',async()=>{
 const env={META_PAGE_ACCESS_TOKEN:'fake',META_PAGE_ID:'11111',META_INSTAGRAM_USER_ID:'22222'};
 const {report,requests,db}=await simulate('Facebook',env,async()=>new Response('{"success":true}',{status:200}));
 assert.equal(requests.length,1);
 assert.equal(report.results[0].ok,false);
 assert.equal(report.results[0].manual_required,true);
 assert.equal(report.results[0].delivery_outcome_unverified,true);
 assert.ok(db.state.writes.some(x=>x.sql.includes('social_publish_deliveries')&&x.binds.includes('manual_required')));
 assert.equal(db.state.writes.some(x=>x.sql.startsWith("UPDATE social_posts SET status='published'")),false,
  'No UPDATE social_posts to published may execute without remote publication proof');
});
test('Instagram media_publish 200 lacking media ID cannot be labeled published',async()=>{
 const env={META_PAGE_ACCESS_TOKEN:'fake',META_PAGE_ID:'11111',META_INSTAGRAM_USER_ID:'22222'};
 const {report,requests}=await simulate('Instagram',env,async(url)=>{
  if(String(url).endsWith('/media'))return new Response('{"id":"ig-local-container"}',{status:200});
  if(String(url).includes('status_code'))return new Response('{"status_code":"FINISHED"}',{status:200});
  if(String(url).endsWith('/media_publish'))return new Response('{}',{status:200});
  throw Error('unexpected Instagram route');
 });
 assert.equal(requests.length,3);
 assert.equal(report.results[0].manual_required,true);
 assert.equal(report.results[0].delivery_outcome_unverified,true);
 assert.equal(report.results[0].retryable,false);
});
test('Google 200 without returned local-post name requires manual verification',async()=>{
 const env={GOOGLE_OAUTH_CLIENT_ID:'fake',GOOGLE_OAUTH_CLIENT_SECRET:'fake',
  GOOGLE_OAUTH_REFRESH_TOKEN:'fake',GOOGLE_BUSINESS_ACCOUNT_ID:'111',GOOGLE_BUSINESS_LOCATION_ID:'222'};
 const {report}=await simulate('Google 商家',env,async url=>String(url).includes('oauth2.googleapis.com')
  ?new Response('{"access_token":"local-test-only"}',{status:200})
  :new Response('{}',{status:200}));
 assert.equal(report.results[0].ok,false);
 assert.equal(report.results[0].manual_required,true);
});
test('Webhook 200 queued acknowledgement cannot impersonate a published post',async()=>{
 const env={FACEBOOK_PUBLISH_WEBHOOK_URL:'https://hook.example.test/receive',
  FACEBOOK_PUBLISH_WEBHOOK_TOKEN:'fake'};
 const {report}=await simulate('Facebook',env,async()=>new Response('{"accepted":true,"id":"queue-123"}',{status:200}));
 assert.equal(report.results[0].ok,false);
 assert.equal(report.results[0].manual_required,true);
 assert.equal(report.results[0].delivery_outcome_unverified,true);
});
test('Webhook explicit published state with remote post ID is valid evidence',async()=>{
 const env={FACEBOOK_PUBLISH_WEBHOOK_URL:'https://hook.example.test/receive',
  FACEBOOK_PUBLISH_WEBHOOK_TOKEN:'fake'};
 const {report}=await simulate('Facebook',env,async()=>new Response('{"published":true,"id":"remote-post-123"}',{status:200}));
 assert.equal(report.results[0].ok,true);
 assert.equal(report.results[0].remote_id,'remote-post-123');
 assert.notEqual(report.results[0].manual_required,true);
});
test('Webhook published flag without remote ID still lacks a valid publication receipt',async()=>{
 const env={FACEBOOK_PUBLISH_WEBHOOK_URL:'https://hook.example.test/receive',
  FACEBOOK_PUBLISH_WEBHOOK_TOKEN:'fake'};
 const {report}=await simulate('Facebook',env,async()=>new Response('{"published":true}',{status:200}));
 assert.equal(report.results[0].ok,false);
 assert.equal(report.results[0].manual_required,true);
});
test('Facebook Reel finish returned HTTP 200 success false must not publish',async()=>{
 const env={META_PAGE_ACCESS_TOKEN:'fake',META_PAGE_ID:'11111',META_INSTAGRAM_USER_ID:'22222'};
 const fixture={...post('Facebook'),media_type:'reel',video_url:'https://assets.example.test/clip.mp4'};
 const saved=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{
  calls++;
  if(calls===1)return new Response('{"video_id":"video-1122","upload_url":"https://uploader.example.test"}',{status:200});
  if(calls===2)return new Response('{}',{status:200});
  if(calls===3)return new Response('{"success":false}',{status:200});
  throw Error('unexpected extra POST');
 };
 try{
  const db=fakeDb('Facebook'),originalPrepare=db.DB.prepare;
  db.DB.prepare=function(sql){
   const statement=originalPrepare.call(this,sql);
   if(sql.includes('FROM social_posts'))statement.first=async()=>fixture;
   return statement;
  };
  const report=await publishPostById({DB:db.DB,...env},fixture.id,new Date('2026-10-26T00:00:00Z'));
  assert.equal(calls,3);
  assert.equal(report.results[0].ok,false);
  assert.equal(report.results[0].manual_required,true);
 }finally{globalThis.fetch=saved}
});

test('mixed known and unknown platforms block every external send and any false published state',async()=>{
 for(const invalid of ['["Facebook","unrecognized-network"]','["Instagram",null]','["LINE OA",""]','["Google 商家",{"network":"untrusted"}]']){
  const db=fakeInvalidPlatformsDb(invalid);
  let called=0;const original=globalThis.fetch;
  globalThis.fetch=async()=>{called++;throw Error('External publishing must never run')};
  try{
   const result=await publishPostById({DB:db.DB,META_PAGE_ID:'123',META_PAGE_ACCESS_TOKEN:'fake'},'P-20261026-UNIQUE',new Date('2026-10-26T00:02:00Z'));
   assert.equal(result.ok,false,invalid);
   assert.equal(result.blocked,true,invalid);
   assert.equal(result.reason,'invalid_platform_selection',invalid);
   assert.equal(called,0,invalid);
   assert.equal(db.writes.length,0,invalid);
  }finally{globalThis.fetch=original}
 }
});
test('valid multi-platform selection remains valid and reaches only configured routes',async()=>{
 const db=fakeInvalidPlatformsDb('["Facebook","Facebook","LINE VOOM"]');
 let sends=0;const save=globalThis.fetch;
 globalThis.fetch=async()=>{sends++;return new Response('{"id":"published-remote-id"}',{status:200})};
 try{
  const result=await publishPostById({DB:db.DB,META_PAGE_ID:'123',META_INSTAGRAM_USER_ID:'456',META_PAGE_ACCESS_TOKEN:'fake'},'P-20261026-UNIQUE',new Date('2026-10-26T00:02:00Z'));
  assert.notEqual(result.reason,'invalid_platform_selection');
  assert.equal(sends,1,'Duplicated Facebook option publishes at most once');
  assert.ok(result.results.some(x=>x.platform==='LINE VOOM'&&x.manual_required===true));
 }finally{globalThis.fetch=save}
});

test('late scheduled post with mixed invalid platforms goes to manual review without posting or deleting approval evidence',async()=>{
 let status='',mutationCount=0,externalCalls=0;
 const row={...post('Facebook'),status:'scheduled',
  platforms_json:'["Facebook","unsupported"]',scheduled_at:'2026-10-26T00:00:00.000Z'};
 const DB={prepare(sql){
  return{bind(){return this},
   async all(){
    if(sql.includes('FROM social_posts'))return {results:[row]};
    if(sql.includes('FROM social_publish_deliveries'))return {results:[]};
    throw Error('unexpected list SQL: '+sql);
   },
   async first(){
    if(sql.includes('FROM social_metricool_sync'))return null;
    throw Error('unexpected read SQL: '+sql);
   },
   async run(){
    mutationCount++;
    assert.ok(sql.startsWith("UPDATE social_posts SET status='manual_required'"),
     'Do not delete approved images, review checks, or publication evidence');
    status='manual_required';
    return{success:true,meta:{changes:1}};
   }
  };
 }};
 const saved=globalThis.fetch;
 globalThis.fetch=async()=>{externalCalls++;throw Error('No public sends')};
 try{
  const result=await publishDuePosts({DB},new Date('2026-10-26T00:18:00.000Z'));
  assert.equal(result.results[0].reason,'invalid_platform_selection');
  assert.equal(result.results[0].manual_required,true);
  assert.equal(result.results[0].returned_to,'manual_required');
  assert.equal(status,'manual_required');
  assert.equal(mutationCount,1);
  assert.equal(externalCalls,0);
 }finally{globalThis.fetch=saved}
});
