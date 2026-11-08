// Diagnose fresh n8n dependency-resolution paths in isolated GitHub runner only.
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const req=JSON.parse(fs.readFileSync('ops/request-n8n-dependency-graph-20261108.json','utf8'));
if(req.scope!=='n8n-dependency-graph-only-20261108'||req.allowDeployment!==false||req.allowDatabaseAccess!==false||req.allowPublication!==false)throw Error('Unsafe diagnostic request');
const workDir=path.resolve('n8n-runtime');
const runtime=require(path.join(workDir,'package.json'));
const n8nRoot=path.join(workDir,'node_modules/n8n/package.json');
const modules=['n8n','@n8n/di','@n8n/typeorm','@n8n/db','reflect-metadata','pg'];
function resolveFrom(from,pkg){
 try{
  const r=createRequire(from);
  const entry=r.resolve(pkg);
  let dir=path.dirname(entry);
  for(let i=0;i<13;i++){const p=path.join(dir,'package.json');if(fs.existsSync(p)){try{const meta=JSON.parse(fs.readFileSync(p,'utf8'));if(meta.name===pkg)return{name:pkg,version:meta.version,path:path.relative(workDir,p),entry:path.relative(workDir,entry)};}catch{}}
  const up=path.dirname(dir);if(up===dir)break;dir=up;}
  return{name:pkg,error:'package_root_not_found',entry:path.relative(workDir,entry)};
 }catch(err){return{name:pkg,error:'not_resolvable',detail:String(err.code||err.message).slice(0,120)}}
}
const dbRoot=path.join(workDir,'node_modules/@n8n/db/package.json');
const roots={runtime:path.join(workDir,'package.json'),n8n:n8nRoot,db:dbRoot};
function loadIdentity(from,pkg,exportName){
 try {const mod=createRequire(from)(pkg);return mod?.[exportName]||null;}catch{return null;}
}

const resolved=Object.fromEntries(Object.entries(roots).map(([label,from])=>[label,modules.map(pkg=>resolveFrom(from,pkg))]));
const n8nVersion=JSON.parse(fs.readFileSync(n8nRoot,'utf8')).version;
const n8nDS=loadIdentity(n8nRoot,'@n8n/typeorm','DataSource'),dbDS=loadIdentity(dbRoot,'@n8n/typeorm','DataSource');
const n8nContainer=loadIdentity(n8nRoot,'@n8n/di','Container'),dbContainer=loadIdentity(dbRoot,'@n8n/di','Container');
const classIdentity={sameDataSourceType:Boolean(n8nDS&&dbDS&&n8nDS===dbDS),sameDIContainer:Boolean(n8nContainer&&dbContainer&&n8nContainer===dbContainer),bothDataSourcesLoaded:Boolean(n8nDS&&dbDS)};
const packageMatches=n8nVersion===runtime.dependencies.n8n;
const report={schema:req.scope,checkedAt:new Date().toISOString(),node:process.version,expectedN8n:runtime.dependencies.n8n,installedN8n:n8nVersion,packageMatches,resolved,classIdentity,
 warnings:['This checks a fresh GitHub runner install, not the actual Render node_modules tree','No database or n8n start invoked; DataSource constructor may fail for other reasons','Cannot claim DI error repaired from an isolated dependency graph'],
 databaseMutations:0,deployments:0,externalNetworkWrites:0,aiApprovals:0,publications:0};
fs.writeFileSync('n8n-dependency-di-report.json',JSON.stringify(report,null,2)+'\n');
console.log('N8N_DI_DEPENDENCY',JSON.stringify({node:process.version,expected:runtime.dependencies.n8n,installed:n8nVersion,match:packageMatches,root:resolved.runtime,withinN8n:resolved.n8n,withinDb:resolved.db,classIdentity}));
if(!packageMatches||!classIdentity.sameDataSourceType||!classIdentity.sameDIContainer)process.exitCode=1;
