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
async function exercise(mutate){
 const routes=fixtures();
 if(mutate)mutate(routes);
 const output=[],errors=[],exits=[],requests=[];
 const fakeFetch=async url=>{
  requests.push(String(url));
  const entry=routes[String(url)];
  if(!entry)throw Error('Unexpected destination (network forbidden): '+url);
  if(entry.transportFailure)throw Error('simulated transport error: never expose details');
  return {status:entry.status,ok:entry.status>=200&&entry.status<300,
   text:async()=>typeof entry.body==='string'?entry.body:JSON.stringify(entry.body)};
 };
 const ctx={fetch:fakeFetch,AbortController,setTimeout,clearTimeout,
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
