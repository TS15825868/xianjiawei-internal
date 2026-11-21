# 仙加味｜歷史圖片來源核對（2026-11-21，唯讀）

用途：追查 46 篇待審的歷史圖片去重覆蓋率，不作發布授權、圖片相似度通過或 D1 寫入依據。

| 歷史貼文 | 來源 | 目前核對結果 |
|---|---|---|
| POST-TRIAL-MAIN | D1 media_assets / IMG-OFFICIAL-12-TRIAL | base64 可解碼，57232 bytes，SHA-256 `47793954b2883aab287edefc1b059c033d1bb9be605df114ff16f0d90cbfe40f` |
| POST-BRAND-START | D1 media_assets / IMG-OFFICIAL-13-BRAND-STORY | base64 可解碼，27672 bytes，SHA-256 `dad70a2120e5630e733c341993ef477c28bc5e06eef203a5c780bda72780f9cd` |
| XJW-CONV-brand-third-generation-note | GitHub main / assets/post-images/2026-10-10/formal-production/XJW-CONV-brand-third-generation-note-scene-v3.jpg | 存在；Git Blob SHA `c2818692e0c2e3f6ed1023ae5d817167209d6184`；未計算原圖 SHA-256 |
| XJW-CONV-chat-customer-first-question | GitHub main / assets/post-images/2026-10-12/formal-production/XJW-CONV-chat-customer-first-question-audit-v1.jpg | 存在；Git Blob SHA `8c2a5977761fbfaab0e30b7a615ddba862f15dbb`；未計算原圖 SHA-256 |
| XJW-CONV-live-hongludi-outing-20260929 | GitHub main / assets/post-images/2026-10-11/formal-production/XJW-CONV-live-hongludi-outing-20260929-scene-v1.jpg | 存在；Git Blob SHA `743eafb0883d79178ee7d94ae4e327ab3acb5fc3`；未計算原圖 SHA-256 |
| XJW-CONV-new-year-open-door | GitHub main / assets/post-images/2026-10-12/formal-production/XJW-CONV-new-year-open-door-audit-v1.jpg | 存在；Git Blob SHA `758dde3124c3b0be4e86f12a4201329b4e123732`；未計算原圖 SHA-256 |
| XJW-SOCIAL-20260904-0900-FIRST | GitHub Pages / images/posts/formal-v20260904/first-post-work-rest-qmascot.webp | 直接讀取 HTTP 403，原圖 SHA-256 未核驗 |

重要：Git Blob SHA 是 Git 物件識別碼，**不是**檔案 SHA-256。即使原圖 SHA-256 全部取得，仍須視覺／感知相似度及歷史素材覆蓋率驗證；不得自動將 `duplicate=DEFER` 改為 `PASS`。

## 補充實測（2026-11-21）

從正式 GitHub main 直接取得檔案內容、Base64 解碼並計算 SHA-256，四張封存圖片位元組與 D1 記錄相符：

| 貼文 ID | 原始 bytes | SHA-256 |
|---|---:|---|
| XJW-CONV-brand-third-generation-note | 882825 | `f13103dba3309755a372e3bdf38f32c3579c55549c8121e48c4524406b6151b6` |
| XJW-CONV-chat-customer-first-question | 642410 | `149f09686eb9880b0289b0d481369a407d70e247e38807b74d4dc2aa722cde32` |
| XJW-CONV-live-hongludi-outing-20260929 | 874289 | `ecce9526a3c76898764b3f4f3ba49bc44be69114c36a39c879e906b18b84e110` |
| XJW-CONV-new-year-open-door | 1041033 | `57dba205793cc6c358200b6c3a02be0e3b30e979144ce72bdc4e10a614f64411` |

**9/4 圖片版本不一致：** 從官網 Repository `TS15825868/xianjiawei` 最新 main 的 `images/posts/formal-v20260904/first-post-work-rest-qmascot.webp` 取得 **172548 bytes**，SHA-256 `0c73c6cd5a4ac8942a89d160838789744a813f617536e8d8c26260867ccf14d2`，但 D1 的 `XJW-SOCIAL-20260904-0900-FIRST` 記錄 **317077 bytes**。不可將目前 GitHub 檔案視為當年發布的同一版本；應追查歷史 commit 或實際平台媒體。不得寫入 D1 或解除 `duplicate=DEFER`。

## 9／4 來源追查補充

- D1 `social_posts.image_source` 明確記錄「使用者人工指定｜identity-approved｜2026-09-04正式Q版小男生完整單一情境圖」，`image_bytes=317077`，`media_id=NULL`；`social_post_quality_reviews` 無該篇審核列。這是歷史標註，不代表目前 GitHub 同路徑圖片相同。
- Metricool 2026-09-04 Facebook 與 Instagram 已發布貼文分析均有相同文案及平台媒體縮圖 URL。FB 貼文 ID `1471535304996687`、IG 連結 `https://www.instagram.com/p/Dc3L479FavT/`。平台 CDN 圖片可能是縮圖、轉碼或過期 URL，不可用其位元組大小直接判斷原始發布圖。
- 搜尋官網 GitHub `first-post` 相關 commit，已找到數筆內容清單變更，但指定圖片路徑在這些 commit 中均為 404；目前尚未取得 317077 bytes 的歷史圖片版本。
- 不回寫 D1，不推定 9／4 影像已被更換，也不因平台貼文存在就認定圖片視覺去重合格。
