#!/usr/bin/env python3
"""Offline visual candidate audit of 12 missing original files using 11/10 contact sheets.

This is a thumbnail-only comparison. It cannot verify original bytes, current
D1 image bindings, historical 178 Cloudflare assets, or publication eligibility.
Never makes HTTP requests or queries production D1.
"""
from __future__ import annotations

from collections import Counter
from hashlib import sha256
import json
from pathlib import Path
import sys

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "ops/social-pending-46-archival-media-paths-v20261122.json"
GALLERY = ROOT / "ops/visual-review/20261110-49-pending/manifest.json"
HISTORY = ROOT / "assets/data/github-social-media-fingerprints-v20261122.json"
ERP = ROOT / "ops/social-46-offline-github-image-reconciliation-v20261122.json"
OUTPUT = ROOT / "ops/social-12-contact-sheet-visual-evidence-v20261122.json"


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def visual_hash(img):
    tiny = img.convert("L").resize((9, 8), Image.Resampling.LANCZOS)
    pixels = list(tiny.getdata())
    value = 0
    for row in range(8):
        for col in range(8):
            value = (value << 1) | int(pixels[row * 9 + col] > pixels[row * 9 + col + 1])
    return f"{value:016x}"


def distance(left, right):
    return (int(left, 16) ^ int(right, 16)).bit_count()


def crop_for_gallery(page, cell, original_size):
    # Exact historical 2026-11-10 gallery builder dimensions.
    cell_w, cell_h = 360, 374
    image_max_w, image_max_h = cell_w - 22, cell_h - 76
    ow, oh = original_size
    if ow <= 0 or oh <= 0:
        raise ValueError("Missing original image dimensions")
    aspect, dest_aspect = ow / oh, image_max_w / image_max_h
    if aspect > dest_aspect:
        tw, th = image_max_w, round(image_max_w / aspect)
    else:
        tw, th = round(image_max_h * aspect), image_max_h
    if not (0 < tw <= image_max_w and 0 < th <= image_max_h):
        raise ValueError("Invalid thumbnail dimensions")
    col, row = (cell - 1) % 5, (cell - 1) // 5
    if not (1 <= cell <= 10):
        raise ValueError("Invalid contact cell index")
    xx, yy = col * cell_w, row * cell_h
    left = xx + (cell_w - tw) // 2
    top = yy + 5 + (image_max_h - th) // 2
    if page.size != (cell_w * 5, cell_h * 2):
        raise ValueError(f"Unexpected page dimensions: {page.size}")
    return page.crop((left, top, left + tw, top + th))


