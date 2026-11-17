import { accessBusinessDraft, claimBusinessNotification, expireBusinessNotification, finishBusinessNotification, storeBusinessInquiry } from "./business-inquiries.mjs";

const encoder = new TextEncoder();
const path = "/api/internal/business-inquiries";
const scope = "xjw-b2b-intake-v1";
const maxBytes = 4096;
const freshnessMs = 5 * 60 * 1000;

function reply(status, data) {
  return Response.json(data, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

async function boundedBody(request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const bytes = new Uint8Array(maxBytes);
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) return bytes.subarray(0, size);
    if (size + value.length > maxBytes) {
      await reader.cancel();
      return null;
    }
    bytes.set(value, size);
    size += value.length;
  }
}

export async function businessInquiryIntake(request, env, now = Date.now()) {
  const enabled = env.XJW_B2B_INTAKE_ENABLED === "true";
  // Only the exact, independently signed, read-only readiness probe may enter
  // this handler when the feature is disabled. It cannot write data or notify.
  const probing = request.headers.get("x-xjw-readiness") === "1";
  if (!enabled && !probing) return reply(404, { error: "not_found" });
  if (request.method !== "POST" || new URL(request.url).pathname !== path) return reply(405, { error: "method_not_allowed" });
  const secret = env.XJW_B2B_INTAKE_SECRET;
  if (!env.DB || typeof secret !== "string" || secret.length < 32) return reply(503, { error: "intake_unavailable" });

  const timestamp = request.headers.get("x-xjw-timestamp") ?? "";
  const signature = request.headers.get("x-xjw-signature") ?? "";
  if (!/^\d{13}$/.test(timestamp) || Math.abs(now - Number(timestamp)) > freshnessMs || !/^[a-f0-9]{64}$/.test(signature)) {
    return reply(401, { error: "invalid_signature" });
  }
  try {
    const body = await boundedBody(request);
    if (!body?.length) return reply(400, { error: "invalid_body" });
    const prefix = encoder.encode(`${scope}\nPOST\n${path}\n${timestamp}\n`);
    const signed = new Uint8Array(prefix.length + body.length);
    signed.set(prefix);
    signed.set(body, prefix.length);
    const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const mac = Uint8Array.from(signature.match(/../g), byte => Number.parseInt(byte, 16));
    if (!await crypto.subtle.verify("HMAC", key, mac, signed)) return reply(401, { error: "invalid_signature" });

    let input;
    try { input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)); }
    catch { return reply(400, { error: "invalid_body" }); }
    if (probing) {
      if (!input || input.action !== "readiness" || Object.keys(input).length !== 2 ||
          typeof input.nonce !== "string" || !/^[a-f0-9]{32}$/.test(input.nonce)) {
        return reply(400, { error: "invalid_probe" });
      }
      const schema = await env.DB.prepare(
        "SELECT COUNT(*) AS ready FROM sqlite_master WHERE type='table' AND name IN ('business_inquiries','business_inquiry_drafts','business_inquiry_crm_delivery')"
      ).bind().first();
      if (Number(schema?.ready) !== 3) return reply(503, { error: "intake_unavailable" });
      return reply(200, { ok: true, action: "readiness", nonce: input.nonce, version: scope, enabled });
    }
    if (!enabled) return reply(404, { error: "not_found" });
    if (["save-draft", "load-draft", "discard-draft"].includes(input?.action)) {
      return reply(200, await accessBusinessDraft(env.DB, input, now));
    }
    if (input?.action === "claim" || input?.action === "finish") {
      const { action, id, claimId, outcome } = input;
      if (typeof id !== "string" || !/^B2B-[a-f0-9-]{36}$/i.test(id) ||
          typeof claimId !== "string" || !/^[a-f0-9-]{36}$/i.test(claimId) ||
          (action === "finish" && !["delivered", "rejected", "unknown"].includes(outcome))) {
        return reply(400, { error: "invalid_notification_action" });
      }
      await expireBusinessNotification(env.DB, id, now);
      const applied = action === "claim"
        ? await claimBusinessNotification(env.DB, id, claimId, now)
        : await finishBusinessNotification(env.DB, id, claimId, outcome);
      return reply(200, { id, action, applied });
    }
    const confirming = input?.action === "confirm-draft";
    if (confirming && (typeof input.actorKey !== "string" || !/^[a-f0-9]{64}$/.test(input.actorKey))) {
      return reply(400, { error: "invalid_inquiry" });
    }
    const receipt = await storeBusinessInquiry(env.DB, confirming ? input.payload : input,
      confirming ? { actorKey: input.actorKey, now } : null);
    if (receipt.notificationStatus === "sending" && await expireBusinessNotification(env.DB, receipt.id, now)) {
      receipt.notificationStatus = "uncertain";
    }
    return reply(receipt.duplicate ? 200 : 201, receipt);
  } catch (error) {
    if (error.message === "Invalid business inquiry") return reply(400, { error: "invalid_inquiry" });
    if (error.message === "Inactive business draft") return reply(409, { error: "inactive_draft" });
    if (error.message === "Business inquiry ID conflict") return reply(409, { error: "id_conflict" });
    return reply(503, { error: "intake_unavailable" });
  }
}
