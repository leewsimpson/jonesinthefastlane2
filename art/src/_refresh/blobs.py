"""Cut a refresh sheet into one source PNG per subject by its connected shapes, for art that strays across grid cells
(the bus is wider than its cell). Subjects are ordered like the sheet's prompt: rows top to bottom, left to right.

    python blobs.py <sheet.png> <category> <id1> ... <idN>

The background is removed as in slice.py (real alpha kept, flat magenta keyed); pieces smaller than 1% of the largest
are dropped as specks. An id of "-" skips that subject. Output: art/src/<category>/<id>.png, ready for `pnpm sprites`.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

from slice import ROOT, has_alpha, key_magenta


def main() -> None:
    sheet, category, *ids = sys.argv[1:]
    im = Image.open(sheet)
    im = im.convert('RGBA') if has_alpha(im) else key_magenta(im)
    px = np.asarray(im)
    mask = ndimage.binary_dilation(px[..., 3] > 24, iterations=6)
    labels, n = ndimage.label(mask)
    boxes = ndimage.find_objects(labels)
    sizes = ndimage.sum(mask, labels, range(1, n + 1))
    big = max(sizes)
    parts = [(b, i + 1) for i, b in enumerate(boxes) if sizes[i] >= big * 0.01]
    # Row by row: a subject belongs to the row its vertical centre falls in.
    rows = 2 if len(parts) > 3 else 1
    h = px.shape[0]
    parts.sort(key=lambda p: (int(((p[0][0].start + p[0][0].stop) / 2) // (h / rows)), p[0][1].start))
    if len(parts) != len(ids):
        sys.exit(f'{sheet}: found {len(parts)} subjects, expected {len(ids)}')
    out = ROOT / category
    out.mkdir(parents=True, exist_ok=True)
    for (box, label), name in zip(parts, ids):
        if name == '-':
            continue
        cut = px[box].copy()
        cut[..., 3] = np.where(labels[box] == label, cut[..., 3], 0)
        Image.fromarray(cut).save(out / f'{name}.png')
        print(name, cut.shape[1], 'x', cut.shape[0])


if __name__ == '__main__':
    main()
