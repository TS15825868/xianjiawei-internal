const notificationLeaseMs = 5 * 60 * 1000;
const categories = new Set(["批發採購", "經銷", "通路寄賣", "產品開發", "鹿角原料", "品牌異業", "其他合作"]);

export const businessInquirySchema = `
  CREATE TABLE IF NOT EXISTS business_inquiries (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL CHECK (source = 'LINE'),
    received_at TEXT NOT NULL,
    origin TEXT,
    category TEXT NOT NULL,
    business_contact TEXT NOT NULL,
    details TEXT NOT NULL,
    consultation_status TEXT NOT NULL DEFAULT '待洽談',
    notification_status TEXT NOT NULL DEFAULT 'pending'
      CHECK (notification_status IN ('pending', 'sending', 'sent', 'uncertain')),
    notification_claim TEXT,
    notification_started_at INTEGER,
    notification_attempts INTEGER NOT NULL DEFAULT 0
  );
`;

function verifiedInquiry(input) {
  const { id, source, receivedAt, category, businessContact, details, origin = null } = input ?? {};
  if (!/^B2B-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id ?? "") ||
      source !== "LINE" || !categories.has(category) ||
      (origin !== null && (typeof origin !== "string" || !/^website:[a-z0-9_-]{1,48}$/.test(origin))) ||
      typeof businessContact !== "string" || !businessContact.trim() || businessContact.length > 300 ||
      typeof details !== "string" || !details.trim() || details.length > 400 ||
      typeof receivedAt !== "string" || !Number.isFinite(Date.parse(receivedAt)) ||
      new Date(receivedAt).toISOString() !== receivedAt) {
    throw new Error("Invalid business inquiry");
  }
  return [id, source, receivedAt, category, businessContact.trim(), details.trim(), origin];
}

export async function storeBusinessInquiry(db, input) {
  const [id, ...fields] = verifiedInquiry(input);
  const saved = await db.prepare(`
    INSERT INTO business_inquiries (id, source, received_at, category, business_contact, details, origin)
    VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING
    RETURNING notification_status
  `).bind(id, ...fields).first();
  if (saved) return { id, notificationStatus: saved.notification_status, duplicate: false };

  const existing = await db.prepare(`
    SELECT notification_status FROM business_inquiries
    WHERE id = ? AND source = ? AND received_at = ? AND category = ?
      AND business_contact = ? AND details = ? AND origin IS ?
  `).bind(id, ...fields).first();
  if (!existing) throw new Error("Business inquiry ID conflict");
  return { id, notificationStatus: existing.notification_status, duplicate: true };
}

export async function claimBusinessNotification(db, inquiryId, claimId, now = Date.now()) {
  if (!claimId) throw new Error("Notification claim ID required");
  const claimed = await db.prepare(`
    UPDATE business_inquiries
    SET notification_status = 'sending', notification_claim = ?, notification_started_at = ?,
        notification_attempts = notification_attempts + 1
    WHERE id = ? AND notification_status = 'pending'
    RETURNING id
  `).bind(claimId, now, inquiryId).first();
  return Boolean(claimed);
}

export async function finishBusinessNotification(db, inquiryId, claimId, outcome) {
  // Only a confirmed rejection can be retried. A timeout might have delivered the push.
  const status = { delivered: "sent", rejected: "pending", unknown: "uncertain" }[outcome];
  if (!["sent", "pending", "uncertain"].includes(status)) throw new Error("Invalid notification outcome");
  const finished = await db.prepare(`
    UPDATE business_inquiries SET notification_status = ?, notification_claim = NULL, notification_started_at = NULL
    WHERE id = ? AND notification_status = 'sending' AND notification_claim = ?
    RETURNING id
  `).bind(status, inquiryId, claimId).first();
  return Boolean(finished);
}

export async function expireBusinessNotification(db, inquiryId, now = Date.now()) {
  const expired = await db.prepare(`
    UPDATE business_inquiries SET notification_status = 'uncertain',
        notification_claim = NULL, notification_started_at = NULL
    WHERE id = ? AND notification_status = 'sending' AND notification_started_at <= ?
    RETURNING id
  `).bind(inquiryId, now - notificationLeaseMs).first();
  return Boolean(expired);
}


export async function sweepExpiredBusinessNotifications(db, now = Date.now()) {
  await db.prepare(`
    UPDATE business_inquiries SET notification_status = 'uncertain',
        notification_claim = NULL, notification_started_at = NULL
    WHERE notification_status = 'sending' AND notification_started_at <= ?
  `).bind(now - notificationLeaseMs).run();
}
