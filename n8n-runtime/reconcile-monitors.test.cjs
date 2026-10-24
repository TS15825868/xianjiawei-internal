'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {randomUUID}=require('node:crypto');
const {definition,reconcile,MONITORS,validateMonitorSource}=require('./reconcile-monitors.cjs');
const sources=Object.fromEntries(MONITORS.map(file=>[file,JSON.parse(readFileSync(join(__dirname,'../docs/n8n',file),'utf8'))]));
const clone=value=>JSON.parse(JSON.stringify(value));
function validateMutated(file,mutate){
  const item=clone(sources[file]);mutate(item);
  assert.throws(()=>validateMonitorSource(file,item),/Read-only monitor source verification failed/);
}
test('all three currently approved public-GET monitor definitions are safe',()=>{
  for(const file of MONITORS)assert.equal(validateMonitorSource(file,sources[file]),true);
});
test('write-capable HTTP, unapproved hosts, outbound credentials, and new publish nodes all fail closed',()=>{
  const f=MONITORS[0];
  validateMutated(f,s=>{s.nodes.find(n=>n.type.endsWith('httpRequest')).parameters.method='POST'});
  validateMutated(f,s=>{s.nodes.find(n=>n.type.endsWith('httpRequest')).parameters.url='https://other.example.test/healthz'});
  validateMutated(f,s=>{s.nodes.find(n=>n.type.endsWith('httpRequest')).credentials={httpHeaderAuth:{id:'fake'}}});
  validateMutated(f,s=>{s.nodes.push({id:randomUUID(),name:'send',type:'n8n-nodes-base.gmail',parameters:{}})});
  validateMutated(f,s=>{s.nodes.find(n=>n.type.endsWith('httpRequest')).parameters.sendBody=true});
});
test('GET webhook path, identity, and response mode cannot be changed silently',()=>{
  const f=MONITORS[0];
  validateMutated(f,s=>{s.id='other'});
  validateMutated(f,s=>{s.nodes.find(n=>n.type.endsWith('webhook')).parameters.httpMethod='POST'});
  validateMutated(f,s=>{s.nodes.find(n=>n.type.endsWith('webhook')).parameters.path='other'});
  validateMutated(f,s=>{s.nodes.find(n=>n.type.endsWith('webhook')).parameters.responseMode='onReceived'});
});
test('Code node is restricted to local calculations, not env/secrets/network access',()=>{
  const f=MONITORS[1];
  for(const payload of ['return await fetch("https://bad.test");','return require("http");','return $env.SECRET;', 'return process.env;']){
    validateMutated(f,s=>{s.nodes.find(n=>n.type.endsWith('code')).parameters.jsCode=payload});
  }
});
function exercise(change){
  const store=new Map(),commands=[],written=new Map();
  for(const file of MONITORS){
    const src=clone(sources[file]);
    store.set(src.id,{editor:clone(src),published:clone(src)});
  }
  if(change)change(store);
  const io={
    run(args){
      commands.push(args);
      const id=args.find(a=>a.startsWith('--id='))?.slice(5);
      if(args[0]==='export:workflow'){
        const item=store.get(id);
        if(!item)throw Error('mock missing monitor');
        written.set(args.find(a=>a.startsWith('--output=')).slice(9),JSON.stringify([clone(args.includes('--published')?item.published:item.editor)]));
      }else if(args[0]==='import:workflow'){
        const imported=JSON.parse(written.get(args.find(a=>a.startsWith('--input=')).slice(8)))[0];
        store.get(imported.id).editor=imported;
      }else if(args[0]==='publish:workflow'){
        store.get(id).published=clone(store.get(id).editor);
      }else throw Error('unexpected n8n CLI action '+args[0]);
    },
    read(p){return p.startsWith('/source/')?JSON.stringify(sources[p.slice('/source/'.length)]):written.get(p)},
    write(p,s){written.set(p,s)},
    sourceDir:'/source',workDir:'/output',log:()=>{}
  };
  reconcile(io);
  return {commands,store,written};
}
test('unchanged editor and published definitions never import or republish monitor',()=>{
  const {commands}=exercise();
  assert.equal(commands.length,MONITORS.length*2);
  assert.ok(commands.every(a=>a[0]==='export:workflow'));
});
test('a drifted draft is imported without activating it; matching published monitor is not republished',()=>{
  const {commands,store}=exercise(store=>{
    const id=sources[MONITORS[0]].id;
    const w=store.get(id);
    w.editor.nodes.find(n=>n.type.endsWith('code')).parameters.jsCode='return [{json:{ok:false}}]';
    w.editor.settings={executionOrder:'v1',timezone:'Asia/Taipei'};
  });
  assert.equal(commands.filter(a=>a[0]==='import:workflow').length,1);
  assert.equal(commands.filter(a=>a[0]==='publish:workflow').length,0);
  const editor=store.get(sources[MONITORS[0]].id).editor;
  assert.equal(editor.active,false);
  assert.equal(editor.settings.timezone,'Asia/Taipei');
  assert.equal(definition(editor),definition(sources[MONITORS[0]]));
});
test('outdated published version is republished only for affected monitor',()=>{
  const {commands}=exercise(store=>{
    const id=sources[MONITORS[1]].id;
    store.get(id).published.nodes.find(n=>n.type.endsWith('httpRequest')).parameters.url='https://old.example.test';
  });
  assert.equal(commands.filter(a=>a[0]==='publish:workflow').length,1);
  assert.ok(commands.some(a=>a[0]==='publish:workflow'&&a.includes('--id='+sources[MONITORS[1]].id)));
});
test('invalid later monitor definition blocks all subprocesses and all partial writes',()=>{
  const bad=clone(sources[MONITORS[2]]);
  bad.nodes.find(n=>n.type.endsWith('httpRequest')).parameters.method='POST';
  let called=0;
  assert.throws(()=>reconcile({
    run(){called++},
    read(p){return JSON.stringify(p.endsWith(MONITORS[2])?bad:sources[MONITORS.find(x=>p.endsWith(x))])},
    write(){called++},
    sourceDir:'/source',workDir:'/output',log:()=>{}
  }),/Read-only monitor source verification failed/);
  assert.equal(called,0);
});

