# 仙加味免費備援矩陣

原則：新增費用 NT$0；未經人工核准不發布；Meta 三平台未通過端對端驗證不自動回覆；未知結果不得重送。

| 功能 | 主線 | 免費備援 | 狀態 |
|---|---|---|---|
| n8n 唯讀監控 | Render n8n | GitHub Actions | 三條監控已通過 |
| ERP 健康巡檢 | Cloudflare D1 | GitHub Actions 唯讀匯出 | 已通過 |
| 社群 Webhook | n8n | Supabase Edge Function xjw-social-receipt | 函式已部署，Meta 串接未驗收 |
| 第二收件入口 | n8n | Cloudflare Worker／D1 | 尚未實作，不可啟用 |
| 留言去重 | Supabase PostgreSQL | 唯讀備份與人工接手 | 備份不是可寫交易帳本 |
| AI 客服 | 官方 API | LINE OA／Meta 原生人工客服 | 自動發送保持關閉 |
| 社群排程 | Metricool 免費版 | Meta Business Suite、Threads 原生排程 | 需逐平台驗證，不得重複排程 |
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
- Cloudflare 第二收件入口實作及主備防重驗證。
- Meta／Threads 原生排程及故障通知權限驗證。

本矩陣是現況與切換條件，不表示尚未驗收的備援已正式上線。
