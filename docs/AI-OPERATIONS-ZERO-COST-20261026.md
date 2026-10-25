# 仙加味｜AI 營運中樞零新增費用配置（2026-10-26）

此文件是**部署與驗收決策**，不代表所有 AI 功能已自動啟用。最高限制：新增費用 NT$0／US$0；不購買 Render 分鐘、不新增帳號來規避配額；不未審核發布、不自動對客做療效宣稱。

## 單一真實資料來源與權限

- 品牌與公開商品：官網 main 的最新核准產品母資料；LINE OA 與 ERP 應對齊，不以舊商品數量封鎖新核准商品。
- LINE OA：既有 Render 服務先保留顧客入口與訂單；Render 免費實例可能休眠，而且最新 build 因配額無法上線。**不可把舊 LIVE 當新程式**。
- ERP／貼文中心：既有 Cloudflare Workers＋D1 持續負責審核、庫存與正式發布，所有修改走 Access 授權、D1 交易及操作紀錄。已發布內容不可因 AI 改稿而重發。
- Meta：僅一個正式 Callback URL；Supabase Edge Function 收件與 Cloudflare D1 備援都保留封閉狀態，直到 HMAC、官方權限、真實簽章收件、共同 idempotency 及 ERP 寫回全部驗收。備援無法共用回覆帳本時**只收件，不發送**。
- Metricool：既有仙加味品牌 6889683 的 Facebook／Instagram／Threads；先比較遠端 uuid、現有草稿、上架與免費額度，未核准草稿不自動發表。免費版發文上限要看正式帳戶用量。
- n8n：只作非關鍵輔助；健康監控已由 GitHub Actions GET-only 路徑接手，除明確人工指定外不喚醒舊版。

## AI 分級

1. **不消耗 AI 額度的確定性資料**：產品名稱／規格／原料順序／交期／聯絡入口先使用正式資料＋規則；資料矛盾、人身健康、訂單、批發、價格或合作轉人工。
2. **Cloudflare Workers AI 草稿**：內部角色才可使用，採小量請求，必須同時具備 AI binding、`XJW_SOCIAL_AI_DRAFT_ENABLED=true` 與`XJW_AI_FREE_ACCOUNT_CONFIRMED=true`，前提是確認帳號屬不會產生超額費用的免費方案。模型只接觸正式產品事實，不接收客戶私密對話，輸出仍須人工審核。
3. **貼文 AI**：可生成文案、圖文一致性檢查與待審核候選；正式產品圖片必須沿用實物原圖，小老闆與鹿／龜角色固定；16 項安全門與人工核准不可跳過。
4. **低風險留言自動回覆**：須逐平台實測官方讀取歷史與有效寫入權限，驗證同一留言只回覆一次、人工接手/暫停即停止、遠端 receipt 回寫 ERP；未達成即只提供建議草稿，不啟用發送。
5. **異常通知**：只發出真正影響服務的告警，避免每小時全面重跑、重複建立工作流程、重複呼叫模型及無限重試。

## 新增零推論 read-only API

`GET /api/ai-ops/readiness`：需 Cloudflare Access + D1 權限為 owner/admin/content；只讀貼文各狀態數、Workers AI 啟用條件是否齊備、外部流程仍須驗證的項目。回傳 `allAutonomous:false`、`modelCalls:0`、`customerSend:false`；不得把它當作模型／Meta／LINE／Metricool 端對端驗收證據。

## 切換／驗收門檻

- GitHub 測試 → Cloudflare 成功部署 → Access 受保護狀態查詢 → D1 read-only → LINE 訊息/CRM 真實回執 → Meta 單平台簽章+收件+去重+人工接手+回覆 ID → 才考慮**逐一**啟用低風險自動回覆。
- 無任何「全部自動打開」開關，任何送出結果 UNKNOWN 都要人工查核，禁止無腦重試。
- n8n OOM（512 MiB）及 Render 配額尚未解決時，禁止讓它成為唯一顧客服務節點。
- 不存任何密碼／Token／金流資料於 Repo；如無法確認 AI 免費配額，保留模型草稿停用但零推論事實建議可用。

## 已驗證與尚未驗證（本文件建立當日）

- Cloudflare AI binding 存在，兩個 AI 草稿放行旗標仍在 `wrangler.jsonc` 設為 false。
- Supabase `xjw_social.platform_control` 三平台 `enabled/e2e_verified/overlap_verified` 皆為 false。
- Metricool 2026-10-26～11-25 有 12 筆 `draft:true, autoPublish:false` 的草稿；10/28 有兩篇同日候選；**不是已核准排程**。
- Render n8n 多次 OOM、部署因建置分鐘數耗盡；LINE OA 目前 Live 版本落後 GitHub 最新版。
- 官網及 ERP 的 n8n 監控已改為手動明確 opt-in 才喚醒；本次不建立新 Render 服務。

## 內部操作入口

使用已登入 Cloudflare Access 的仙加味帳號開啟 `/social-support.html`，頁面下方的「檢查 AI 營運狀態」只讀取 `/api/ai-ops/readiness`，不呼叫模型或發送訊息。登入未通過／D1 異常時顯示錯誤，不可推論為正式運作。
