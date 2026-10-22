# 留言建議回覆實作與實際驗收狀態

依據：`docs/social-ai-comment-reply-policy-20261021.md`。

## 已實作

- `n8n-runtime/comment-policy.cjs`：只產生建議；未提供發送方法或自動開關。先驗證完整對話與正式帳號，再檢查已回覆、最新追問、不需回覆、個資及高風險。只有唯一商品且可核實的規格／成分會產生建議，其他交人工。這是規則與正式資料核心，**不是已接通的生成式 AI**。
- `n8n-runtime/comment-store.cjs` 與 `comment-suggestions-schema.sql`：應用程式自有的 SQLite／D1 去重與建議紀錄介面，不變動 n8n 管理資料表。claim 使用資料庫唯一鍵；讀 API 失敗只留去識別錯誤分類，不存原始 API body 或憑證。正式儲存綁定尚未部署。
- `05-comment-suggestions-qa.json`：可匯入 n8n 的手動驗收流程，僅合成案例，沒有 webhook、正式平台資料、發送或付費 AI 節點，保持 inactive。尚未匯入正式 n8n。
- 本機 `node --test n8n-runtime/comment-policy.test.cjs`：19 組通過，包括真正 SQLite 關閉重開後去重、四平台共用守門、追問、跨客戶隔離及 API 錯誤。另以 JavaScript 執行 n8n Code 節點，8 個合成案例通過。這些均**不是平台端到端發送驗收**。

## 正式接入契約

`processComment(event,{adapter,store,catalog,allowedAccounts})`。

- event 必須有 platform、accountId、postId、threadId、commentId。
- adapter.loadThread 必須使用受保護的官方憑證查詢，核實帳號／貼文所有權，讀完全部分頁及品牌回覆，將角色與作者 ID 由官方來源解析；不可照信 webhook 自帶的 role、verified 或 complete。回傳平台、帳號、貼文、串 ID、verified、complete 與 messages（id、text、role、authorId、at、replyTo）。任何查詢／分頁失敗均拋錯或 complete=false，不可把不完整歷史當完整。
- catalog 必須為本次成功讀取的 `xianjiawei/main/public-product-master.json`，使用最新公開商品，不從記憶、舊 ZIP 或 ERP 成本欄推斷；包含 version、source、fetchedAt、verified 及 products。超過一小時拒答。資料讀取失敗交人工。
- store 使用應用自有受保護資料庫，claim 唯一鍵成功才進入判斷；建議前再次查詢對話。finish 留下分類、依據、模式及決策；remoteReplyId 永遠空值，因本實作不發送。processing 因中斷留下時人工檢視，不盲目重試。
- 後續正式發送需要獨立實作與驗收，不可只把 mode 改成 auto。須再次讀取狀態、以留言級唯一發送鍵鎖定、逾時保留 unknown 待查核，API 確認回覆 ID 後才記成功。
- LINE 不改原 TS-LINE webhook；未完成官方 adapter 前不得接管既有客服。

## 本次即時查核

- GitHub main 基準：官網 `2e4f0f75746b99f7a21291d820b75a98023cc985`；LINE `ecff6669576b202c84a9b137fb980c2ae542e1a2`；內部 `5c436fa1e8dbc637e428fb4810d8fc56d7d07776`。內部 repo 回傳 push/admin 權限。
- Meta Business Suite 已登入仙加味，Facebook／Instagram 入口可用。Instagram 實際看到既有「請問可以拍成份看嗎」與品牌已回覆「你好，已經私訊你」；本次沒有再發送。網頁讀取與既有回覆可見不等同已取得官方 API 回覆權限。
- n8n Render：`srv-da8s2r49v7es73cefob0`、plan=free、autoDeploy=off；最近部署 `fb77b8c1da69091076fa9faad9de834b20564364` 狀態 live，但 runtime 日誌出現 Database ping timeout／pg-pool 連線逾時，初期網頁回傳 503「Database is not ready!」；後續冷啟動恢復到 n8n 登入頁，最新日誌顯示監控重新啟用。Supabase 為 ACTIVE_HEALTHY，讀取 n8n.workflow_entity 確認三條監控 active=true、貼文立即發布 active=false。n8n.credentials_entity 類型盤點為空（未讀取秘密欄位）。live 部署不能據此宣稱留言工作流已完成。
- 留言 API Token、各平台實際 scope、Webhook 訂閱、AI 提供者免費額度與正式讀取／回覆回執尚未驗證；三平台與 LINE 均不得標示智慧自動回覆已啟用。
- 正式 n8n 工作流匯入／執行仍需 n8n 登入；冷啟動曾有資料庫連線問題；未重新部署或覆蓋既有監控。不新增資源、不更改付費方案、不呼叫付費 AI。

## Metricool 已完成的正式修改

UUID `-3392347560393946949`，原 ID `402249078` 更新為 `402291774`：10/27（二）10:00 改為 **10/28（三）10:00 Asia/Taipei**，第一句「週二早上」改「週三早上」。圖片、其他文案、三平台與 autoPublish=true／draft=false 保留。重新 GET 以 Asia/Taipei 確認；API 寫入回傳 Europe/Madrid 03:00 為同一時刻。

目前已查核的後續正式三平台排程：10/23、10/26、10/28、10/30，均 10:00。10/28 09:00 的龜鹿飲內容是草稿（draft=true、autoPublish=false），未改為正式排程。

## 官方權限參考

- Instagram：<https://developers.facebook.com/documentation/instagram-platform/comment-moderation>。Instagram Login 與 Facebook Login 權限不同，須按實際登入方式核對。
- Threads：<https://developers.facebook.com/documentation/threads/retrieve-and-manage-replies>。讀取與回覆分別需 threads_read_replies／threads_manage_replies；Metricool 可發布不代表可把它的憑證挪作留言 API。

額外支出：NT$0／US$0。尚未啟用正式無人值守留言回覆。


## 2026-10-22 續作查核

- 最新 main 基準 `2180905f482948457f7157655232ce65ca24ac6c`。
- 直接唯讀查詢正式 n8n 資料庫：仍有四條工作流，LINE OA 健康監控、產品母資料一致性檢查、系統健康總監控啟用；已審核貼文立即發布關閉。本次未改任何 active 狀態或貼文排程。
- Credentials 數量為 0；尚無留言讀取／回覆正式工作流。沒有讀取秘密欄位。
- 建議核心新增 replyOwnership（human/meta_away 等非 ai 值時略過）、automationPending（平台回覆待送時轉人工），以及無 replyTo 的後續品牌訊息避讓。這些欄位必須由可信平台 adapter 查詢，不可相信 webhook 自述；未完成 adapter 前不能宣稱已接通 Meta 離線回覆偵測。
- 無新問題的寒暄、同業交流及補充資訊不強制回覆；高風險仍先轉人工。同步更新離線 QA Code 節點，避免兩份判斷邏輯不同。
- 本機 21 組測試通過，包含 SQLite 重開持久化、重複 webhook、人工競態與 Meta 避讓。這是本機合成測試，不是平台端到端測試。
- Work 瀏覽器進入正式 n8n 時 navigation/frame tree 逾時，尚未進入可操作管理介面。未匯入或啟用新工作流，未觸發部署，未發送留言，未呼叫付費服務。
- 待完成：n8n 登入及平台官方 Credentials、完整分頁與品牌身分 adapter、正式持久化綁定、真實唯讀端到端驗收，之後才可驗收發送及啟用低風險回覆。
