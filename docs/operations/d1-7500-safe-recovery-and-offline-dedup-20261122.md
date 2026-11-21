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
