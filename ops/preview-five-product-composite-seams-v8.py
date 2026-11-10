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
{"id":"XJW-CONV-cny-gift-choice","source":"assets/post-images/2026-10-12/formal-production/XJW-CONV-cny-gift-choice-audit-v1.jpg","blob":"56e23eede90f33e6fe85e6c8ea25fa5453e085d4","mask":[(248,377,303,480)],"objects":[("gao",(239,369,313,484))]},
{"id":"XJW-CONV-chat-picture-or-text","source":"assets/post-images/2026-10-12/formal-production/XJW-CONV-chat-picture-or-text-audit-v1.jpg","blob":"0de63ca21971c4775df6e038bfbf739a13b8b591","mask":[(253,378,308,481)],"objects":[("gao",(244,366,316,485))]},
{"id":"XJW-CONV-chat-glass-vs-pouch-storage","source":"assets/post-images/2026-10-11/formal-production/XJW-CONV-chat-glass-vs-pouch-storage-scene-v1.jpg","blob":"5ab0df32d18c568482df77de23010f8829719870","mask":[(172,354,210,417)],"objects":[("drink30",(162,346,216,417)),("drink180",(241,283,347,441))]}
]
# Five current pending posts; preview both erasure strategies, no D1 changes.
TIGHT_MASKS={
"XJW-CONV-chat-luerong-intro":(266,374,329,458),
"XJW-CONV-chat-photo-size":(205,338,267,411),
"XJW-CONV-cny-gift-choice":(240,372,310,482),
"XJW-CONV-chat-picture-or-text":(241,366,319,486),
"XJW-CONV-chat-glass-vs-pouch-storage":(169,349,214,422),
}
CLONE_CENTERS={
"XJW-CONV-chat-luerong-intro":(365,443),
"XJW-CONV-chat-photo-size":(314,376),
"XJW-CONV-cny-gift-choice":(368,421),
"XJW-CONV-chat-picture-or-text":(359,443),
"XJW-CONV-chat-glass-vs-pouch-storage":(229,384),
}

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
 mask_data=np.asarray(im.getchannel("A"))
 return im.crop(box),{"blob":expected,"pixels":list(im.size),"crop":list(box),"alphaExtrema":[amin,amax],
 "alphaTransparentPct":round(100*float(np.mean(mask_data<10)),2),
 "alphaOpaquePct":round(100*float(np.mean(mask_data>245)),2),
 "alphaSemiPct":round(100*float(np.mean((mask_data>=10)&(mask_data<=245))),2),
 "alphaCornerValues":[int(mask_data[0,0]),int(mask_data[0,-1]),int(mask_data[-1,0]),int(mask_data[-1,-1])]}
products={}
stats={}
for k in PRODUCTS:
 products[k],stats[k]=unpack_product(k)
