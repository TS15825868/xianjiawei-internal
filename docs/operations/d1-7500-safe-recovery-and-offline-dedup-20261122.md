# D1 7500 額度耗盡後的安全恢復與離線去重（2026-11-22）

## 即時確認
- 正式 Cloudflare D1 曾回傳 7500（免費每日讀取列數超額）；在額度恢復前，不重試正式資料庫品質掃描。
- D1 Insights（唯讀管理 API、不是 SQL）顯示兩筆一次性歷史去重 SQL：22,945,428 + 3,783,386 = 26,728,814 estimated rows read。並非證據足夠指向每分鐘的 Worker Cron，不可誤判。
- Cloudflare 官方規則：每日免費額度於 **00:00 UTC = 台灣時間 08:00** 重置；超額期間查詢失敗，原資料不受影響。來源：https://developers.cloudflare.com/d1/platform/pricing/ 及 https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/
- 不增加費用、不自動發布、不將 503/7500 當作內容品質不合格或客戶資料不存在。

## 安全離線比對（不消耗 D1）
既有**已取得、已授權且隔離儲存**的社群資料匯出應僅保留：
- posts: id、status、title、copy、image_url。
- reviews: id、post_id、image_sha256、created_at 或 reviewed_at。

範例格式：
```json
{
  "posts": [{"id":"example-post","status":"pending_review","title":"範例","copy":"範例","image_url":"https://example.invalid/a.jpg"}],
  "reviews": [{"id":"example-review","post_id":"example-post","image_sha256":"","reviewed_at":"2026-11-22T00:00:00Z"}]
}
```
使用本機或隔離 CI（不要提交真實匯出到 Git）：
```sh
node --test tools/audit-social-dedup-offline.test.mjs
node tools/audit-social-dedup-offline.mjs /secure/path/sanitized-social-export.json > /secure/path/dedup-candidates.json
```
只回傳貼文 ID、碰撞類型與證據缺口，不回傳產品文案或圖片地址。此工具以雜湊索引比對候選（不使用 D1 CROSS JOIN），不判定語意、感知圖片相似度、原圖授權或最終合格。**零碰撞不等於發布核准**。

## 額度恢復後的最低限度驗證
1. 優先讀取 Cloudflare D1 Insights 及帳戶使用量（管理 API），確認沒有新的高耗量查詢，禁止執行舊版 2,295 萬／378 萬列 SQL。
2. 僅在 00:00 UTC 重置後，採小範圍、索引可用的查詢；先做一次最低成本的現況驗證。重複 7500 立即熔斷，不進行輪詢。
3. 使用既有備份／隔離還原流程驗證完整性，不因測試方便對正式 D1 寫入、清庫或遷移。
4. LINE、B2B、CRM、社群各回執獨立驗證。B2B intake 維持啟用，通知重試與 CRM 自動轉送仍維持既有停用狀態。
5. 僅恢復受當前審核授權保護的原本流程；不得因 D1 恢復自動啟用草稿發布或「補發」。
6. Metricool 8 篇草稿與真正排程/已發布分開核對；外部免費月額度未知時不可新增排程。
7. 對外報告務必區分「資料庫恢復」、「品質通過」、「主排程成功」、「三平台回執」四個不同證據。

## 尚待證明
- 真正可用、可隔離還原的正式備份。
- 完整匯出中 latest quality review 的時間戳一致性及歷史圖片資產比對。
- D1 低成本查詢的執行計畫與主站線上 E2E 驗收。
- LINE 進線、試喝、訂單、成交與回購的真實轉換證據。

以上證據缺失時，維持待核對，不宣稱已結案。

## 2026-11-24 安全閘門實際修復（承接，不重跑正式 D1）

