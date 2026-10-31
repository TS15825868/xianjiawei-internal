# 社群私訊收件安全驗收（2026-10-31）

本文件補充既有留言收件流程，不取代既有程式或平台授權。

## 已核對程式
- n8n-runtime/social-webhook.mjs：簽章驗證、帳號白名單、持久化收件；回傳 manual_receipt_only，不發送。
- n8n-runtime/comment-inbox-processor.cjs：僅解析 Facebook feed 留言與 Instagram comments；其他事件忽略，Threads 對應尚未正式驗證。
- docs/n8n/social-api-integration-20261022.md：Instagram manage_messages 權限列為可測試，不等於私訊 webhook 已訂閱、Token 有效或端到端驗收完成。

## 私訊正式守門
1. Facebook Messenger 與 Instagram 私訊先查 App 權限、Webhook 訂閱、有效 Token、帳號白名單及官方事件範例；Threads 私訊只有在官方 API 確認支援且完成授權後才可納入。
2. 只接收簽章與帳號驗證通過的事件；以平台、帳號、訊息 ID 作唯一去重鍵；echo、刪除、無法辨識及附件事件保留人工處理。
3. 收件先持久化，再依正式產品資料分類為商品、價格、試喝、訂單、售後、合作、其他；不得以 webhook 原文當已查證的客戶狀態。
4. 醫療、用藥、孕期、付款、個資、客訴與資料不確定者交人工；一般問題先產生草稿並引導 LINE OA @762jybnm。
5. 記錄來源、官方訊息 ID、分類、處理狀態、人工接手、發送結果；只有平台回執能標示 sent。
6. 在官方歷史重讀、重複訊息、並行、重啟恢復、權限與人工接手端到端驗收完成之前，不啟用任何私訊自動發送。
7. 不新建 Meta App、不重建服務、不新增付費資源；Render 免費額度不足時不反覆觸發部署。

## 目前狀態
此文件僅完成正式缺口盤點與安全守門定義；**尚未**完成私訊 API 收件、正式資料庫串接、對客發送或部署。不可宣稱私訊自動客服已上線。
