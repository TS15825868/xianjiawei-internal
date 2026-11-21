# 茶包浸泡時間｜正式 D1 唯讀核對（2026-11-21）

候選：k-tea-steep-01；原稿及 1080×1350 2D WebP 見 `docs/content-research/tea-steep-candidate-20261121.md` 與 `docs/content-research/media/k-tea-steep-01.webp`；原提交 47989d95ba598443f4dc7d89f8f8f9431df2fa8c。

## 本次實際查核
透過已授權 Cloudflare D1 API 對 `xianjiawei-internal-db` 直接執行唯讀 SQL，未修改資料：
- `SELECT status,COUNT(*) n FROM social_posts GROUP BY status`：archived 107、pending_review 46、published 8，合計 161。
- `SELECT id,title,status FROM social_posts WHERE title LIKE '%茶%' OR copy LIKE '%浸泡時間%' LIMIT 15`：0 筆。
- `SELECT COUNT(*) n FROM media_assets WHERE name LIKE '%茶%' OR file_name LIKE '%tea%' OR notes LIKE '%茶包%'`：0 筆。
- `SELECT COUNT(*) n FROM social_post_quality_reviews WHERE post_id LIKE '%tea%'`：0 筆。

## 證據邊界
以上為指定欄位及關鍵字比對，**不是**對全部 161 篇歷史圖片進行 SHA-256、感知雜湊、構圖、角色動作、場景及語意近似的完整查核；未命中不等於無重複。原始候選圖片仍需與歷史媒體原檔比對，並逐項完成正式品質檢查及有效發布授權。不得直接將 GitHub 候選視為 D1 已審核或 Metricool 已排程。

## 下一個安全執行關卡
1. 找齊歷史媒體原圖、輪播子圖及可靠的圖片指紋，對照候選主圖；缺檔應標記 DEFER，不得冒稱 PASS。
2. 比對三平台文案與已發布、待審、封存全部 161 篇的近似語意及主題角度。
3. 完成適用 16 項品質與品牌檢查，記錄各項證據與獨立授權來源；依既有閘門寫入正式待審或核准。
4. 僅在授權及安全閘門全數通過後才排程與發布，取得三平台回執後再查 GA4 `knowledge_202611` 入帳。
5. 保留 11/25 龜鹿飲與 11/28 鹿茸粉既有草稿，不重複建立、不改為已發布。

狀態：唯讀查核完成；完整去重、品質審核、正式發布、成效驗收尚未完成。
