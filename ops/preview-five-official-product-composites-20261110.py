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
{"id":"XJW-CONV-chat-luerong-intro","source":"assets/post-images/2026-10-12/formal-production/XJW-CONV-chat-luerong-intro-audit-v1.jpg","blob":"3892582fecf8e701ba790961af04abc6c640c3cb","mask":[(254,397,311,488)],"objects":[("luerong",(260,403,309,480))]},
{"id":"XJW-CONV-chat-photo-size","source":"assets/post-images/2026-10-11/formal-production/XJW-CONV-chat-photo-size-scene-v1.jpg","blob":"c24ccffa60a43cce852a7ed3633d06c03953ecce","mask":[(219,322,282,401)],"objects":[("drink30",(233,323,274,390))]},
{"id":"XJW-CONV-cny-gift-choice","source":"assets/post-images/2026-10-12/formal-production/XJW-CONV-cny-gift-choice-audit-v1.jpg","blob":"56e23eede90f33e6fe85e6c8ea25fa5453e085d4","mask":[(230,419,291,491)],"objects":[("gao",(240,418,288,490))]},
{"id":"XJW-CONV-chat-picture-or-text","source":"assets/post-images/2026-10-12/formal-production/XJW-CONV-chat-picture-or-text-audit-v1.jpg","blob":"0de63ca21971c4775df6e038bfbf739a13b8b591","mask":[(241,412,304,492)],"objects":[("gao",(254,413,300,489))]},
{"id":"XJW-CONV-chat-glass-vs-pouch-storage","source":"assets/post-images/2026-10-11/formal-production/XJW-CONV-chat-glass-vs-pouch-storage-scene-v1.jpg","blob":"5ab0df32d18c568482df77de23010f8829719870","mask":[(156,347,219,420),(245,332,345,451)],"objects":[("drink30",(167,348,213,419)),("drink180",(263,334,331,452))]}
]
PRODUCTS={
"luerong":("images/product-main/luerong-fen.png","910f7eee29bfdac73d3f9d4f1a05fc4b5fd9f78e"),
"drink30":("images/product-cutout-review/guilu-drink-30.png","d46d1c788b2bd9edd6522e4524faaec5c478c880"),
"drink180":("images/product-main/guilu-drink-180.png","82a167036b026247d1954d6a4491a3aa79e3b914"),
"gao":("images/product-main/guilu-gao.png","21d97da98eafdf064ff72ee6396361b8de31af52")
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
  # Formal main shows original carton+100g hexagonal jar; isolate jar on the right,
  # not an AI-redrawn imitation. Preserve all label pixels inside extracted jar.
  w,h=im.size;im=im.crop((int(w*.48),0,w,h))
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
outdir=Path("ops/visual-previews/20261110-official-source-composite")
outdir.mkdir(parents=True,exist_ok=True)
side=512;sheet=Image.new("RGB",(side*2,side*len(SCENES)),(250,248,244))
report={"schema":"xjw-five-product-official-photo-preview-v1","status":"draft-only-needs-human-visual-inspection","D1Writes":0,"approvals":0,"scheduled":0,"publications":0,"sourceAssetDetails":stats,"previews":[]}
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
