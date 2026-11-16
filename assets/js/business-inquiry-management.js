"use strict";
const endpoint = "/api/business-inquiries";
const states = ["待洽談", "洽談中", "待報價", "已報價", "合作成立", "暫緩", "未成立"];
const search = document.querySelector("#search");
const filter = document.querySelector("#status");
const results = document.querySelector("#results");
const message = document.querySelector("#message");
const more = document.querySelector("#more");
let nextOffset = null;
let activeQuery = "";
let requestVersion = 0;

function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function options(select, selected) {
  for (const state of states) select.add(new Option(state, state, false, selected === state));
}

function field(form, name, control) {
  const label = element("label", name + " ");
  label.append(control);
  form.append(label);
}

function notificationPanel(record, controls, save) {
  const panel = element("section");
  const labels = { pending: "待通知", sending: "通知中", sent: "LINE 已受理或人工確認", uncertain: "送達待查" };
  const actions = { retry: "重試業主通知", "resolve-sent": "已確認通知成功", "resolve-pending": "已確認未成功，回待通知" };
  function render() {
    panel.replaceChildren(element("p", "業主通知：" + (labels[record.notification_status] ?? "待確認")));
    const choices = record.notification_status === "pending" && controls.retry ? ["retry"]
      : record.notification_status === "uncertain" && controls.resolve ? ["resolve-sent", "resolve-pending"] : [];
    if (!choices.length) {
      if (record.notification_status === "pending" && controls.resolve) panel.append(element("p", "通知重試尚未安全啟用。"));
      return;
    }
    const form = element("form");
    const action = element("select");
    for (const value of choices) action.add(new Option(actions[value], value));
    const reason = element("textarea");
    reason.required = true;
    reason.maxLength = 500;
    reason.placeholder = "填寫查核證據或重試原因（勿填入金鑰）";
    const submit = element("button", "確認通知處理");
    submit.className = "btn";
    const status = element("p");
    status.setAttribute("role", "status");
    if (record.notification_status === "uncertain") form.append(element("p", "結果不明不得直接重送。取得證據後才可確認處理。"));
    field(form, "通知處理", action);
    field(form, "查核原因", reason);
    form.append(submit, status);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (save.disabled || !reason.value.trim()) return;
      if (!window.confirm(actions[action.value] + "？")) return;
      submit.disabled = true;
      save.disabled = true;
      try {
        const response = await fetch(endpoint, { method: "PATCH", headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: record.id, revision: record.revision, notificationAction: action.value, reason: reason.value.trim() }) });
        if (!response.ok) {
          status.textContent = "尚未確認結果。請重新搜尋並核對通知狀態，不要直接重試。";
          return;
        }
        const receipt = await response.json();
        if (receipt.id !== record.id || !Number.isSafeInteger(receipt.revision) || !Object.hasOwn(labels, receipt.notificationStatus)) {
          status.textContent = "回執不完整，請重新搜尋並核對。";
          return;
        }
        record.revision = receipt.revision;
        record.notification_status = receipt.notificationStatus;
        render();
      } catch {
        status.textContent = "結果未確認，請重新搜尋並核對，不要直接重試。";
      } finally {
        save.disabled = false;
      }
    });
    panel.append(form);
  }
  render();
  return panel;
}

function card(record, controls = {}) {
  const article = element("article");
  article.className = "loading-card";
  article.append(element("h2", record.category + "｜" + record.id));
  article.append(element("p", record.business_contact), element("p", record.details));
  article.append(element("p", [record.source, record.origin, record.received_at].filter(Boolean).join(" · ")));
  const form = element("form");
  const status = element("select");
  options(status, record.consultation_status);
  const assignee = element("input");
  assignee.maxLength = 100;
  assignee.value = record.assignee;
  const notes = element("textarea");
  notes.maxLength = 2000;
  notes.value = record.consultation_notes;
  const save = element("button", "儲存");
  save.className = "btn primary";
  const feedback = element("p");
  feedback.setAttribute("role", "status");
  field(form, "狀態", status);
  field(form, "負責人", assignee);
  field(form, "洽談備註", notes);
  form.append(save, feedback);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    save.disabled = true;
    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: record.id, revision: record.revision, status: status.value, assignee: assignee.value, notes: notes.value }),
      });
      if (response.status === 409) {
        feedback.textContent = "資料已被更新。請重新搜尋並核對目前內容。";
        return;
      }
      if (!response.ok) throw new Error();
      record.revision = (await response.json()).revision;
      feedback.textContent = "已儲存。";
    } catch {
      feedback.textContent = "無法儲存，請確認登入權限或稍後再試。";
    } finally {
      save.disabled = false;
    }
  });
  article.append(notificationPanel(record, controls, save), form);
  return article;
}

async function load(offset, query) {
  const version = ++requestVersion;
  const params = new URLSearchParams(query);
  params.set("offset", offset);
  message.textContent = "讀取中…";
  more.hidden = true;
  try {
    const response = await fetch(endpoint + "?" + params);
    if (!response.ok) throw new Error(String(response.status));
    const page = await response.json();
    if (version !== requestVersion) return;
    if (offset === 0) results.replaceChildren();
    results.append(...page.inquiries.map(record => card(record, page.notificationControls ?? {})));
    nextOffset = page.nextOffset;
    more.hidden = nextOffset === null;
    message.textContent = results.childElementCount ? "" : "沒有符合條件的合作紀錄。";
  } catch (error) {
    if (version !== requestVersion) return;
    results.replaceChildren();
    message.textContent = ["401", "403"].includes(error.message)
      ? "請登入具備商家合作管理權限的帳號。" : "目前無法讀取合作紀錄。";
  }
}

options(filter);
search.addEventListener("submit", event => {
  event.preventDefault();
  activeQuery = new URLSearchParams({ q: document.querySelector("#keyword").value, status: filter.value }).toString();
  void load(0, activeQuery);
});
more.addEventListener("click", () => { if (nextOffset !== null) void load(nextOffset, activeQuery); });
void load(0, activeQuery);
