import fs from 'node:fs';
import assert from 'node:assert/strict';

// Isolated executable test: no Cloudflare credentials, database, API or posting.
let source=fs.readFileSync(new URL('../src/production-entry.js',import.meta.url),'utf8');
const replacements=[
  ["import app,{gateState} from './publishing-review-gate-entry.js';",
   "const app={scheduled:async()=>{globalThis.__scheduleSafety.forwarded++}};const gateState=async()=>globalThis.__scheduleSafety.review;"],
  ["import { keepLineWarm } from './flexible-publish-entry.js';",
   "const keepLineWarm=async()=>{globalThis.__scheduleSafety.lineWarmed++};"],
  ["import { createRemoteJWKSet, jwtVerify } from 'jose';",
   "const createRemoteJWKSet=()=>null;const jwtVerify=async()=>{throw Error('not used')};"],
  ["import { publisherConfiguration } from './social-publisher.js';",
   "const publisherConfiguration=()=>({});"],
  ["import { checkD1, runReadiness, probePlatforms, blockingPlatformFailures, VERSION as READINESS_VERSION } from './system-readiness.js';",
   "const checkD1=async()=>({ok:!globalThis.__scheduleSafety.failHealth,error:'isolated'});const runReadiness=async()=>({});const probePlatforms=async()=>{globalThis.__scheduleSafety.probes++;return{}};const blockingPlatformFailures=()=>[];const READINESS_VERSION='isolated';"]
];
for(const [from,to] of replacements){
  assert.equal(source.split(from).length,2,'Missing expected import boundary: '+from);
  source=source.replace(from,to);
}
const {default:production}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

function scenario({failHealth=false,failQuery=false,failUpdate=false,review={ok:true},due=[]}={}){
 const state={failHealth,failQuery,failUpdate,review,due,forwarded:0,lineWarmed:0,probes:0,writes:0};
 globalThis.__scheduleSafety=state;
 const DB={prepare(sql){return{
   bind(){return this},
   async all(){
     if(!sql.includes('FROM social_posts WHERE status=\'scheduled\''))throw Error('Unexpected SQL');
     if(state.failQuery)throw Error('database read unavailable');
     return {results:state.due};
   },
   async run(){
     state.writes++;
     if(state.failUpdate)throw Error('database write unavailable');
     return {meta:{changes:1}};
   }
 };}};
 return {state,env:{DB}};
}
async function exercise(options){
 const {state,env}=scenario(options);
 const tasks=[];
 await production.scheduled({scheduledTime:Date.now()},env,{waitUntil:promise=>{tasks.push(promise)}});
 await Promise.all(tasks);
 return state;
}
{
 const a=await exercise({failQuery:true});
 assert.equal(a.forwarded,0,'Failed review query must not invoke publisher');
 assert.equal(a.probes,0,'Failed review query must not proceed to platform probe');
 assert.equal(a.lineWarmed,1,'Independent LINE keep-warm must remain available');
}
{
 const a=await exercise({due:[{id:'not-approved',status:'scheduled'}],review:{ok:false,reason:'missing review'},failUpdate:true});
 assert.equal(a.forwarded,0,'Unquarantined invalid review must never publish');
 assert.equal(a.probes,0,'Failed quarantine write must stop before publisher readiness');
}
{
 const a=await exercise({failHealth:true});
 assert.equal(a.forwarded,0,'Unhealthy D1 must not invoke publisher');
 assert.equal(a.probes,0,'Unhealthy D1 must not probe publishing');
}
{
 const a=await exercise({due:[{id:'approved',status:'scheduled'}],review:{ok:true}});
 assert.equal(a.forwarded,1,'Healthy, reviewed schedule retains normal behavior');
 assert.equal(a.probes,1,'Valid schedules still check current provider health');
}
delete globalThis.__scheduleSafety;
console.log('PASS scheduled publication fails closed on review lookup/quarantine write/D1 failures, retains LINE keep-warm and reviewed schedule routing; no external requests');
