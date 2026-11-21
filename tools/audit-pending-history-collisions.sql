-- 仙加味｜待審貼文與全歷史精確碰撞稽核（唯讀）
-- 每種碰撞分別輸出，避免 CASE 只回報同一對貼文的第一種碰撞。
-- 歷史含封存、已發布及其他待審；排除自己與自己比較。
-- 不包含感知雜湊、構圖、產品外觀或語意判定。
-- 零碰撞不得直接改寫為 AI_APPROVED 或 duplicate=PASS。
WITH latest_pending AS (
 SELECT p.id,p.title,p.copy,p.image_url,
        (SELECT r.image_sha256 FROM social_post_quality_reviews r
         WHERE r.post_id=p.id ORDER BY r.created_at DESC LIMIT 1) image_sha256
 FROM social_posts p WHERE p.status='pending_review'
), exact_content AS (
 SELECT p.id pending_id,h.id historical_id,h.status historical_status,
        'copy_exact' collision_type
 FROM latest_pending p JOIN social_posts h ON h.id<>p.id
 WHERE trim(p.copy)<>'' AND trim(p.copy)=trim(h.copy)
 UNION ALL
 SELECT p.id,h.id,h.status,'title_exact'
 FROM latest_pending p JOIN social_posts h ON h.id<>p.id
 WHERE trim(p.title)<>'' AND trim(p.title)=trim(h.title)
 UNION ALL
 SELECT p.id,h.id,h.status,'image_url_exact'
 FROM latest_pending p JOIN social_posts h ON h.id<>p.id
 WHERE trim(p.image_url)<>'' AND trim(p.image_url)=trim(h.image_url)
), hash_collision AS (
 SELECT DISTINCT p.id pending_id,r.post_id historical_id,
        COALESCE(h.status,'review_history_only') historical_status,
        'historical_image_sha256_exact' collision_type
 FROM latest_pending p JOIN social_post_quality_reviews r
 ON r.post_id<>p.id AND lower(r.image_sha256)=lower(p.image_sha256)
 LEFT JOIN social_posts h ON h.id=r.post_id
 WHERE length(p.image_sha256)=64
)
SELECT * FROM exact_content
UNION ALL SELECT * FROM hash_collision
ORDER BY pending_id,collision_type,historical_id;
