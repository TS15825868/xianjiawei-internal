# 仙加味 n8n 第一階段自動化

更新：2026-08-25

## 原則

n8n 只作旁路自動化與協調層，不取代目前已正式運作的 LINE OA Webhook、Cloudflare Worker、D1、GitHub main 或 Render 自動部署。

第一階段先做四件事：

1. LINE OA / Render 健康監控
2. 已人工審核貼文的發布串接
3. 產品母資料同步通知與一致性檢查
4. GitHub / Render / Cloudflare 部署異常通知

## 目前 n8n 執行環境

- Render Web Service：`https://xianjiawei-n8n.onrender.com`
- Service：`xianjiawei-n8n`
- Region：Singapore
- Plan：Free
- Runtime：Node
- 程式來源：`xianjiawei-internal/main/n8n-runtime/`
- 目前用途：第一階段測試與旁路自動化，不作仙加味正式資料庫。

另外已建立 Render 免費 Postgres `xianjiawei-n8n-db` 作為可選測試資料庫，但 Render 明確標示到期日為 `2026-09-24`。在完成長期資料庫遷移前：

- 不存客戶、訂單、付款、成本、庫存、拜訪等正式營運資料。
- 不把 Facebook／Instagram／LINE／Google／Cloudflare／OpenAI 等正式 Token 寫入 GitHub 或測試資料庫。
- n8n workflow JSON 以 GitHub `docs/n8n/` 為可重建來源。
- 正式資料仍留在 Cloudflare D1、GitHub 正式母資料與各平台既有安全儲存。

## 已確認正式接口

- LINE OA 健康檢查：`https://ts-line.onrender.com/healthz`
- 內部系統健康檢查：`${XJW_INTERNAL_BASE_URL}/healthz`
- 已審核貼文立即發布：`POST ${XJW_INTERNAL_BASE_URL}/api/posts/:id/publish-now`
- 貼文各平台發布結果：`GET ${XJW_INTERNAL_BASE_URL}/api/posts/:id/deliveries`
- 官網公開產品母資料：`https://ts15825868.github.io/xianjiawei/public-product-master.json`
- 官網 AI 問答：`https://ts15825868.github.io/xianjiawei/ai-answers.json`
- 官網 GEO：`https://ts15825868.github.io/xianjiawei/geo-data.json`

## 安全邊界

- n8n 不得自行把 draft / pending_review 貼文改成 approved。
- `/publish-now` 仍由內部 Worker 驗證 `approved / scheduled`、圖片審核、產品母資料與平台授權；n8n 不繞過既有守門。
- 任何 Token、Cloudflare Access Service Token、社群平台 Token 只放 n8n Credentials / Secrets，不寫入 GitHub。
- 官網產品母資料仍以 `xianjiawei/public-product-master.json` 為公開最高權威。
- LINE OA 既有 Webhook 保留在 TS-LINE，不把 LINE 官方 Webhook 直接改指向 n8n。

## n8n 環境變數 / Credentials

建議建立：

- `XJW_INTERNAL_BASE_URL`：仙加味內部 Worker 正式網址（不含尾端 `/`）
- `CF_ACCESS_CLIENT_ID`
- `CF_ACCESS_CLIENT_SECRET`
- `XJW_ALERT_WEBHOOK_URL`：可選，用於異常通知；未設定時工作流只標記失敗
- `XJW_LINE_HEALTH_URL=https://ts-line.onrender.com/healthz`

Cloudflare Access 請用 Service Token，HTTP Request Header：

- `CF-Access-Client-Id: {{$env.CF_ACCESS_CLIENT_ID}}`
- `CF-Access-Client-Secret: {{$env.CF_ACCESS_CLIENT_SECRET}}`

## 已建立 workflow

1. `01-line-health-monitor.json`：每 15 分鐘讀 LINE OA healthz。
2. `02-approved-post-publish.json`：只串接已人工審核貼文的正式 publish-now / deliveries。
3. `03-product-ai-geo-audit.json`：產品母資料、AI Answers、GEO 的只讀一致性檢查。
4. `04-system-health-watch.json`：每 30 分鐘檢查官網正式母資料、LINE OA、GitHub Pages 最新部署。

所有 workflow 預設 `active: false`，必須先手動 Execute 驗證成功後才啟用。

## 匯入順序

1. 匯入 `01-line-health-monitor.json`
2. 填好環境變數後手動 Execute，一切正常再 Activate
3. 匯入 `03-product-ai-geo-audit.json`
4. 匯入 `04-system-health-watch.json`
5. 最後才匯入 `02-approved-post-publish.json`
6. 用一篇已經人工審核通過的測試貼文 ID 驗證；不得拿 draft 貼文測試
7. 確認 deliveries 結果後，才接到貼文中心的自動呼叫

## 下一階段

- n8n UI 首次上線後建立 Owner，匯入四條 workflow 並逐條手動測試。
- 改用長期持久化資料庫後才存 n8n Credentials 與正式 workflow 狀態。
- 產品母資料變更後自動驗證 `public-product-master.json / ai-answers.json / geo-data.json / llms.txt / sitemap.xml`。
- GitHub main 更新後等 Pages / Render / Cloudflare 部署完成，再做 production readback。
- 發布中心「不符合／重新生成」只建立重生成任務，完成後必須回 `待審核`，不直接發布。
