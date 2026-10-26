"""Per-frame difference analysis for a reference episode.

Reports how many frames are exact-ish duplicates of the previous one (to recover the
original Flash frame rate hidden inside the 30 fps YouTube encode) and lists hard cuts.

usage: python framediff.py <video> <out.csv>
"""
import csv
import sys

import cv2
import numpy as np

DUP_THRESHOLD = 0.6   # mean abs diff (0-255) below which a frame counts as a repeat
CUT_THRESHOLD = 40.0  # mean abs diff above which we call it a hard cut


def main(path, out_csv):
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    prev = None
    rows = []
    i = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        small = cv2.cvtColor(cv2.resize(frame, (371, 270)), cv2.COLOR_BGR2GRAY).astype(np.int16)
        diff = 0.0 if prev is None else float(np.abs(small - prev).mean())
        rows.append((i, i / fps, diff))
        prev = small
        i += 1

    with open(out_csv, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["frame", "t", "diff"])
        w.writerows(rows)

    diffs = np.array([r[2] for r in rows[1:]])
    moving = diffs[diffs > DUP_THRESHOLD]
    dup = int((diffs <= DUP_THRESHOLD).sum())
    print(f"frames={len(rows)} fps={fps:.2f} duplicates={dup} ({dup / len(diffs):.0%})")

    # Cadence: in stretches where something moves every frame of the source, the gap
    # between changing frames reveals the source frame rate (e.g. 30/24 -> gaps of 1,1,1,1,2).
    changes = [r[0] for r in rows[1:] if r[2] > DUP_THRESHOLD]
    gaps = np.diff(changes)
    hist = {int(g): int((gaps == g).sum()) for g in np.unique(gaps) if g <= 6}
    print("gap histogram (frames between changes):", hist)

    cuts = [(r[0], round(r[1], 2)) for r in rows if r[2] > CUT_THRESHOLD]
    print(f"hard cuts ({len(cuts)}):", cuts)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
