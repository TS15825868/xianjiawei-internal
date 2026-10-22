# 分頁、三平台讀取與 ERP 綁定狀態

本次修復以 f472bd01465450141f47861fbca2ff7293c60084 為基準。

## 已完成程式

- 分頁拒絕 access_token（含大小寫／URL 編碼）、token、appsecret_proof，拒絕跨來源、帳密、HTTP、fragment、異常 paging/next/cursors、重複 ID、循環與超限。僅接受同一資料 edge。所有 URL 先檢查再呼叫安全 request；錯誤不帶 URL 或秘密。
- 單次 collect 完成所有頁才回 complete=true；中途錯誤不回部分結果。上限 1–100 頁、1–10000 筆，單次 API 15 秒；無自動重試。
- comment-meta-history.cjs 提供 Facebook/Instagram 根留言與回覆分頁、Threads flat conversation 父子組合，核對事件範圍、時間、作者、目標留言，依時間與 ID 排序。缺權限／缺 ownership proof／空清單／缺欄位／父子異常均拒絕。
- 品牌回覆無法分辨人工與 Meta 自動化時，一律 replyOwnership=human；不宣稱已具備可靠的 AI／人工來源辨識。
- comment-erp-view.cjs 從既有私有 ledger 依平台／帳號／版本讀取建議、人工接手、保留／回執／unknown／錯誤及更新時間；不建新表，不新增公開 API。workflow.erp 提供 server-side list/takeover，人工接手只更新已授權帳號的既有對話。
- send ledger 完成與中斷隔離新增安全 error_code，供 ERP 同一讀取介面使用。

## 尚未驗證，禁止啟用

- verifyPost 必須由受保護的官方帳號與權限查詢產生，不能使用 webhook 內的 verified 或使用者輸入作證據。
- 三平台所用欄位、貼文類型、隱藏留言可見性及完整分頁契約尚待正式 API 回讀。缺少欄位時模組會拒絕，不能把 mock 視為官方支援證據。
- Instagram 空清單根因仍未確認。本次未呼叫正式 Meta API，未更新 Token，未發送留言。
- ERP 的私有程式介面已接入 createCommentWorkflow，但現有 ERP HTTP/UI 到此介面的受保護遠端綁定尚未部署驗收。不得宣稱畫面或遠端回寫已正常。
- 人工接手最後檢查至平台 POST 間仍存在外部競態；原有自動化協調與受控重疊驗收仍必要。
- TLS CA 未在正式 n8n 載入。Render pipeline 限制未解除，本次不部署、不關閉憑證驗證、不修改 RLS、不建立正式測試資料，三平台維持 OFF。
