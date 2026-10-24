const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');

const TARGET_SERVICE = 'srv-da8s2r49v7es73cefob0';
const MONITORS = ['01-line-health-monitor.json', '03-product-ai-geo-audit.json', '04-system-health-watch.json'];
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
function definition(workflow) {
  return JSON.stringify(canonical({nodes:workflow.nodes.map(n => ({id:n.id,name:n.name,type:n.type,typeVersion:n.typeVersion,parameters:n.parameters,disabled:Boolean(n.disabled),credentials:n.credentials||{}})).sort((a,b)=>a.id.localeCompare(b.id)),connections:workflow.connections}));
}

const MONITOR_SCOPE=Object.freeze({
  '01-line-health-monitor.json':{id:'RQwMvN9bhfBa1LJf',name:'仙加味｜LINE OA 健康監控',path:'xjw-line-health-a7f8c2'},
  '03-product-ai-geo-audit.json':{id:'mC4ySWDhUzFW4SS6',name:'仙加味｜產品母資料 AI GEO 一致性檢查',path:'xjw-ai-geo-9c3f75'},
  '04-system-health-watch.json':{id:'XthcauaEkTO29XSf',name:'仙加味｜系統健康總監控',path:'xjw-system-health-d4b6e1'}
});
const READ_URLS=new Set([
  'https://ts-line.onrender.com/healthz',
  'https://ts15825868.github.io/xianjiawei/public-product-master.json',
  'https://ts15825868.github.io/xianjiawei/ai-answers.json',
  'https://ts15825868.github.io/xianjiawei/geo-data.json',
  'https://ts15825868.github.io/xianjiawei/sitemap.xml'
]);
// Exact reviewed Code-node programs. A regex denylist alone can be evaded via
// computed property names or dynamically constructed globals. A change to any
// monitor script must be reviewed and its SHA-256 explicitly updated here.
// Digests are of the exact UTF-8 jsCode string, not the workflow JSON.
const APPROVED_CODE_SHA256=Object.freeze({
  '01-line-health-monitor.json':Object.freeze({
    '判斷健康狀態':'17c0e515cf0b86b07b8d62450209bbbf8efacadda2f6eaea28b04bf090eb611a',
    '正常結束':'065c15124070252a1b80bcb59a8b88289d3d3db391b5ef91d669634da34017f3'
  }),
  '03-product-ai-geo-audit.json':Object.freeze({
    '一致性驗收':'978193917d71b445cae8e278422ee9a5ecdba2d726481f332475080b0c9431d2'
  }),
  '04-system-health-watch.json':Object.freeze({
    '總體判斷':'2ab5343b5b512d2a3527c5d873b55bdadfbfd5850ed6bd5e86acc4d1225431cf',
    '正常結束':'f66996b8ce5d8602a8dc9699a880a4096b055673cc9b2fa96e553b42bd69c0b6'
  })
});
// The postinstall reconciler can republish production n8n workflows.
// Fail closed on unapproved write nodes or new destinations BEFORE launching
// any n8n CLI subprocess. This validates scope, not a frozen product version.
function validateMonitorSource(file,source){
  const expected=MONITOR_SCOPE[file];
  const bad=()=>{throw new Error('Read-only monitor source verification failed: '+file)};
  if(!expected||!source||source.id!==expected.id||source.name!==expected.name||
     !Array.isArray(source.nodes)||source.nodes.length<2||source.nodes.length>32||
     !source.connections||typeof source.connections!=='object'||Array.isArray(source.connections))bad();
  let triggers=0,reads=0;
  const approvedCode=APPROVED_CODE_SHA256[file];
  const seenCode=new Set();
  const names=new Set(),ids=new Set();
  for(const n of source.nodes){
    if(!n||typeof n.id!=='string'||!n.id||typeof n.name!=='string'||!n.name||
       names.has(n.name)||ids.has(n.id)||n.disabled===true||
       n.credentials&&Object.keys(n.credentials).length!==0)bad();
    names.add(n.name);ids.add(n.id);
    const p=n.parameters||{};
    if(n.type==='n8n-nodes-base.webhook'){
      triggers++;
      if(p.httpMethod!=='GET'||p.path!==expected.path||p.responseMode!=='lastNode'||
         p.responseData!=='firstEntryJson'||!p.options||Object.keys(p.options).length!==0||
         Object.keys(p).some(k=>!['httpMethod','path','options','responseMode','responseData'].includes(k)))bad();
    }else if(n.type==='n8n-nodes-base.httpRequest'){
      reads++;
      if(!READ_URLS.has(p.url)||Object.keys(p).some(k=>!['url','options'].includes(k)))bad();
      // Only response parsing options are needed for these five safe public GET endpoints.
      const options=p.options||{};
      if(Object.keys(options).some(k=>k!=='response')||
         Object.keys(options.response||{}).some(k=>k!=='response')||
         Object.keys(options.response?.response||{}).some(k=>!['fullResponse','neverError','responseFormat'].includes(k)))bad();
    }else if(n.type==='n8n-nodes-base.code'){
      if(typeof p.jsCode!=='string'||!p.jsCode.trim()||
         Object.keys(p).some(k=>k!=='jsCode')||
         /(?:\brequire\s*\(|\bimport\s*\(|\beval\s*\(|\bFunction\s*\(|\bfetch\s*\(|\bprocess\b|\bglobalThis\b|\$env\b|\$credentials\b|\$vars\b|\$secrets\b|\$helpers\b|\$http\b|\$getWorkflowStaticData\b|\bWebSocket\b|\bXMLHttpRequest\b|\bthis\b|helpers\.httpRequest)/i.test(p.jsCode))bad();
      const digest=createHash('sha256').update(p.jsCode,'utf8').digest('hex');
      if(!Object.hasOwn(approvedCode,n.name)||approvedCode[n.name]!==digest)bad();
      seenCode.add(n.name);
    }else bad();
  }
  if(triggers!==1||reads<1||seenCode.size!==Object.keys(approvedCode).length)return bad();
  for(const [node,links] of Object.entries(source.connections)){
    if(!names.has(node)||!links||typeof links!=='object'||Object.keys(links).some(k=>k!=='main'))bad();
    for(const lane of links.main||[]){
      if(!Array.isArray(lane))bad();
      for(const edge of lane)if(!edge||!names.has(edge.node))bad();
    }
  }
  // Merely including a GET node is not proof that a monitor executes it.
  // Require one complete, acyclic trigger -> public GET(s) -> Code path,
  // with no disconnected nodes, bypass branches or non-main output edges.
  const byName=new Map(source.nodes.map(n=>[n.name,n]));
  let cursor=source.nodes.find(n=>n.type==='n8n-nodes-base.webhook');
  const visited=new Set();
  let sawRead=false,sawCode=false;
  while(cursor){
    if(visited.has(cursor.name))bad();
    visited.add(cursor.name);
    if(cursor.type==='n8n-nodes-base.code')sawCode=true;
    else if(sawCode)bad();
    if(cursor.type==='n8n-nodes-base.httpRequest')sawRead=true;
    const outgoing=source.connections[cursor.name];
    if(!outgoing){cursor=null;break;}
    const lanes=outgoing.main;
    if(Object.keys(outgoing).length!==1||!Array.isArray(lanes)||lanes.length!==1||
       !Array.isArray(lanes[0])||lanes[0].length!==1)bad();
    const edge=lanes[0][0];
    if(edge?.type!=='main'||edge.index!==0||!byName.has(edge.node))bad();
    cursor=byName.get(edge.node);
  }
  if(!sawRead||!sawCode||visited.size!==source.nodes.length||
     Object.keys(source.connections).length!==source.nodes.length-1)bad();
  return true;
}

function reconcile({run,read,write,sourceDir,workDir,log=console.log}) {
  // Validate ALL definitions before touching even one live monitor.
  const sources=MONITORS.map(file=>({file,source:JSON.parse(read(path.join(sourceDir,file)))}));
  for(const {file,source} of sources)validateMonitorSource(file,source);
  for (const {file,source} of sources) {
    if (!source.id || source.nodes.some(n => /publish-now|deliveries/.test(JSON.stringify(n)))) throw new Error('Monitor-only scope check failed');
    const editorPath = path.join(workDir,source.id+'-editor.json');
    run(['export:workflow','--id='+source.id,'--output='+editorPath]);
    const editor = JSON.parse(read(editorPath))[0];
    if (!editor || editor.id !== source.id || editor.name !== source.name) throw new Error('Existing workflow identity mismatch');
    if (definition(editor) !== definition(source)) {
      // Import only these three existing read-only monitors. Retain their current ownership/settings.
      const input = path.join(workDir,source.id+'-input.json');
      write(input,JSON.stringify([{id:editor.id,name:editor.name,description:editor.description,nodes:source.nodes,connections:source.connections,settings:editor.settings,versionId:randomUUID(),active:false,pinData:{}}]));
      run(['import:workflow','--input='+input,'--projectId=9EIwpCtu6XzweEmW']);
    }
    const publishedPath = path.join(workDir,source.id+'-published.json');
    // Exporting the effective published version catches stale drafts that were never published.
    let published;
    try { run(['export:workflow','--id='+source.id,'--published','--output='+publishedPath]); published=JSON.parse(read(publishedPath))[0]; } catch { published=null; }
    if (!published || definition(published)!==definition(source)) run(['publish:workflow','--id='+source.id]);
    log('Monitor definition reconciled: '+source.id);
  }
}
function main() {
  // Build-time maintenance only: normal n8n start and every cold start remain unchanged.
  if (process.env.RENDER_SERVICE_ID !== TARGET_SERVICE) return;
  const workDir=fs.mkdtempSync(path.join(os.tmpdir(),'xjw-monitors-'));
  fs.chmodSync(workDir,0o700);
  const executable=path.join(__dirname,'node_modules','.bin','n8n');
  const run=args=>{
    const result=spawnSync(executable,args,{encoding:'utf8',timeout:120000,env:process.env,maxBuffer:4*1024*1024});
    if(result.error||result.status!==0)throw new Error('n8n CLI '+args[0]+' failed; workflow data and credentials omitted');
  };
  try { reconcile({run,read:p=>fs.readFileSync(p,'utf8'),write:(p,s)=>fs.writeFileSync(p,s,{mode:0o600}),sourceDir:path.resolve(__dirname,'../docs/n8n'),workDir}); }
  finally { fs.rmSync(workDir,{recursive:true,force:true}); }
}
if (require.main===module) { try {main()} catch(error){console.error(error.message);process.exitCode=1;} }
module.exports={canonical,definition,reconcile,validateMonitorSource,MONITORS,TARGET_SERVICE};
