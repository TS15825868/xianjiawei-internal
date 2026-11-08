#!/usr/bin/env python3
"""Read-only original image visual similarity audit of all live D1 pending and repo archived/published image files."""
import hashlib,json,os,re,urllib.request
from pathlib import Path
from PIL import Image,ImageOps,ImageStat
cfg=json.loads(Path("ops/request-current-vs-archived-image-visual-audit-20261108.json").read_text())
if cfg.get("schema")!="xjw-all-current-local-images-versus-archived-and-published-20261108-v1" or cfg.get("readOnly") is not True or cfg.get("allowApproval") is not False or cfg.get("allowPublication") is not False or cfg.get("deleteNothing") is not True:
 raise RuntimeError("Unsafe source audit config")
account=os.environ.get("CLOUDFLARE_ACCOUNT_ID"); token=os.environ.get("CLOUDFLARE_API_TOKEN")
db=re.search(r'"database_id"\s*:\s*"([a-f0-9-]+)"',Path("wrangler.jsonc").read_text()).group(1)
if not account or not token:raise RuntimeError("Cloudflare D1 read credentials unavailable")
url=f"https://api.cloudflare.com/client/v4/accounts/{account}/d1/database/{db}/query"
def q(sql):
 payload=json.dumps({"sql":sql}).encode()
 request=urllib.request.Request(url,data=payload,headers={"Authorization":"Bearer "+token,"content-type":"application/json"},method="POST")
 with urllib.request.urlopen(request,timeout=45) as response:result=json.load(response)
 if result.get("success") is not True or any(x.get("success") is False for x in result.get("result",[])):raise RuntimeError("D1 query failed "+str(result.get("errors"))[:120])
 return result.get("result",[{}])[0].get("results",[])
counts=q("SELECT status,COUNT(*) AS count FROM social_posts GROUP BY status ORDER BY status")
rows=q("SELECT id,title,status,copy,image_url FROM social_posts WHERE status IN ('pending_review','archived','published') ORDER BY id")
expectedTotal=sum(int(r["count"]) for r in counts)
if len(rows)!=expectedTotal or len(set(x["id"] for x in rows))!=len(rows):raise RuntimeError("D1 snapshot truncated or repeated")
prefix="https://raw.githubusercontent.com/TS15825868/xianjiawei-internal/main/"
def dhash(im):
 im=ImageOps.grayscale(im).resize((9,8),Image.Resampling.LANCZOS)
 p=list(im.getdata());h=0
 for y in range(8):
  for x in range(8):
   h=(h<<1)|int(p[y*9+x]>p[y*9+x+1])
 return h
def ahash(im):
 im=ImageOps.grayscale(im).resize((8,8),Image.Resampling.LANCZOS)
 p=list(im.getdata());mean=sum(p)/len(p);h=0
 for v in p:h=(h<<1)|int(v>=mean)
 return h
def info(p):
 with Image.open(p) as source:
  image=ImageOps.exif_transpose(source).convert("RGB")
  return {"size":list(image.size),"dhash":dhash(image),"ahash":ahash(image),"pixels":list(image.resize((16,16),Image.Resampling.LANCZOS).getdata())}
out=[];issues=[]
for x in rows:
 u=x.get("image_url") or ""
 if not u.startswith(prefix):
  if x["status"]=="pending_review":issues.append({"id":x["id"],"issue":"pending source not GitHub"})
  continue
 rel=u[len(prefix):].split("?",1)[0]
 if not rel.startswith(("assets/post-images/","media/social-candidates/")) or ".." in Path(rel).parts or "\\" in rel:raise RuntimeError("Unexpected asset path "+rel[:80])
 p=Path(rel)
 if not p.is_file():
  issues.append({"id":x["id"],"status":x["status"],"issue":"GitHub source not tracked","path":rel});continue
 try:
  inf=info(p)
  out.append({"id":x["id"],"title":x.get("title"),"status":x["status"],"path":rel,"sha":hashlib.sha256(p.read_bytes()).hexdigest(),**inf})
 except Exception as e:issues.append({"id":x["id"],"status":x["status"],"issue":str(e)[:150]})
