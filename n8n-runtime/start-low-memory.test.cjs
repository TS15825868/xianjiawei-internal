'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,writeFileSync,chmodSync,rmSync}=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

function inspectStart(overrides={}){
 const stubDir=mkdtempSync(path.join(os.tmpdir(),'xjw-n8n-safe-start-'));
 try{
  const stub=path.join(stubDir,'n8n');
  // Do not launch n8n, touch PostgreSQL or read any real credential.
  writeFileSync(stub,'#!/bin/sh\nprintf "%s|%s|%s|%s|%s|%s" "$N8N_CONCURRENCY_PRODUCTION_LIMIT" "$N8N_RUNNERS_MAX_CONCURRENCY" "$N8N_RUNNERS_MAX_OLD_SPACE_SIZE" "$NODE_OPTIONS" "$N8N_RUNNERS_GRANT_TOKEN_TTL" "$1"\n');
  chmodSync(stub,0o700);
  const env={...process.env,PATH:stubDir+path.delimiter+(process.env.PATH||'')};
  for(const key of ['N8N_CONCURRENCY_PRODUCTION_LIMIT','N8N_RUNNERS_MAX_CONCURRENCY','N8N_RUNNERS_MAX_OLD_SPACE_SIZE','NODE_OPTIONS','N8N_RUNNERS_GRANT_TOKEN_TTL'])delete env[key];
  Object.assign(env,overrides);
  const result=spawnSync('sh',['start-low-memory.sh'],{
   cwd:__dirname,env,encoding:'utf8',timeout:3000
  });
  if(result.error)throw result.error;
  assert.equal(result.status,0,result.stderr);
  return result.stdout;
 }finally{rmSync(stubDir,{recursive:true,force:true});}
}

test('low-memory startup provides single-worker and bounded runner-heap defaults',()=>{
 assert.equal(inspectStart(),'1|1|128|--max-old-space-size=256|300|start');
});
test('operator-provided limits remain intact without replacing protected settings',()=>{
 assert.equal(inspectStart({
  N8N_CONCURRENCY_PRODUCTION_LIMIT:'2',
  N8N_RUNNERS_MAX_CONCURRENCY:'3',
  N8N_RUNNERS_MAX_OLD_SPACE_SIZE:'160',
  NODE_OPTIONS:'--max-old-space-size=224 --trace-warnings',
  N8N_RUNNERS_GRANT_TOKEN_TTL:'420',
 }),'2|3|160|--max-old-space-size=224 --trace-warnings|420|start');
});
test('empty configured limits receive safe defaults',()=>{
 assert.equal(inspectStart({
  N8N_CONCURRENCY_PRODUCTION_LIMIT:'',
  N8N_RUNNERS_MAX_CONCURRENCY:'',
  N8N_RUNNERS_MAX_OLD_SPACE_SIZE:'',
  NODE_OPTIONS:'',
  N8N_RUNNERS_GRANT_TOKEN_TTL:'',
 }),'1|1|128|--max-old-space-size=256|300|start');
});
