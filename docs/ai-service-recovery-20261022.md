# 仙加味客服修復實際紀錄（2026-10-22）

基準 main：1404357d16c7a60db1b68fdc53b2e32c4c07f238。所有三平台發送開關保持關閉。

## 正式系統證據

- Render longterm 服務：srv-da8s2r49v7es73cefob0；free、autoDeploy=off。
- 2026-10-22T13:02:46Z 的 server_failed 明確記錄 oomKilled、512Mi。
- 12:40–13:00Z 記憶體約 531–537 MB，重啟後約 469–475 MB。高基線、執行程序負擔仍需驗證，未宣稱單一根因已修復。
- 執行資料僅 58 筆、總 pg_column_size 441527 bytes、最大 16517 bytes；不支持大量歷史資料為主因。無刪除。
- 7 條 workflow、3 條 active；139 對應 workflow inactive，三個 HTTP 節點皆 GET。
- 139 已由 n8n 恢復機制標記 crashed，stoppedAt=2026-10-22T13:04:37.313Z。無 running 記錄、無 worker DB session、兩套 ledger 為空。未再停止或重跑。
- Render 記錄多次 pipeline_minutes_exhausted。環境更新曾觸發失敗建置。本次不更新 Render 環境、不發起建置。
- n8n 2.35.7；啟動時有 DB ping timeout 及 connection recovered，瀏覽器目前仍回 503 Database is not ready。
- 專用角色可登入、非 superuser、無 bypassrls、連線上限 3；既有三張 ledger/control 表皆 RLS。三平台 enabled=false。

## 已完成程式及部署

- start-low-memory.sh：production execution / task runner concurrency 預設 1；保留既有環境值、TLS、保存策略及歷史資料。僅保存待日後 Render 可安全部署，不宣稱生效或解決 OOM。production concurrency 不涵蓋手動執行。
- social-tls.mjs：僅專用帳號及 Supabase host、要求 CA、rejectUnauthorized=true、max=1；不接受會覆蓋 SSL 選項的 URI。僅離線測試，尚無正式專用帳號 TLS 握手證據。
- social-webhook.mjs：原始 body HMAC、白名單、64KiB 限制、原子 INSERT ON CONFLICT、寫入後才 ACK。payload 只存私有資料表，不記錄日誌。
- webhook_inbox 已建立於原 Supabase、RLS 開啟、匿名不可讀、專用角色僅 SELECT/INSERT、不可 DELETE。不是另一套回覆 ledger；既有 comment/reply ledger 未改。
- Supabase Edge Function xjw-social-receipt v2 已部署，遠端驗證 receipt_disabled / sent=false。沒有向 Meta 註冊 callback、沒有新增訂閱。
- 收件端只提供簽章驗證與私有待處理收件；不呼叫 AI、不產生客服建議、不發送訊息、未接入 ERP。不得當成完整客服已恢復。
- 新增 7 項本地測試通過；既有 76 項測試未重跑。簽章/帳號/大小/失敗不 ACK/挑戰/TLS 防降級覆蓋。
- 遠端權限透過 privilege/RLS metadata 讀回。SET LOCAL ROLE 被既有 membership 保護拒絕，未擴權；交易回滾測試不能冒充專用登入驗收。

## A / B / C 實際判斷

A：現有 Cloudflare Worker 沒有 PostgreSQL binding，外層 Access 擋住 Meta webhook。仍可能透過最小 bridge 實作，但尚未確認 binding、secret 與免費用量；未改 Access、未宣稱不可行。

B：選用現有 Supabase Edge Functions 部署收件端，沿用原 PostgreSQL。平台文檔列免費 worker wall time 150s、256MB、2s CPU；本端無排程及持續輪詢。尚缺受保護設定與實際用量確認，保持停用。

C：私有待處理佇列已建，正式 callback、安全收件、AI 建議、ERP 顯示與人工接手全流程仍待串接驗收。不得稱為完成。

## 受保護設定及後續驗收

Edge Secrets：XJW_RECEIPT_ENABLED（預設未設即關閉）、XJW_META_APP_SECRET、XJW_META_VERIFY_TOKEN、XJW_SOCIAL_ALLOWED_ACCOUNTS、XJW_SOCIAL_DB_CONFIG。

DB_CONFIG 為 host、port、user、password、ca 的受保護 JSON。必須使用既有專用帳號；不得填管理員或 service_role。現有 Connector 沒有設定 Edge Secrets 的方法，本回合無擷取既有密碼／Token。以平台受保護介面補齊後先完成 TLS 握手及隔離驗收，再考慮啟用收件。不得因此啟用回覆。

待驗收：三平台有效 Token／Scopes／完整留言分頁；Meta callback；沿用既有 history reader / policy 的建議生成；ERP Access 登入與遠端寫入／人工接手；n8n OOM 調整遠端生效。ERP 本回合導向 Cloudflare Access 登入頁。

未升級、未購買額度、未新增 Render 服務、未發送真實顧客測試訊息。

官方參考：
- https://render.com/docs/free
- https://docs.n8n.io/hosting/configuration/environment-variables/executions/
- https://docs.n8n.io/hosting/configuration/environment-variables/task-runners/
- https://developers.cloudflare.com/workers/platform/limits/
- https://supabase.com/docs/guides/functions/limits
