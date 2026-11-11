#!/usr/bin/env python3
"""仙加味：只下載最新第一方已發布媒體，與現有49篇原圖作增量相似性比對。
No D1 edits, AI approvals, schedule or publication. Hash match and perceptual distance
are screening evidence only, never a claim that missing history was fully checked.
"""
import hashlib, io, json, os
from pathlib import Path
from urllib.parse import urlsplit
import requests
from PIL import Image, ImageOps, UnidentifiedImageError

REQ=Path("ops/request-historical-firstparty-media-delta-20261111.json")
MAN=Path("ops/visual-review/20261110-49-pending/manifest.json")
OUT=Path("ops/receipts/20261111-firstparty-historical-media-recovery.json")
EXPECTED={"3957491164539558820_78424002938","3944679925123219099_78424002938","411869648852531_1446376627512555"}
payload=json.loads(REQ.read_text())
manifest=json.loads(MAN.read_text())
if(payload.get("schema")!="xjw-historical-3-firstparty-media-restore-v1" or
   payload.get("noD1Writes") is not True or payload.get("noAiApproval") is not True or
   payload.get("noPublish") is not True or
   {x.get("id") for x in payload.get("items",[])}!=EXPECTED or len(payload["items"])!=3):
    raise SystemExit("Untrusted historical-media request or incomplete first-party source list")
records=manifest["records"]
if len(records)!=49 or len({r["postId"] for r in records})!=49:
    raise SystemExit("Expected complete 49-current-post manifest")

def sha256(data): return hashlib.sha256(data).hexdigest()

def get_image(data):
    im=Image.open(io.BytesIO(data))
    im.load()
    return ImageOps.exif_transpose(im).convert("RGB")

def dhash(im):
    g=im.convert("L").resize((9,8),Image.Resampling.LANCZOS)
    vals=list(g.getdata())
    return sum((1<<i) for i in range(64) if vals[(i//8)*9+i%8]>vals[(i//8)*9+i%8+1])

current=[]
for r in records:
    path=Path(r["imagePath"])
    if not path.is_file() or path.is_symlink():raise SystemExit("Missing source image "+str(path))
    data=path.read_bytes()
    if sha256(data)!=r["sha256"]:raise SystemExit("Candidate current image SHA changed: "+r["postId"])
    current.append({"post_id":r["postId"],"sha256":r["sha256"],"dhash":dhash(get_image(data))})
report={"schema":"xjw-historical-media-3-current-source-dedup-v1",
  "sources":"Metricool Brand 6889683 first-party already-published image fields",
  "pendingCompared":len(current),"sourceRequests":len(payload["items"]),
  "sourcePreviouslyRestoredNotRedownloaded":payload["alreadyRecoveredHistoricalMediaDoNotRedo"],
  "results":[],"mediaSaved":0,"sourceReachable":0,"failedSources":0,
  "D1Writes":0,"aiApprovals":0,"humanApprovals":0,"schedules":0,"publications":0,
  "fullHistoryCleared":False,"notes":[
    "64-bit dHash is a near-duplicate SCREEN only, never semantic/editorial certification",
    "15 historical private media and carousel children may remain unidentified",
    "Recovered photos remain published history, never new product photography"
  ]}
for item in payload["items"]:
    entry={"id":item["id"],"platform":item["platform"],
      "post_url":item["post_url"],"source":"Metricool first-party published-post image",
      "image_status":"unavailable","nearest":[]}
    url=item["media_url"]
    host=urlsplit(url).hostname or ""
    if not url.startswith("https://") or not (
        host.endswith(".cdninstagram.com") or host=="app.metricool.com"):
        entry["error"]="unsafe_source_domain"
        report["failedSources"]+=1
        report["results"].append(entry)
        continue
    try:
        # These are signed current CDN images; do not retry the known expired URL list.
        res=requests.get(url,headers={"User-Agent":"Mozilla/5.0 (compatible; xjw-owned-media-audit/1.0)",
        "Accept":"image/avif,image/webp,image/jpeg,image/png,*/*"},timeout=22)
        entry["http_status"]=res.status_code
        if res.status_code!=200:raise ValueError("remote HTTP "+str(res.status_code))
        data=res.content
        if len(data)<3000 or len(data)>12_000_000:raise ValueError("unacceptable source byte size")
        image=get_image(data)
        width,height=image.size
        if width<90 or height<90:raise ValueError("too small to compare safely")
        digest=sha256(data)
        hd=dhash(image)
        distances=sorted(({"post_id":p["post_id"],"dhashDistance":(hd^p["dhash"]).bit_count(),
           "exactSHA256Match":digest==p["sha256"]} for p in current),
           key=lambda x:(x["dhashDistance"],x["post_id"]))
        entry.update({"image_status":"retrieved","image_sha256":digest,"bytes":len(data),
          "pixels":[width,height],"nearest":distances[:8],
          "possibleNearDuplicates":[p for p in distances if p["dhashDistance"]<=10]})
        report["sourceReachable"]+=1
        # Preserve original bytes only if suitable for reliable visual review.
        if width>=256 and height>=256:
            ext=Image.open(io.BytesIO(data)).format.lower()
            if ext not in ("jpeg","png","webp"):raise ValueError("unsupported source media format")
            suffix=".jpg" if ext=="jpeg" else "."+ext
            output=Path("assets/historical-published")/item["platform"]/"2026-11-11-recovery"/(item["id"]+suffix)
            output.parent.mkdir(parents=True,exist_ok=True)
            output.write_bytes(data)
            entry["saved_path"]=str(output)
            report["mediaSaved"]+=1
        else:
            entry["lowResolutionOnly"]=True
    except (requests.RequestException,ValueError,OSError,UnidentifiedImageError) as e:
        entry["error"]=type(e).__name__+": "+str(e)[:90]
        report["failedSources"]+=1
    report["results"].append(entry)
OUT.parent.mkdir(parents=True,exist_ok=True)
OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
print("HISTORICAL_FIRSTPARTY_RECHECK",json.dumps({key:report[key] for key in
  ("pendingCompared","sourceRequests","sourceReachable","mediaSaved","failedSources","D1Writes")},ensure_ascii=False))
