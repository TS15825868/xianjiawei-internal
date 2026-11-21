-- 仙加味：已發布貼文的授權來源與三平台回執唯讀稽核
-- 使用 Cloudflare D1 SQLite；僅 SELECT，不會補造核准或修改發布狀態。
-- 「owner-directed」稽核線索不等同 16 項人工核准，也不代表已驗證原始聊天。
-- 缺少核准欄位不等於未經授權；需檢查個別指示與來源證據。
-- 歷史大小寫不一致已正規化；0 筆回執代表本表缺資料，並非未發布。
-- 2026-09-04 兩平台回執不應自動補造 Threads 回執。
-- 2026-11-21 Metricool 已發布貼文唯讀查核：2026-08-03 品牌故事、08-06 試喝、09-04 週五早上均有 FB/IG 對應貼文。
-- 2026-08-06 試喝貼文與 D1 POST-TRIAL-MAIN 的 published_at=08-19 不一致，僅作同主題歷史佐證。
-- Metricool 2026-09 全月 Threads 8 筆，未見 09-04 週五早上；缺件不可視為未發布或擅自補發。
-- IG 證據：品牌 https://www.instagram.com/p/DblHxYGoAdW/ ；試喝 https://www.instagram.com/p/Dbr1T8YIJuk/ ；週五 https://www.instagram.com/p/Dc3L479FavT/


WITH published AS (
  SELECT id, title, published_at, approved_by, approved_at, image_approved
  FROM social_posts WHERE status='published'
), deliveries AS (
  SELECT post_id,
    COUNT(DISTINCT CASE WHEN LOWER(TRIM(status))='published' AND LOWER(TRIM(platform)) IN ('facebook','instagram','threads')
      AND TRIM(COALESCE(remote_id,''))<>'' THEN platform END) AS platform_receipts
  FROM social_publish_deliveries GROUP BY post_id
), owner_traces AS (
  SELECT entity_id,
    MAX(CASE WHEN action LIKE '單篇使用者指示%'
      AND json_valid(after_json)
      AND NULLIF(json_extract(after_json,'$.ownerAuthorizationRef'),'') IS NOT NULL
      AND LENGTH(COALESCE(json_extract(after_json,'$.fingerprint'),''))=64
      THEN 1 ELSE 0 END) AS version_bound_owner_ref,
    MAX(CASE WHEN action LIKE '%使用者明確發布%' OR action LIKE '單篇使用者指示%'
      THEN 1 ELSE 0 END) AS owner_instruction_audit
  FROM audit_logs
  GROUP BY entity_id
), manual_gates AS (
  SELECT post_id, MAX(CASE WHEN reviewed_by IS NOT NULL AND TRIM(reviewed_by)<>''
    THEN 1 ELSE 0 END) AS has_review_gate
  FROM social_post_review_gates GROUP BY post_id
)
SELECT p.id,p.title,p.published_at,
  COALESCE(d.platform_receipts,0) AS platform_receipts,
  CASE WHEN TRIM(COALESCE(p.approved_by,''))<>'' AND p.approved_at IS NOT NULL
    AND p.image_approved=1 THEN 'approval_fields_present' ELSE 'approval_fields_incomplete' END AS approval_fields,
  COALESCE(g.has_review_gate,0) AS has_review_gate,
  COALESCE(o.version_bound_owner_ref,0) AS version_bound_owner_ref,
  COALESCE(o.owner_instruction_audit,0) AS owner_instruction_audit,
  CASE
    WHEN COALESCE(d.platform_receipts,0)<3 THEN 'receipt_followup'
    WHEN TRIM(COALESCE(p.approved_by,''))<>'' AND p.approved_at IS NOT NULL AND p.image_approved=1 THEN 'approval_fields_present_verify_gate'
    WHEN COALESCE(o.version_bound_owner_ref,0)=1 THEN 'owner_ref_recorded_verify_original_instruction'
    WHEN COALESCE(o.owner_instruction_audit,0)=1 THEN 'owner_instruction_logged_verify_original'
    ELSE 'authorization_evidence_followup'
  END AS audit_class
FROM published p
LEFT JOIN deliveries d ON d.post_id=p.id
LEFT JOIN owner_traces o ON o.entity_id=p.id
LEFT JOIN manual_gates g ON g.post_id=p.id
ORDER BY p.published_at DESC;
