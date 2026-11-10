#!/usr/bin/env python3
"""Five source-bound, draft-only composites using unmodified official product photo pixels.
Produces PREVIEWS ONLY, never updates D1, auto-approves, schedules or posts.
"""
import io,json,hashlib,urllib.request,math,os
from pathlib import Path
import numpy as np,cv2
from PIL import Image,ImageDraw,ImageFilter
SCALE=512
RAW="https://raw.githubusercontent.com/"
SCENES=[
{"id":"XJW-CONV-chat-luerong-intro","source":"assets/post-images/2026-10-12/formal-production/XJW-CONV-chat-luerong-intro-audit-v1.jpg","blob":"3892582fecf8e701ba790961af04abc6c640c3cb","mask":[(255,365,335,473)],"objects":[("luerong",(267,370,323,464))]},
{"id":"XJW-CONV-chat-photo-size","source":"assets/post-images/2026-10-11/formal-production/XJW-CONV-chat-photo-size-scene-v1.jpg","blob":"c24ccffa60a43cce852a7ed3633d06c03953ecce","mask":[(201,330,268,406)],"objects":[("drink30",(210,331,251,398))]},
{"id":"XJW-CONV-cny-gift-choice","source":"assets/post-images/2026-10-12/formal-production/XJW-CONV-cny-gift-choice-audit-v1.jpg","blob":"56e23eede90f33e6fe85e6c8ea25fa5453e085d4","mask":[(232,365,309,477)],"objects":[("gao",(243,374,297,466))]},
{"id":"XJW-CONV-chat-picture-or-text","source":"assets/post-images/2026-10-12/formal-production/XJW-CONV-chat-picture-or-text-audit-v1.jpg","blob":"0de63ca21971c4775df6e038bfbf739a13b8b591","mask":[(245,364,313,480)],"objects":[("gao",(256,374,307,473))]},
{"id":"XJW-CONV-chat-glass-vs-pouch-storage","source":"assets/post-images/2026-10-11/formal-production/XJW-CONV-chat-glass-vs-pouch-storage-scene-v1.jpg","blob":"5ab0df32d18c568482df77de23010f8829719870","mask":[(157,344,226,428),(251,277,349,450)],"objects":[("drink30",(165,351,212,416)),("drink180",(251,294,346,449))]}
]
SCENES=[s for s in SCENES if s["id"] in ("XJW-CONV-cny-gift-choice","XJW-CONV-chat-picture-or-text")]
PRODUCTS={
"luerong":("images/product-main/luerong-fen.png","910f7eee29bfdac73d3f9d4f1a05fc4b5fd9f78e"),
"drink30":("images/product-cutout-review/guilu-drink-30.png","d46d1c788b2bd9edd6522e4524faaec5c478c880"),
"drink180":("images/product-main/guilu-drink-180.png","82a167036b026247d1954d6a4491a3aa79e3b914"),
"gao":("images/catalog-user-original-v20261017/guilu-gao-box-jar-owner-selected-detail-v20261017.webp","5c4fe52f1ed8b0f6f1b6569b6823cc369e2607c9")
}
def source(path,official=False):
 repo="xianjiawei" if official else "xianjiawei-internal"
 with urllib.request.urlopen(RAW+"TS15825868/"+repo+"/main/"+path,timeout=45) as rsp:
  return rsp.read()
def gitblob(data):
 return hashlib.sha1(b"blob "+str(len(data)).encode()+b"\0"+data).hexdigest()
def unpack_product(key):
 path,expected=PRODUCTS[key];data=source(path,True)
 if gitblob(data)!=expected:raise RuntimeError("Current official product source changed: "+key)
 im=Image.open(io.BytesIO(data)).convert("RGBA")
 if key=="gao":
  # Owner-selected real source photo: hand-isolate whole genuine hexagonal jar.
  # No regeneration of labels/pixels; box remains only in historical reference.
  w,h=im.size
  perimeter=[(.587,.416),(.597,.394),(.631,.374),(.699,.364),(.807,.366),
   (.868,.382),(.895,.399),(.903,.426),(.903,.444),(.891,.465),
   (.904,.493),(.907,.725),(.897,.749),(.870,.767),(.831,.778),
   (.644,.779),(.612,.769),(.587,.750),(.579,.718),(.579,.494),(.569,.463)]
  matte=Image.new("L",(w,h),0)
  draw=ImageDraw.Draw(matte)
  draw.polygon([(int(x*w),int(y*h)) for x,y in perimeter],fill=255)
  matte=matte.filter(ImageFilter.GaussianBlur(max(1,round(w/950))))
  im.putalpha(matte)
 # Retain only true transparent product; if source is opaque white studio background,
 # use outer-connected light pixels, never edit product text/colored label.
 alpha=im.getchannel("A")
 amin,amax=alpha.getextrema()
 if amin>=253:
  data=np.array(im)
  rgb=data[:,:,:3].astype(np.int16)
  near=np.min(rgb,axis=2)>235
  flood=near.astype(np.uint8)*255
  h,w=flood.shape;mask=np.zeros((h+2,w+2),np.uint8)
  cv2.floodFill(flood,mask,(0,0),0)
  # Source must be already transparent or have a clean white outer background
  if near.mean()<.03:raise RuntimeError("No transparent/clean product cutout: "+key)
  a=np.where(near,0,255).astype(np.uint8)
  a=cv2.GaussianBlur(a,(3,3),.45)
  im.putalpha(Image.fromarray(a))
 box=im.getchannel("A").getbbox()
 if not box:raise RuntimeError("No opaque product pixels: "+key)
 return im.crop(box),{"blob":expected,"pixels":list(im.size),"crop":list(box),"alphaExtrema":[amin,amax]}
