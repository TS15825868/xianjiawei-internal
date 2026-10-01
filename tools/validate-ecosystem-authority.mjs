import fs from "node:fs";

const file = "config/ecosystem-authority-v20260910.json";
const data = JSON.parse(fs.readFileSync(file, "utf8"));
const must = (ok, message) => { if (!ok) throw new Error(message); };

must(data.authority === "user-confirmed-current", "ecosystem authority 必須是 user-confirmed-current");
must(data.brand?.publicName === "仙加味", "公開主品牌必須是仙加味");

const hours = data.serviceHours || {};
must(hours.storefront === "週一至週五 10:30－20:00", "店面營業時間回退");
must(hours.closed === "週六、週日店休", "週末店休規則回退");
must(hours.website === "24 小時可瀏覽", "官網24小時可瀏覽規則缺失");
must(String(hours.lineOA || "").startsWith("24 小時可留言"), "LINE 24小時可留言規則缺失");

const gb = data.googleBusiness || {};
const allowed = new Set(["verification_processing","verified","verification_failed","suspended","unknown"]);
must(allowed.has(gb.managementStatus), "Google 商家狀態不在允許集合");
must(gb.desiredAfterVerification?.regularHours === "週一至週五 10:30－20:00；週六、週日休息", "Google 商家目標營業時間回退");
if (gb.managementStatus === "verification_processing") {
  must(gb.mutationPolicy === "freeze_until_verification_complete", "Google 驗證處理中必須凍結商家變更");
  must(data.systemRules?.googleBusinessPendingNoMutation === true, "Google 驗證處理中防寫入規則未啟用");
  must(Array.isArray(gb.pendingTasks) && gb.pendingTasks.length >= 3, "Google 驗證後待辦未完整保存");
}

console.log("PASS：服務時間權威一致；Google 商家驗證中狀態有防寫入與驗證後待辦。");
