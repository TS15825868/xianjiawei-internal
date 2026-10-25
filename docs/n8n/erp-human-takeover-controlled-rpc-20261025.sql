-- Safe, additive, least-privilege ERP human-takeover bridge.
-- xjw_social_worker intentionally has no table UPDATE privileges.
-- No customer send, status flag enablement, RLS changes or account data writes.
CREATE FUNCTION xjw_social.mark_human_takeover(
 p_platform text, p_account_id text, p_post_id text, p_thread_id text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE v_updated integer;
BEGIN
 IF p_platform IS NULL OR p_platform NOT IN ('facebook','instagram','threads')
  OR p_account_id IS NULL OR p_account_id !~ '^[0-9]{1,64}$'
  OR p_post_id IS NULL OR p_post_id !~ '^[0-9]{1,64}(_[0-9]{1,64})?$'
  OR p_thread_id IS NULL OR p_thread_id !~ '^[0-9]{1,64}(_[0-9]{1,64})?$'
 THEN RAISE EXCEPTION 'invalid takeover scope' USING ERRCODE='22023';
 END IF;
 UPDATE xjw_social.comment_ledger
 SET human_takeover=true, updated_at=now()
 WHERE platform=p_platform AND account_id=p_account_id
  AND post_id=p_post_id AND thread_id=p_thread_id;
 GET DIAGNOSTICS v_updated = ROW_COUNT;
 RETURN v_updated;
END;
$function$;
REVOKE ALL ON FUNCTION xjw_social.mark_human_takeover(text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION xjw_social.mark_human_takeover(text,text,text,text) TO xjw_social_worker;