products={}
stats={}
for k in PRODUCTS:
 products[k],stats[k]=unpack_product(k)
outdir=Path("ops/visual-previews/20261110-official-source-composite-v4")
outdir.mkdir(parents=True,exist_ok=True)
side=512;sheet=Image.new("RGB",(side*2,side*len(SCENES)),(250,248,244))
report={"schema":"xjw-two-gao-owner-selected-photo-preview-v4","status":"draft-only-needs-human-visual-inspection","D1Writes":0,"approvals":0,"scheduled":0,"publications":0,"sourceAssetDetails":stats,"previews":[]}
for row,s in enumerate(SCENES):
 content=source(s["source"])
 if gitblob(content)!=s["blob"]:raise RuntimeError("Current official candidate image changed: "+s["id"])
 original=Image.open(io.BytesIO(content)).convert("RGB")
 w,h=original.size
 scale_x=w/512.;scale_y=h/512.
 arr=cv2.cvtColor(np.array(original),cv2.COLOR_RGB2BGR)
 mask=np.zeros((h,w),np.uint8)
 for x1,y1,x2,y2 in s["mask"]:
  xx1,yy1,xx2,yy2=round(x1*scale_x),round(y1*scale_y),round(x2*scale_x),round(y2*scale_y)
  cv2.rectangle(mask,(xx1,yy1),(xx2,yy2),255,-1)
 # Preserve original scene outside masked fake package areas; inpaint only those.
 clean=cv2.inpaint(arr,mask,max(4,round(5*min(scale_x,scale_y))),cv2.INPAINT_TELEA)
 canvas=Image.fromarray(cv2.cvtColor(clean,cv2.COLOR_BGR2RGB)).convert("RGBA")
 for key,(x1,y1,x2,y2) in s["objects"]:
  source_product=products[key]
  target_w=round((x2-x1)*scale_x);target_h=round((y2-y1)*scale_y)
  # Do not warp formal product shape. Fit within bounding rectangle proportionally.
  ratio=min(target_w/source_product.width,target_h/source_product.height)
  tw=max(1,int(source_product.width*ratio));th=max(1,int(source_product.height*ratio))
  image=source_product.resize((tw,th),Image.Resampling.LANCZOS)
  px=int((x1+(x2-x1)/2)*scale_x-tw/2)
  py=int(y2*scale_y-th)
  if px<0 or py<0 or px+tw>w or py+th>h:raise RuntimeError("Product would crop: "+s["id"])
  shadow=Image.new("RGBA",(w,h),(0,0,0,0))
  a=Image.new("L",(tw,th),0)
  draw=ImageDraw.Draw(a);draw.ellipse((0,th*.78,tw-1,th),fill=105)
  a=a.filter(ImageFilter.GaussianBlur(max(2,tw*.08)))
  silhouette=Image.new("RGBA",(tw,th),(32,24,18,0));silhouette.putalpha(a)
  shadow.alpha_composite(silhouette,(px+round(tw*.055),py+round(th*.04)))
  canvas=Image.alpha_composite(canvas,shadow)
  canvas.alpha_composite(image,(px,py))
 preview=canvas.convert("RGB")
 dest=outdir/(s["id"]+"-preview.jpg")
 preview.save(dest,"JPEG",quality=93,subsampling=0,optimize=True)
 sheet.paste(original.resize((side,side),Image.Resampling.LANCZOS),(0,row*side))
 sheet.paste(preview.resize((side,side),Image.Resampling.LANCZOS),(side,row*side))
 report["previews"].append({"id":s["id"],"source":s["source"],"sourceBlob":s["blob"],"previewPath":str(dest),"previewSHA256":hashlib.sha256(dest.read_bytes()).hexdigest(),"canvas":[w,h],"productTypes":[x[0] for x in s["objects"]],"pictureNotYetVerified":True})
sheet_file=outdir/"contact-sheet.jpg"
sheet.save(sheet_file,"JPEG",quality=87,optimize=True)
report["contactSheet"]=str(sheet_file)
(outdir/"manifest.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
print("FORMAL_PRODUCT_SOURCE_COMPOSITES_PREVIEWS",json.dumps({"count":len(SCENES),"images":report["previews"],"officialAssets":stats,"noD1Writes":True},ensure_ascii=False))