def main():
    bridge, gallery, history, erp = (load(x) for x in (SOURCE, GALLERY, HISTORY, ERP))
    missing = bridge["missing_git_binary_paths"]
    records = gallery["records"]
    if bridge["candidate_count"] != 46 or len(missing) != 12:
        raise ValueError("Changed 46/12 snapshot; do not infer missing originals")
    if len(records) != 49 or len(history["media"]) != 169 or len(erp["records"]) != 46:
        raise ValueError("Changed 49/169/46 manifests; halt instead of blending versions")
    if history.get("dhash_available") != 159:
        raise ValueError("Changed historical dHash coverage")

    historical = [
        {"path": im["path"], "hash": im["dhash"], "classification": im.get("classification", "")}
        for im in history["media"] if im.get("dhash")
    ]
    pending = [
        {"post_id": row["post_id"], "path": im["file"], "hash": im["dhash"]}
        for row in erp["records"] for im in row.get("github_erp_exact_image_paths", [])
        if im.get("dhash")
    ]
    if len(pending) != 34:
        raise ValueError(f"Expected 34 found ERP images, got {len(pending)}")

    gallery_by_id = {row["postId"]: row for row in records}
    if len(gallery_by_id) != 49:
        raise ValueError("Duplicate gallery record ID")
    pages = {}
    for page in gallery["pages"]:
        name = page["name"]
        if name not in ("page-01.jpg", "page-02.jpg", "page-03.jpg", "page-04.jpg", "page-05.jpg"):
            raise ValueError("Unexpected gallery page filename")
        blob = (GALLERY.parent / name).read_bytes()
        if sha256(blob).hexdigest() != page["sha256"]:
            raise ValueError(f"Gallery page checksum mismatch: {name}")
        pages[int(name[5:7])] = Image.open(GALLERY.parent / name).convert("RGB")

    outputs = []
    for item in missing:
        pid, expected = item["post_id"], item["expected_sha"]
        original = gallery_by_id.get(pid)
        if not original or original["sha256"] != expected or original["imagePath"] != item["nov10_gallery_path"]:
            raise ValueError(f"Snapshot identity/path/SHA mismatch: {pid}")
        page_num, cell = int(original["page"]), int(original["cell"])
        if page_num not in pages:
            raise ValueError(f"Missing page {page_num}")
        cropped = crop_for_gallery(pages[page_num], cell, original["imageSize"])
        hash_value = visual_hash(cropped)
        similar_historical = sorted(
            ({"historical_path": other["path"], "distance": distance(hash_value, other["hash"]),
              "classification": other["classification"]} for other in historical),
            key=lambda x: (x["distance"], x["historical_path"]))
        similar_current = sorted(
            ({"other_post_id": other["post_id"], "path": other["path"],
              "distance": distance(hash_value, other["hash"])} for other in pending),
            key=lambda x: (x["distance"], x["other_post_id"]))
        outputs.append({
            "post_id": pid,
            "archival_original_sha256": expected,
            "archival_original_path": item["nov10_gallery_path"],
            "thumbnail_page": original["page"],
            "thumbnail_cell": cell,
            "thumbnail_dhash": hash_value,
            "thumbnail_size": list(cropped.size),
            "original_bytes_verified": False,
            "historical_nearest": similar_historical[:5],
            "historical_candidates_distance_le8": [x for x in similar_historical if x["distance"] <= 8],
            "current_34_nearest": similar_current[:5],
            "current_34_candidates_distance_le8": [x for x in similar_current if x["distance"] <= 8],
            "needs_original_image_and_final_review": True,
        })

    cross_pairs = []
    for i, current in enumerate(outputs):
        for other in outputs[i + 1:]:
            n = distance(current["thumbnail_dhash"], other["thumbnail_dhash"])
            if n <= 8:
                cross_pairs.append({"post_a": current["post_id"], "post_b": other["post_id"], "distance": n})
    cross_pairs.sort(key=lambda x: (x["distance"], x["post_a"], x["post_b"]))
    summary = {
        "schema": "xjw-contact-sheet-thumbnail-12-missing-original-visual-check-v1",
        "source": "11/10 GitHub contact sheets, not current original images",
        "gallery_pages_hash_verified": 5,
        "thumbnails_checked": len(outputs),
        "historical_comparison_images": len(historical),
        "erp_current_comparison_images": len(pending),
        "historical_pairs_distance_le8": sum(len(x["historical_candidates_distance_le8"]) for x in outputs),
        "erp_current_pairs_distance_le8": sum(len(x["current_34_candidates_distance_le8"]) for x in outputs),
        "thumbnail_internal_pairs_distance_le8": len(cross_pairs),
        "original_12_bytes_available": False,
        "cloudflare_178_full_history_verified": False,
        "current_live_46_D1_binding_verified": False,
        "ai_review_approved": 0,
        "publication_scheduled_or_sent": 0,
        "production_D1_queries": 0,
        "release_allowed": False,
        "warning": "JPEG gallery thumbnails are derivative previews: false positives and false negatives are possible. Findings are only similarity candidates. Do not approve, schedule or publish.",
        "thumbnail_pairs": cross_pairs,
        "records": outputs,
    }
    if len(outputs) != 12 or len({x["post_id"] for x in outputs}) != 12:
        raise ValueError("Incomplete missing-file review")
    OUTPUT.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: summary[k] for k in (
        "thumbnails_checked", "historical_comparison_images",
        "erp_current_comparison_images", "historical_pairs_distance_le8",
        "erp_current_pairs_distance_le8", "thumbnail_internal_pairs_distance_le8",
        "production_D1_queries", "release_allowed"
    )}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError, TypeError) as error:
        print(f"Offline gallery audit failed: {error}", file=sys.stderr)
        sys.exit(2)
