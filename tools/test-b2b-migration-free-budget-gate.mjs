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
  assert.ok(block.includes(approval));
  assert.ok(step('Block migration if production export was not explicitly approved').includes('exit 1'));
});

test('all remote D1 operations are within opt-in steps', () => {
  const sections = config.split(/(?=^      - name: )/m);
  let count = 0;
  for (const section of sections) {
    if (!/wrangler d1 (?:time-travel|export|execute)/.test(section)) continue;
    count++;
    assert.ok(section.includes(approval), 'Unguarded D1 operation in step: ' + section.slice(0, 110));
  }
  assert.equal(count, 2, 'Expected exactly export/rehearsal and apply operation steps');
});

test('raw backup never becomes a workflow artifact and is cleaned', () => {
  const upload = step('Preserve recovery and rehearsal evidence');
  assert.match(upload, /business-inquiries-preflight\.json/);
  assert.doesNotMatch(upload, /business-inquiries-backup\.sql/);
  const redact = step('Redact recovery identifier from the public-repository artifact');
  assert.match(redact, /x\.pop\("bookmark"\)/);
  assert.match(step('Remove downloaded production data from runner'), /business-inquiries-backup\.sql/);
});
