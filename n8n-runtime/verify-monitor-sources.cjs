'use strict';
// This file runs during npm install, including Render builds.
// Verify the tracked public-GET monitor definitions without spawning n8n,
// opening PostgreSQL, importing or republishing active workflows.
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {MONITORS,validateMonitorSource}=require('./reconcile-monitors.cjs');
function verify(){
  // Load all tracked definitions before accepting the installation.
  const source=MONITORS.map(file=>({file,json:JSON.parse(
    readFileSync(resolve(__dirname,'../docs/n8n',file),'utf8')
  )}));
  for(const {file,json} of source)validateMonitorSource(file,json);
  return source.length;
}
if(require.main===module){
  try{console.log('PASS read-only n8n monitor source verification:',verify());}
  catch{console.error('Failed to validate n8n monitor definitions (no live workflows changed).');process.exitCode=1;}
}
module.exports={verify};
