# 仙加味 n8n 長期版自動化

更新：2026-10-24（保留 2026-09～10 的建置歷程）

## 原則

n8n 作為仙加味的旁路自動化與協調層，不取代目前正式運作的 LINE OA Webhook、Cloudflare Worker、D1、GitHub main 或 Render 既有正式服務。

目前保留四條原始正式工作流（三條健康／母資料監控啟用，發布工作流關閉），另有三條停用的 QA／唯讀工作流；資料庫合計七條：

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
- 線上版本：Render 仍為 `fb77b8c1`（2026-10-20）；近期新建置受免費 pipeline minutes 額度限制，不能宣稱新版已部署。
- 最新 main 啟動入口：`n8n-runtime/start-low-memory.sh`，單工作流程並行上限 1、JS Runner 預設堆積上限 128 MB、n8n 主 Node.js `NODE_OPTIONS=--max-old-space-size=256`、Runner 授權等待預設 480 秒（只有未另設變數時生效）。以上皆**尚未生效於舊版 Render 線上版本**，並非整機 RSS 或 OOM 已修復的證據。
- 正式啟動不會重新匯入 workflow。
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
- 2026-10-24 已唯讀核對 Supabase `n8n.workflow_entity` 編輯定義及 `n8n.workflow_history` 已發布定義，三條工作流程與 GitHub 來源均為 **3／3 一致**；無須重複匯入。

## 正式外部排程（2026-10-23 已核對 main）

- 官網 Repo `TS15825868/xianjiawei`：`.github/workflows/n8n-monitor-scheduler.yml` 每小時 UTC 第 8 分檢查官網、LINE OA、ERP Access 邊界；因 Render 舊版健康檢查反覆失敗，n8n liveness／readiness 僅在 `workflow_dispatch` 手動驗收時檢查。定時巡檢通過**不代表 n8n 健康**。
- 內部 Repo `TS15825868/xianjiawei-internal`：`.github/workflows/n8n-readonly-monitor-scheduler.yml` 每小時 UTC 第 23 分執行獨立公開 GET 唯讀備援；對 n8n 的三條 Webhook 與 readiness 僅在 `workflow_dispatch` 手動驗收時執行，以免反覆喚醒已知 OOM／逾時服務。
- **2026-10-24 已停止定時喚醒故障服務**：內部 GitHub Action 的 `fallback-readonly` 仍每小時獨立執行 `n8n-runtime/smoke-readonly.js`，不依賴主監控；手動觸發的 `monitor` 若未通過，仍會失敗，不被備援成功掩蓋。自動略過 `monitor` 不能視為測試通過。
- 2026-10-23 的 GitHub Actions #39852516440：三條 n8n 唯讀監控與獨立 GET 備援均成功；這不是 Meta 回覆或 ERP 端對端驗收。
- 2026-10-23 上午約 08:02～08:11（台灣）：GitHub Actions #39875578542 的 n8n readiness 連續未通過；Render 記錄在啟動後取得 migration lock，記憶體約 510～512 MiB／512 MiB。主監控失敗，獨立 GET 備援成功。Supabase n8n 表最大約 2.3 MB、查核當下無 n8n 連線或等待鎖，不能據此刪除歷史資料。
- 2026-10-23 GitHub Actions #39894514015：新增核心 Node.js 堆積限制後的 **131 項自動測試全部通過**，沒有線上 n8n 記憶體驗收／新版 Render 部署，不能宣稱 OOM 已修復。
- 2026-10-23 GitHub Actions #39895420109：加強備援 LINE OA `ok:true`、憑證、接單、商品數與品牌驗證，**139 項測試通過**。GitHub Actions #39895709580：並行備援保護測試，共 **143 項通過**；排程執行 #39895607445 的 `fallback-readonly` job 已完成 SUCCESS，該次 n8n 主要監控亦已完成 SUCCESS；Supabase n8n execution `153`、`154`、`155` 三條監控皆為 `success`。Render 03:40 UTC 記憶體約 **508 MiB／512 MiB（99.2%）**，高風險仍在，**不代表 OOM 根治**。
- 早期文件提及的官網 n8n 15 分鐘／30 分鐘／6 小時排程與晚間每 10 分鐘預熱，不代表目前 main 設定；以最新工作流程檔為準。

## Render 免費建置與監控同步規則（2026-10-24）

