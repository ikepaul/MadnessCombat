"""Cut the per-mechanic reference clips listed in research/clips.json.

For every mechanic it writes research/mechanics/<slug>/clip-<n>.mp4 (742 px wide, with
audio) and frames-<n>.jpg (a labelled 10 fps contact sheet of the same range). Both are
gitignored: they are derived from the original episodes and stay on this machine.

usage: python make_clips.py [slug ...]   (no args = all)
"""
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
VIDEO = ROOT / "reference" / "video"
OUT = ROOT / "research" / "mechanics"
CONTACT = ROOT / "tools" / "research" / "contact.py"


def cut(src, start, end, dst):
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{start}", "-to", f"{end}", "-i", str(src),
         "-vf", "scale=742:-2", "-c:v", "libx264", "-crf", "23", "-preset", "veryfast",
         "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(dst)],
        check=True,
    )


def sheet(src, start, end, prefix):
    rows = max(1, min(6, -(-int((end - start) * 10) // 4)))
    subprocess.run(
        [sys.executable, "-I", str(CONTACT), str(src), str(prefix), f"{start}", f"{end}", "3",
         "--cols", "4", "--rows", str(rows), "--tile", "371"],
        check=True, stdout=subprocess.DEVNULL,
    )
    # contact.py numbers its sheets; keep the first as frames-<n>.jpg, extra pages as -b, -c...
    pages = sorted(prefix.parent.glob(prefix.name + "_*.jpg"))
    for i, page in enumerate(pages):
        suffix = "" if i == 0 else "-" + "abcdefghij"[i]
        page.rename(prefix.parent / f"{prefix.name}{suffix}.jpg")


def main():
    manifest = json.loads((ROOT / "research" / "clips.json").read_text())["mechanics"]
    wanted = sys.argv[1:] or list(manifest)
    for slug in wanted:
        folder = OUT / slug
        folder.mkdir(parents=True, exist_ok=True)
        for n, (ep, start, end) in enumerate(manifest[slug], 1):
            src = VIDEO / f"{ep}.mp4"
            cut(src, start, end, folder / f"clip-{n}.mp4")
            sheet(src, start, end, folder / f"frames-{n}")
        print(f"{slug}: {len(manifest[slug])} clip(s)")


if __name__ == "__main__":
    main()
