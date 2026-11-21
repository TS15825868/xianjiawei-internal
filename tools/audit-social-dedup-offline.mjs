#!/usr/bin/env node
// Analyze an existing, sanitized local export. NO network, D1, credentials or writes.
// Does not deem a post approved: collisions are only candidates for human/AI review.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const clean=value=>String(value??'').trim();
const sha=value=>/^[a-f0-9]{64}$/i.test(clean(value))?clean(value).toLowerCase():'';
const textValue=value=>clean(value);
const latestOrder=review=>{const stamp=Date.parse(review?.created_at||review?.reviewed_at||'');return Number.isFinite(stamp)?stamp:-Infinity;};
export function auditSocialDedup(input){
 const posts=input?.posts,reviews=input?.reviews;
 if(!Array.isArray(posts)||!Array.isArray(reviews))throw Error('Required arrays: posts and reviews');
 const ids=new Set(),latest=new Map(),uncertainReviews=new Set();
 for(const post of posts){const id=clean(post?.id);if(!id||ids.has(id))throw Error('Missing or duplicate post id');ids.add(id);}
 for(const review of reviews){
   const id=clean(review?.post_id);if(!ids.has(id))continue;
   const date=latestOrder(review);
   if(!Number.isFinite(date)){uncertainReviews.add(id);continue;}
   const prev=latest.get(id);
   if(!prev||date>prev.date||(date===prev.date&&clean(review.id)>clean(prev.review.id)))
     latest.set(id,{review,date});
 }
 const indexes=new Map(),indexed=[];
 function add(type,key,id,status){
   if(!key)return;
   const signature=JSON.stringify([type,key]);
   if(!indexes.has(signature))indexes.set(signature,[]);
   indexes.get(signature).push({id,status});
 }
 for(const p of posts){
   const id=clean(p.id),status=clean(p.status),review=latest.get(id)?.review;
   const fields=[
      ['copy_exact',textValue(p.copy)],
      ['title_exact',textValue(p.title)],
      ['image_url_exact',textValue(p.image_url)],
      ['latest_image_sha256_exact',sha(review?.image_sha256)]
   ];
   indexed.push({id,status,fields});
   for(const [type,key] of fields)add(type,key,id,status);
 }
 const collisions=new Map(),pending=indexed.filter(p=>p.status==='pending_review');
 for(const p of pending){
   for(const [type,key] of p.fields){
     if(!key)continue;
     for(const match of indexes.get(JSON.stringify([type,key]))||[]){
       if(match.id===p.id)continue;
       const signature=JSON.stringify([p.id,match.id,type]);
       collisions.set(signature,{pending_id:p.id,other_id:match.id,other_status:match.status,collision_type:type});
     }
   }
 }
 return {
   source:'local-export-only',production_queries:0,changes:0,
   total_posts:posts.length,total_reviews:reviews.length,pending_posts:pending.length,
   pending_missing_latest_review:pending.filter(p=>!latest.has(p.id)).map(p=>p.id).sort(),
   review_timestamp_uncertain:[...uncertainReviews].sort(),
   collisions:[...collisions.values()].sort((a,b)=>
     a.pending_id.localeCompare(b.pending_id)||a.collision_type.localeCompare(b.collision_type)||a.other_id.localeCompare(b.other_id)),
   warning:'候選重複不等於已確認重複；零碰撞亦不代表圖片感知相似度、文案語意或缺失證據通過，禁止直接發布'
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const path=process.argv[2];
 if(!path){console.error('Usage: node tools/audit-social-dedup-offline.mjs <sanitized-local-posts-and-reviews.json>');process.exitCode=2;}
 else try{console.log(JSON.stringify(auditSocialDedup(JSON.parse(readFileSync(path,'utf8'))),null,2));}
 catch(error){console.error('Offline audit failed: '+String(error.message));process.exitCode=2;}
}
