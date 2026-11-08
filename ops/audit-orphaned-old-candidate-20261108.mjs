// Source-bound, fail-closed orphan asset proof. Never delete from this workflow.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const req=JSON.parse(fs.readFileSync('ops/request-orphaned-old-candidate-audit-20261108.json','utf8'));
if(req.schema!=='xjw-orphaned-old-candidate-audit-v1'||req.mode!=='read-only'||req.mutateD1!==false||req.allowDeletion!==false||req.allowApproval!==false||req.allowPublication!==false||req.candidates?.length!==1)throw Error('Unsafe deletion audit request');
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const db=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];
if(!account||!token||!db)throw Error('Missing live D1 credentials');
async function query(sql){
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+db+'/query',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql}),signal:AbortSignal.timeout(45000)});
 const j=await r.json();if(!r.ok||!j.success||!Array.isArray(j.result)||j.result.some(x=>x.success===false))throw Error('Live D1 query failed '+JSON.stringify(j.errors||[]).slice(0,200));
 return j.result[0]?.results||[];
}
const quote=x=>"'"+String(x).replaceAll("'","''")+"'";
const countSql='SELECT status,COUNT(*) AS count FROM social_posts GROUP BY status ORDER BY status';
const before=await query(countSql);
const tableData=await query("SELECT name,sql FROM sqlite_master WHERE type='table' AND (name LIKE 'social_%' OR name LIKE 'post_%') ORDER BY name");
const scanColumns=['image','media','url','asset','path','photo','attachment','payload','json'];
const results=[];
for(const cand of req.candidates){
 const file=path.resolve(cand.path),newer=path.resolve(cand.newerPath);
 if(!file.startsWith(process.cwd()+path.sep)||!newer.startsWith(process.cwd()+path.sep)||!fs.existsSync(file)||!fs.existsSync(newer)||!cand.path.endsWith('.webp'))throw Error('Candidate or replacement invalid');
 const filename=path.basename(file);
 let gitRefs=[];
 try{
 const hits=execFileSync('git',['grep','-n','-F',filename,'--','.',':!ops/request-orphaned-old-candidate-audit-20261108.json'],{encoding:'utf8',maxBuffer:1024*1024});
 gitRefs=hits.trim().split('\n').filter(Boolean);
 }catch(e){if(e.status!==1)throw e}
 const dbRefs=[];const skipped=[];
 for(const tab of tableData){
  if(!/^[a-zA-Z0-9_]+$/.test(tab.name))continue;
  const cols=await query('PRAGMA table_info('+quote(tab.name)+')');
  for(const col of cols){
   if(!/^[a-zA-Z0-9_]+$/.test(col.name)||!scanColumns.some(w=>col.name.toLowerCase().includes(w)))continue;
   if(!/CHAR|TEXT|JSON|CLOB|VARCHAR|^$/i.test(col.type||''))continue;
   try{
    const found=await query('SELECT COUNT(*) AS n FROM "'+tab.name+'" WHERE CAST("'+col.name+'" AS TEXT) LIKE '+quote('%'+filename+'%'));
    const count=Number(found[0]?.n||0);
    if(count>0)dbRefs.push({table:tab.name,column:col.name,count});
   }catch(e){skipped.push(tab.name+'.'+col.name+':'+String(e.message||e).slice(0,120))}
  }
 }
 results.push({path:cand.path,newerPath:cand.newerPath,bytes:fs.statSync(file).size,replacementBytes:fs.statSync(newer).size,gitRefs:gitRefs.slice(0,100),dbRefs,scanIssues:skipped,trackedByGit:fs.existsSync(file),classification:gitRefs.length===0&&dbRefs.length===0&&skipped.length===0?'NO_OBSERVED_REFERENCES':'RETAIN_REFERENCED_OR_UNCERTAIN'});
}
const after=await query(countSql);if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Concurrent D1 mutation invalidates read-only audit');
const output={schema:req.schema,checkedAt:new Date().toISOString(),gitCommit:process.env.GITHUB_SHA||null,counts:before,scannedTables:tableData.map(x=>x.name),results,allCertainUnused:results.every(x=>x.classification==='NO_OBSERVED_REFERENCES'),limitations:['This checks name references in Git tracked text plus media-like columns of social/post database tables; other out-of-band unpublished file references cannot be ruled out','Never remove published images, AI review evidence, archived data, or database history based on this test'],d1Writes:0,deletedFiles:0,approvals:0,scheduled:0,published:0};
fs.writeFileSync('old-variant-orphan-report.json',JSON.stringify(output,null,2)+'\n');
console.log('OLD_VARIANT_ORPHAN_AUDIT',JSON.stringify({counts:before,results:results.map(x=>({path:x.path,gitRefs:x.gitRefs.length,dbRefs:x.dbRefs,scanIssues:x.scanIssues,classification:x.classification})),allCertainUnused:output.allCertainUnused,deleted:0}));
