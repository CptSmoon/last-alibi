#!/usr/bin/env python3
"""Helper for tools/gen-patches.mjs: prepares the zoomed window sent to the image model, and cuts the
"taken" patch out of the model's answer. Needs Pillow and numpy (OpenCV only for the `fill` fallback).

  python3 tools/cut-patches.py prep <spec.json>   writes <work>/<id>-in.png (the plate window, 4x)
  python3 tools/cut-patches.py cut  <spec.json>   reads  <work>/<id>-out.*, writes game-assets/patches/<id>.png

spec.json: { "id", "room", "box": [x0, y0, x1, y1], "win": [x, y], "work", "mode": "model" | "fill" }
Everything is in plate pixels (1376 x 768). The patch is the box plus a margin; its alpha is 0 wherever
the edit left the plate unchanged and fades out over the margin, so the plate stays pixel-identical
around it.
"""
import json, sys, glob
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
WW, WH, Z = 344, 192, 4          # window in plate px (16:9), zoom sent to the model -> 1376 x 768
MARGIN = 6                        # feather margin around the box, plate px


def plate(room):
    return Image.open(ROOT / 'game-assets' / 'bg' / f'bg-{room}.webp').convert('RGB')


def window(spec):
    x0, y0, x1, y1 = spec['box']
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    wx = min(max(cx - WW // 2, 0), 1376 - WW)
    wy = min(max(cy - WH // 2, 0), 768 - WH)
    return wx, wy


def prep(spec):
    wx, wy = window(spec)
    win = plate(spec['room']).crop((wx, wy, wx + WW, wy + WH)).resize((WW * Z, WH * Z), Image.NEAREST)
    out = Path(spec['work']) / f"{spec['id']}-in.png"
    win.save(out)
    print(json.dumps({'in': str(out), 'win': [wx, wy]}))


def model_patch(spec, P):
    """Scale the model's edited window back to plate px and line it up with the plate (the model may shift or
    tint the picture a little): the offset and colour shift are measured on the ring around the box."""
    wx, wy = window(spec)
    cands = sorted(glob.glob(str(Path(spec['work']) / f"{spec['id']}-out.*")))
    if not cands: raise SystemExit(f"no model output for {spec['id']}")
    ed = Image.open(cands[-1]).convert('RGB')
    S = 8                                               # search +-S px
    big = ed.resize((WW, WH), Image.BOX)
    E = np.asarray(big, dtype=np.float32)
    Wn = P[wy:wy + WH, wx:wx + WW]
    x0, y0, x1, y1 = spec['box']
    ring = np.zeros((WH, WW), bool)
    ring[max(0, y0 - wy - 24):y1 - wy + 24, max(0, x0 - wx - 24):x1 - wx + 24] = True
    ring[y0 - wy - 2:y1 - wy + 2, x0 - wx - 2:x1 - wx + 2] = False
    best = None
    for dy in range(-S, S + 1):
        for dx in range(-S, S + 1):
            sh = np.roll(np.roll(E, dy, 0), dx, 1)
            m = ring.copy(); m[:S + 1] = m[-S - 1:] = False; m[:, :S + 1] = m[:, -S - 1:] = False
            err = np.abs(sh[m] - Wn[m]).mean()
            if best is None or err < best[0]: best = (err, dx, dy)
    err, dx, dy = best
    E = np.roll(np.roll(E, dy, 0), dx, 1)
    E += (Wn[ring] - E[ring]).mean(0)                    # colour match on the ring
    print(json.dumps({'id': spec['id'], 'align': [dx, dy], 'ringErr': round(float(err), 2)}), file=sys.stderr)
    full = P.copy()
    full[wy:wy + WH, wx:wx + WW] = E
    return full


def fill_patch(spec, P):
    import cv2
    x0, y0, x1, y1 = spec['box']
    mask = np.zeros(P.shape[:2], np.uint8); mask[y0:y1, x0:x1] = 255
    out = cv2.inpaint(np.clip(P, 0, 255).astype(np.uint8), mask, 7, cv2.INPAINT_TELEA)
    return out.astype(np.float32)


def cut(spec):
    P = np.asarray(plate(spec['room']), dtype=np.float32)
    full = fill_patch(spec, P) if spec.get('mode') == 'fill' else model_patch(spec, P)
    x0, y0, x1, y1 = spec['box']
    bx0, by0, bx1, by1 = x0 - MARGIN, y0 - MARGIN, x1 + MARGIN, y1 + MARGIN
    Pc, Fc = P[by0:by1, bx0:bx1], np.clip(full[by0:by1, bx0:bx1], 0, 255)
    # alpha: full inside the box, fading to 0 over the margin; then only where the edit changed something
    h, w = Pc.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.minimum.reduce([xx + 0.5, w - xx - 0.5, yy + 0.5, h - yy - 0.5])  # distance to the patch edge
    a = np.clip(d / MARGIN, 0, 1)
    changed = (np.abs(Fc - Pc).max(2) > 18).astype(np.uint8) * 255
    ch = Image.fromarray(changed).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1.5))
    a = a * np.clip(np.asarray(ch, np.float32) / 255 * 1.6, 0, 1)
    rgba = np.dstack([Fc, a * 255]).round().astype(np.uint8)
    out = ROOT / 'game-assets' / 'patches' / f"{spec['id']}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, 'RGBA').save(out, optimize=True)
    # before / after preview, 4x, for review
    base = Image.fromarray(np.clip(P, 0, 255).astype(np.uint8)).convert('RGBA')
    base.alpha_composite(Image.open(out), (bx0, by0))
    pad = 30
    cb = (max(0, bx0 - pad), max(0, by0 - pad), min(1376, bx1 + pad), min(768, by1 + pad))
    before = Image.fromarray(P.astype(np.uint8)).crop(cb)
    after = base.convert('RGB').crop(cb)
    s = 4; pw, ph = before.width * s, before.height * s
    prev = Image.new('RGB', (pw * 2 + 8, ph), (255, 0, 255))
    prev.paste(before.resize((pw, ph), Image.NEAREST), (0, 0)); prev.paste(after.resize((pw, ph), Image.NEAREST), (pw + 8, 0))
    prev.save(Path(spec['work']) / f"{spec['id']}-preview.png")
    print(json.dumps({'id': spec['id'], 'x': bx0, 'y': by0, 'w': bx1 - bx0, 'h': by1 - by0}))


if __name__ == '__main__':
    cmd, path = sys.argv[1], sys.argv[2]
    spec = json.loads(Path(path).read_text())
    {'prep': prep, 'cut': cut}[cmd](spec)
