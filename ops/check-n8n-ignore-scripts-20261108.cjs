// Isolated CI-only check; never connects to DB or starts n8n server.
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const req=JSON.parse(fs.readFileSync('ops/request-n8n-ignore-scripts-ci-20261108.json','utf8'));
if(req.scope!=='n8n-ignore-lifecycle-scripts-ci-only-20261108'||req.allowDeployment!==false||req.allowDatabaseConnection!==false||req.allowAutoPublish!==false||req.expectedN8n!=='2.35.7'||req.expectedTypeORM!=='0.7.0'||req.runSourceGuardsExplicitly!==true)throw Error('Unsafe CI audit request');
const root=path.resolve('n8n-runtime');
const load=createRequire(path.join(root,'package.json'));
const results={schema:req.scope,checkedAt:new Date().toISOString(),node:process.version,checks:[],n8nServerStarted:false,postgresAccess:false,productionDeploy:false,d1Writes:0,approvalWrites:0,published:0};
function check(name,run,required=true){try{const value=run();results.checks.push({name,required,pass:true,value:value==null?'ok':String(value).slice(0,200)});}catch(error){results.checks.push({name,required,pass:false,error:String(error.message||error).slice(0,180)});}}
check('n8n-version',()=>{const v=load('n8n/package.json').version;if(v!=='2.35.7')throw Error(v);return v});
check('core-datasource-class-identity',()=>{const fromN8n=createRequire(load.resolve('n8n/package.json'));const fromDb=createRequire(load.resolve('@n8n/db/package.json'));const a=fromN8n('@n8n/typeorm').DataSource,b=fromDb('@n8n/typeorm').DataSource;if(!a||!b||a!==b)throw Error('Different DI class token');return 'same'});
check('core-di-container-class-identity',()=>{const fromN8n=createRequire(load.resolve('n8n/package.json'));const fromDb=createRequire(load.resolve('@n8n/db/package.json'));const a=fromN8n('@n8n/di').Container,b=fromDb('@n8n/di').Container;if(!a||!b||a!==b)throw Error('Different DI container');return 'same'});
check('readonly-monitor-source-safety',()=>{const n=load('./verify-monitor-sources.cjs').verify();if(n!==3)throw Error('unexpected monitors');return n});
check('isolated-vm-native-binding',()=>{const ivm=load('isolated-vm');if(typeof ivm.Isolate!=='function')throw Error('missing JS Isolate');return 'native-module-available'});
check('n8n-bin-exists',()=>{const b=path.join(root,'node_modules','.bin','n8n');if(!fs.existsSync(b))throw Error('CLI missing');return 'exists'});
check('kafka-not-needed-for-verified-monitors',()=>{const {MONITORS}=load('./reconcile-monitors.cjs');for(const f of MONITORS){const x=JSON.parse(fs.readFileSync(path.join('docs/n8n',f)));if(x.nodes.some(n=>/kafka/i.test(n.type+' '+n.name)))throw Error('Kafka node present');}return 'zero Kafka nodes'});
fs.writeFileSync('n8n-ignore-scripts-ci-report.json',JSON.stringify(results,null,2)+'\n');
console.log('N8N_IGNORE_SCRIPTS_DIAG',JSON.stringify(results));
if(results.checks.some(c=>c.required&&!c.pass))process.exitCode=1;
