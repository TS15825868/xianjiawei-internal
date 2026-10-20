const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const TARGET_SERVICE = 'srv-da8s2r49v7es73cefob0';
const MONITORS = ['03-product-ai-geo-audit.json', '04-system-health-watch.json'];
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
function definition(workflow) {
  return JSON.stringify(canonical({nodes:workflow.nodes.map(n => ({id:n.id,name:n.name,type:n.type,typeVersion:n.typeVersion,parameters:n.parameters,disabled:Boolean(n.disabled),credentials:n.credentials||{}})).sort((a,b)=>a.id.localeCompare(b.id)),connections:workflow.connections}));
}
function reconcile({run,read,write,sourceDir,workDir,log=console.log}) {
  for (const file of MONITORS) {
    const source = JSON.parse(read(path.join(sourceDir,file)));
    if (!source.id || source.nodes.some(n => /publish-now|deliveries/.test(JSON.stringify(n)))) throw new Error('Monitor-only scope check failed');
    const editorPath = path.join(workDir,source.id+'-editor.json');
    run(['export:workflow','--id='+source.id,'--output='+editorPath]);
    const editor = JSON.parse(read(editorPath))[0];
    if (!editor || editor.id !== source.id || editor.name !== source.name) throw new Error('Existing workflow identity mismatch');
    if (definition(editor) !== definition(source)) {
      // Import only these two existing read-only monitors. Retain their current ownership/settings.
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
module.exports={canonical,definition,reconcile,MONITORS,TARGET_SERVICE};
