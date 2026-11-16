import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { businessNotificationAction, notificationControls } from './business-inquiry-notification-management.mjs';
const id = 'B2B-' + crypto.randomUUID();
const owner = { role: 'owner', email: 'isolated@example.invalid' };
const sales = { role: 'sales', email: 'isolated@example.invalid' };
function fixture(t, state = 'pending') {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec(`CREATE TABLE business_inquiries (id TEXT PRIMARY KEY, category TEXT NOT NULL, notification_status TEXT NOT NULL,
    notification_claim TEXT, notification_started_at INTEGER, notification_attempts INTEGER DEFAULT 0, revision INTEGER DEFAULT 0);
    CREATE TABLE audit_logs (id TEXT PRIMARY KEY, actor_email TEXT NOT NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL, before_json TEXT, after_json TEXT, created_at TEXT NOT NULL);`);
  sqlite.prepare('INSERT INTO business_inquiries (id,category,notification_status) VALUES (?,?,?)').run(id,'經銷',state);
  const db = { prepare: sql => ({ bind: (...args) => ({ sql, args }) }), batch: async statements => {
    sqlite.exec('BEGIN');
    try { const results = statements.map(s => ({ results: sqlite.prepare(s.sql).all(...s.args) })); sqlite.exec('COMMIT'); return results; }
    catch(e) { sqlite.exec('ROLLBACK'); throw e; }
  } };
  const env = { DB: db, XJW_B2B_NOTIFICATION_RETRY_ENABLED: 'true', XJW_B2B_OWNER_LINE_USER_ID: 'U' + 'a'.repeat(32), LINE_CHANNEL_ACCESS_TOKEN: 'isolated-not-a-real-token' };
  const row = () => sqlite.prepare('SELECT notification_status,notification_attempts,revision FROM business_inquiries').get();
  const audit = () => sqlite.prepare('SELECT action, after_json FROM audit_logs ORDER BY rowid').all();
  const run = (action, revision = 0, transport = async () => { throw Error('not expected'); }, profile = owner, extra = {}) => businessNotificationAction({ id, revision, notificationAction: action, reason: '隔離證據', ...extra }, env, profile, { transport });
  return { env, row, audit, run };
}
test('retry is owner-only, explicitly enabled, and one claimant sends only to the configured owner', async t => {
  const { env, row, audit, run } = fixture(t);
  let sends = 0;
  const transport = async (url, init) => {
    sends++;
    assert.equal(url, 'https://api.line.me/v2/bot/message/push');
    assert.equal(row().notification_status, 'sending');
    assert.match(init.headers['X-Line-Retry-Key'], /^[a-f0-9-]{36}$/);
    assert.equal(JSON.parse(init.body).to, env.XJW_B2B_OWNER_LINE_USER_ID);
    return new Response('{}', { status: 200 });
  };
  assert.equal((await run('retry',0,transport,sales)).status,403);
  env.XJW_B2B_NOTIFICATION_RETRY_ENABLED = 'false';
  assert.equal((await run('retry',0,transport)).status,503);
  assert.equal(notificationControls(env,owner).retry,false);
  env.XJW_B2B_NOTIFICATION_RETRY_ENABLED = 'true';
  const attempts = await Promise.all([run('retry',0,transport),run('retry',0,transport)]);
  assert.deepEqual(attempts.map(r=>r.status).sort(),[200,409]);
  assert.equal(sends,1);
  assert.equal(row().notification_status,'sent');
  assert.equal(row().notification_attempts,1);
  assert.equal(row().revision,2);
  assert.equal(audit().length,2);
});
test('ambiguous delivery is held until explicit evidence-based owner resolution', async t => {
  const { row, audit, run } = fixture(t);
  let calls = 0;
  const failed = async () => { calls++; throw Error('response lost'); };
  assert.equal((await (await run('retry',0,failed)).json()).notificationStatus,'uncertain');
  assert.equal((await run('retry',2,failed)).status,409);
  assert.equal((await run('resolve-pending',2,failed,sales)).status,403);
  assert.equal((await run('resolve-pending',2,failed,owner,{reason:''})).status,400);
  assert.equal((await run('resolve-pending',1,failed)).status,409);
  assert.equal((await (await run('resolve-pending',2,failed)).json()).notificationStatus,'pending');
  assert.equal(calls,1);
  assert.equal(row().revision,3);
  assert.equal(audit().length,3);
});
test('definite rejection returns pending, accepted retry key is not sent again', async t => {
  const { row, run } = fixture(t);
  assert.equal((await (await run('retry',0,async()=>new Response('{}',{status:400}))).json()).notificationStatus,'pending');
  const accepted = async()=>new Response('{}',{status:409,headers:{'x-line-accepted-request-id':'mock'}});
  assert.equal((await (await run('retry',2,accepted)).json()).notificationStatus,'sent');
  assert.equal((await run('retry',4,accepted)).status,409);
  assert.equal(row().notification_attempts,2);
});
test('uncertain can be recorded as already accepted without sending another message', async t => {
  const { row, audit, run } = fixture(t,'uncertain');
  const response = await run('resolve-sent');
  assert.equal(response.status,200);
  assert.equal(row().notification_status,'sent');
  assert.equal(row().notification_attempts,0);
  assert.equal(audit().length,1);
});
test('management route preserves authentication, same-origin and feature flag guards', async t => {
  const { businessInquiryManagement } = await import('./business-inquiry-management.mjs');
  const { env, row, audit } = fixture(t,'uncertain');
  const url = 'https://isolated.invalid/api/business-inquiries';
  const run = (profile, origin = 'https://isolated.invalid', action = 'resolve-sent') => businessInquiryManagement(new Request(url, {
    method: 'PATCH', headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ id, revision: 0, notificationAction: action, reason: '隔離證據' }),
  }),env,async()=>profile);
  assert.equal((await run(owner)).status,404);
  env.XJW_B2B_INTAKE_ENABLED = 'true';
  assert.equal((await run(null)).status,401);
  assert.equal((await run(sales)).status,403);
  assert.equal((await run(owner,'https://other.invalid')).status,403);
  env.XJW_B2B_NOTIFICATION_RETRY_ENABLED = 'false';
  assert.equal((await run(owner,'https://isolated.invalid','retry')).status,503);
  assert.equal(audit().length,0);
  assert.equal((await run(owner)).status,200);
  assert.equal(row().notification_status,'sent');
  assert.equal(audit().length,1);
});
