-- 仙加味：唯讀對照 D1 歷史 Facebook 快照與已發布貼文
-- 歷史快照是發布佐證，不是 Metricool 三平台回執，也不等同正式授權。
-- 僅匹配明確文字片段；不同日期或文案版本不得自動視為同一筆發布。
WITH historical AS (
 SELECT json_extract(j.value,'$.date') fb_date,
        json_extract(j.value,'$.permalink') fb_url,
        json_extract(j.value,'$.text') fb_copy
 FROM social_meta_history_readonly h,
      json_each(h.result_json,'$.facebook') j
 WHERE h.run_id='XJW-META-HISTORY-20261105-V1'
), candidates AS (
 SELECT p.id,p.title,p.published_at,h.fb_date,h.fb_url,
   CASE
     WHEN p.id='POST-BRAND-START' AND h.fb_copy LIKE '仙加味，從萬華開始。%' THEN 'same_title_historical_copy'
     WHEN p.id='POST-TRIAL-MAIN' AND h.fb_copy LIKE '龜鹿飲試喝組｜先試喝，再決定%' THEN 'same_topic_date_differs'
     WHEN p.id='XJW-SOCIAL-20260904-0900-FIRST' AND h.fb_copy LIKE '週五早上，先把今天想問的整理好%' THEN 'same_title_historical_copy'
   END evidence_type
 FROM social_posts p JOIN historical h ON (
   (p.id='POST-BRAND-START' AND h.fb_copy LIKE '仙加味，從萬華開始。%')
   OR (p.id='POST-TRIAL-MAIN' AND h.fb_copy LIKE '龜鹿飲試喝組｜先試喝，再決定%')
   OR (p.id='XJW-SOCIAL-20260904-0900-FIRST' AND h.fb_copy LIKE '週五早上，先把今天想問的整理好%')
 )
 WHERE p.status='published'
)
SELECT * FROM candidates ORDER BY id,fb_date;
