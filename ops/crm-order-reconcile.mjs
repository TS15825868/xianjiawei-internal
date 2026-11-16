import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const knownTestOrderIds = new Set(["XJW20260707111258411131"]);
const sheetFields = {
  id: "訂單編號",
  receivedAt: "時間",
  orderStatus: "訂單狀態",
  source: "來源",
  amount: "訂單總額",
};

export function reconcileCrmOrders(sheet, erpOrders) {
  const [headers, ...rows] = sheet;
  const columns = Object.fromEntries(
    Object.entries(sheetFields).map(([key, label]) => [key, headers?.indexOf(label) ?? -1]),
  );
  if (Object.values(columns).includes(-1)) throw new Error("CRM 訂單主表缺少必要欄位");
  const report = { excludedTest: 0, malformed: 0, duplicate: 0, unmatched: 0, matched: 0, different: 0 };
  const crm = new Map();
  for (const row of rows) {
    if (!row.some(value => value !== "" && value != null)) continue;
    const get = key => String(row[columns[key]] ?? "").trim();
    const id = get("id");
    if (knownTestOrderIds.has(id)) {
      report.excludedTest++;
      continue;
    }
    const amountText = get("amount");
    const amount = Number(amountText);
    if (!id || !get("receivedAt") || !get("orderStatus") || !amountText ||
        !Number.isFinite(amount) || amount < 0) {
      report.malformed++;
      continue;
    }
    const order = { amount, orderStatus: get("orderStatus"), source: get("source") };
    const entries = crm.get(id) ?? [];
    entries.push(order);
    crm.set(id, entries);
  }
  const erp = new Map();
  for (const order of erpOrders) {
    if (!order.crmOrderId) continue;
    const entries = erp.get(order.crmOrderId) ?? [];
    entries.push(order);
    erp.set(order.crmOrderId, entries);
  }
  for (const [id, entries] of crm) {
    const existing = erp.get(id) ?? [];
    if (entries.length !== 1 || existing.length > 1) {
      report.duplicate++;
    } else if (existing.length === 0) {
      report.unmatched++;
    } else if (Object.keys(entries[0]).every(key => entries[0][key] === existing[0][key])) {
      report.matched++;
    } else {
      report.different++;
    }
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 4) throw new Error("Usage: node crm-order-reconcile.mjs CRM_ROWS_JSON ERP_ORDER_PROJECTION_JSON");
  const [sheet, erpOrders] = process.argv.slice(2).map(path => JSON.parse(readFileSync(path, "utf8")));
  process.stdout.write(JSON.stringify(reconcileCrmOrders(sheet, erpOrders)) + "\n");
}
