import assert from "node:assert/strict";
import { backup, DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  businessInquirySchema, claimBusinessNotification, finishBusinessNotification, storeBusinessInquiry,
} from "./business-inquiries.mjs";

function fixture(t) {
  const sqlite = new DatabaseSync(":memory:");
  t.after(() => sqlite.close());
  sqlite.exec(businessInquirySchema);
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
