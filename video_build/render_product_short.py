#!/usr/bin/env python3
"""Render a silent 9:16 product short from a JSON scene manifest and approved images."""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile

from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT, FPS = 720, 1280, 24
CREAM, NAVY, RED, GOLD = "#F7F4ED", "#0B1F3B", "#682023", "#B08A47"


def render(manifest, output, font_path):
    scenes = json.loads(manifest.read_text(encoding="utf-8"))
    if any(scene["seconds"] <= 0 for scene in scenes) or not 15 <= sum(s["seconds"] for s in scenes) <= 30:
        raise ValueError("Use positive scene durations totaling 15–30 seconds.")
    fonts = {size: ImageFont.truetype(str(font_path), size, index=3) for size in (26, 30, 39, 52)}
    output = output.resolve()
    with tempfile.TemporaryDirectory() as directory:
        clips = []
        for index, scene in enumerate(scenes):
            base = Image.new("RGB", (WIDTH, HEIGHT), CREAM)
            draw = ImageDraw.Draw(base)
            draw.rectangle((0, 0, WIDTH, 205), fill=NAVY)
            draw.rectangle((0, 1050, WIDTH, HEIGHT), fill=NAVY)
            draw.line((64, 209, 656, 209), fill=GOLD, width=3)
            draw.text((360, 66), "仙加味精選", font=fonts[30], fill=CREAM, anchor="mm")
            draw.text((360, 139), scene["title"], font=fonts[52], fill=CREAM, anchor="mm")
            for line_number, line in enumerate(scene["captions"]):
                draw.text((360, 780 + 53 * line_number), line, font=fonts[39 if line_number == 0 else 30],
                          fill=RED if line_number == 0 else NAVY, anchor="mm")
            draw.text((360, 1127), "官方 LINE  @762jybnm", font=fonts[39], fill=CREAM, anchor="mm")
            draw.text((360, 1200), "補養，是一種節奏。", font=fonts[26], fill=CREAM, anchor="mm")
            photos = [Image.open(manifest.parent / path).convert("RGBA") for path in scene["images"]]
            if not 1 <= len(photos) <= 2:
                raise ValueError("Each scene requires one or two approved images.")
            clip = Path(directory) / f"{index}.mp4"
            frames = round(FPS * scene["seconds"])
            fade = f"fade=in:s=0:n=9,fade=out:s={frames - 10}:n=9"
            command = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
                       "-s", f"{WIDTH}x{HEIGHT}", "-r", str(FPS), "-i", "-", "-vf", fade,
                       "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt",
                       "yuv420p", str(clip)]
            with subprocess.Popen(command, stdin=subprocess.PIPE) as encoder:
                for frame in range(frames):
                    progress = frame / max(frames - 1, 1)
                    canvas = base.copy()
                    size = round((490 if len(photos) == 1 else 292) * (0.94 + 0.06 * progress))
                    centers = (360,) if len(photos) == 1 else (198, 522)
                    for photo, center in zip(photos, centers):
                        image = photo.copy()
                        image.thumbnail((size, size), Image.Resampling.LANCZOS)
                        canvas.paste(image, (center - image.width // 2,
                                             round(478 - 12 * progress - image.height / 2)), image)
                    encoder.stdin.write(canvas.tobytes())
                encoder.stdin.close()
                if encoder.wait():
                    raise RuntimeError("FFmpeg scene encoding failed.")
            clips.append(clip)
        listing = Path(directory) / "clips.txt"
        listing.write_text("".join(f"file '{clip.name}'\n" for clip in clips), encoding="utf-8")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "1", "-i",
                        str(listing), "-c", "copy", "-movflags", "+faststart", str(output)], check=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--font", type=Path, default=Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"))
    arguments = parser.parse_args()
    render(arguments.manifest, arguments.output, arguments.font)
