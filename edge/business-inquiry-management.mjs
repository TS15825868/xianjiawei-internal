import { businessNotificationAction, notificationControls } from "./business-inquiry-notification-management.mjs";
export const managementPath = "/api/business-inquiries";
const statuses = ["待洽談", "洽談中", "待報價", "已報價", "合作成立", "暫緩", "未成立"];

function reply(status, data) {
  return Response.json(data, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

export async function businessInquiryManagement(request, env, authenticate) {
  if (env.XJW_B2B_INTAKE_ENABLED !== "true") return reply(404, { error: "not_found" });
  try {
    const profile = await authenticate(request, env).catch(() => null);
    if (!profile) return reply(401, { error: "unauthenticated" });
    if (!["owner", "admin", "sales"].includes(profile.role)) return reply(403, { error: "forbidden" });
    if (request.method === "GET") {
      const query = new URL(request.url).searchParams;
      const status = query.get("status") ?? "";
      const keyword = (query.get("q") ?? "").trim().slice(0, 100);
      const offset = Number(query.get("offset") ?? "0");
      if ((status && !statuses.includes(status)) || !Number.isSafeInteger(offset) || offset < 0) {
        return reply(400, { error: "invalid_filter" });
      }
      const { results } = await env.DB.prepare(`
        SELECT b.id, b.category, b.business_contact, b.details, b.source, b.origin, b.received_at,
               b.consultation_status, b.assignee, b.consultation_notes, b.notification_status, b.revision,
               COALESCE(d.state, 'queued') AS crm_delivery_state,
               COALESCE(d.attempts, 0) AS crm_delivery_attempts,
               d.next_attempt_at AS crm_next_attempt_at, d.sent_at AS crm_sent_at
        FROM business_inquiries b
        LEFT JOIN business_inquiry_crm_delivery d ON d.inquiry_id = b.id
        WHERE (? = '' OR b.consultation_status = ?)
          AND (? = '' OR instr(b.id, ?) > 0 OR instr(b.business_contact, ?) > 0
               OR instr(b.details, ?) > 0 OR instr(b.category, ?) > 0)
        ORDER BY b.received_at DESC, b.id DESC LIMIT 51 OFFSET ?
      `).bind(status, status, keyword, keyword, keyword, keyword, keyword, offset).all();
      return reply(200, { inquiries: results.slice(0, 50), nextOffset: results.length > 50 ? offset + 50 : null, notificationControls: notificationControls(env, profile), crmDeliveryEnabled: env.XJW_B2B_CRM_ENABLED === "true" });
    }
    if (request.method !== "PATCH") return reply(405, { error: "method_not_allowed" });
    if (request.headers.get("origin") !== new URL(request.url).origin ||
        !/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) {
      return reply(403, { error: "invalid_origin" });
    }
    const payload = await request.json().catch(() => null);
    if (payload && Object.hasOwn(payload, "notificationAction")) return await businessNotificationAction(payload, env, profile);
    const { id, revision, status, assignee, notes } = payload ?? {};
    if (!/^B2B-[a-f0-9-]{36}$/i.test(id ?? "") || !Number.isSafeInteger(revision) || revision < 0 ||
        !statuses.includes(status) || typeof assignee !== "string" || assignee.length > 100 ||
        typeof notes !== "string" || notes.length > 2000) {
      return reply(400, { error: "invalid_update" });
    }
    const saved = await env.DB.prepare(`
      UPDATE business_inquiries SET consultation_status = ?, assignee = ?, consultation_notes = ?, revision = revision + 1
      WHERE id = ? AND revision = ? RETURNING id, revision
    `).bind(status, assignee.trim(), notes.trim(), id, revision).first();
    return saved ? reply(200, saved) : reply(409, { error: "record_changed_or_missing" });
  } catch {
    return reply(503, { error: "management_unavailable" });
  }
}
