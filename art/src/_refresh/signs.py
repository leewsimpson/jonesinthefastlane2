"""Find each building's blank sign panel, for SIGN_PANELS in apps/web/src/board/frames.ts.

    python signs.py <id> ...

A panel is the largest pale, low-saturation, wide region in the upper two thirds of the art. Prints one TypeScript
line per building: centre x and y and width, as fractions of the trimmed source (the atlas keeps proportions).
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent


def panel(path: Path):
    im = np.asarray(Image.open(path).convert('RGBA')).astype(int)
    h, w = im.shape[:2]
    r, g, b, a = im[..., 0], im[..., 1], im[..., 2], im[..., 3]
    pale = (a > 200) & (r > 225) & (g > 215) & (b > 190) & (np.max(im[..., :3], 2) - np.min(im[..., :3], 2) < 45)
    pale[int(h * 0.7):] = False
    labels, n = ndimage.label(pale)
    best = None
    for i, sl in enumerate(ndimage.find_objects(labels), start=1):
        ys, xs = sl
        bw, bh = xs.stop - xs.start, ys.stop - ys.start
        area = (labels[sl] == i).sum()
        # A sign: wide, solidly filled, and a fair share of the facade.
        if bw < w * 0.3 or bw < bh * 2 or area < bw * bh * 0.6:
            continue
        if best is None or area > best[0]:
            best = (area, xs.start, ys.start, bw, bh)
    if not best:
        return None
    _, x, y, bw, bh = best
    return ((x + bw / 2) / w, (y + bh / 2) / h, bw / w * 0.92)


for name in sys.argv[1:]:
    p = panel(ROOT / 'locations' / f'{name}.png')
    if p:
        print(f"  '{name}': {{ x: {p[0]:.2f}, y: {p[1]:.2f}, w: {p[2]:.2f} }},")
    else:
        print(f'  // {name}: no panel found')
