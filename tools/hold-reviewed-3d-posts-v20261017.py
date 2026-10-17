#!/usr/bin/env python3
"""Hold only 62 specifically sight-checked nonpublished 3D posts. No image, copy, or published-row deletion."""
from pathlib import Path
from urllib.parse import urlsplit
import json,sys
A=Path("/tmp/xjw-visual-audit/index.json")
BEFORE=Path("/tmp/xjw-current-posts-before.json")
AFTER=Path("/tmp/xjw-current-posts-after.json")
SQL=Path("/tmp/xjw-hold-62.sql")
PREFIX="https://raw.githubusercontent.com/TS15825868/xianjiawei-internal/main/assets/post-images/"
MARKER="20261017_3D_FULL_AUDIT"
def rows(path):
    data=json.loads(path.read_text(encoding="utf-8"))
    return (data[0]["results"] if isinstance(data,list) else data["results"])
def checked():
    a=json.loads(A.read_text(encoding="utf-8"))
    allitems=a["items"]
    selected=[p for p in allitems if not p.get("error")]
    assert len(allitems)==65 and len(selected)==62 and len({p["id"] for p in selected})==62
    assert sum(p["status"]=="approved" for p in selected)==47
    assert sum(p["status"]=="pending_review" for p in selected)==15
    assert all(p["url"].startswith(PREFIX) and "/assets/post-images/" in p["url"] for p in selected)
    return selected
def sqlquote(v):return "'"+str(v).replace("'","''")+"'"
data=checked(); ids={x["id"]:x for x in data}
if sys.argv[1]=="prepare":
    live={x["id"]:x for x in rows(BEFORE)}
    for post in data:
        cur=live.get(post["id"])
        if not cur:raise SystemExit("Current row missing: "+post["id"])
        if cur["image_url"]!=post["url"] or cur["status"]!=post["status"]:raise SystemExit("Stale reviewed image or changed status: "+post["id"])
        if cur.get("published_at") or cur.get("scheduled_at") or bool(cur.get("active_external_schedule")):raise SystemExit("Potential active/published post. Stop: "+post["id"])
        if post["status"]=="approved" and str(cur.get("approved_by") or "").strip():raise SystemExit("Human approved since snapshot; stop: "+post["id"])
    # Row-wise (id,image_url) pair guard is essential: an independently replaced correct photo must never be held by this process.
    pairs=",\n".join("("+sqlquote(x["id"])+","+sqlquote(x["url"])+")" for x in data)
    statement=("UPDATE social_posts SET status='pending_review', approved_by=NULL, approved_at=NULL, "+
      "image_approved=0, image_quality_status='needs_rework', scheduled_at=NULL, "+
      "rejection_reason='實際圖片覆核：小老闆與夥伴為非正式立體3D風格；涉及產品的貼文需核對正式實物原圖。請重新製作固定2D Q版並回待審核。', "+
      "review_note=CASE WHEN instr(COALESCE(review_note,''),'"+MARKER+"')>0 THEN review_note "+
      "ELSE COALESCE(review_note,'') || ' | "+MARKER+": 實物圖片逐張確認偏3D，保留舊文案／舊圖，待新2D情境圖與16項人工審核' END, "+
      "updated_at=CURRENT_TIMESTAMP WHERE status IN ('approved','pending_review') "+
      "AND approved_by IS NULL AND scheduled_at IS NULL AND published_at IS NULL "+
      "AND (id,image_url) IN (\n"+pairs+"\n);")
    SQL.write_text(statement+"\n",encoding="utf-8")
    print("PREFLIGHT PASS: precisely 62 current image/status pairs, 47 pseud-approved and 15 pending; no published/external-scheduled posts touched")
elif sys.argv[1]=="verify":
    live={x["id"]:x for x in rows(AFTER)}
    wrong=[]
    for x in data:
        r=live.get(x["id"],{})
        if r.get("status")!="pending_review" or r.get("image_url")!=x["url"] or int(r.get("image_approved") or 0)!=0 or r.get("image_quality_status")!="needs_rework" or r.get("approved_by") or r.get("approved_at") or r.get("scheduled_at") or r.get("published_at"):
            wrong.append(x["id"])
    if wrong:raise SystemExit("Verification failed: "+repr(wrong[:10]))
    print("VERIFIED: 62 inspected posts now pending_review, all source images and text preserved, 47 unauthorized approvals cleared")
else:raise SystemExit("Usage: prepare|verify")
