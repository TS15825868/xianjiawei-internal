import assert from "node:assert/strict";
import { test } from "node:test";
import { reconcileCrmOrders } from "./crm-order-reconcile.mjs";

const headers = ["時間", "訂單編號", "訂單狀態", "來源", "訂單總額"];
const local = "2026/11/16 下午 4:30:00";
const utc = "2026-11-16T08:30:00Z";
const row = (id, ...override) => [local, id, "待確認", "LINE", "NT$1,200.50"].map((v, i) => override[i] ?? v);
const order = id => ({ crmOrderId: id, receivedAt: utc, orderStatus: "待確認", source: "LINE", amount: 1200.5, paymentStatus: "待匯款", shippingStatus: "待出貨" });
const auxiliary = (...ids) => ({
  payments: [["訂單編號", "核對狀態"], ...ids.map(id => [id, "待匯款"])],
  shipments: [["訂單編號", "出貨狀態"], ...ids.map(id => [id, "待出貨"])],
});

test("matches equivalent Taiwan and UTC timestamps and canonical amounts", () => {
  assert.equal(reconcileCrmOrders([headers, row("A")], [order("A")], auxiliary("A")).matched, 1);
});

test("counts both directions, two-sided duplicates and explicit test exclusions", () => {
  const marker = "XJW20260707111258411131";
  const result = reconcileCrmOrders(
    [headers, row("A"), row("B"), row("B"), row(marker)],
    [order("C"), order("D"), order("D"), order(marker), { ...order("example"), isTest: true }, { id: "manual" }],
  );
  assert.deepEqual(
    [result.unmatched, result.erpOnly, result.duplicateCrm, result.duplicateErp, result.excludedTest, result.excludedErpTest, result.erpWithoutCrmId],
    [1, 1, 1, 1, 1, 2, 1],
  );
  assert.ok(!JSON.stringify(result).includes(marker));
});

test("counts each diverging field without conflating payment and shipment", () => {
  const result = reconcileCrmOrders([headers, row("A")], [{
    ...order("A"), receivedAt: "2026-11-16T08:31:00Z", orderStatus: "取消", source: "門市",
    amount: 100, paymentStatus: "已收款", shippingStatus: "已出貨",
  }], auxiliary("A"));
  assert.equal(result.different, 1);
  assert.deepEqual(Object.values(result.differences), [1, 1, 1, 1, 1, 1]);
});

test("holds missing and conflicting evidence; never treats malformed rows as safe", () => {
  const options = auxiliary("A", "B", "C");
  options.payments.push(["C", "已收款"]);
  const records = [
    row("A", local, "A", "待確認", ""),
    row("B", "2026/2/30 11:22:00", "B", "待確認", "LINE", "1,23"),
    row("C"),
  ];
  const result = reconcileCrmOrders([headers, ...records], ["A", "B", "C"].map(order), options);
  assert.deepEqual([result.blocked, result.malformed, result.missingCrmSource, result.conflictingPayment, result.unavailable.source], [3, 1, 1, 1, 1]);
  assert.throws(() => reconcileCrmOrders([[...headers, "訂單編號"]], []), /欄位/);
});
