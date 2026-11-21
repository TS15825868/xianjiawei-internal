-- 仙加味｜全量圖片雜湊覆蓋率稽核（唯讀）
-- 最新 SHA-256 不存在不等於檔案缺失；歷史 media_assets 或 GitHub 檔案可能仍存在。
-- 此查詢不修改正式資料，也不授權發布。
WITH latest AS (
 SELECT post_id,image_sha256,
 ROW_NUMBER() OVER(PARTITION BY post_id ORDER BY created_at DESC) rn
 FROM social_post_quality_reviews
), imaged AS (
 SELECT p.id,p.status,p.image_url,p.image_bytes,p.image_width,p.image_height,
        l.image_sha256
 FROM social_posts p LEFT JOIN latest l ON l.post_id=p.id AND l.rn=1
 WHERE p.image_url IS NOT NULL AND trim(p.image_url)<>''
)
SELECT status,COUNT(*) image_posts,
 SUM(CASE WHEN length(image_sha256)=64 THEN 1 ELSE 0 END) latest_sha_available,
 SUM(CASE WHEN image_sha256 IS NULL OR length(image_sha256)<>64 THEN 1 ELSE 0 END) latest_sha_missing
FROM imaged GROUP BY status ORDER BY status;

-- 只列需補查證據的歷史圖片；不回寫虛構 hash。
WITH latest AS (
 SELECT post_id,image_sha256,
 ROW_NUMBER() OVER(PARTITION BY post_id ORDER BY created_at DESC) rn
 FROM social_post_quality_reviews
)
SELECT p.id,p.status,p.image_url,p.image_bytes,p.image_width,p.image_height
FROM social_posts p LEFT JOIN latest l ON l.post_id=p.id AND l.rn=1
WHERE p.status IN ('archived','published')
  AND p.image_url IS NOT NULL AND trim(p.image_url)<>''
  AND (l.image_sha256 IS NULL OR length(l.image_sha256)<>64)
ORDER BY p.status,p.id;
