import fs from "node:fs";

const file = "config/ecosystem-authority-v20260910.json";
const data = JSON.parse(fs.readFileSync(file, "utf8"));
const must = (ok, message) => { if (!ok) throw new Error(message); };

must(data.authority === "user-confirmed-current", "ecosystem authority 必須是 user-confirmed-current");
must(data.brand?.publicName === "仙加味", "公開主品牌必須是仙加味");

must(data.brandNaming?.publicBrandName === "仙加味", "品牌命名權威必須是仙加味");
must(data.brandNaming?.googleDesiredPublicName === "仙加味", "Google 最終公開名稱必須是仙加味");
must(data.brandNaming?.guiluRole === "龜鹿只作為產品／系列名稱，不再綁在品牌名稱後面", "龜鹿不得重新綁回品牌名稱");
must(data.funnel?.lineCommunity?.name === "仙加味｜日常交流", "LINE 社群名稱不得再使用仙加味・龜鹿");

const hours = data.serviceHours || {};
must(hours.storefront === "週一至週五 10:30－20:00", "店面營業時間回退");
must(hours.closed === "週六、週日店休", "週末店休規則回退");
must(hours.website === "24 小時可瀏覽", "官網24小時可瀏覽規則缺失");
must(String(hours.lineOA || "").startsWith("24 小時可留言"), "LINE 24小時可留言規則缺失");

const funnel = data.funnel || {};
must(funnel.lineOA?.id === "@762jybnm", "LINE OA ID 回退");
must(funnel.lineOA?.url === "https://lin.ee/sHZW7NkR", "LINE OA URL 回退");
must(funnel.lineOA?.primary === true && funnel.lineOA?.defaultCta === true, "LINE OA 必須維持主要預設CTA");
must(funnel.lineCommunity?.notTransactionCenter === true, "LINE 社群不得成為交易中心");
must(funnel.lineCommunity?.defaultCta === false && funnel.lineCommunity?.optionalOnly === true, "LINE 社群只能選擇性提及，不得成為預設CTA");
must(funnel.lineCommunity?.noPersonalOrTransactionData === true, "LINE 社群不得承接個資或交易資料");
must(data.socialAutomation?.allCommercialHandoff === "LINE OA", "商業需求必須統一交給 LINE OA");
must(data.socialAutomation?.neverRouteTransactionsToCommunity === true, "不得把交易需求導向 LINE 社群");

const gb = data.googleBusiness || {};
const allowed = new Set(["verification_processing","verified","verification_failed","suspended","unknown"]);
must(allowed.has(gb.managementStatus), "Google 商家狀態不在允許集合");
must(gb.desiredAfterVerification?.regularHours === "週一至週五 10:30－20:00；週六、週日休息", "Google 商家目標營業時間回退");
must(gb.desiredFinalPublicName === "仙加味", "Google 最終公開名稱必須是仙加味");
if (gb.managementStatus === "verification_processing") {
  must(gb.mutationPolicy === "freeze_until_verification_complete", "Google 驗證處理中必須凍結商家變更");
  must(data.systemRules?.googleBusinessPendingNoMutation === true, "Google 驗證處理中防寫入規則未啟用");
  must(Array.isArray(gb.pendingTasks) && gb.pendingTasks.length >= 3, "Google 驗證後待辦未完整保存");
}

console.log("PASS：仙加味主品牌、LINE OA導流、社群非交易、服務時間與Google最終名稱權威一致。");
