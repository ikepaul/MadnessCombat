"""Build labelled contact sheets (grids of frames) from a reference episode.

usage: python contact.py <video> <out_prefix> <start_s> <end_s> <step_frames>
                         [--cols 4] [--rows 4] [--tile 371] [--crop x0,y0,x1,y1]

Every tile is stamped with its source frame number and timestamp, so notes can cite
exact frames. --crop selects a region of the 1484x1080 source before scaling, which keeps
small wide-shot characters readable. Sheets are written as <out_prefix>_<n>.jpg.
"""
import argparse

import cv2
from PIL import Image, ImageDraw


def main():
    p = argparse.ArgumentParser()
    p.add_argument("video")
    p.add_argument("prefix")
    p.add_argument("start", type=float)
    p.add_argument("end", type=float)
    p.add_argument("step", type=int)
    p.add_argument("--cols", type=int, default=4)
    p.add_argument("--rows", type=int, default=4)
    p.add_argument("--tile", type=int, default=371, help="tile width in px")
    p.add_argument("--crop", default=None)
    a = p.parse_args()

    cap = cv2.VideoCapture(a.video)
    fps = cap.get(cv2.CAP_PROP_FPS)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    src_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    src_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    x0, y0, x1, y1 = [int(v) for v in a.crop.split(",")] if a.crop else (0, 0, src_w, src_h)
    tile_w = a.tile
    tile_h = int(tile_w * (y1 - y0) / (x1 - x0))

    f0 = int(a.start * fps)
    f1 = min(int(a.end * fps), total - 1)
    frames = list(range(f0, f1 + 1, a.step))
    per_sheet = a.cols * a.rows
    cap.set(cv2.CAP_PROP_POS_FRAMES, f0)
    cur = f0
    ok = True
    for sheet_idx, s in enumerate(range(0, len(frames), per_sheet)):
        batch = frames[s:s + per_sheet]
        sheet = Image.new("RGB", (a.cols * tile_w, a.rows * tile_h), "black")
        draw = ImageDraw.Draw(sheet)
        for k, fn in enumerate(batch):
            while cur <= fn:
                ok, frame = cap.read()
                cur += 1
            if not ok:
                break
            frame = cv2.resize(frame[y0:y1, x0:x1], (tile_w, tile_h))
            img = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            x, y = (k % a.cols) * tile_w, (k // a.cols) * tile_h
            sheet.paste(img, (x, y))
            label = f"f{fn} {fn / fps:6.2f}s"
            draw.rectangle([x, y, x + 6 * len(label) + 4, y + 12], fill="black")
            draw.text((x + 2, y), label, fill="yellow")
        out = f"{a.prefix}_{sheet_idx:03d}.jpg"
        sheet.save(out, quality=85)
        print(out, f"f{batch[0]}-f{batch[-1]}")


if __name__ == "__main__":
    main()
