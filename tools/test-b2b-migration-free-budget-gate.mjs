import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = readFileSync(new URL('../.github/workflows/prepare-business-inquiries-d1.yml', import.meta.url), 'utf8');
const step = name => {
  const marker = '      - name: ' + name + '\n';
  const start = config.indexOf(marker);
  assert.ok(start >= 0, 'Missing workflow step: ' + name);
  const next = config.indexOf('\n      - name: ', start + marker.length);
  return config.slice(start, next >= 0 ? next : config.length);
};
const approval = "github.event_name == 'workflow_dispatch' && inputs.allow_production_d1_export == true";
const guarded = 'if: ' + '$' + '{{ ' + approval + ' }}';

test('production D1 export opt-in is false by default', () => {
  assert.match(config, /allow_production_d1_export:\n\s+description:[^\n]*\n\s+type: boolean\n\s+required: true\n\s+default: false/);
  assert.match(config, /apply:\n\s+description:[^\n]*\n\s+type: boolean\n\s+default: false/);
});

test('branch push and plain manual dispatch cannot export production D1', () => {
  for (const name of [
    'Install existing project dependencies without credentials',
    'Export and rehearse migration against an isolated restore',
    'Redact recovery identifier from the public-repository artifact',
    'Preserve recovery and rehearsal evidence'
  ]) {
    const block = step(name);
    assert.ok(block.includes(guarded), name + ' must require explicit opt-in');
  }
  assert.match(step('Record offline-only B2B migration preflight'), /github\.event_name != 'workflow_dispatch' \|\| inputs\.allow_production_d1_export != true/);
});

test('apply also requires main, opt-in and explicit apply=true', () => {
  const block = step('Apply approved B2B schema and verify reads');
  assert.match(block, /github\.ref == 'refs\/heads\/main'/);
  assert.match(block, /inputs\.apply == true/);
  assert.match(block, /inputs\.allow_production_d1_export == true/);
  assert.ok(step('Block migration if production export was not explicitly approved').includes('exit 1'));
});

test('all remote D1 operations are within opt-in steps', () => {
  const sections = config.split(/(?=^      - name: )/m);
  let count = 0;
  for (const section of sections) {
    if (!/wrangler d1 (?:time-travel|export|execute)/.test(section)) continue;
    count++;
    const isApply = section.includes('- name: Apply approved B2B schema and verify reads');
    if (isApply) {
      assert.match(section, /if:.*github\.event_name == 'workflow_dispatch'.*github\.ref == 'refs\/heads\/main'.*inputs\.apply == true.*inputs\.allow_production_d1_export == true/);
    } else {
      assert.ok(section.includes(guarded), 'Unguarded D1 operation in step: ' + section.slice(0, 110));
    }
  }
  assert.equal(count, 2, 'Expected exactly export/rehearsal and apply operation steps');
});

test('actual Cloudflare account-wide budget evaluation precedes remote export', () => {
  const budgetName='Validate account-wide D1 free Rows Read budget without production SQL';
  const budget=step(budgetName);
  const exportStep='Export and rehearse migration against an isolated restore';
  assert.ok(budget.includes(guarded));
  assert.match(budget,/node tools\/check-d1-free-budget-before-export\.mjs/);
  assert.ok(config.indexOf('      - name: '+budgetName) <
    config.indexOf('      - name: '+exportStep));
  const exportBlock=step(exportStep);
  assert.ok(exportBlock.includes(guarded));
});

test('existing three B2B tables never trigger redundant remote SQL', () => {
  const preflight=step('Verify schema and isolate test data');
  assert.match(preflight,/businessInquiryCrmSchema/);
  assert.match(preflight,/businessInquirySchema/);
  const apply=step('Apply approved B2B schema and verify reads');
  assert.match(apply,/requiresProductionSchemaApply/);
  assert.match(apply,/isolatedRestoreAndSchemaRehearsal/);
  assert.match(apply,/missingB2bTableCount/);
  assert.match(apply,/SELECT 1 FROM business_inquiry_crm_delivery WHERE 0/);
  assert.match(apply,/exit 0/);
  assert.ok(apply.indexOf('requiresProductionSchemaApply') <
    apply.indexOf('npx --no-install wrangler d1 execute'));
});

test('complete live table inventory is captured and verified before full backup is accepted', () => {
  const captureName='Capture full live D1 table names for backup completeness (metadata only)';
  const capture=step(captureName);
  const exportName='Export and rehearse migration against an isolated restore';
  assert.ok(capture.includes(guarded));
  assert.match(capture,/node tools\/capture-d1-live-table-inventory\.mjs/);
  assert.ok(config.indexOf('      - name: Validate account-wide D1 free Rows Read budget') <
            config.indexOf('      - name: '+captureName));
  assert.ok(config.indexOf('      - name: '+captureName) <
            config.indexOf('      - name: '+exportName));
  assert.match(step(exportName),/business-inquiries-live-table-inventory\.json/);
  assert.match(step('Remove downloaded production data from runner'),/business-inquiries-live-table-inventory\.json/);
});

test('raw backup never becomes a workflow artifact and is cleaned', () => {
  const upload = step('Preserve recovery and rehearsal evidence');
  assert.match(upload, /business-inquiries-preflight\.json/);
  assert.doesNotMatch(upload, /business-inquiries-backup\.sql/);
  const redact = step('Redact recovery identifier from the public-repository artifact');
  assert.match(redact, /x\.pop\("bookmark"\)/);
  assert.match(step('Remove downloaded production data from runner'), /business-inquiries-backup\.sql/);
});
