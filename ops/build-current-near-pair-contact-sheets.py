#!/usr/bin/env python3
"""Make review-only paired previews from the latest verified local image audit.

No post approvals, D1 mutation, publication, external fetching, or editing of originals.
"""
import json
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw, ImageFont

report = json.loads(Path("current-vs-archived-visual-report.json").read_text())
assert report["schema"] == "xjw-all-current-local-images-versus-archived-and-published-20261108-v1"
assert all(report[k] == 0 for k in ("d1Mutations", "approvals", "schedules", "publications", "deletions"))
pairs = report["imageNearPairs"]
assert isinstance(pairs, list)
root = Path.cwd().resolve()
out = Path("current-near-pair-contact-sheets")
out.mkdir(exist_ok=True)
try:
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 17)
except OSError:
    font = ImageFont.load_default()

def original_image(relative):
    p = Path(relative)
    if p.is_absolute() or ".." in p.parts or not (
        relative.startswith("assets/post-images/")
        or relative.startswith("media/social-candidates/")
    ):
        raise ValueError("Unapproved evidence image path")
    path = (root / p).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise ValueError("Missing checked-out evidence original")
    with Image.open(path) as source:
        im = ImageOps.exif_transpose(source).convert("RGB")
        im.thumbnail((510, 500), Image.Resampling.LANCZOS)
        return im.copy()

manifest = []
for i, pair in enumerate(pairs, 1):
    if pair.get("exactFile"):
        # Keep the duplicate finding in the report; never visually waive it.
        verdict = "EXACT_MATCH_REQUIRES_REVIEW"
    else:
        verdict = "NEAR_HASH_CANDIDATE_NOT_A_VERDICT"
    page = Image.new("RGB", (1100, 640), (247, 244, 237))
    draw = ImageDraw.Draw(page)
    for slot, key, label in [(0, "currentPath", "CURRENT"), (1, "referencePath", "REFERENCE")]:
        im = original_image(pair[key])
        x = 18 + slot * 552
        draw.rectangle((x, 20, x+530, 610), outline=(110, 102, 89), width=2)
        draw.text((x+8, 30), label, fill=(20, 39, 56), font=font)
        entry_id = pair["current"] if slot == 0 else pair["reference"]
        draw.text((x+8, 60), str(entry_id)[:45], fill=(20, 39, 56), font=font)
        page.paste(im, (x+(530-im.width)//2, 96+(500-im.height)//2))
        draw.text((x+8, 590), str(pair[key])[:55], fill=(25, 33, 44), font=font)
    filename = "pair-%03d.jpg" % i
    page.save(out / filename, quality=87, optimize=True)
    manifest.append({
        "current": pair["current"], "reference": pair["reference"],
        "referenceStatus": pair["referenceStatus"], "filename": filename,
        "dhash64": pair["dhash64"], "averageHash64": pair["averageHash64"],
        "classification": verdict,
    })
result = {
    "schema": "xjw-current-near-pair-original-contact-sheet-readonly-v1",
    "sourceAuditGitCommit": report.get("head"),
    "pendingScanned": report["pendingScanned"],
    "nearPairs": len(pairs), "pairPreviews": manifest,
    "ai16Approved": False, "historyCoverageComplete": False,
    "d1Writes": 0, "publishOperations": 0, "ownerApprovals": 0
}
(out / "manifest.json").write_text(json.dumps(result, ensure_ascii=False, indent=2)+"\n")
print("NEAR_PAIR_REVIEW_SHEETS", json.dumps({
    "pending": result["pendingScanned"], "comparisonPages": len(manifest),
    "historicalUniquenessCertified": False, "d1Writes": 0
}, ensure_ascii=False))
