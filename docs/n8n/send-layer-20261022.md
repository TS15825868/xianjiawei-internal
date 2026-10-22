# 客服發送層：程式完成部分，尚未部署或啟用

既有 suggestion-only policy、PostgreSQL store、workflow 與七條正式 n8n 流程不變。

新增 `comment-sender.cjs`、`comment-send-store.cjs`、`comment-meta-replies.cjs`。
預設 dryRun=true，releaseApproved=false；三平台資料庫開關不修改。
send store 沿用 reply_ledger 的留言層級主鍵，跨對話版本不得重複保留。
發送前兩次重讀官方對話並重跑既有政策，資料庫再次檢查平台開關及人工接手。
結果不明、回執缺失、API 失敗、記錄失敗均不可自動重送；中斷保留轉 unknown。
Threads 使用建立容器、再次重查對話、發布容器；容器 ID 不作發布回執。

## 必要正式綁定（尚未完成）

- createMetaReplyAdapter 的 request 必須是安全憑證介面的官方 HTTP binding，保留 TLS 驗證、無重試、無重新導向、無原始錯誤或秘密日誌。模組另有 15 秒逾時及 AbortSignal；逾時後視為結果不明。
- loadThread 必須是已驗收的完整分頁、官方身分對應 reader；本次沒有建立或假造完整分頁成功證據。
- permissionEvidence 必須來自官方授權檢查，包含平台、帳號、授予 scopes、檢查時間與到期時間；缺少證據拒絕發送。
- workflow 使用既有 createCommentWorkflow；store 使用 createSendStore；catalog 與 allowedAccounts 只可由受信任伺服器設定，不可由 webhook payload 指定。
- 不得把 factory 或 raw db 暴露給公開 webhook。須先驗證 webhook 簽章及資料範圍。
- 外部人工／Meta 自動化與 API POST 無跨平台交易；最後檢查到實際 POST 間仍有競態窗口。須完成原有自動化停用／協調、人工接手通路與受控重疊測試，不能僅以 mock 宣稱零重複。
- 正式整合還需 ERP 回寫及受控測試授權入口。未完成前不得設定 releaseApproved 或 enabled。

## 測試與限制

本地執行：`node --test n8n-runtime/comment-*.test.cjs`。
新增測試使用 mock，不發送真實留言；它不代表遠端 PostgreSQL 併行或 Meta API 發送驗收。
目前 Render pipeline 額度受限，官方 CA 與 NODE_EXTRA_CA_CERTS 已保存但未載入正式程序。
SSL Require 與 Ignore SSL Issues=OFF 保持不變；不部署、不新增費用、不改資料庫權限。
