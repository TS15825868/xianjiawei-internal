# 仙加味｜LINE OA 免費 Cloudflare 安全備援（2026-10-26）

此版是**待命收件端**，不是 LINE 自動客服。正式 Render TS-LINE 仍提供購物車、試喝、Flex 卡片、人工詢價、CRM 及 Rich Menu，LINE Developers 中的正式 Webhook URL 不做變更。

## 權限、資料與費用

- Worker 名稱：xianjiawei-line-receipt-staging，使用現有 Cloudflare 帳號，不新增付費服務、不開 Render Build。
- 預設 receipt／驗證／E2E／單一 callback 四個旗標全部 false，Webhook POST 回 503。部署即使成功，也不能宣稱 LINE 已切換。
- LINE 授權必須先驗證原始 bytes 的 x-line-signature HMAC-SHA256，然後才可以解析 JSON；驗證 webhookEventId 防重送。
- 此程式不傳送 LINE 訊息，也不處理訂單；收到資料時才可能經 D1 atomic batch 保存，不回傳原始顧客內容，也不公開對話。
- XJW_LINE_CHANNEL_SECRET 與 XJW_LINE_DESTINATION 僅可放入受保護 Cloudflare Secret/Vars，不能存 GitHub、日誌、聊天。
- Cloudflare 免費配額不足則安全拒絕，絕不可自動付費、擴容或升級。

## 受控轉換門檻

1. 先確認獨立 Worker 部署後 GET /healthz 表示 receiptEnabled=false 且 customerReplies=false；POST /webhook 必須仍為 503。
2. 正式 E2E 啟用前，必須確認 Cloudflare 免費配額及 D1 備份，並審核後套用 docs/cloudflare-line-receipt-schema.sql。新增資料表不會覆蓋現有 ERP。
3. 保存 Channel Secret、正式 destination；僅在 LINE Console 控制下短暫啟用 XJW_LINE_VERIFY_ONLY_ENABLED=true，僅空事件驗證可以回 200，非空顧客事件繼續回 503，絕不因驗證成功就切換全部正式流量。
4. 必須取得 LINE 官方 Callback 設定、唯一來源、真實簽章、重送、並行、D1 寫入、CRM 人工接手、防重覆及異常恢復的實測證據，才能分別確認 XJW_LINE_E2E_VERIFIED 與 XJW_LINE_EXCLUSIVE_CALLBACK_CONFIRMED。
5. 正式收件 XJW_LINE_RECEIPT_ENABLED 只在完成上述驗收且已有安全的內部人工處理入口後才可打開；仍不會自動發送訊息。顧客來訊若無人處理，單純記錄不能冒充完整客服。
6. 完整 LINE 功能遷移需要把 Render 的記憶體內購物車／試喝狀態與 CRM 資料持久化，保留原產品圖、實際庫存／價格、訂單回執、權限及客服流程，才可以在官方 Webhook 上正式切換。未知發送結果不得重試。
7. 任何清除顧客資料前必須完成保留年限、歸檔及必要權限審查。

## 驗收方式

GitHub Actions 中新流程在獨立 Node 測試（簽章、空事件、重送、資料庫失敗、資料上限、無對客發送）通過後，才部署獨立 Worker 的停用設定；部署後用公開唯讀健康端點與 503 收件測試驗證。這不等於 LINE 官方 E2E 已通過。

## 內部唯讀監控

`/social-support.html` 的「檢查 AI 營運狀態」在完成 Cloudflare Access 授權後，同步查詢 D1 收件表的 **分組總數與待處理數**。不回傳事件本體、LINE replyToken、顧客名字、訊息、手機號碼；這個統計永遠顯示 `liveWebhookVerified:false`，並不等於 LINE 正式串接驗收通過。

## LINE 人工接手（2026-10-26）

既有 Cloudflare ERP `GET /api/line-handoff?limit=20` 僅供 `owner/admin/sales` 通過正式 Access JWT＋profiles 權限檢查的人員，顯示 webhookEventId、事件類型、收件時間、認領人及認領時間；絕不查詢原始 event_json／私訊、LINE replyToken、帳戶來源、手機或訂單資料。

內部客服中心 `social-support.html` 的「查看待接手事件」只在人工點擊時查詢，沒有自動背景輪詢。「人工接手」／「釋放接手」必須同源 POST、JSON 的 `confirmManual:true`、有效 Access、角色授權及 D1 條件式寫入。獨立 `xjw_line_handoff_claims` 以部分唯一索引防止同筆重複接手，釋放不刪除歷史；主管可釋放認領，但一般客服只可釋放自己的接手。

這些動作**不向 LINE 回覆、不代表已完成對客處理**；正式 Webhook 仍在 Render。請在 LINE Official Account Manager 查核真正的顧客內容並人工回覆。未驗證的正式回覆與訂單搬遷繼續維持未啟用。

## 已人工處理完成的結案操作（2026-10-26）

- 僅有已認領事件的原受理者、管理員與 owner，可將備援事件標示為 `handled`；使用資料庫同一筆條件式 UPDATE 防止重複結案。
- 人員必須親自到 LINE OA Manager 確認該對話已處理後，再在內部客服中心按「已在官方 LINE 處理完成」並確認。請求必須同時包含 `confirmManual:true` 與 `confirmHandledInOfficialLine:true`。
- 寫入 `handling_status='handled'` 與 `handled_at`，保留原接手人及收件事件歷史；不發送 LINE 訊息、不宣稱取得官方發送回執。結案後事件會退出「待接手」清單。
- 如果沒有實際回覆、事件缺少受理者、認領者不符或資料庫狀態不一致，均不可標示完成。
