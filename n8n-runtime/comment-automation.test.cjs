'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createCommentAutomation}=require('./comment-automation.cjs');
const event={platform:'facebook',accountId:'123',postId:'456',threadId:'789',commentId:'789'};
const catalog=()=>({verified:true,version:'fixture',source:'fixture',fetchedAt:new Date().toISOString(),
 products:[{id:'paste',name:'龜鹿膏',ingredients:['鹿角萃取物','龜板萃取物']}]});
function scenario({releaseApproved=false,allowed=true,permission=true,owner=true,reply=false,takeover=false}={}){
 const events=[],claims=new Set();let sends=0,apiReads=0,erps=0;
 const db={async query(sql,args){
  events.push(sql);
  if(sql.includes('AS human_takeover'))return {rows:[{human_takeover:takeover,reply_reserved:false}]};
  if(sql.includes('INSERT INTO xjw_social.comment_ledger')){
    const key=args.slice(0,5).join(':');if(claims.has(key))return {rowCount:0};claims.add(key);
    return {rowCount:1};
  }
  if(sql.includes('INSERT INTO xjw_social.reply_ledger'))return {rowCount:allowed?1:0};
  if(sql.includes('UPDATE xjw_social.reply_ledger'))return {rowCount:allowed?1:0};
  if(sql.includes('UPDATE xjw_social.comment_ledger'))return {rowCount:1};
  if(sql.includes('SELECT c.platform')){erps++;return {rows:[]};}
  throw Error('Unexpected SQL statement in offline fixture');
 }};
 const request=async ({method,url,retries,followRedirects})=>{
  assert.equal(retries,0);assert.equal(followRedirects,false);
  if(method==='POST'){sends++;assert.match(url,/\/789\/comments$/);return {id:'987'};}
  apiReads++;
  if(url.endsWith('/me?fields=id'))return {id:permission?'123':'999'};
  if(url.includes('/456/comments?'))return {data:[{id:'789',message:'龜鹿膏成分？',
    from:{id:'900'},created_time:'2026-10-23T00:00:00Z'}]};
  if(url.includes('/789/comments?'))return {data:[]};
  throw Error('Unexpected Graph API endpoint');
 };
 const automation=createCommentAutomation({
  db,platform:'facebook',accountId:'123',username:'仙加味',request,
  verifyPost:async()=>({verified:owner,platform:'facebook',accountId:'123',postId:'456',
    username:'仙加味',readPermissionVerified:true,checkedAt:Date.now()}),
  permissionEvidence:async()=>({platform:'facebook',accountId:'123',verified:true,
    checkedAt:Date.now(),expiresAt:Date.now()+3600000,scopes:[
      'pages_read_engagement','pages_read_user_content','pages_manage_engagement']}),
  catalog:catalog(),allowedAccounts:{facebook:['123']},releaseApproved
 });
 return {automation,events,sends:()=>sends,reads:()=>apiReads,erps:()=>erps};
}
test('non-released automation still verifies official history and saves suggestions without POST',async()=>{
 const x=scenario();
 const r=await x.automation.handle(event);
 assert.equal(r.action,'suggest');assert.equal(r.sent,false);assert.equal(x.sends(),0);
 assert.ok(x.reads()>=2);
 assert.equal((await x.automation.handle(event)).reason,'duplicate_event');
 assert.equal(x.sends(),0);
});
test('trusted release plus real permissions, fresh official thread and durable gates can send once',async()=>{
 const x=scenario({releaseApproved:true});
 const r=await x.automation.handle(event);
 assert.equal(r.action,'sent');assert.equal(r.remoteReplyId,'987');assert.equal(x.sends(),1);
 assert.equal((await x.automation.handle(event)).reason,'duplicate_event');
 assert.equal(x.sends(),1);
 assert.ok(x.events.some(s=>s.includes('p.enabled AND p.e2e_verified AND p.overlap_verified')));
});
test('released sender cannot bypass durable disabled platform or unverified identity',async()=>{
 for(const state of [{allowed:false},{permission:false},{owner:false},{takeover:true}]){
  const x=scenario({...state,releaseApproved:true});
  assert.equal((await x.automation.handle(event)).sent,false);assert.equal(x.sends(),0);
 }
});
test('even on released server explicit suggest() never sends',async()=>{
 const x=scenario({releaseApproved:true});
 const r=await x.automation.suggest(event);
 assert.equal(r.action,'suggest');assert.equal(r.sent,false);assert.equal(x.sends(),0);
});
test('untrusted account events fail before database and official API calls',async()=>{
 const x=scenario({releaseApproved:true});
 const r=await x.automation.handle({...event,accountId:'111'});
 assert.equal(r.reason,'unverified_account');assert.equal(x.sends(),0);
 assert.equal(x.reads(),0);assert.equal(x.events.length,0);
});
test('unapproved platform bindings and release values are refused before initialization',()=>{
 assert.throws(()=>createCommentAutomation(),/Protected social automation/);
 assert.throws(()=>createCommentAutomation({platform:'facebook',accountId:'1',
  allowedAccounts:{facebook:['2']}}),/Protected social automation/);
});