outdir=Path("ops/visual-previews/20261110-official-source-composite-v8")
outdir.mkdir(parents=True,exist_ok=True)
side=420;sheet=Image.new("RGB",(side*3,side*len(SCENES)),(250,248,244))
report={"schema":"xjw-five-original-product-blending-AB-preview-v8","status":"draft-only-needs-human-visual-inspection","D1Writes":0,"approvals":0,"scheduled":0,"publications":0,"sourceAssetDetails":stats,"previews":[]}
for row,s in enumerate(SCENES):
 content=source(s["source"])
 if gitblob(content)!=s["blob"]:raise RuntimeError("Current official candidate image changed: "+s["id"])
 original=Image.open(io.BytesIO(content)).convert("RGB")
 w,h=original.size
 scale_x=w/512.;scale_y=h/512.
 arr=cv2.cvtColor(np.array(original),cv2.COLOR_RGB2BGR)
 x1,y1,x2,y2=TIGHT_MASKS[s["id"]]
 xx1,yy1,xx2,yy2=[round(v*(scale_x if i%2==0 else scale_y)) for i,v in enumerate((x1,y1,x2,y2))]
 if not (0<xx1<xx2<w and 0<yy1<yy2<h):raise RuntimeError("Invalid cleanup bounds")
 # Approach A: tight object-region inpainting rather than the old oversized square.
 mask=np.zeros((h,w),np.uint8)
 cv2.rectangle(mask,(xx1,yy1),(xx2,yy2),255,-1)
 clean_a=cv2.inpaint(arr,mask,5,cv2.INPAINT_TELEA)
 # Approach B: sample unoccupied wood texture from the same scene and use
 # Poisson blending to avoid the obvious rectangle at the old AI object.
 mw=xx2-xx1+1;mh=yy2-yy1+1
 cx,cy=CLONE_CENTERS[s["id"]]
 source_center=(cx*scale_x,cy*scale_y)
 patch=cv2.getRectSubPix(arr,(mw,mh),source_center)
 clone_mask=np.zeros((mh,mw),np.uint8)
 margin=max(3,round(min(mw,mh)*.025))
 cv2.rectangle(clone_mask,(margin,margin),(mw-1-margin,mh-1-margin),255,-1)
 center=((xx1+xx2)//2,(yy1+yy2)//2)
 clean_b=cv2.seamlessClone(patch,arr,clone_mask,center,cv2.NORMAL_CLONE)
 sheet.paste(original.resize((side,side),Image.Resampling.LANCZOS),(0,row*side))
 for col,(approach,background) in enumerate((("tight_inpaint",clean_a),("texture_clone",clean_b)),start=1):
  if s["id"] in ("XJW-CONV-chat-luerong-intro","XJW-CONV-cny-gift-choice"):
   Image.fromarray(cv2.cvtColor(background,cv2.COLOR_BGR2RGB)).save(outdir/(s["id"]+"-"+approach+"-background-only.jpg"),"JPEG",quality=92)
  canvas=Image.fromarray(cv2.cvtColor(background,cv2.COLOR_BGR2RGB)).convert("RGBA")
  for key,(ox1,oy1,ox2,oy2) in s["objects"]:
   official=products[key]
   tw0=round((ox2-ox1)*scale_x);th0=round((oy2-oy1)*scale_y)
   ratio=min(tw0/official.width,th0/official.height)
   tw=max(1,int(official.width*ratio));th=max(1,int(official.height*ratio))
   image=official.resize((tw,th),Image.Resampling.LANCZOS)
   px=int((ox1+(ox2-ox1)/2)*scale_x-tw/2);py=int(oy2*scale_y-th)
   if px<0 or py<0 or px+tw>w or py+th>h:raise RuntimeError("Official product cropped")
   shadow=Image.new("RGBA",(w,h),(0,0,0,0))
   a=Image.new("L",(tw,th),0)
   ImageDraw.Draw(a).ellipse((0,th*.80,tw-1,th),fill=90)
   a=a.filter(ImageFilter.GaussianBlur(max(2,tw*.07)))
   silhouette=Image.new("RGBA",(tw,th),(32,24,18,0));silhouette.putalpha(a)
   shadow.alpha_composite(silhouette,(px+round(tw*.04),py+round(th*.025)))
   canvas=Image.alpha_composite(canvas,shadow)
   canvas.alpha_composite(image,(px,py))
  preview=canvas.convert("RGB")
  dest=outdir/(s["id"]+"-"+approach+"-preview.jpg")
  preview.save(dest,"JPEG",quality=93,subsampling=0,optimize=True)
  sheet.paste(preview.resize((side,side),Image.Resampling.LANCZOS),(side*col,row*side))
  report["previews"].append({"id":s["id"],"approach":approach,"source":s["source"],
    "sourceBlob":s["blob"],"previewPath":str(dest),
    "previewSHA256":hashlib.sha256(dest.read_bytes()).hexdigest(),
    "productTypes":[x[0] for x in s["objects"]],"officialPixelsPreservedExceptGeometricScale":True,
    "imageNotYetApproved":True})
sheet_file=outdir/"contact-sheet.jpg"
sheet.save(sheet_file,"JPEG",quality=87,optimize=True)
report["contactSheet"]=str(sheet_file)
(outdir/"manifest.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
print("FORMAL_PRODUCT_SOURCE_COMPOSITES_V8_AB",json.dumps({"count":len(SCENES),"images":report["previews"],"officialAssets":stats,"noD1Writes":True},ensure_ascii=False))
