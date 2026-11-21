-- 仙加味｜待審貼文與全歷史精確碰撞稽核（唯讀）
-- 僅判定標題、文案、圖片 URL、歷史審核 SHA-256 精確碰撞。
-- 不代表圖片視覺／感知雜湊、構圖、角色、產品真實外觀或語意去重完成。
-- 不可將 0 筆碰撞直接改寫為 AI_APPROVED 或 duplicate=PASS。
WITH latest_pending AS (
 SELECT p.id,p.title,p.copy,p.image_url,
        (SELECT r.image_sha256 FROM social_post_quality_reviews r
         WHERE r.post_id=p.id ORDER BY r.created_at DESC LIMIT 1) image_sha256
 FROM social_posts p WHERE p.status='pending_review'
), exact_content AS (
 SELECT p.id pending_id,h.id historical_id,h.status historical_status,
        CASE WHEN trim(p.copy)=trim(h.copy) THEN 'copy_exact'
             WHEN trim(p.title)=trim(h.title) THEN 'title_exact'
             WHEN trim(p.image_url)=trim(h.image_url) THEN 'image_url_exact' END collision_type
 FROM latest_pending p JOIN social_posts h ON h.id<>p.id
 WHERE (trim(p.copy)<>'' AND trim(p.copy)=trim(h.copy))
    OR (trim(p.title)<>'' AND trim(p.title)=trim(h.title))
    OR (trim(p.image_url)<>'' AND trim(p.image_url)=trim(h.image_url))
), hash_collision AS (
 SELECT DISTINCT p.id pending_id,r.post_id historical_id,'review_history' historical_status,
        'historical_image_sha256_exact' collision_type
 FROM latest_pending p JOIN social_post_quality_reviews r
 ON r.post_id<>p.id AND r.image_sha256=p.image_sha256
 WHERE length(p.image_sha256)=64
)
SELECT * FROM exact_content
UNION ALL SELECT * FROM hash_collision
ORDER BY pending_id,collision_type,historical_id;
