'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const vm=require('node:vm');
const script=readFileSync(join(__dirname,'smoke-readonly.js'),'utf8');
const base='https://ts15825868.github.io/xianjiawei/';
const lineUrl='https://ts-line.onrender.com/healthz';
const supabaseUrl='https://iphexhvjhsmelbgwzhhr.supabase.co/functions/v1/xjw-social-receipt';
const cloudflareUrl='https://xianjiawei-social-receipt-fallback.tung314069.workers.dev/';
function fixtures(){
 const products=[
  {id:'guilu-gao'},{id:'guilu-drink-30',usage:['每日 1～2 罐']},
  {id:'guilu-drink-180'},{id:'luerong-fen'}
 ];
 return {
  [lineUrl]:{status:200,body:{ok:true,credentialsConfigured:true,orderOpen:true,productCount:4}},
  [base+'public-product-master.json']:{status:200,body:{authority:'user-confirmed-current',
    brand:{name:'仙加味'},productCount:4,version:'fixture',products}},
  [base+'ai-answers.json']:{status:200,body:{sourceOfTruth:'public-product-master.json',version:'fixture'}},
  [base+'geo-data.json']:{status:200,body:{'@graph':[
   {'@type':'Organization',name:'仙加味'},
   {'@type':'ItemList',numberOfItems:4},
   {'@type':'Dataset',dateModified:'2026-10-23'}
  ]}},
  [base+'sitemap.xml']:{status:200,body:'<?xml version="1.0"?><urlset></urlset>'},
  [supabaseUrl]:{status:503,body:{accepted:false,code:'receipt_disabled',sent:false}},
  [cloudflareUrl]:{status:503,body:{accepted:false,code:'disabled',sent:false}}
 };
}
async function exercise(mutate,options={}){
 const routes=fixtures();
 let virtualNow=Date.now();
 class VirtualDate extends Date{
  constructor(...args){super(...(args.length?args:[virtualNow]));}
  static now(){return virtualNow;}
 }
 if(mutate)mutate(routes);
 const output=[],errors=[],exits=[],requests=[];
 const fakeFetch=async url=>{
  requests.push(String(url));
  if(String(url)===lineUrl && options.lineLatencyMs)virtualNow+=options.lineLatencyMs;
  const entry=routes[String(url)];
  if(!entry)throw Error('Unexpected destination (network forbidden): '+url);
  if(entry.transportFailure)throw Error('simulated transport error: never expose details');
  return {status:entry.status,ok:entry.status>=200&&entry.status<300,
   text:async()=>typeof entry.body==='string'?entry.body:JSON.stringify(entry.body)};
 };
 const ctx={fetch:fakeFetch,AbortController,setTimeout,clearTimeout,Date:VirtualDate,
  process:{env:{},exit:code=>{exits.push(code);throw Error('mock process.exit '+code);}},
  console:{log:(...args)=>output.push(args.join(' ')),
   error:(...args)=>errors.push(args.join(' '))}};
 try { await vm.runInNewContext(script,ctx,{filename:'smoke-readonly.js',timeout:2000}); }
 catch(err){if(!String(err.message).includes('mock process.exit'))throw err;}
 const record=output.find(line=>line.startsWith('[readonly-smoke] '));
 assert.ok(record,'Expected a structured read-only health report');
 const report=JSON.parse(record.slice('[readonly-smoke] '.length));
 assert.equal(requests.length,7,'Only the seven known public GET destinations are allowed');
 assert.ok(requests.includes(supabaseUrl)&&requests.includes(cloudflareUrl));
 return {report,exits,errors,requests};
}
test('normal public endpoints pass with exact LINE credential, order and product evidence',async()=>{
 const result=await exercise();
 assert.equal(result.report.ok,true);
 assert.deepEqual(result.report.errors,[]);
 assert.deepEqual(result.exits,[]);
 assert.equal(result.report.line.bodyOk,true);
});
test('HTTP 200 HTML masquerading as LINE health is rejected',async()=>{
 const x=await exercise(r=>{r[lineUrl].body='<html>Login required</html>';});
 assert.equal(x.report.ok,false);
 assert.ok(x.report.errors.some(t=>t.includes('LINE healthz')));
 assert.deepEqual(x.exits,[1,1]);
});
test('missing or false LINE ok flag is never treated as healthy',async()=>{
 for(const status of [undefined,false,null]){
  const x=await exercise(r=>{r[lineUrl].body.ok=status;});
  assert.equal(x.report.ok,false);
  assert.ok(x.report.errors.some(t=>t.includes('ok 未明確為 true')));
 }
});
test('credentials missing or disabled orders are detected independently',async()=>{
 for(const key of ['credentialsConfigured','orderOpen']){
  const x=await exercise(r=>{r[lineUrl].body[key]=false;});
  assert.equal(x.report.ok,false);
  assert.ok(x.report.errors.some(t=>t.includes(key==='orderOpen'?'接單':'憑證')));
 }
});
test('LINE and public product counts cannot quietly diverge',async()=>{
 const x=await exercise(r=>{r[lineUrl].body.productCount=3;});
 assert.equal(x.report.ok,false);
 assert.ok(x.report.errors.some(t=>t.includes('LINE 產品筆數')));
});
test('public product brand mismatch cannot pass',async()=>{
 const x=await exercise(r=>{r[base+'public-product-master.json'].body.brand.name='wrong';});
 assert.equal(x.report.ok,false);
 assert.ok(x.report.errors.some(t=>t.includes('品牌錯誤')));
});
test('GEO and AI authority regressions fail without touching live accounts',async()=>{
 const x=await exercise(r=>{
  r[base+'ai-answers.json'].body.sourceOfTruth='stale';
  r[base+'geo-data.json'].body['@graph'][1].numberOfItems=99;
 });
 assert.equal(x.report.ok,false);
 assert.ok(x.report.errors.some(t=>t.includes('AI answers')));
 assert.ok(x.report.errors.some(t=>t.includes('GEO ItemList')));
});
test('LINE 503 and sitemap downtime both fail the backup checks',async()=>{
 const x=await exercise(r=>{
  r[lineUrl].status=503;
  r[base+'sitemap.xml'].status=404;
 });
 assert.equal(x.report.ok,false);
 assert.ok(x.report.errors.some(t=>t.includes('LINE healthz')));
 assert.ok(x.report.errors.some(t=>t.includes('sitemap')));
});


