// Owner-only recovery of B2B notifications. Never send to a customer.
const actions = new Set(['retry', 'resolve-sent', 'resolve-pending']);
const operator = profile => ['owner', 'admin'].includes(profile?.role) && typeof profile?.email === 'string' && profile.email.trim().length > 0;
const configured = env => env.XJW_B2B_NOTIFICATION_RETRY_ENABLED === 'true' &&
  /^U[a-f0-9]{32}$/i.test(env.XJW_B2B_OWNER_LINE_USER_ID ?? '') &&
  typeof env.LINE_CHANNEL_ACCESS_TOKEN === 'string' && env.LINE_CHANNEL_ACCESS_TOKEN.trim().length > 0;
const reply = (status, data) => Response.json(data, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });

export function notificationControls(env, profile) {
  return { resolve: operator(profile), retry: operator(profile) && configured(env) };
}

// D1 batch is transactional. Insert the audit record only if the exact same
// guarded row can be changed, then apply the change in the same transaction.
async function change(db, { id, actor, action, reason, from, to, revision, claim, now }) {
  const isClaim = action === 'retry';
  const isFinish = action === 'retry-result';
  const where = isFinish ? 'id = ? AND notification_status = ? AND notification_claim = ?'
    : 'id = ? AND notification_status = ? AND revision = ?';
  const args = [id, from, isFinish ? claim : revision];
  const at = new Date(now).toISOString();
  const audit = db.prepare(`INSERT INTO audit_logs
    (id, actor_email, action, entity_type, entity_id, before_json, after_json, created_at)
    SELECT ?, ?, ?, 'business_inquiry', id, ?, ?, ? FROM business_inquiries WHERE ${where}`)
    .bind(crypto.randomUUID(), actor, 'b2b-notification-' + action,
      JSON.stringify({ notificationStatus: from }), JSON.stringify({ notificationStatus: to, reason }), at, ...args);
  const update = db.prepare(`UPDATE business_inquiries SET notification_status = ?, notification_claim = ?,
    notification_started_at = ?, notification_attempts = notification_attempts + ?, revision = revision + 1
    WHERE ${where} RETURNING id, category, notification_status, revision`)
    .bind(to, isClaim ? claim : null, isClaim ? now : null, isClaim ? 1 : 0, ...args);
  const results = await db.batch([audit, update]);
  return results[1]?.results?.[0] ?? null;
}

async function pushOwner(env, record, claim, transport) {
  try {
    const response = await transport('https://api.line.me/v2/bot/message/push', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { authorization: 'Bearer ' + env.LINE_CHANNEL_ACCESS_TOKEN.trim(), 'content-type': 'application/json', 'X-Line-Retry-Key': claim },
      // The owner's ERP contains the details; the notification itself omits contact information.
      body: JSON.stringify({ to: env.XJW_B2B_OWNER_LINE_USER_ID, messages: [{ type: 'text', text: `【仙加味｜商家合作待處理】\n合作編號：${record.id}\n類型：${record.category}\n請至仙加味 ERP 商家合作頁查看。` }] }),
    });
    if (response.ok || (response.status === 409 && response.headers.get('x-line-accepted-request-id'))) return 'sent';
    // A definite HTTP rejection may be retried later; timeouts and 5xx remain unknown.
    if (response.status >= 400 && response.status < 500 && ![408, 409].includes(response.status)) return 'pending';
    return 'uncertain';
  } catch { return 'uncertain'; }
}

export async function businessNotificationAction(payload, env, profile, { transport = fetch, now = Date.now } = {}) {
  if (!operator(profile)) return reply(403, { error: 'forbidden' });
  const { id, revision, notificationAction: action, reason } = payload ?? {};
  if (!/^B2B-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id ?? '') ||
    !Number.isSafeInteger(revision) || revision < 0 || !actions.has(action) ||
    typeof reason !== 'string' || !reason.trim() || reason.length > 500) return reply(400, { error: 'invalid_notification_action' });
  const actor = profile.email.trim().toLowerCase();
  if (action === 'retry' && !configured(env)) return reply(503, { error: 'notification_retry_not_configured' });
  const claim = action === 'retry' ? crypto.randomUUID() : null;
  const from = action === 'retry' ? 'pending' : 'uncertain';
  const to = action === 'retry' ? 'sending' : action === 'resolve-sent' ? 'sent' : 'pending';
  const row = await change(env.DB, { id, actor, action, reason: reason.trim(), from, to, revision, claim, now: now() });
  if (!row) return reply(409, { error: 'notification_state_changed' });
  if (action !== 'retry') return reply(200, { id, revision: row.revision, notificationStatus: to });
  const outcome = await pushOwner(env, row, claim, transport);
  const final = await change(env.DB, { id, actor, action: 'retry-result', reason: 'LINE API outcome: ' + outcome,
    from: 'sending', to: outcome, claim, now: now() });
  if (!final) return reply(409, { error: 'notification_state_changed' });
  return reply(200, { id, revision: final.revision, notificationStatus: outcome });
}
