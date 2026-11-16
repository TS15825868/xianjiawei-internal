import assert from "node:assert/strict";
import { backup, DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { createHmac, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  businessInquirySchema, claimBusinessNotification, finishBusinessNotification, storeBusinessInquiry,
  expireBusinessNotification, sweepExpiredBusinessNotifications,
} from "./business-inquiries.mjs";

import { businessInquiryCrmSchema } from "./business-inquiry-crm.mjs";

function fixture(t) {
  const sqlite = new DatabaseSync(":memory:");
  t.after(() => sqlite.close());
  sqlite.exec(businessInquirySchema + businessInquiryCrmSchema);
  const db = { prepare: sql => ({ bind: (...args) => ({ first: async () => sqlite.prepare(sql).get(...args) }) }) };
  const data = { id: "B2B-" + randomUUID(), source: "LINE", receivedAt: new Date().toISOString(),
    category: "鹿角原料", businessContact: "隔離測試聯絡資料", details: "隔離測試需求" };
  return { db, data, sqlite };
}

test("saves once, rejects conflicting replays, and omits contact data from receipts", async t => {
  const { db, data, sqlite } = fixture(t);
  assert.deepEqual(await storeBusinessInquiry(db, data), { id: data.id, notificationStatus: "pending", duplicate: false });
  assert.equal((await storeBusinessInquiry(db, data)).duplicate, true);
  await assert.rejects(storeBusinessInquiry(db, { ...data, details: "different" }), /conflict/);
  await assert.rejects(storeBusinessInquiry(db, { ...data, category: "invalid" }), /Invalid/);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM business_inquiries").get().count, 1);
});

test("claims one sender, permits confirmed rejection retries, and holds unknown deliveries", async t => {
  const { db, data } = fixture(t);
  assert.equal(await claimBusinessNotification(db, data.id, "first"), false);
  await storeBusinessInquiry(db, data);
  assert.deepEqual(await Promise.all([
    claimBusinessNotification(db, data.id, "first"), claimBusinessNotification(db, data.id, "second"),
  ]), [true, false]);
  assert.equal(await finishBusinessNotification(db, data.id, "second", "delivered"), false);
  assert.equal(await finishBusinessNotification(db, data.id, "first", "rejected"), true);
  assert.equal(await claimBusinessNotification(db, data.id, "second"), true);
  assert.equal(await finishBusinessNotification(db, data.id, "second", "unknown"), true);
  assert.equal(await claimBusinessNotification(db, data.id, "third"), false);
  assert.equal((await storeBusinessInquiry(db, data)).notificationStatus, "uncertain");
});

test("isolated backup restores both the record and confirmed notification state", async t => {
  const { db, data, sqlite } = fixture(t);
  const directory = await mkdtemp(join(tmpdir(), "xjw-inquiry-test-"));
  try {
    await storeBusinessInquiry(db, data);
    assert.equal(await claimBusinessNotification(db, data.id, "delivery"), true);
    assert.equal(await finishBusinessNotification(db, data.id, "delivery", "delivered"), true);
    const snapshot = join(directory, "snapshot.db");
    await backup(sqlite, snapshot);
    const restored = new DatabaseSync(snapshot, { readOnly: true });
    try {
      const result = restored.prepare("SELECT id, details, notification_status FROM business_inquiries").get();
      assert.deepEqual({ ...result }, { id: data.id, details: data.details, notification_status: "sent" });
    } finally {
      restored.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("signed intake rejects stale or altered requests and holds expired notification claims", async t => {
  const { businessInquiryIntake } = await import("./business-inquiry-intake.mjs");
  const { db, data, sqlite } = fixture(t);
  const secret = "isolated-test-key-not-a-real-credential";
  const env = { DB: db, XJW_B2B_INTAKE_ENABLED: "true", XJW_B2B_INTAKE_SECRET: secret };
  const path = "/api/internal/business-inquiries";
  const now = Date.now();
  function signed(input, date = now, signedBody = JSON.stringify(input)) {
    const signature = createHmac("sha256", secret)
      .update(`xjw-b2b-intake-v1\nPOST\n${path}\n${date}\n${signedBody}`).digest("hex");
    return new Request("https://isolated.invalid" + path, {
      method: "POST", body: JSON.stringify(input),
      headers: { "x-xjw-timestamp": String(date), "x-xjw-signature": signature },
    });
  }
  assert.equal((await businessInquiryIntake(signed(data), {}, now)).status, 404);
  assert.equal((await businessInquiryIntake(signed(data, now - 300001), env, now)).status, 401);
  assert.equal((await businessInquiryIntake(signed(data, now, "{}"), env, now)).status, 401);
  assert.equal((await businessInquiryIntake(signed({ ...data, details: "a".repeat(5000) }), env, now)).status, 400);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM business_inquiries").get().count, 0);

  const first = await businessInquiryIntake(signed(data), env, now);
  assert.equal(first.status, 201);
  assert.equal(JSON.stringify(await first.json()).includes(data.businessContact), false);
  await claimBusinessNotification(db, data.id, "lost-process", now);
  const replay = await businessInquiryIntake(signed(data, now + 300001), env, now + 300001);
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).notificationStatus, "uncertain");
  assert.equal(await claimBusinessNotification(db, data.id, "retry"), false);
  const conflict = await businessInquiryIntake(signed({ ...data, origin: "website:b2b" }), env, now);
  assert.equal(conflict.status, 409);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM business_inquiries").get().count, 1);
});

test("management scopes personal data and prevents stale or cross-origin updates", async t => {
  const { businessInquiryManagement } = await import("./business-inquiry-management.mjs");
  const { db, data, sqlite } = fixture(t);
  const env = { XJW_B2B_INTAKE_ENABLED: "true", DB: db };
  db.prepare = sql => ({ bind: (...args) => ({
    first: async () => sqlite.prepare(sql).get(...args),
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
  }) });
  await storeBusinessInquiry(db, data);
  const run = (role, init, query = "") => businessInquiryManagement(
    new Request("https://isolated.invalid/api/business-inquiries" + query, init), env,
    async () => role ? { role } : null,
  );
  assert.equal((await run(null)).status, 401);
  assert.equal((await run("viewer")).status, 403);
  const matches = await (await run("sales", undefined, "?q=" + encodeURIComponent(data.businessContact))).json();
  assert.equal(matches.inquiries.length, 1);
  assert.equal(matches.crmDeliveryEnabled, false);
  assert.equal(matches.inquiries[0].crm_delivery_state, "queued");
  assert.equal(matches.inquiries[0].crm_delivery_attempts, 0);
  sqlite.prepare("INSERT INTO business_inquiry_crm_delivery (inquiry_id,state,attempts,claim,last_error) VALUES (?,?,?,?,?)")
    .run(data.id, "held", 8, "private-claim", "private-error");
  const held = await (await run("owner")).json();
  assert.equal(held.inquiries[0].crm_delivery_state, "held");
  assert.equal(held.inquiries[0].crm_delivery_attempts, 8);
  assert.equal(JSON.stringify(held).includes("private-claim"), false);
  assert.equal(JSON.stringify(held).includes("private-error"), false);
  const patch = { method: "PATCH", headers: { origin: "https://isolated.invalid", "content-type": "application/json" },
    body: JSON.stringify({ id: data.id, revision: 0, status: "洽談中", assignee: "業務", notes: "隔離測試" }) };
  assert.equal((await run("sales", { ...patch, headers: { ...patch.headers, origin: "https://untrusted.invalid" } })).status, 403);
  assert.equal((await run("sales", patch)).status, 200);
  assert.equal((await run("sales", patch)).status, 409);
  assert.equal((await (await run("owner", undefined, "?status=" + encodeURIComponent("洽談中"))).json()).inquiries.length, 1);
});

test("additive migration leaves existing ERP records intact and can run twice", t => {
  const sqlite = new DatabaseSync(":memory:");
  t.after(() => sqlite.close());
  sqlite.exec("CREATE TABLE app_records (id TEXT PRIMARY KEY, module TEXT); INSERT INTO app_records VALUES ('isolated-order', 'orders');");
  sqlite.exec(businessInquirySchema);
  sqlite.exec(businessInquirySchema);
  assert.equal(sqlite.prepare("SELECT module FROM app_records WHERE id = 'isolated-order'").get().module, "orders");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM business_inquiries").get().count, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM business_inquiry_drafts").get().count, 0);
});


test("notification changes invalidate stale ERP revisions, including repeated pending cycles and sweeps", async t => {
  const { db, data, sqlite } = fixture(t);
  db.prepare = sql => ({ bind: (...args) => ({
    first: async () => sqlite.prepare(sql).get(...args),
    run: async () => sqlite.prepare(sql).run(...args),
  }) });
  await storeBusinessInquiry(db, data);
  const row = () => sqlite.prepare("SELECT notification_status, revision FROM business_inquiries WHERE id = ?").get(data.id);
  const rev = () => row().revision;
  const now = Date.now();
  assert.equal(rev(), 0);
  assert.equal(await claimBusinessNotification(db, data.id, "first", now), true);
  assert.equal(rev(), 1);
  assert.equal(await finishBusinessNotification(db, data.id, "incorrect", "rejected"), false);
  assert.equal(rev(), 1);
  assert.equal(await finishBusinessNotification(db, data.id, "first", "rejected"), true);
  assert.equal(rev(), 2);
  assert.equal(row().notification_status, "pending");
  const stale = sqlite.prepare("UPDATE business_inquiries SET consultation_status = '洽談中' WHERE id = ? AND revision = 0").run(data.id);
  assert.equal(Number(stale.changes), 0);
  assert.equal(await claimBusinessNotification(db, data.id, "second", now), true);
  assert.equal(await expireBusinessNotification(db, data.id, now + 300001), true);
  assert.equal(rev(), 4);
  assert.equal(await expireBusinessNotification(db, data.id, now + 600000), false);
  assert.equal(rev(), 4);
  const other = { ...data, id: "B2B-" + randomUUID() };
  await storeBusinessInquiry(db, other);
  await claimBusinessNotification(db, other.id, "sweep", now);
  await sweepExpiredBusinessNotifications(db, now + 300001);
  assert.equal(sqlite.prepare("SELECT revision FROM business_inquiries WHERE id = ?").get(other.id).revision, 2);
  assert.equal(rev(), 4);
});