test('Meta receivers both reject unsigned public GET without accepting or sending a customer event',async()=>{
 const {report,requests}=await exercise();
 assert.equal(report.ok,true);
 assert.equal(report.metaReceipts.supabase.safelyBlocked,true);
 assert.equal(report.metaReceipts.cloudflare.safelyBlocked,true);
 assert.equal(report.metaReceipts.supabase.liveSendingVerified,false);
 assert.equal(report.metaReceipts.cloudflare.liveSendingVerified,false);
 assert.deepEqual(requests.slice(-2),[supabaseUrl,cloudflareUrl]);
});
test('a public receiver that accepts a request or loses fail-closed status fails the entire backup',async()=>{
 for(const url of [supabaseUrl,cloudflareUrl]){
  for(const mutation of [
   {status:200,body:{accepted:true,sent:false,code:'ok'}},
   {status:503,body:{accepted:false,sent:true,code:'disabled'}},
   {status:200,body:'<html>Login</html>'},
   {status:503,body:{accepted:false,code:'unconfigured',sent:false}}
  ]){
   const x=await exercise(r=>{r[url]=mutation});
   assert.equal(x.report.ok,false);
   assert.equal(x.report.metaReceipts[url===supabaseUrl?'supabase':'cloudflare'].safelyBlocked,false);
   assert.ok(x.report.errors.some(t=>t.includes('收件備援')));
   assert.deepEqual(x.exits,[1,1]);
  }
 }
});
test('verified-enabled receivers still reject unauthenticated GET without claiming auto-reply',async()=>{
 const r=await exercise(routes=>{
  routes[supabaseUrl]={status:400,body:{accepted:false,sent:false,code:'verification_rejected'}};
  routes[cloudflareUrl]={status:400,body:{accepted:false,sent:false,code:'invalid_event'}};
 });
 assert.equal(r.report.ok,true);assert.equal(r.report.metaReceipts.supabase.liveSendingVerified,false);
});

