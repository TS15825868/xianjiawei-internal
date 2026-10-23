# 仙加味免費備援矩陣

原則：新增費用 NT$0；未經人工核准不發布；Meta 三平台未通過端對端驗證不自動回覆；未知結果不得重送。

| 功能 | 主線 | 免費備援 | 狀態 |
|---|---|---|---|
| n8n 唯讀監控 | Render n8n | GitHub Actions | 三條監控已通過 |
| ERP 健康巡檢 | Cloudflare D1 | GitHub Actions 唯讀匯出 | 已通過 |
| 社群 Webhook | n8n | Supabase Edge Function xjw-social-receipt | 函式已部署，Meta 串接未驗收 |
| 第二收件入口 | n8n | Cloudflare Worker／D1 | 程式已存在且端點已部署，驗證門檻仍未達成，故意關閉、不可宣稱可接單 |
| 留言去重 | Supabase PostgreSQL | 唯讀備份與人工接手 | 備份不是可寫交易帳本 |
| AI 客服 | 官方 API | LINE OA／Meta 原生人工客服 | 自動發送保持關閉 |
| 社群排程 | Metricool 免費版 | Meta Business Suite、Threads 原生排程 | 已連結三平台；2026-10-23 查獲撞期與重複已發布文案，必須按遠端 UUID 查驗再變更 |
| ERP／貼文 | Cloudflare Worker＋D1 | GitHub 版本化資料及巡檢 | 只作恢復參考，不可當即時資料庫 |
| 故障檢查 | Render 事件與日誌 | GitHub Actions／Supabase 日誌 | 不代表已配置自動通知 |

## 切換守門

1. 先查主線是否已發送、已排程或有未知結果；未知即停止重送。
2. 同一事件只允許一條發送路徑；共用權威唯一鍵與人工接手狀態。
3. 驗證官方權限、Webhook 簽章、原子去重、並行、重啟及遠端回執，才可開啟自動客服。
4. 貼文必須先完成 16 項檢查及人工核准，且逐平台確認原 UUID。
5. 不觸發付費升級、額外建置分鐘數或新增付費資源。

## 待完成

- Render 免費建置額度恢復後部署最新低記憶體版本並驗證 OOM。
- PostgreSQL TLS 若發生憑證鏈錯誤：先核對 Supabase Connect 正式 Session pooler host、5432、專用 role。Pooler 與直接資料庫可能使用不同憑證鏈；`socialTlsOptions` 提供明確指定 `trustStore: "system"` 的備選模式，只接受此專案已知區域的 Session pooler，使用 Node 系統信任根憑證與完整 hostname 驗證（`rejectUnauthorized:true`），不能改為 `false`、不能自動回退到明文。無法通過真實 `social-tls-preflight.mjs` 即不可啟用收件及回覆。正式密碼／憑證只能存受保護的執行環境，不可寫入 GitHub。
- Supabase 收件函式的 Meta 官方端對端驗證。
- Cloudflare 第二收件入口已存在且停用；仍需 Meta 官方 Webhook 回呼、D1 實際收件、Supabase 主備防重及中斷後安全恢復的端對端驗證。
- Meta／Threads 原生排程及故障通知權限驗證。

本矩陣是現況與切換條件，不表示尚未驗收的備援已正式上線。

## 2026-10-23 正式外部帳號唯讀回讀（非自動發布證據）

本節為當日即時盤點快照，後續操作必須重新讀取 Metricool 正式帳號，不得以快照直接改變排程。

- 仙加味品牌 ID 6889683，已連結 Facebook、Instagram、Threads。
- 先前狹窄視窗（10/23～11/30）取得 16 個物件，僅能說明其 provider 狀態，不可把 PENDING 直接當成已安排發布：其中 **10 個為 `draft:true, autoPublish:false` 的未核准草稿、3 個為 `draft:false, autoPublish:true` 的未來排程、3 個三平台已發布**（此處只統計 Oct 23 起算，因此不包含所有歷史貼文）。
- 10/23 00:13 與 00:23 各發布一次相同風雨提醒文案，疑似未通過正式去重核對；已發布內容不得以不同本地 UUID 誤認為未發布並再次上架。
- 10/26 10:00、10/30 10:00、11/06 10:00 各有兩個不同遠端 UUID 撞期，10/28 09:00 與 10:00 同日兩篇。不得直接刪除未知人工核准狀態的既有貼文。
- 2026-10-01～11-30 再次完整唯讀回讀：**10 月 26 個物件**，13 個已完全發布、10 個未核准草稿（`draft:true`、`autoPublish:false`）、3 個待發布排程（`draft:false`、`autoPublish:true`，分別 10/26、10/28、10/30）；**11 月 6 個物件全是草稿**，並非六篇會自動發出的排程。10 月共見到 35 個 `PUBLISHED` 的平台狀態（11 筆三平台與兩筆單平台），但遠端狀態不等於免費方案計數器，亦未確認帳號當前方案；不得直接推論已超額或自動升級。
- <https://help.metricool.com/main-differences-between-free-and-paid-plans-bl0v9>：官方說明免費版每月最多 20 次**實際發布到社群的次數**，同一貼文跨三平台計三次；草稿和排程未發布前不計數。為避免超額，仍應逐篇比對正式免費版計數器後再啟用排程。
- `src/metricool-sync.js` 已新增內部已知時段及月額度保護，但**內部資料不能替代外部 Metricool 真實排程、使用量和人工核准**。每次由 Work 使用 Connector 創建/更新前必須查現有 UUID 與正式免費使用計數器。
- 本次對 Metricool **只有唯讀查詢**，沒有刪除、變更、發布任何貼文。

## 最終版主備故障切換的驗收條件

1. 主路徑：Meta 官方簽章 Webhook → 完整官方 API 留言歷史 → Supabase PostgreSQL 原子去重與人工接手 → 嚴格產品事實判斷 → 官方平台回覆 ID → ERP 寫回。
2. 備援收件：Supabase Edge Function 第 7 版與 Cloudflare Worker/D1 已建立但均處於安全關閉。Meta 每個 App Webhook 回呼指向哪個單一入口，須由正式 App 設定證據確認；不要把兩個不同網址描述為自動 DNS 故障切換。
3. 備援 AI：免費 AI 額度確實可用時，只產生已驗證事實的短答草稿；不可用則使用 0 推論產品母資料，仍須維持人工審核/發送守門。
4. 共用安全事實：若兩個入口無法同時原子查詢同一個遠端發送回執與人工接手狀態，備援只收件/排隊，不得對客發送。任何回覆結果不明一律停止重試，等待人工查核。
5. 狀態切換：必須實際測試主服務故障、備援收件、恢復時事件對帳、同事件重複 Webhook、並行 Worker、人工作業衝突及中斷恢復，且正式 ERP 看到唯一回執才可啟用。
6. Render 免費建置額度耗盡、n8n TLS 驗證失敗、Meta App/Token 未經官方端對端證實時，繼續預設關閉對客自動回覆；不可因程式測試通過就宣稱「已全自動上線」。
7. 新增費用 NT$0／US$0；所有公開文案、產品與圖片遵守最新仙加味正式資料及人工 16 項審核。

