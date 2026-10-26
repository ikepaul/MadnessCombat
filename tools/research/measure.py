"""Render consecutive frames with a pixel grid so positions can be read off by eye.

usage: python measure.py <video> <out.jpg> <first_frame> <count>
                         [--step 1] [--crop x0,y0,x1,y1] [--cols 4] [--tile 371] [--grid 50]

Grid lines are drawn in SOURCE pixels (1484x1080 frame) every --grid px, with a
label every 100 px, so readings stay comparable between crops.
"""
import argparse

import cv2
from PIL import Image, ImageDraw


def main():
    p = argparse.ArgumentParser()
    p.add_argument("video")
    p.add_argument("out")
    p.add_argument("first", type=int)
    p.add_argument("count", type=int)
    p.add_argument("--step", type=int, default=1)
    p.add_argument("--crop", default=None)
    p.add_argument("--cols", type=int, default=4)
    p.add_argument("--tile", type=int, default=371)
    p.add_argument("--grid", type=int, default=50)
    a = p.parse_args()

    cap = cv2.VideoCapture(a.video)
    src_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    src_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    x0, y0, x1, y1 = [int(v) for v in a.crop.split(",")] if a.crop else (0, 0, src_w, src_h)
    scale = a.tile / (x1 - x0)
    tile_h = int((y1 - y0) * scale)
    rows = -(-a.count // a.cols)
    sheet = Image.new("RGB", (a.cols * a.tile, rows * tile_h), "black")
    draw = ImageDraw.Draw(sheet)

    cap.set(cv2.CAP_PROP_POS_FRAMES, a.first)
    fn = a.first
    for k in range(a.count):
        ok, frame = cap.read()
        if not ok:
            break
        for _ in range(a.step - 1):
            cap.read()
        img = cv2.resize(frame[y0:y1, x0:x1], (a.tile, tile_h))
        tx, ty = (k % a.cols) * a.tile, (k // a.cols) * tile_h
        sheet.paste(Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB)), (tx, ty))
        for gx in range((x0 // a.grid + 1) * a.grid, x1, a.grid):
            px = tx + int((gx - x0) * scale)
            draw.line([px, ty, px, ty + tile_h], fill=(0, 160, 255) if gx % 100 == 0 else (0, 90, 140))
            if gx % 100 == 0:
                draw.text((px + 1, ty + tile_h - 11), str(gx), fill=(0, 200, 255))
        for gy in range((y0 // a.grid + 1) * a.grid, y1, a.grid):
            py = ty + int((gy - y0) * scale)
            draw.line([tx, py, tx + a.tile, py], fill=(255, 120, 0) if gy % 100 == 0 else (140, 70, 0))
            if gy % 100 == 0:
                draw.text((tx + 1, py + 1), str(gy), fill=(255, 160, 0))
        draw.rectangle([tx, ty, tx + 70, ty + 11], fill="black")
        draw.text((tx + 2, ty), f"f{fn}", fill="yellow")
        fn += a.step
    sheet.save(a.out, quality=88)
    print(a.out)


if __name__ == "__main__":
    main()
