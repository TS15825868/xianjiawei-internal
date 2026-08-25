# 仙加味 n8n 第一階段自動化

更新：2026-08-25

## 原則

n8n 只作旁路自動化與協調層，不取代目前已正式運作的 LINE OA Webhook、Cloudflare Worker、D1、GitHub main 或 Render 自動部署。

第一階段先做四件事：

1. LINE OA / Render 健康監控
2. 已人工審核貼文的發布串接
3. 產品母資料同步通知與一致性檢查
4. GitHub / Render / Cloudflare 部署異常通知

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

## 匯入順序

1. 匯入 `01-line-health-monitor.json`
2. 填好環境變數後手動 Execute，一切正常再 Activate
3. 匯入 `02-approved-post-publish.json`
4. 用一篇已經人工審核通過的測試貼文 ID 驗證；不得拿 draft 貼文測試
5. 確認 deliveries 結果後，才接到貼文中心的自動呼叫

## 下一階段

- 產品母資料變更後自動驗證 `public-product-master.json / ai-answers.json / geo-data.json / llms.txt / sitemap.xml`
- GitHub main 更新後等 Pages / Render / Cloudflare 部署完成，再做 production readback
- 發布中心「不符合／重新生成」只建立重生成任務，完成後必須回 `待審核`，不直接發布