- `ai-quality-rollout.yml` 已改為 **push 只執行離線 AI 審核測試**。正式 D1 唯讀稽核只有手動勾選 `allow_production_d1_scan` 才執行；建表則須另外明確勾選 `allow_production_schema_apply`，缺任何必要授權即不執行正式 SQL。
- 正式 SQL 前先使用既有 `tools/check-d1-free-budget-before-export.mjs` 核對 Cloudflare 官方 D1 Insights 帳戶級用量；資料過期、不完整、或超過原保守預留門檻時直接失敗，不嘗試 D1 遠端查詢。
- `metricool-free-evidence.yml` 與 `sync-social-schedule-candidates.yml` 亦已在原有正式 D1 SQL 之前增加相同免費用量閘門，保留既有來源觸發及業務流程；不是新的每小時 D1 掃描。
- AI 測試實際成功回執：[GitHub Actions 45215922447](https://github.com/TS15825868/xianjiawei-internal/actions/runs/45215922447)。該次 `push` 的 D1 預算查詢、增量建表、資料讀取與 artifact 上傳步驟均 `skipped`；不得把此來源測試當作正式 D1 全庫驗收。
- Metricool 回填與候選同步的新增預算閘門已提交 GitHub 並讀回原始碼，但截至本次紀錄未另外觸發正式 D1 工作流。保留必要時的獨立驗收，不為驗收耗用生產 SQL 或新增費用。
- 本次三個修正的程式提交：`9dad8505`、`90684256`、`542b6e6d`。保留三套正式 main 版本順序，不將過時的 `ef7a6044` 當成新的 ERP HEAD。

## 2026-11-24 三項遺留建表觸發補強（已實際提交與測試）

- `prepare-ai-delegated-publication-d1.yml`、`prepare-line-handoff-d1.yml`、`prepare-line-receipt-d1.yml` 原先均在 workflow 檔案 push 時可連線至正式 D1 執行建表或讀回。已改為 push 只執行既有離線檢查；必須透過 GitHub `workflow_dispatch` 明確勾選 `allow_production_schema_apply=true` 才能觸發正式資料庫操作，預設 false。
- 以上三項正式 D1 作業在任何遠端操作前，額外檢查 `tools/check-d1-free-budget-before-export.mjs` 的官方 Insights 免費帳戶級額度與保留量；缺少憑證、額度不足、資料過期或不完整即 fail-closed。手動授權只是必要條件，並非准許新增費用或保證無停機風險。
- 正式提交：委任發布 `91273959`、LINE 人工接手 `876ca720`、LINE 備援收件 `2fb98e15`。三項 `push` GitHub Actions [45217977554](https://github.com/TS15825868/xianjiawei-internal/actions/runs/45217977554)、[45218061483](https://github.com/TS15825868/xianjiawei-internal/actions/runs/45218061483)、[45218120018](https://github.com/TS15825868/xianjiawei-internal/actions/runs/45218120018) 均 SUCCESS；實際遠端 D1 操作步驟均 SKIPPED。
- 新增離線保護回歸測試 `ops/tests/test-d1-unattended-workflow-guards.mjs`，監督上述三項建表、AI 品質審核雙授權、Metricool 證據回填與貼文候選同步的正式 D1 額度門檻；`d1-read-budget-offline.yml` 已將相關流程變更加入 CI 觸發，避免日後恢復無人值守正式 D1 寫入。提交 `8b6e4a82`、`8841447f`。
- 離線 CI [45218793523](https://github.com/TS15825868/xianjiawei-internal/actions/runs/45218793523) SUCCESS，包括新加安全閘門回歸測試；沒有動正式 D1。這些是**來源安全/CI 驗收**，不是新版完整 SQL 備份、隔離還原、B2B CRM Web App 或社群發布的正式完成證據。
- 後續仍要處理：新版完整 D1 備份與隔離還原、獨立 B2B Apps Script 接收器簽章驗證、歷史媒體缺口及 46 篇待審去重與授權；不得因本次守門員測試通過而自動開啟 CRM 發送或社群發布。
