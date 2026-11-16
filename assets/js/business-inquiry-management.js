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

function card(record) {
  const article = element("article");
  article.className = "loading-card";
  article.append(element("h2", record.category + "｜" + record.id));
  article.append(element("p", record.business_contact), element("p", record.details));
  article.append(element("p", [record.source, record.origin, record.received_at].filter(Boolean).join(" · ")));
  const delivery = { pending: "待通知", sending: "通知中", sent: "已通知", uncertain: "送達待查" };
  article.append(element("p", "業主通知：" + (delivery[record.notification_status] ?? "待確認")));
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
  article.append(form);
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
    results.append(...page.inquiries.map(card));
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
