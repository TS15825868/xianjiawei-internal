# 仙加味｜AI 自然流量成長實作基準（2026-11-21）

狀態：正式內部營運規範及實際量測索引；不是已發布、部署或保證成長的證明。

## 目標與邊界
首要目標為讓陌生讀者認識仙加味、提升非粉絲觸及、內容點擊、分享收藏與追蹤；次要目標為官網知識頁閱讀、官方 LINE @762jybnm 自願詢問，最後才是實際成交。不能透過假帳號、灌讚、機器人留言、大量陌生私訊、假評論、未經同意標註或宣稱第三方 AI 必定推薦。維持 NT$0、原有審核授權與每月平台發布額度。

## 已核對資料來源與實際量測
2026-11-21 已透過連接的 Metricool 查到品牌 6889683，已連 Facebook、Instagram xianjiawei.tw、Threads xianjiawei.tw；並查詢 2026-11-01 至 11-20 的可用指標及資料。Metricool 指標字典確認：
- Facebook：FBEV12 貼文曝光、FBEV15 分享、FBEV16 貼文點擊、FBEV17 粉絲總數（最後值，不得加總）。
- Instagram：IGEV01 粉絲總數、IGEV05 內容觀看、IGEV06 帳號觸及、IGEV15 貼文收藏（不含 Reels）。
- Threads：THEV01 粉絲總數、THEV06 貼文觀看、THEV09 轉發。
指標查詢結果含日期列及部分 null，不能把 null 當 0、把不同平台的觀看當同一種獨立觸及、把貼文點擊當官網連結點擊；須依平台與資料欄位獨立處理。當期資料若不完整，保留原始查詢期間及缺漏註記。
先前正式營運對帳 11/01–11/19 Facebook 自然曝光 816、貼文點擊 12、連結點擊 0；此為不同口徑的歷史基準，不可直接與本次 FBEV12 混算。

## 執行優先序
1. 每輪先讀最新 GitHub main、D1 審核/排程及 Metricool 已發/草稿狀態，避免重複發布及舊資料回流。
2. 依公開社群熱門問題找主題，但官方資料與可信專業資料負責事實查證；記錄來源 URL、日期、風險、可重製性。禁止未授權擷取私人內容或搬運圖片。
3. 優先創作可收藏的具體食材挑選、保存、料理比例、茶飲步驟、季節生活技巧、迷思釐清；不要每篇硬塞商品。標題採明確問題或可操作的利益點，不誇大療效。
4. 每篇為 FB、IG、Threads 分別準備開頭、內容長度、可讀首圖與適當引導；正式產品必須使用真實原圖，角色依既定品牌規格，完成歷史圖文去重與16項適用審核。未合格維持待審，不啟用關閉中的發布開關。
5. 官網新增內容前檢查既有路由、SEO 與搜尋索引；有完整可靠來源才製作原創知識頁，使用清楚標題、摘要、內部連結、結構化資料（僅標記頁面真實存在的資訊）。不聲稱能操控 Google 或 AI 助理推薦。
6. 對外連結在不破壞既有連結的前提下，使用 utm_source=facebook|instagram|threads、utm_medium=organic_social、utm_campaign=knowledge_YYYYMM、utm_content=不含個資的內容ID。每次保留原始連結與跳轉驗證；LINE 深連結另記來源，不強制增加追蹤碼。
7. 發布後以各平台實際回執、來源連結、成效觀測日期對帳；比較主題/首圖/開頭/時段，保留成功模式但不得換句話重發。

## 成效欄位與判定
post_id、source_topic、platform、published_url、published_at、campaign、content_variant、source_evidence、review_status、impressions_or_views、reach、non_follower_reach（有提供才填）、post_clicks、link_clicks、shares、saves、comments、new_followers（可歸因才填）、website_sessions（可歸因才填）、line_inquiries（真實來源可核才填）、metric_window、last_verified_at、data_gaps。
CTR 僅在有相同口徑的連結點擊與曝光分母時才計算；貼文點擊率需另外標示，不可冒稱導站 CTR。不得以互動率推估成交。
驗收：實際寫入/提交、正式部署、三平台實際發布、流量改善分開回報；缺任何外部回執就標未驗證。

## 本次尚未完成
尚未建立新社群貼文、正式發布、修改網站 SEO 程式或部署；僅建立可供後續自動化執行與驗收的成長量測規範。