test('LINE transport outage cannot hide successful independent Supabase/Cloudflare safety probes',async()=>{
 const x=await exercise(r=>{r[lineUrl].transportFailure=true;});
 assert.equal(x.report.ok,false);
 assert.equal(x.report.line.status,0);
 assert.equal(x.report.line.transportFailure,true);
 assert.equal(x.report.metaReceipts.supabase.safelyBlocked,true);
 assert.equal(x.report.metaReceipts.cloudflare.safelyBlocked,true);
 assert.ok(x.report.errors.some(e=>e.includes('LINE healthz')));
 assert.equal(x.requests.length,7);
 assert.doesNotMatch(JSON.stringify(x.report),/simulated transport error|secret|token/i);
});
test('independent receiver outage is reported while remaining health checks still complete',async()=>{
 const x=await exercise(r=>{r[supabaseUrl].transportFailure=true;});
 assert.equal(x.report.ok,false);
 assert.equal(x.report.metaReceipts.supabase.status,0);
 assert.equal(x.report.metaReceipts.supabase.transportFailure,true);
 assert.equal(x.report.metaReceipts.supabase.safelyBlocked,false);
 assert.equal(x.report.metaReceipts.cloudflare.safelyBlocked,true);
 assert.equal(x.report.line.bodyOk,true);
 assert.ok(x.report.errors.some(e=>e.includes('Supabase Meta 收件備援')));
 assert.equal(x.requests.length,7);
});
test('both failed providers still produce a complete nonpassing safety report',async()=>{
 const x=await exercise(r=>{r[lineUrl].transportFailure=true;r[cloudflareUrl].transportFailure=true;});
 assert.equal(x.report.ok,false);
 assert.equal(x.report.metaReceipts.supabase.safelyBlocked,true);
 assert.equal(x.report.metaReceipts.cloudflare.safelyBlocked,false);
 assert.equal(x.report.metaReceipts.cloudflare.transportFailure,true);
 assert.equal(x.requests.length,7);
 assert.ok(x.report.errors.some(e=>e.includes('Cloudflare Meta 收件備援')));
});

test('enabled receipt without independent Meta E2E/overlap gate is still safely blocked',async()=>{
 const x=await exercise(r=>{r[supabaseUrl]={status:503,body:{accepted:false,code:'verification_required',sent:false}};});
 assert.equal(x.report.ok,true);
 assert.equal(x.report.metaReceipts.supabase.safelyBlocked,true);
 assert.equal(x.report.metaReceipts.supabase.liveSendingVerified,false);
});
test('wrong code or misleading send state cannot masquerade as independently gated receipt',async()=>{
 for(const body of [
  {accepted:true,code:'verification_required',sent:false},
  {accepted:false,code:'verification_required',sent:true},
  {accepted:false,code:'verification_required'},
 ]){
  const x=await exercise(r=>{r[supabaseUrl]={status:503,body};});
  assert.equal(x.report.ok,false);
  assert.equal(x.report.metaReceipts.supabase.safelyBlocked,false);
 }
});

test('line health 8+ second latency is visible and fails even if HTTP 200 eventually succeeds',async()=>{
 const x=await exercise(null,{lineLatencyMs:9000});
 assert.equal(x.report.line.status,200);
 assert.equal(x.report.line.healthLatencyMs,9000);
 assert.equal(x.report.line.slowHealth,true);
 assert.equal(x.report.line.customerReplyE2EVerified,false);
 assert.equal(x.report.ok,false);
 assert.ok(x.report.errors.some(t=>t.includes('超過 8 秒')));
 assert.deepEqual(x.exits,[1,1]);
});
test('line response errors surface as a privacy-safe warning not guessed customer failure',async()=>{
 const x=await exercise(routes=>{
  routes[lineUrl].body.lastWebhookAt=new Date().toISOString();
  routes[lineUrl].body.lastReplySuccessAt='2026-10-01T00:00:00Z';
  routes[lineUrl].body.lastReplyError='PRIVATE TOKEN / PRIVATE CUSTOMER MESSAGE';
 });
 assert.equal(x.report.ok,true,'Unsupported follow/unfollow events can have no expected reply');
 assert.equal(x.report.line.replyFailureUnresolved,true);
 assert.ok(x.report.warnings.some(t=>t.includes('回覆失敗紀錄')));
 assert.doesNotMatch(JSON.stringify(x.report),/PRIVATE TOKEN|PRIVATE CUSTOMER MESSAGE/);
});
test('historical reply errors and successfully recovered LINE conversations are not recent incidents',async()=>{
 for(const fix of [
  {lastWebhookAt:'2026-09-01T00:00:00Z',lastReplySuccessAt:''},
  {lastWebhookAt:new Date(Date.now()-1000).toISOString(),
   lastReplySuccessAt:new Date().toISOString()}
 ]){
  const x=await exercise(routes=>Object.assign(routes[lineUrl].body,fix,
   {lastReplyError:'PRIVATE REPLY DETAIL'}));
  assert.equal(x.report.ok,true);
  assert.equal(x.report.line.replyFailureUnresolved,false);
  assert.deepEqual(x.report.warnings,[]);
  assert.doesNotMatch(JSON.stringify(x.report),/PRIVATE REPLY DETAIL/);
 }
});
test('LINE health data transfer failure is flagged without exposing URL secrets',async()=>{
 const x=await exercise(r=>{r[lineUrl].transportFailure=true;});
 assert.equal(x.report.line.customerReplyE2EVerified,false);
 assert.ok(Number.isFinite(x.report.line.healthLatencyMs));
 assert.equal(x.report.line.transportFailure,true);
});