test('monitor topology cannot bypass public GETs, disconnect checks, fork or cycle',()=>{
 const f=MONITORS[2];
 validateMutated(f,s=>{delete s.connections['外部排程觸發']});
 validateMutated(f,s=>{s.connections['外部排程觸發'].main[0][0].node='總體判斷'});
 validateMutated(f,s=>{s.connections['讀 LINE OA healthz'].main[0][0].node='讀 LINE OA healthz'});
 validateMutated(f,s=>{s.connections['外部排程觸發'].main[0][0].index=1});
 validateMutated(f,s=>{s.connections['外部排程觸發'].main[0].push({node:'正常結束',type:'main',index:0})});
});
test('monitor Code nodes cannot access n8n variables, secrets or network helpers',()=>{
 const f=MONITORS[1];
 for(const payload of [
  'return $vars.SECRET;', 'return $secrets.apiKey;',
  'return $getWorkflowStaticData("global");',
  'return $helpers.httpRequest({url:"https://example.com"});',
  'return this.helpers.httpRequest({url:"https://example.com"});',
  'return new WebSocket("wss://example.com");'
 ])validateMutated(f,s=>{s.nodes.find(n=>n.type.endsWith('code')).parameters.jsCode=payload});
});

test('npm postinstall only validates monitor sources; operational reconciliation stays explicit',()=>{
  const pkg=JSON.parse(readFileSync(join(__dirname,'package.json'),'utf8'));
  assert.equal(pkg.scripts.postinstall,'node verify-monitor-sources.cjs');
  assert.equal(pkg.scripts['reconcile:monitors'],'node reconcile-monitors.cjs');
  const script=readFileSync(join(__dirname,'verify-monitor-sources.cjs'),'utf8');
  assert.match(script,/validateMonitorSource\(file,json\)/);
  assert.doesNotMatch(script,/spawnSync|execSync|import:workflow|publish:workflow|\.query\(|connect\(/);
  assert.equal(require('./verify-monitor-sources.cjs').verify(),3);
});

test('approved Code-node source is pinned by SHA-256 against computed-property escapes',()=>{
 const f=MONITORS[1];
 // These evade the earlier word-based denylist, but must never be imported
 // or published by a build-only reconciler.
 validateMutated(f,s=>{s.nodes.find(n=>n.type.endsWith('code')).parameters.jsCode=
  "return ({})['con'+'structor']['con'+'structor']('return pro'+'cess')();"});
 validateMutated(f,s=>{s.nodes.find(n=>n.type.endsWith('code')).parameters.jsCode=
  'return [{json:{ok:true}}];'});
});
test('swapping approved Code programs between monitor nodes is not allowed',()=>{
 const f=MONITORS[0];
 validateMutated(f,s=>{
  const nodes=s.nodes.filter(n=>n.type.endsWith('code'));
  [nodes[0].parameters.jsCode,nodes[1].parameters.jsCode]=
   [nodes[1].parameters.jsCode,nodes[0].parameters.jsCode];
 });
});
