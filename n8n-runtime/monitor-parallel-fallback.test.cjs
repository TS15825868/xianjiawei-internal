'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const root=resolve(__dirname,'..');
const workflow=readFileSync(resolve(root,'.github/workflows/n8n-readonly-monitor-scheduler.yml'),'utf8');
const backupSource=readFileSync(resolve(__dirname,'smoke-readonly.js'),'utf8');
const parts=workflow.split(/\n  fallback-readonly:\s*\n/);
test('read-only fallback starts in parallel and never waits for broken n8n',()=>{
 assert.equal(parts.length,2,'Both monitor and backup jobs must exist');
 const [primary,backup]=parts;
 assert.match(primary,/\n  monitor:\n/);
 assert.match(primary,/cron:\s*'23 0 \* \* \*'/);
 assert.match(primary,/cron:\s*'23 1-23 \* \* \*'/);
 assert.doesNotMatch(backup,/^\s{4}needs:/m);
 assert.doesNotMatch(backup,/^\s{4}if:/m);
 assert.match(backup,/runs-on: ubuntu-latest/);
 assert.match(backup,/node n8n-runtime\/smoke-readonly\.js/);
});
test('public fallback is read-only with no workflow write or external credentials',()=>{
 assert.match(parts[1],/permissions:\n\s+contents: read/);
 assert.doesNotMatch(parts[1],/secrets\.|repository_dispatch|workflow_dispatch.*token|curl.*-X\s+POST/);
 assert.match(backupSource,/line\.body\?\.ok !== true/);
 assert.match(backupSource,/line\.body\?\.orderOpen !== true/);
 assert.match(backupSource,/line\.body\?\.credentialsConfigured !== true/);
 assert.match(backupSource,/sourceOfTruth !== 'public-product-master\.json'/);
 assert.match(backupSource,/receipt_disabled/);
 assert.match(backupSource,/verification_required/);
 assert.match(backupSource,/safelyBlocked/);
});
test('n8n monitoring remains GET-only and excludes publishing routes',()=>{
 assert.match(parts[0],/xjw-line-health-a7f8c2/);
 assert.match(parts[0],/xjw-ai-geo-9c3f75/);
 assert.match(parts[0],/xjw-system-health-d4b6e1/);
 assert.doesNotMatch(parts[0],/\/publish-now|\/deliveries|curl[^\n]*-X\s+POST/i);
});
test('independent success cannot silently replace the real monitor failure',()=>{
 // The primary job still fails independently on readiness timeout, while the
 // separate backup job provides availability facts without live sends.
 assert.match(parts[0],/n8n readiness unavailable; no monitor webhooks were invoked/);
 assert.match(parts[0],/exit 1/);
 assert.match(parts[1],/不代表 n8n/);
});

test('broken Render readiness is bounded and never masks primary failure',()=>{
 const primary=parts[0];
 assert.match(primary,/timeout-minutes: 9/);
 assert.match(primary,/for attempt in 1 2 3 4; do/);
 assert.match(primary,/--connect-timeout 7 --max-time 20/);
 assert.match(primary,/if \[ "\$attempt" -lt 4 \]; then sleep 60; fi/);
 assert.doesNotMatch(primary,/for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14/);
 assert.match(primary,/n8n readiness unavailable; no monitor webhooks were invoked/);
 assert.match(primary,/exit 1/);
 assert.match(primary,/for route in xjw-line-health-a7f8c2 xjw-ai-geo-9c3f75 xjw-system-health-d4b6e1;/);
 assert.match(parts[1],/node n8n-runtime\/smoke-readonly\.js/);
});

test('verified Render n8n resumes one daily scheduled check; pushes and other hours remain backup-only',()=>{
 const [primary,backup]=parts;
 assert.ok(primary.includes("    if: (github.event_name == 'schedule' && github.event.schedule == '23 0 * * *') || (github.event_name == 'workflow_dispatch' && inputs.probe_n8n == true)"));
 assert.ok(!primary.includes("github.event_name == 'push' &&"));
 assert.match(primary,/cron:\s*'23 0 \* \* \*'/);
 assert.match(primary,/cron:\s*'23 1-23 \* \* \*'/);
 assert.doesNotMatch(backup,/^\s{4}if:/m);
 assert.doesNotMatch(backup,/^\s{4}needs:/m);
 assert.match(backup,/node n8n-runtime\/smoke-readonly\.js/);
 assert.match(primary,/no monitor webhooks were invoked/);
});

// One accidentally clicked manual Run must not trigger a 512 MiB Render n8n cold start.
test('manual run stays independent by default and requires explicit n8n opt-in',()=>{
 const [primary,backup]=parts;
 assert.ok(primary.includes("workflow_dispatch:\n    inputs:\n      probe_n8n:"));
 assert.ok(primary.includes("default: false"));
 assert.ok(primary.includes("    if: (github.event_name == 'schedule' && github.event.schedule == '23 0 * * *') || (github.event_name == 'workflow_dispatch' && inputs.probe_n8n == true)"));
 assert.doesNotMatch(backup,/^\s{4}if:/m);
 assert.match(backup,/node n8n-runtime\/smoke-readonly\.js/);
});


test('bounded readiness covers the observed 149s cold start within the existing job budget',()=>{
 const primary=parts[0];
 const attempts=4,probeSeconds=20,gapSeconds=60,workflowRequests=3,workflowSeconds=60;
 assert.match(primary,/for attempt in 1 2 3 4; do/);
 assert.ok(primary.includes('--retry 0 --connect-timeout 7 --max-time 20'));
 assert.ok(primary.includes('then sleep 60; fi'));
 assert.ok(primary.includes('--retry 0 --connect-timeout 15 --max-time 60'));
 assert.equal(attempts*probeSeconds+(attempts-1)*gapSeconds,260);
 assert.ok((attempts-1)*gapSeconds>149);
 assert.ok(attempts*probeSeconds+(attempts-1)*gapSeconds+workflowRequests*workflowSeconds<9*60);
 assert.ok(!primary.includes('--retry 2'));
 assert.ok(primary.includes("    if: (github.event_name == 'schedule' && github.event.schedule == '23 0 * * *') || (github.event_name == 'workflow_dispatch' && inputs.probe_n8n == true)"));
 assert.ok(parts[1].includes('n8n-runtime/monitor-parallel-fallback.test.cjs'));
});


test('daily primary and remaining 23 hourly backup slots are disjoint and preserve all 24 hours',()=>{
 const [primary,backup]=parts;
 const schedules=Array.from(primary.matchAll(/- cron: '23 ([^']+) \* \* \*'/g),m=>m[1]);
 assert.deepEqual(schedules,['0','1-23']);
 const hours=schedules.flatMap(slot=>slot==='0'?[0]:Array.from({length:23},(_,i)=>i+1));
 assert.equal(hours.length,24);
 assert.equal(new Set(hours).size,24);
 assert.ok(primary.includes("    if: (github.event_name == 'schedule' && github.event.schedule == '23 0 * * *') || (github.event_name == 'workflow_dispatch' && inputs.probe_n8n == true)"));
 assert.doesNotMatch(backup,/^\s{4}needs:/m);
 assert.doesNotMatch(backup,/^\s{4}if:/m);
});
