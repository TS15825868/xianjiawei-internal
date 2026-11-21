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
