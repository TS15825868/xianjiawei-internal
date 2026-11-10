#!/usr/bin/env python3
"""Review-only five-page contact sheet of existing latest 49 pending D1-synced originals.
No alterations to source/product imagery; does not approve, publish, or mutate D1.
"""
from pathlib import Path
from PIL import Image,ImageOps,ImageDraw,ImageFont
from hashlib import sha256
import json,io,math
root=Path.cwd()
request=json.loads((root/"ops/request-forty-nine-current-visual-review-20261110.json").read_text())
current=json.loads((root/"ops/social-schedule-candidates-current.json").read_text())
if request["scope"]!="xjw-49-current-visual-review-gallery-v1" or request["noD1Writes"] is not True or request["noPublishing"] is not True or request["expectedSnapshotAt"]!=current["generatedAt"] or len(current["items"])!=49 or len(set(x["id"] for x in current["items"]))!=49:
 raise RuntimeError("Changed or unsafe D1-synced 49-post candidate snapshot")
items=sorted(current["items"],key=lambda x:x["id"])
out=root/"ops/visual-review/20261110-49-pending"
out.mkdir(parents=True,exist_ok=True)
W,H=360,374;columns=5;rows=2
def placeholder(path,id):
 img=Image.new("RGB",(W-16,H-75),"#eee9e3")
 ImageDraw.Draw(img).text((22,22),"IMAGE UNREADABLE: "+id,fill="#83221d")
 return img
manifest={"schema":"xjw-49-current-original-visual-contact-v1","snapshotAt":current["generatedAt"],"records":[],"pages":[],"sourceOnly":True,"sourceImageChanged":False,"D1Writes":0,"approvals":0,"publications":0}
font=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",16)
for pi in range(math.ceil(len(items)/(columns*rows))):
 sheet=Image.new("RGB",(columns*W,rows*H),"#F7F4ED")
 d=ImageDraw.Draw(sheet)
 batch=items[pi*columns*rows:(pi+1)*columns*rows]
 for idx,item in enumerate(batch):
  n=pi*columns*rows+idx+1
  origin=item["image_url"]
  prefix="https://raw.githubusercontent.com/TS15825868/xianjiawei-internal/main/"
  if not origin.startswith(prefix):raise RuntimeError("Untrusted original source: "+item["id"])
  rel=origin[len(prefix):]
  if ".." in Path(rel).parts or not rel.startswith(("assets/post-images/","media/social-candidates/")):raise RuntimeError("Bad source: "+rel)
  file=root/rel
  data=file.read_bytes()
  original=Image.open(io.BytesIO(data))
  fullsize=original.size
  thumbnail=ImageOps.contain(original.convert("RGB"),(W-22,H-76),Image.Resampling.LANCZOS)
  col=idx%columns;row=idx//columns
  xx=col*W;yy=row*H
  d.rounded_rectangle((xx+4,yy+4,xx+W-4,yy+H-4),radius=13,outline="#b6a99c",width=2)
  sheet.paste(thumbnail,(xx+(W-thumbnail.width)//2,yy+5+(H-76-thumbnail.height)//2))
  d.text((xx+9,yy+H-66),f"{n:02d}. {item['id'][:28]}",fill="#101927",font=font)
  d.text((xx+9,yy+H-37),str(fullsize[0])+"x"+str(fullsize[1])+" / "+item["status"],fill="#343434",font=font)
  manifest["records"].append({"index":n,"postId":item["id"],"title":item["title"],"imagePath":rel,"sha256":sha256(data).hexdigest(),"imageSize":list(fullsize),"page":pi+1,"cell":idx+1,"alt":item.get("image_alt"),"caption":item["copy"],"contentVersion":item["updated_at"]})
 name=f"page-{pi+1:02d}.jpg"
 file=out/name;sheet.save(file,quality=85,subsampling=0,optimize=True)
 manifest["pages"].append({"name":name,"firstIndex":pi*10+1,"lastIndex":min(pi*10+10,len(items)),"sha256":sha256(file.read_bytes()).hexdigest()})
(out/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n")
print("VISUAL_49_DRAFT_GALLERY",json.dumps({"total":len(items),"pages":manifest["pages"],"snapshotAt":manifest["snapshotAt"],"noWrites":True},ensure_ascii=False))