test('new deployment uses boolean LINE error state without leaking a raw SDK message',async()=>{
 const x=await exercise(routes=>{
  routes[lineUrl].body.lastWebhookAt=new Date().toISOString();
  routes[lineUrl].body.lastReplySuccessAt='2026-10-01T00:00:00Z';
  routes[lineUrl].body.lastReplyErrorPresent=true;
  routes[lineUrl].body.lastReplyError='PRIVATE LINE SDK ERROR';
 });
 assert.equal(x.report.ok,true);
 assert.equal(x.report.line.replyFailureUnresolved,true);
 assert.ok(x.report.warnings.length>0);
 assert.doesNotMatch(JSON.stringify(x.report),/PRIVATE LINE SDK ERROR/);
});
test('recent slow customer event to LINE reply API acceptance is an actual latency incident',async()=>{
 const x=await exercise(routes=>Object.assign(routes[lineUrl].body,{
  lastCustomerEventProcessedAt:new Date().toISOString(),
  lastEventToLineAckApproxMs:13740,
  lastCustomerResponseAccepted:true
 }));
 assert.equal(x.report.ok,false);
 assert.equal(x.report.line.recentCustomerReplyAckMs,13740);
 assert.equal(x.report.line.slowRecentCustomerReply,true);
 assert.equal(x.report.line.customerReplyE2EVerified,false);
 assert.ok(x.report.errors.some(e=>e.includes('客戶事件至回覆 API')));
});
test('recent customer event without LINE acceptance acknowledgement is surfaced independently',async()=>{
 const x=await exercise(routes=>Object.assign(routes[lineUrl].body,{
  lastCustomerEventProcessedAt:new Date().toISOString(),
  lastEventToLineAckApproxMs:600,
  lastCustomerResponseAccepted:false
 }));
 assert.equal(x.report.ok,false);
 assert.equal(x.report.line.recentReplyUnconfirmed,true);
 assert.equal(x.report.line.slowRecentCustomerReply,false);
 assert.ok(x.report.errors.some(e=>e.includes('沒有回覆 API 成功確認')));
});
test('legacy live service without new latency counters stays unverified, not falsely zero',async()=>{
 const x=await exercise();
 assert.equal(x.report.line.recentCustomerReplyAckMs,null);
 assert.equal(x.report.line.customerReplyE2EVerified,false);
 assert.equal(x.report.line.slowRecentCustomerReply,false);
 assert.equal(x.report.ok,true);
});
test('old slow-event telemetry is not treated as a fresh customer incident',async()=>{
 const x=await exercise(routes=>Object.assign(routes[lineUrl].body,{
  lastCustomerEventProcessedAt:'2026-09-01T00:00:00Z',
  lastEventToLineAckApproxMs:65000,
  lastCustomerResponseAccepted:false
 }));
 assert.equal(x.report.ok,true);
 assert.equal(x.report.line.slowRecentCustomerReply,false);
 assert.equal(x.report.line.recentReplyUnconfirmed,false);
});
