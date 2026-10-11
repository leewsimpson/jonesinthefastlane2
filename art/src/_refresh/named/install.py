"""Key a named building (flat magenta, keyed from the edges so pink and lilac details survive), trim it, and install
it as art/src/locations/<id>.png, keeping the blank-sign original in art/src/_legacy/locations-blank-sign/.

    python install.py <id> ...
"""
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = Path(__file__).resolve().parent
SRC = HERE.parent.parent


def key(path: Path) -> Image.Image:
    px = np.asarray(Image.open(path).convert('RGBA')).astype(float)
    r, g, b = px[..., 0], px[..., 1], px[..., 2]
    score = np.minimum(r, b) - g
    labels, _ = ndimage.label(score > 120)
    edge = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    bg = np.isin(labels, edge[edge > 0])
    near = ndimage.binary_dilation(bg, iterations=4)
    k = np.clip((216 - score) / (216 - 48), 0, 1)
    k = np.where(bg, 0.0, np.where(near, k, 1.0))
    safe = np.maximum(k, 1e-6)
    out = px.copy()
    out[..., 0] = np.where(k < 1, (r - (1 - k) * 255) / safe, r)
    out[..., 1] = np.where(k < 1, g / safe, g)
    out[..., 2] = np.where(k < 1, (b - (1 - k) * 255) / safe, b)
    out[..., 3] = 255 * k
    im = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
    return im.crop(im.getchannel('A').point(lambda a: 255 if a > 16 else 0).getbbox())


for id_ in sys.argv[1:]:
    dest = SRC / 'locations' / f'{id_}.png'
    legacy = SRC / '_legacy' / 'locations-blank-sign'
    legacy.mkdir(parents=True, exist_ok=True)
    if not (legacy / f'{id_}.png').exists():
        shutil.copy(dest, legacy / f'{id_}.png')
        shutil.copy(dest.with_suffix('.prompt.txt'), legacy / f'{id_}.prompt.txt')
    im = key(HERE / f'{id_}.png')
    im.save(dest)
    dest.with_suffix('.prompt.txt').write_text(
        f'Regenerated from the blank-sign original (_legacy/locations-blank-sign/{id_}.png) with its name painted on:\n'
        f'_refresh/named/{id_}.prompt.txt, reference _refresh/named/ref-{id_}.png. Keyed and trimmed by\n'
        f'_refresh/named/install.py.\n',
        encoding='utf-8',
    )
    print(id_, im.size)