- **每次 `npm install` 不再對正式資料庫呼叫 n8n CLI**。Render Build Command 仍為 `cd n8n-runtime && npm install --no-audit --no-fund --no-package-lock`；最新版 `postinstall` 僅執行 `node verify-monitor-sources.cjs`，離線驗證三份唯讀監控定義，未連線 PostgreSQL，也不匯入或發布工作流程。
- 如在正式環境有經確認的監控定義變更，須由有權限的操作員明確執行 `npm run reconcile:monitors`（工作目錄：`n8n-runtime`）。此指令可能讀寫正式工作流程，**不得當作每次冷啟動或建置的預設步驟**。
- 核心測試已通過 **234／234**（GitHub Actions `40086959541`），但不是 n8n 線上部署成功證據。
- Render Free 近期回報 `pipeline_minutes_exhausted`；最新 GitHub 程式不能假定已部署。暫不重複建置或付費升級；保持現有監控狀態與資料，等免費額度恢復再核對 live commit、readiness、記憶體及 TLS。
- LINE OA 亦有已修補的 GitHub 相依套件版本尚待 Render 部署；官網或獨立備援健康檢查通過不等於 LINE OA 取得最新安全程式碼。

## 社群專用 PostgreSQL TLS 真實驗收（2026-10-23）

- Supabase 專案 `iphexhvjhsmelbgwzhhr` 的專用角色 `xjw_social_worker` 已可登入、已有保護的密碼，角色連線上限 3，不能修改三平台啟用旗標。
- Render IPv4 環境應使用 Supabase Connect 顯示的 **Session Pooler，port 5432**。專案在東京 `ap-northeast-1`，但 Pooler 主機的叢集編號不能自行猜測；自訂角色池化使用者為 `xjw_social_worker.<project-ref>`。
- `n8n-runtime/social-tls-preflight.mjs` 是**操作員在受保護執行環境手動執行**的唯讀連線測試（`node n8n-runtime/social-tls-preflight.mjs`）；透過環境變數 `XJW_SOCIAL_DB_CONFIG` 提供既有機密設定。不得在 GitHub、聊天、命令列參數或公開 URL 填入密碼／CA 私密內容。
- 驗收執行 `BEGIN READ ONLY`，檢查實際 PostgreSQL TLS、worker 身分、RLS、平台開關，關閉連線；絕不新增留言或發送回覆。CI 的模擬測試成功**不等於**生產環境 TLS 實連通過。
- n8n 已儲存一組 `postgres` 類型憑證，但尚未有儲存的工作流程引用。最新查詢未見 worker 的活動連線；密碼存在不代表已成功通過 TLS 實連。
- 三平台 `enabled/e2e_verified/overlap_verified` 維持 `false`；真實 Meta API／完整留言歷史、n8n 部署與受保護 ERP 遠端回寫尚未驗收，禁止自行啟用。

## 發布流程安全規則

`02-approved-post-publish.json` 目前仍保持關閉，直到正式發布驗收完成。

啟用前必須同時符合：

1. Cloudflare Access Service Token 已放入安全環境變數／Credentials。
2. 使用一篇真正人工審核通過的貼文 ID 測試；不得使用 draft／pending_review。
3. `/publish-now` 正常驗證 approved / scheduled、圖片審核、產品母資料與平台授權。
4. `/deliveries` 確認各平台實際結果。
5. 驗證成功後才允許貼文中心正式呼叫 n8n 發布 Workflow。

n8n 不得自行把 draft / pending_review 變成 approved，也不得繞過既有貼文守門。

## Owner 管理員帳號

- 2026-09-02 已由帳號持有人本人完成 n8n Owner 管理員帳號設定。
- 登入 Email／姓名／密碼不記錄於 GitHub、README 或自動化環境。
- AI Assistant Preview 不是仙加味目前四條 Workflow 的必要功能，未要求啟用。

## 維護原則

- 修改 workflow 前先以 GitHub `docs/n8n/` 為可重建版本來源。
- 產品母資料變更後驗證 `public-product-master.json / ai-answers.json / geo-data.json / llms.txt / sitemap.xml`。
- GitHub main 更新後等 Pages / Render / Cloudflare 部署完成，再做 production readback。
- 發布中心「不符合／重新生成」只建立重生成任務，完成後必須回 `待審核`，不直接發布。
- 不在每次 Render 冷啟動時執行 workflow import / publish CLI，避免 Port Scan Timeout 與流程被暫時停用。
