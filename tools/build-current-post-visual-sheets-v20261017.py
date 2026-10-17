#!/usr/bin/env python3
"""Read-only thumbnail proof of CURRENT active D1 social images; no publish, review, or database mutations."""
from pathlib import Path
from io import BytesIO
from urllib.parse import urlparse
from urllib.request import Request,urlopen
from concurrent.futures import ThreadPoolExecutor
import json,os,math
from PIL import Image,ImageOps,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1]
S=ROOT/"active-post-media.json"
if not S.exists():raise SystemExit("No live D1 export")
r=json.loads(S.read_text(encoding="utf8"))
rows=r[0]["results"] if isinstance(r,list) else r["results"]
valid=[]
for item in rows:
    if item["status"] not in ("pending_review","approved","scheduled","published"):continue
    url=item.get("image_url") or ""
    u=urlparse(url)
    if u.scheme!="https" or u.hostname!="raw.githubusercontent.com" or not u.path.startswith("/TS15825868/xianjiawei-internal/main/assets/post-images/"):
        valid.append({"id":item["id"],"status":item["status"],"url":url,"error":"unsupported current official image host/path"})
        continue
    valid.append({"id":item["id"],"status":item["status"],"url":url})
out=ROOT/"social-visual-evidence";out.mkdir(exist_ok=True)
def get(row):
    if row.get("error"):return None
    try:
        req=Request(row["url"],headers={"User-Agent":"XJW-current-social-image-audit/1.0"})
        with urlopen(req,timeout=25) as res:
            typ=res.headers.get("Content-Type","")
            if not typ.startswith("image/"):raise ValueError("not image")
            data=res.read(9*1024*1024)
        im=Image.open(BytesIO(data));im.load()
        if im.width<600 or im.height<600:raise ValueError("too small")
        row["dimensions"]=[im.width,im.height]
        return im.convert("RGB")
    except Exception as e:row["error"]=str(e)[:130];return None
with ThreadPoolExecutor(max_workers=7) as pool:
    images=list(pool.map(get,valid))
font=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",15)
small=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",12)
per=12;cols=3;cellw=362;cellh=395
for page in range(math.ceil(len(valid)/per)):
    group=valid[page*per:(page+1)*per];imgs=images[page*per:(page+1)*per]
    canvas=Image.new("RGB",(cols*cellw,4*cellh),(247,244,237))
    d=ImageDraw.Draw(canvas)
    for i,(x,im) in enumerate(zip(group,imgs)):
        x0=(i%cols)*cellw;y0=(i//cols)*cellh
        if im:
            view=ImageOps.contain(im,(340,330),method=Image.Resampling.LANCZOS)
            canvas.paste(view,(x0+(cellw-view.width)//2,y0+5+(330-view.height)//2))
        else:
            d.text((x0+10,y0+160),"UNAVAILABLE",(120,0,0),font=font)
        label=str(page*per+i+1).zfill(2)+" | "+x["id"][:38]
        d.text((x0+10,y0+342),label,(16,24,38),font=small)
        d.text((x0+10,y0+362),x["status"]+((" | "+x["error"][:35]) if x.get("error") else ""),(97,27,32),font=small)
    canvas.save(out/("current-visual-sheet-"+str(page+1).zfill(2)+".jpg"),"JPEG",quality=87,subsampling=0)
manifest={"kind":"read_only_active_post_visual_sheet","source":"live D1 status and official public post-image URL","active":len(valid),"fetched":sum(im is not None for im in images),"missing":[{"id":x["id"],"reason":x["error"]} for x in valid if x.get("error")],"items":[{"index":i+1,**item} for i,item in enumerate(valid)],"note":"Contact sheets are evidence for visual human review, NOT product authenticity or AI approval; publishing states are unchanged."}
(out/"index.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf8")
assert len(valid)>35,"Unexpectedly few active posts"
print("ACTIVE=",len(valid),"VALID=",manifest["fetched"],"FAILED=",len(manifest["missing"]),"SHEETS=",math.ceil(len(valid)/per))
