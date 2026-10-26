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
  assert.equal(report.reason,'no_valid_platforms');
  assert.equal(db.writes.length,0,'no delivery or published-state writes permitted');
 });
}
test('scheduled post with no valid platforms cannot become published',async()=>{
 const db=fakeInvalidPlatformsDb('[]',{scheduled:true});
 const report=await publishDuePosts({DB:db.DB},new Date('2026-10-26T00:02:00.000Z'));
 assert.equal(report.results[0].reason,'no_valid_platforms');
 assert.equal(db.writes.length,0);
});
