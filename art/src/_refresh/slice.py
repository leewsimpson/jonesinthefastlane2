"""Slice a 3x2 refresh sprite sheet into one source PNG per cell (art-direction §6).

    python slice.py <sheet.png> <category> <id1> ... <id6>

Each cell is cut out, its background removed (real alpha is kept; a flat magenta or flat light background is keyed
out), stray art from neighbouring cells dropped, and trimmed to the art. An id of "-" skips that cell. Output: art/src/<category>/<id>.png, ready for
`pnpm sprites`.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent


def has_alpha(im: Image.Image) -> bool:
    return im.mode == 'RGBA' and im.getextrema()[3][0] < 250


def key_flat(im: Image.Image) -> Image.Image:
    """Key out the colour found in the cell's corners, softly, for sheets that came back without alpha."""
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    corners = [px[2, 2], px[w - 3, 2], px[2, h - 3], px[w - 3, h - 3]]
    bg = tuple(sorted(c[i] for c in corners)[1] for i in range(3))
    solid, clear = 70, 28
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            d = abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2])
            if d <= clear:
                px[x, y] = (0, 0, 0, 0)
            elif d < solid:
                px[x, y] = (r, g, b, int(a * (d - clear) / (solid - clear)))
    return im


def key_magenta(cell: Image.Image) -> Image.Image:
    """The pipeline's magenta key (apps/web/scripts/sprites/key.ts): alpha from min(R, B) - G, key un-mixed."""
    px = np.asarray(cell.convert('RGBA')).astype(float)
    r, g, b, a = px[..., 0], px[..., 1], px[..., 2], px[..., 3]
    score = np.minimum(r, b) - g
    solid, clear = 48, 216
    k = np.clip((clear - score) / (clear - solid), 0, 1)
    safe = np.maximum(k, 1e-6)
    px[..., 0] = np.where(k < 1, (r - (1 - k) * 255) / safe, r)
    px[..., 1] = np.where(k < 1, g / safe, g)
    px[..., 2] = np.where(k < 1, (b - (1 - k) * 255) / safe, b)
    px[..., 3] = a * k
    return Image.fromarray(np.clip(px, 0, 255).astype(np.uint8))


def keep_centre(cell: Image.Image) -> Image.Image:
    """Drop art that strays in from neighbouring cells: keep the pieces that reach the cell's middle."""
    px = np.asarray(cell).copy()
    solid = ndimage.binary_dilation(px[..., 3] > 16, iterations=4)
    labels, _ = ndimage.label(solid)
    h, w = px.shape[:2]
    middle = labels[h // 4 : 3 * h // 4, w // 3 : 2 * w // 3]
    keep = np.isin(labels, np.unique(middle[middle > 0]))
    px[~keep] = 0
    return Image.fromarray(px)


def main() -> None:
    sheet, category, *ids = sys.argv[1:]
    im = Image.open(sheet).convert('RGBA')
    alpha = has_alpha(im)
    w, h = im.size
    cols, rows = 3, 2
    out = ROOT / category
    out.mkdir(exist_ok=True)
    for i, name in enumerate(ids):
        if name == '-':
            continue
        c, r = i % cols, i // cols
        cell = im.crop((c * w // cols, r * h // rows, (c + 1) * w // cols, (r + 1) * h // rows))
        if not alpha:
            r, g, b, _ = cell.getpixel((2, 2))
            cell = key_magenta(cell) if min(r, b) - g > 200 else key_flat(cell)
        cell = keep_centre(cell)
        box = cell.getchannel('A').point(lambda v: 255 if v > 16 else 0).getbbox()
        if not box:
            raise SystemExit(f'{name}: cell {i} is empty')
        cell.crop(box).save(out / f'{name}.png')
        print(f'{category}/{name}.png {box[2] - box[0]}x{box[3] - box[1]} (alpha={alpha})')


if __name__ == '__main__':
    main()