for post,src,sha in [
 ("IG:4003809463882866913_78424002938","assets/historical-published/instagram/2026-10-09/4003809463882866913_78424002938.jpg","b25f76805c3637883769d514a3e0428f87f2e0032902c311c86ae27ecdceeb90"),
 ("IG:4003900963899413608_78424002938","assets/historical-published/instagram/2026-10-09/4003900963899413608_78424002938.jpg","151266c7d292d9d50e1bd13568781d5a9f0c8dbc3c7227be0d6056e0ba55594a")]:
 p=Path(src)
 if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest()!=sha:raise RuntimeError("Published original mirror source hash mismatch "+post)
 out.append({"id":post,"title":"Historically published original","status":"published_ig_source","path":src,"sha":sha,**info(p)})
pending=[x for x in out if x["status"]=="pending_review"];ref=out
expectedPending=next((int(x["count"]) for x in counts if x["status"]=="pending_review"),0)
if len(pending)!=expectedPending:raise RuntimeError("Current pending images incomplete; do not infer duplicates")
def dist(a,b):return (a^b).bit_count()
pairs=[]
nearest=[]
for i,a in enumerate(pending):
 candidates=[]
 for b in ref:
  if a["id"]==b["id"]:continue
  if a["status"]=="pending_review" and b["status"]=="pending_review" and a["id"]>b["id"]:continue
  d=dist(a["dhash"],b["dhash"]);ad=dist(a["ahash"],b["ahash"]);exact=(a["sha"]==b["sha"])
  if exact or d<=cfg["thresholds"]["dhash64"] or ad<=cfg["thresholds"]["averageHash64"]:
   pairs.append({"current":a["id"],"reference":b["id"],"referenceStatus":b["status"],"exactFile":exact,"dhash64":d,"averageHash64":ad,"currentPath":a["path"],"referencePath":b["path"]})
  candidates.append({"id":b["id"],"status":b["status"],"dhash64":d,"averageHash64":ad})
 nearest.append({"id":a["id"],"neighbors":sorted(candidates,key=lambda x:(min(x["dhash64"],x["averageHash64"]),x["dhash64"]))[:3]})
end=q("SELECT status,COUNT(*) AS count FROM social_posts GROUP BY status ORDER BY status")
if counts!=end:raise RuntimeError("Concurrent D1 changes invalidate result")
pairs.sort(key=lambda x:(not x["exactFile"],min(x["dhash64"],x["averageHash64"]),x["dhash64"]))
report={"schema":cfg["schema"],"generatedAt":__import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
"head":os.environ.get("GITHUB_SHA"),"counts":counts,"pendingScanned":len(pending),"referenceImages":len(ref),
"referenceBreakdown":dict((status,len([x for x in out if x["status"]==status])) for status in ["pending_review","archived","published","published_ig_source"]),
"missingOrUnreadable":issues,"imageNearPairs":pairs,"allPendingNearest":nearest,"exactFileDuplicates":sum(x["exactFile"] for x in pairs),
"caveats":["Simple 64-bit hashes screen similarities; threshold hit is not a verdict and misses different camera crops or substantially re-rendered scenes.","The external historical 178-image scratch cache was not fetched or redownloaded. 15 unidentified private cache misses and 3 public media gaps remain.","Archive and published rows with no GitHub image path cannot be visually compared here.","Current pending unchanged, duplicate DEFER remains in D1; this is supplemental evidence only."],"d1Mutations":0,"approvals":0,"schedules":0,"publications":0,"deletions":0}
Path("current-vs-archived-visual-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
print("CURRENT_VS_ARCHIVED_VISUAL",json.dumps({k:report[k] for k in ["counts","pendingScanned","referenceImages","referenceBreakdown","exactFileDuplicates"]},ensure_ascii=False))
print("VISUAL_PAIRS",json.dumps(pairs[:40],ensure_ascii=False))
print("VISUAL_ISSUES",json.dumps(issues[:30],ensure_ascii=False))
