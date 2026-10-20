// Read-only duplicate audit for exported D1 social_posts and Metricool getScheduledPosts.
// Usage: node tools/audit-marketing-post-duplicates.mjs d1-posts.json metricool-posts.json
import fs from 'node:fs';
const [d1Path,metricoolPath]=process.argv.slice(2);
if(!d1Path||!metricoolPath){console.error('Usage: node tools/audit-marketing-post-duplicates.mjs d1-posts.json metricool-posts.json');process.exit(2);}
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const extractD1=v=>Array.isArray(v)?(v[0]?.results||v):v.results||v.items||v.data||[];
const extractMetricool=v=>v.data||v.items||v.posts||[];
const d1=extractD1(read(d1Path)),metricool=extractMetricool(read(metricoolPath));
if(!Array.isArray(d1)||!Array.isArray(metricool))throw new Error('Invalid input arrays');
const norm=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'').trim();
const d1Text=p=>norm([p.title,p.headline,p.copy].filter(Boolean).join('\n'));
const metricoolText=p=>norm(p.text);
const groups=new Map();
for(const p of d1){const key=d1Text(p);if(!key)continue;const arr=groups.get(key)||[];arr.push({source:'D1',id:p.id,status:p.status});groups.set(key,arr);}
for(const p of metricool){const key=metricoolText(p);if(!key)continue;const arr=groups.get(key)||[];arr.push({source:'Metricool',id:p.id,draft:p.draft,autoPublish:p.autoPublish});groups.set(key,arr);}
const exact=[...groups.values()].filter(v=>v.length>1);
const titles=new Map();
for(const p of d1){const key=norm(p.title);if(!key)continue;const arr=titles.get(key)||[];arr.push({id:p.id,status:p.status});titles.set(key,arr);}
const duplicateTitles=[...titles.entries()].filter(([,v])=>v.length>1).map(([normalizedTitle,posts])=>({normalizedTitle,posts}));
const summary={d1Count:d1.length,metricoolCount:metricool.length,exactTextDuplicateGroups:exact,duplicateD1TitleGroups:duplicateTitles,metricoolDrafts:metricool.filter(p=>p.draft===true).length,metricoolAutoPublishEnabled:metricool.filter(p=>p.autoPublish===true).length,limitations:['Different wording for same idea requires manual semantic review','D1 snapshot and Metricool data must be current','No image similarity or published-platform verification','No write or publication operations']};
console.log(JSON.stringify(summary,null,2));
