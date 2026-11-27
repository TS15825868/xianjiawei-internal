import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const knownTestOrderIds = new Set(["XJW20260707111258411131"]);
const sheetFields = {
  id: "訂單編號", receivedAt: "時間", orderStatus: "訂單狀態", source: "來源", amount: "訂單總額",
};
const comparedFields = ["receivedAt", "orderStatus", "paymentStatus", "shippingStatus", "source", "amount"];
const clean = value => String(value ?? "").trim();

function amountInCents(value) {
  const formatted = clean(value).replace(/^(?:NT\$|TWD|\$)\s*/i, "").replace(/\s*元$/, "");
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(formatted)) return null;
  const [integer, decimals = ""] = formatted.replaceAll(",", "").split(".");
  const cents = Number(integer) * 100 + Number(decimals.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

function timestamp(value) {
  const input = clean(value);
  const local = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})[ T]+(?:(上午|下午)\s*)?(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(input);
  if (local) {
    const [, year, month, day, period, hour, minute, second = "00"] = local;
    const h = Number(hour);
    if (period && (h < 1 || h > 12)) return null;
    const hour24 = period ? h % 12 + (period === "下午" ? 12 : 0) : h;
    return timestamp(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${String(hour24).padStart(2, "0")}:${minute}:${second}+08:00`);
  }
  const iso = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.exec(input);
  if (!iso) return null;
  const calendar = new Date(iso[1] + "T00:00:00Z");
  if (!Number.isFinite(calendar.valueOf()) || calendar.toISOString().slice(0, 10) !== iso[1]) return null;
  const millis = Date.parse(input);
  return Number.isFinite(millis) ? millis : null;
}

function columnsFor(headers, fields) {
  if (!Array.isArray(headers) || Object.values(fields).some(label => headers.filter(cell => cell === label).length !== 1)) {
    throw new Error("CRM 工作表必要欄位缺漏或重複");
  }
  return Object.fromEntries(Object.entries(fields).map(([key, label]) => [key, headers.indexOf(label)]));
}

function stateIndex(sheet, label) {
  const states = new Map();
  let missingOrderId = 0;
  if (sheet === undefined) return { states, missingOrderId };
  if (!Array.isArray(sheet)) throw new Error("CRM 狀態工作表格式錯誤");
  const [headers, ...rows] = sheet;
  const { id, status } = columnsFor(headers, { id: "訂單編號", status: label });
  for (const row of rows) {
    if (!Array.isArray(row)) throw new Error("CRM 狀態資料列格式錯誤");
    const key = clean(row[id]);
    if (!key) {
      // Blank spreadsheet rows are harmless; populated rows without an ID cannot be reconciled.
      if (row.some(value => clean(value))) missingOrderId++;
      continue;
    }
    const values = states.get(key) ?? new Set();
    values.add(clean(row[status]));
    states.set(key, values);
  }
  return { states, missingOrderId };
}

function hasStatusConflict({ orderStatus, paymentStatus, shippingStatus }) {
  const cancelled = ["取消", "已取消", "訂單取消"].includes(orderStatus);
  const paid = ["已付款", "已收款", "已入帳", "已匯款"].includes(paymentStatus);
  const shipped = ["已出貨", "已送達", "已取貨"].includes(shippingStatus);
  // A cancellation after payment or fulfillment needs review (e.g. refund or return).
  return cancelled && (paid || shipped);
}

function add(index, id, order) {
  const entries = index.get(id) ?? [];
  entries.push(order);
  index.set(id, entries);
}

export function reconcileCrmOrders(sheet, erpOrders, { payments, shipments, testOrderIds = [] } = {}) {
  if (![sheet, erpOrders, testOrderIds].every(Array.isArray)) throw new Error("對帳輸入必須使用陣列");
  const testIds = new Set([...knownTestOrderIds, ...testOrderIds.map(clean).filter(Boolean)]);
  const [headers, ...rows] = sheet;
  const columns = columnsFor(headers, sheetFields);
  const paymentIndex = stateIndex(payments, "核對狀態");
  const shipmentIndex = stateIndex(shipments, "出貨狀態");
  const pay = paymentIndex.states;
  const ship = shipmentIndex.states;
  const report = {
    excludedTest: 0, excludedErpTest: 0, nonExcludedCrmRows: 0, nonExcludedErpRows: 0,
    orphanPaymentIds: 0, orphanShipmentIds: 0,
    missingPaymentOrderId: paymentIndex.missingOrderId, missingShipmentOrderId: shipmentIndex.missingOrderId,
    malformed: 0, malformedErp: 0, erpWithoutCrmId: 0,
    duplicate: 0, duplicateCrm: 0, duplicateErp: 0, unmatched: 0, erpOnly: 0, matched: 0, different: 0, blocked: 0,
    missingCrmSource: 0, missingErpSource: 0, conflictingPayment: 0, conflictingShipping: 0,
    missingCrmPaymentStatus: 0, missingCrmShippingStatus: 0,
    crmStatusConflicts: 0, erpStatusConflicts: 0,
    differences: Object.fromEntries(comparedFields.map(field => [field, 0])),
    unavailable: Object.fromEntries(comparedFields.map(field => [field, 0])),
  };
  const crm = new Map();
  for (const row of rows) {
    if (!Array.isArray(row)) throw new Error("CRM 訂單資料列格式錯誤");
    if (!row.some(value => clean(value))) continue;
    const get = key => clean(row[columns[key]]);
    const id = get("id");
    if (testIds.has(id)) { report.excludedTest++; continue; }
    report.nonExcludedCrmRows++;
    const order = {
      receivedAt: timestamp(get("receivedAt")), orderStatus: get("orderStatus"),
      source: get("source"), amount: amountInCents(get("amount")),
      paymentStatus: pay.get(id)?.size === 1 ? [...pay.get(id)][0] : "",
      shippingStatus: ship.get(id)?.size === 1 ? [...ship.get(id)][0] : "",
    };
    if (!order.source) report.missingCrmSource++;
    if (!order.paymentStatus) report.missingCrmPaymentStatus++;
    if (!order.shippingStatus) report.missingCrmShippingStatus++;
    const paymentConflict = (pay.get(id)?.size ?? 0) > 1;
    const shippingConflict = (ship.get(id)?.size ?? 0) > 1;
    if (paymentConflict) report.conflictingPayment++;
    if (shippingConflict) report.conflictingShipping++;
    const invalid = !id || order.receivedAt === null || !order.orderStatus || order.amount === null;
    if (invalid) report.malformed++;
    const statusConflict = hasStatusConflict(order);
    if (statusConflict) report.crmStatusConflicts++;
    if (id) add(crm, id, { ...order, blocked: invalid || paymentConflict || shippingConflict || statusConflict });
  }
  const erp = new Map();
  for (const row of erpOrders) {
    if (!row || typeof row !== "object" || Array.isArray(row)) { report.malformedErp++; continue; }
    const id = clean(row.crmOrderId);
    if (testIds.has(id) || row.isTest === true) { report.excludedErpTest++; continue; }
    report.nonExcludedErpRows++;
    if (!id) { report.erpWithoutCrmId++; continue; }
    const order = {
      receivedAt: timestamp(row.receivedAt), orderStatus: clean(row.orderStatus), source: clean(row.source),
      amount: amountInCents(row.amount), paymentStatus: clean(row.paymentStatus), shippingStatus: clean(row.shippingStatus),
    };
    if (!order.source) report.missingErpSource++;
    const invalid = order.receivedAt === null || !order.orderStatus || order.amount === null;
    if (invalid) report.malformedErp++;
    const statusConflict = hasStatusConflict(order);
    if (statusConflict) report.erpStatusConflicts++;
    add(erp, id, { ...order, blocked: invalid || statusConflict });
  }
  for (const id of new Set([...crm.keys(), ...erp.keys()])) {
    const left = crm.get(id) ?? [];
    const right = erp.get(id) ?? [];
    if (left.length > 1) report.duplicateCrm++;
    if (right.length > 1) report.duplicateErp++;
    if (left.length > 1 || right.length > 1) { report.duplicate++; continue; }
    if (left[0]?.blocked || right[0]?.blocked) { report.blocked++; continue; }
    if (!right.length) { report.unmatched++; continue; }
    if (!left.length) { report.erpOnly++; continue; }
    let changed = false;
    let unavailable = false;
    for (const field of comparedFields) {
      if (left[0][field] === "" || right[0][field] === "") {
        report.unavailable[field]++;
        unavailable = true;
      } else if (left[0][field] !== right[0][field]) {
        report.differences[field]++;
        changed = true;
      }
    }
    if (changed) report.different++;
    else if (unavailable) report.blocked++;
    else report.matched++;
  }
  // Auxiliary rows with no CRM master must not silently disappear from reconciliation.
  for (const id of pay.keys()) if (!testIds.has(id) && !crm.has(id)) report.orphanPaymentIds++;
  for (const id of ship.keys()) if (!testIds.has(id) && !crm.has(id)) report.orphanShipmentIds++;
  // A zero-difference empty dataset is not evidence of successful order synchronization.
  const exceptions = report.malformed + report.malformedErp + report.erpWithoutCrmId +
    report.duplicate + report.unmatched + report.erpOnly + report.different + report.blocked +
    report.orphanPaymentIds + report.orphanShipmentIds + report.missingPaymentOrderId + report.missingShipmentOrderId;
  report.coverage = report.matched > 0 ? (exceptions ? "matched_with_exceptions" : "matched_no_detected_exceptions")
    : (report.nonExcludedCrmRows || report.nonExcludedErpRows || exceptions ? "no_matched_records" : "no_non_test_records");
  // Read-only field equality cannot certify live ingestion, money received, or a conversion.
  report.liveOrderSyncVerified = false;
  report.paidRevenueVerified = false;
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length < 4 || process.argv.length > 5) {
    throw new Error("Usage: node crm-order-reconcile.mjs CRM_ROWS_JSON ERP_ORDER_PROJECTION_JSON [CRM_AUXILIARY_JSON]");
  }
  const [sheet, erpOrders, auxiliary] = process.argv.slice(2).map(path => JSON.parse(readFileSync(path, "utf8")));
  process.stdout.write(JSON.stringify(reconcileCrmOrders(sheet, erpOrders, auxiliary)) + "\n");
}
