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
        SELECT id, category, business_contact, details, source, origin, received_at,
               consultation_status, assignee, consultation_notes, notification_status, revision
        FROM business_inquiries
        WHERE (? = '' OR consultation_status = ?)
          AND (? = '' OR instr(id, ?) > 0 OR instr(business_contact, ?) > 0
               OR instr(details, ?) > 0 OR instr(category, ?) > 0)
        ORDER BY received_at DESC, id DESC LIMIT 51 OFFSET ?
      `).bind(status, status, keyword, keyword, keyword, keyword, keyword, offset).all();
      return reply(200, { inquiries: results.slice(0, 50), nextOffset: results.length > 50 ? offset + 50 : null });
    }
    if (request.method !== "PATCH") return reply(405, { error: "method_not_allowed" });
    if (request.headers.get("origin") !== new URL(request.url).origin ||
        !/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) {
      return reply(403, { error: "invalid_origin" });
    }
    const payload = await request.json().catch(() => null);
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
