# D1 免費額度保護與圖片稽核操作守則（2026-11-22）

## 已確認的耗量來源

Cloudflare D1 Insights（2026-11-21 00:00–2026-11-22 00:00 UTC，抽樣估計）：
- 單次 `WITH latest_pending ... exact_content ...` 圖文重複比對：22,945,428 rows_read / 1 execution。
- 單次 `WITH latest ... social_post_quality_reviews ...` 歷史 SHA 比對：3,783,386 rows_read / 1 execution。
- 兩者合計 26,728,814 estimated rows_read。此值為抽樣估計，不等於精確帳務讀取量。

**禁止在正式 D1 直接重跑以上兩類全表交叉比對 SQL。** 此規則不代表停用正常發布或交易。

## 執行原則

1. 先使用 Cloudflare D1 Insights `GET /accounts/{account_id}/d1/insights/queries` 依 `rows_read` 排序定位高耗量查詢；不以反覆正式 SQL 試錯。
2. 圖片檔案 bytes、SHA-256、感知雜湊與視覺去重，優先使用 GitHub 已存在的正式檔案及既有本地稽核產物；只對已縮小的候選集合比對。
3. 需要正式 D1 查詢時，先用小範圍、索引可用的 `WHERE`、`LIMIT` 與 `EXPLAIN QUERY PLAN` 驗證；`LIMIT` 本身不保證減少掃描。
4. 對 `social_post_quality_reviews` 的最新審核紀錄查詢，先盤點索引及 `post_id`、`reviewed_at`、`created_at` 條件，避免在逐列相關子查詢內反覆排序；索引更動須先隔離測試與備份驗證。
5. 若當日額度不足，停止非必要稽核；交易、審核、發布仍維持既有安全守門員，不切換至未同步的備援寫入。
6. 不因提高額度而購買或升級服務，也不以新增同帳戶 D1 資料庫假設額度倍增。
7. 每次稽核紀錄時間窗、SQL 摘要、estimated rows_read、是否使用正式 D1，避免重複執行昂貴查詢。

## 待驗收

- 查明上述 SQL 是人工稽核、GitHub Actions 還是 Worker 發出，才能對真正執行點加上硬性保護。
- 查詢索引及執行計畫，建立同等結果但讀取量明顯較低的版本。
- B2B 清理降頻 PR 必須獨立通過既有發布設定檢查，不能為了通過 CI 擅自停用正式 B2B。
- 維持 D1 單一正式寫入來源；Supabase 等備援只能在同步、權限及資料一致性驗收後啟用。
