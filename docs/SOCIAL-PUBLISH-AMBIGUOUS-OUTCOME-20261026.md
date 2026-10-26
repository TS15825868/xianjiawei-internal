# 仙加味｜外部貼文 API 結果不明時不再重複發布（2026-10-26）

目的：避免 Facebook、Instagram、Google 商家以及外部 Webhook 在 HTTP 408／409／425／429／5xx 或已開始 POST 後的網路中斷、逾時，**因未知是否已接受發布而自動重新送出相同的公開貼文**。

異動：

- 非 LINE 自動公開貼文的模糊回應，一律回傳 `manual_required:true` 與 `delivery_outcome_unverified:true`，停止自動重試，透過既有 `social_publish_deliveries` 記錄待人工查核狀態。
- Graph 身分解析或 Google OAuth 在真正發布 POST 前就確定失敗時，可以保留原本安全錯誤處理；已開始 POST 的不確定結果一律優先防重複。
- **已收到正式 2xx＋平台遠端 ID** 的成功發布保持原流程。
- LINE OA 廣播另走經 LINE 官方支援的 **穩定 X-Line-Retry-Key**，同一貼文合法重試仍能安全進行；不受本規則變更影響。
- 不新增付費系統、不發送任何測試貼文、不啟動未通過審核的對外發送。遇到模糊結果應在平台官方後台核對真實貼文、遠端 ID、是否重複，再決定後續操作。

社群版位和媒體不可只因工作流程 HTTP 200 以外的狀態，就假設未發布成功。先保護不重複內容，避免自動化重試造成圖文重覆。

## HTTP 200 無有效貼文回執的補強（2026-10-26）

- Facebook 圖片、Instagram 發布、Google 商家及 LINE OA 廣播：必須取得平台遠端貼文 ID 或 LINE 官方請求 ID，才能在系統記錄發布完成。
- Facebook Reel 的最終 finish 若明確回覆 `success:false`，即使 HTTP 200 也不得標記成功。
- 外部 Webhook 的 HTTP 200 可能只是進入排程／佇列；必須同時有 `published:true`（或 `status:published`）及正式遠端貼文 ID，才承認已發布。
- LINE 200 回執也允許 `sentMessages[0].id`，前一版穩定 Retry Key 及官方 409 去重處理維持不變。
- 任何缺少發布證據的結果標記 `manual_required:true`，保留已核准素材與待核對資料，不重送、不宣稱成功，不增加付費服務。
