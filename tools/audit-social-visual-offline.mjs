#!/usr/bin/env node
// Offline-only visual dedup candidate audit. No D1, network, writes, or publication decisions.
// Input: {assets:[{id,sha256,dhash,source_zip,source_path,post_id?}], posts?:[{id,status,image_sha256?,image_dhash?}]}
// Supports a future historical-media export; absent historical evidence is explicitly unresolved.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const str=x=>String(x??'').trim();
const hash=(x,n)=>new RegExp('^[a-f0-9]{'+n+'}$','i').test(str(x))?str(x).toLowerCase():'';
export function auditOfflineVisual(input,{maxDistance=8}={}){
 if(!Array.isArray(input?.assets))throw Error('Required assets array');
 if(!Number.isInteger(maxDistance)||maxDistance<0||maxDistance>64)throw Error('Invalid maxDistance');
 const assets=input.assets.map((a,i)=>({id:str(a.id)||str(a.source_path)||String(i),source_zip:str(a.source_zip),sha256:hash(a.sha256,64),dhash:hash(a.dhash,16),post_id:str(a.post_id)}));
 const invalid=assets.filter((a,i)=>!a.sha256||!a.dhash).map(a=>a.id);
 const exact=[],similar=[];
 const distance=(a,b)=>{let d=0;for(let i=0;i<16;i++){let x=parseInt(a[i],16)^parseInt(b[i],16);while(x){d+=x&1;x>>=1;}}return d;};
 for(let i=0;i<assets.length;i++)for(let j=i+1;j<assets.length;j++){
  const a=assets[i],b=assets[j];
  if(a.sha256&&b.sha256&&a.sha256===b.sha256)exact.push({a:a.id,b:b.id});
  else if(a.dhash&&b.dhash){const d=distance(a.dhash,b.dhash);if(d<=maxDistance)similar.push({a:a.id,b:b.id,distance:d});}
 }
 const posts=Array.isArray(input.posts)?input.posts:[];
 const linked=new Set(assets.map(a=>a.post_id).filter(Boolean));
 const pending=posts.filter(p=>str(p.status)==='pending_review');
 return {source:'offline-only',production_queries:0,changes:0,assets:assets.length,invalid_hash_ids:invalid,exact,similar:similar.sort((a,b)=>a.distance-b.distance),pending_posts:pending.length,pending_without_asset_evidence:pending.filter(p=>!linked.has(str(p.id))).map(p=>str(p.id)),historical_coverage_verified:false,auto_release_allowed:false,warning:'雜湊相似是候選；未涵蓋全部歷史媒體、未做圖文語意與正式產品核對，禁止直接解除待審或發布'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{if(!process.argv[2])throw Error('Usage: node tools/audit-social-visual-offline.mjs <sanitized-assets.json>');console.log(JSON.stringify(auditOfflineVisual(JSON.parse(readFileSync(process.argv[2],'utf8'))),null,2));}
 catch(e){console.error(String(e.message));process.exitCode=2;}
}
