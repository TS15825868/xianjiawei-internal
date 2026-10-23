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
 assert.match(primary,/cron:\s*'23 \* \* \* \*'/);
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
