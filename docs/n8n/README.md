# 仙加味 n8n 長期版自動化

更新：2026-09-02

## 原則

n8n 作為仙加味的旁路自動化與協調層，不取代目前正式運作的 LINE OA Webhook、Cloudflare Worker、D1、GitHub main 或 Render 既有正式服務。

目前維持四條工作流：

1. LINE OA 健康監控
2. 已人工審核貼文的發布串接
3. 產品母資料 AI / GEO 一致性檢查
4. 官網／LINE OA／GitHub Pages 系統健康總監控

## 目前正式 n8n 執行環境

- Render Web Service：`https://xianjiawei-n8n-longterm.onrender.com`
- Service：`xianjiawei-n8n-longterm`
- Region：Singapore
- Plan：Free
- Runtime：Node
- n8n：2.35.7
- 程式來源：`xianjiawei-internal/main/n8n-runtime/`
- Start：單純 `n8n start`，正式啟動時不再重複匯入 workflow。
- 長期 PostgreSQL：Supabase 專案 `xianjiawei`
- Workflow JSON 可重建來源：GitHub `docs/n8n/`

舊 Render `xianjiawei-n8n` 暫時保留作回復點；正式排程已切到 longterm。舊 Render 免費 Postgres 不再作為正式 n8n 持久化來源。

## 資料安全邊界

- n8n PostgreSQL 只保存 n8n 自身執行所需資料，不取代仙加味 ERP／Cloudflare D1 正式營運資料。
- 客戶、訂單、付款、成本、庫存、拜訪等正式營運資料仍依仙加味既有正式系統保存。
- Facebook／Instagram／LINE／Google／Cloudflare／OpenAI 等正式 Token 不寫入 GitHub。
- Credentials／Secrets 只放受保護的環境變數或 n8n Credentials。
- 官網產品母資料仍以 `xianjiawei/public-product-master.json` 為公開最高權威。
- LINE OA 官方 Webhook 保留在 TS-LINE，不直接改指向 n8n。

## 已確認正式接口

- n8n liveness / 喚醒：`https://xianjiawei-n8n-longterm.onrender.com/healthz`
- n8n readiness / DB 診斷：`https://xianjiawei-n8n-longterm.onrender.com/healthz/readiness`
- LINE OA 健康檢查：`https://ts-line.onrender.com/healthz`
- 內部系統健康檢查：`${XJW_INTERNAL_BASE_URL}/healthz`
- 已審核貼文立即發布：`POST ${XJW_INTERNAL_BASE_URL}/api/posts/:id/publish-now`
- 貼文各平台發布結果：`GET ${XJW_INTERNAL_BASE_URL}/api/posts/:id/deliveries`
- 官網公開產品母資料：`https://ts15825868.github.io/xianjiawei/public-product-master.json`
- 官網 AI 問答：`https://ts15825868.github.io/xianjiawei/ai-answers.json`
- 官網 GEO：`https://ts15825868.github.io/xianjiawei/geo-data.json`

`/healthz/readiness` 只作 DB readiness 診斷，不拿來當 Render Free 冷啟動預熱網址。2026-09-02 實測冷啟動時 readiness 曾先回 503，但使用 `/healthz` 喚醒後，三條正式 longterm webhook 均可正常執行。

Supabase PostgreSQL 同時間曾記錄 `webhook_entity` 主鍵重複註冊訊息；該主鍵為 `("webhookPath", method)`。目前三條正式 webhook 路徑各自唯一，功能驗收已通過，因此不直接修改 n8n 內部資料表；後續以功能驗收與 n8n 版本更新持續觀察。

## n8n 環境變數 / Credentials

正式發布串接預計使用：

- `XJW_INTERNAL_BASE_URL`：仙加味內部 Worker 正式網址（不含尾端 `/`）
- `CF_ACCESS_CLIENT_ID`
- `CF_ACCESS_CLIENT_SECRET`
- `XJW_ALERT_WEBHOOK_URL`：可選，用於異常通知
- `XJW_LINE_HEALTH_URL=https://ts-line.onrender.com/healthz`

Cloudflare Access 使用 Service Token，HTTP Request Header：

- `CF-Access-Client-Id: {{$env.CF_ACCESS_CLIENT_ID}}`
- `CF-Access-Client-Secret: {{$env.CF_ACCESS_CLIENT_SECRET}}`

## 正式 Workflow 狀態

1. `01-line-health-monitor.json`｜`仙加味｜LINE OA 健康監控`｜Published / Active
2. `02-approved-post-publish.json`｜`仙加味｜已審核貼文立即發布`｜保持關閉
3. `03-product-ai-geo-audit.json`｜`仙加味｜產品母資料 AI GEO 一致性檢查`｜Published / Active
4. `04-system-health-watch.json`｜`仙加味｜系統健康總監控`｜Published / Active

正式驗收：

- GitHub Actions Run `33512408829`：longterm 三條只讀監控全部成功。
- GitHub Actions Run `33533228168`：`/healthz` 喚醒後，三條 longterm 正式 webhook 全部成功。

## 正式外部排程

官網 Repo `xianjiawei`：

- `.github/workflows/n8n-monitor-scheduler.yml`
  - LINE OA 健康監控：每 15 分鐘
  - 系統健康總監控：每 30 分鐘
  - 產品母資料 AI GEO：每 6 小時
  - 正式 Webhook 全部指向 `xianjiawei-n8n-longterm.onrender.com`
  - 正式版只保留 cron＋`workflow_dispatch`，不保留測試用 push 觸發。
- `.github/workflows/n8n-evening-warm.yml`
  - 台灣時間 19:00～00:50 每 10 分鐘呼叫 `/healthz`
  - 用途為 Render Free instance 晚間預熱，降低使用時冷啟動等待
  - 正式版只保留 cron＋`workflow_dispatch`，不保留測試用 push 觸發。

## 發布流程安全規則

`02-approved-post-publish.json` 目前仍保持關閉，直到正式發布驗收完成。

啟用前必須同時符合：

1. Cloudflare Access Service Token 已放入安全環境變數／Credentials。
2. 使用一篇真正人工審核通過的貼文 ID 測試；不得使用 draft／pending_review。
3. `/publish-now` 正常驗證 approved / scheduled、圖片審核、產品母資料與平台授權。
4. `/deliveries` 確認各平台實際結果。
5. 驗證成功後才允許貼文中心正式呼叫 n8n 發布 Workflow。

n8n 不得自行把 draft / pending_review 變成 approved，也不得繞過既有貼文守門。

## 尚需人工帳號設定

n8n Owner 管理員帳號涉及登入 Email、姓名與密碼，必須由帳號持有人本人設定；密碼不得提交到 GitHub 或提供給自動化工具。

## 維護原則

- 修改 workflow 前先以 GitHub `docs/n8n/` 為可重建版本來源。
- 產品母資料變更後驗證 `public-product-master.json / ai-answers.json / geo-data.json / llms.txt / sitemap.xml`。
- GitHub main 更新後等 Pages / Render / Cloudflare 部署完成，再做 production readback。
- 發布中心「不符合／重新生成」只建立重生成任務，完成後必須回 `待審核`，不直接發布。
- 不在每次 Render 冷啟動時執行 workflow import / publish CLI，避免 Port Scan Timeout 與流程被暫時停用。
