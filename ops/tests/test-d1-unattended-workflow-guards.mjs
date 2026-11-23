// Offline regression: protected GitHub Actions may never touch live D1 from push.
// Reads workflow YAML as source text only; no network, credentials, SQL or mutation.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const read=name=>readFileSync(resolve(root,'.github/workflows',name+'.yml'),'utf8');
const steps=source=>source.split(/\n(?=      - (?:name|run|uses):)/).slice(1);
const budget=step=>step.includes('node tools/check-d1-free-budget-before-export.mjs');
const remote=step=>/\bwrangler(?:@\d+)?\s+d1\s+|createD1Transport\s*\(/.test(step);
const manualApply="github.event_name == 'workflow_dispatch' && inputs.allow_production_schema_apply == true";
const manualScan="github.event_name == 'workflow_dispatch' && inputs.allow_production_d1_scan == true";

for(const name of ['prepare-ai-delegated-publication-d1','prepare-line-handoff-d1','prepare-line-receipt-d1']){
  test(name+' push is offline; schema changes require separate manual authorization and budget preflight',()=>{
    const source=read(name),list=steps(source);
    assert.match(source,/  push:\n/,'workflow must retain source regression trigger');
    assert.match(source,/allow_production_schema_apply:[\s\S]*?type: boolean\n\s+required: true\n\s+default: false/,'manual schema input must fail closed');
    const budgetIndex=list.findIndex(budget);
    const remoteSteps=list.map((text,index)=>({text,index})).filter(s=>remote(s.text));
    assert.ok(budgetIndex>=0,'must include official account-level quota gate');
    assert.ok(remoteSteps.length>=1,'must have explicitly gated live step(s) under test');
    assert.ok(list[budgetIndex].includes(manualApply),'quota step must be manual only');
    for(const step of remoteSteps){
      assert.ok(step.index>budgetIndex,'quota gate must precede remote D1 activity');
      assert.ok(step.text.includes(manualApply),'remote D1 command must be a manually authorized step');
    }
    assert.ok(list.some(step=>step.includes("github.event_name != 'workflow_dispatch'") &&
      step.includes('GITHUB_STEP_SUMMARY')),'push must record intentionally skipped remote D1');
  });
}

test('AI quality workflow must separate manual scan from separate schema write',()=>{
  const source=read('ai-quality-rollout'),list=steps(source);
  for(const input of ['allow_production_d1_scan','allow_production_schema_apply']){
    assert.match(source,new RegExp(input+':[\\s\\S]*?default: false'),'manual flag must default false');
  }
  const gateIndex=list.findIndex(budget);
  assert.ok(gateIndex>=0);
  assert.ok(list[gateIndex].includes(manualScan));
  const live=list.map((text,index)=>({text,index})).filter(x=>remote(x.text));
  assert.ok(live.length>=2);
  for(const step of live){
    assert.ok(step.index>gateIndex);
    assert.ok(step.text.includes(manualScan));
    if(step.text.includes('--file /tmp/ai-quality-schema.sql')){
      assert.ok(step.text.includes('inputs.allow_production_schema_apply == true'),'schema may never be implicitly applied');
    }
  }
});

for(const name of ['metricool-free-evidence','sync-social-schedule-candidates']){
  test(name+' must refuse writes/reads before official account quota check',()=>{
    const list=steps(read(name));
    const first=list.findIndex(budget);
    assert.ok(first>=0,'missing Cloudflare D1 Insights free-budget gate');
    const live=list.map((text,index)=>({text,index})).filter(x=>remote(x.text));
    assert.ok(live.length>=1,'expected real D1 query to remain guarded');
    assert.ok(live.every(x=>x.index>first),'all remote SQL must follow successful quota gate');
  });
}
