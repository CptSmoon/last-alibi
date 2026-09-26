"""Turn the generated art into game-ready files in game-assets/ (served to the browser).
   python3 tools/build-game-assets.py
Needs art/assets/ (tools/gen-assets.mjs) and the cut-outs in art/assets/slices/ (tools/build-review.py).
"""
from pathlib import Path
from PIL import Image
from collections import deque
import json


def drop_edge_islands(im):
    """Remove pixel islands that are cut off from the body and touch the left or right edge: bits of the
    neighbouring pose left over from slicing the sprite sheet. In game they flickered beside a walking character
    (a thin line next to the inspector, Castelli's broken walk; 26 Sept)."""
    w, h = im.size; a = im.getchannel('A').load(); px = im.load()
    seen = [[False] * h for _ in range(w)]; islands = []
    for x in range(w):
        for y in range(h):
            if a[x, y] > 40 and not seen[x][y]:
                q = deque([(x, y)]); seen[x][y] = True; pts = []
                while q:
                    cx, cy = q.popleft(); pts.append((cx, cy))
                    for dx in (-1, 0, 1):
                        for dy in (-1, 0, 1):
                            nx, ny = cx + dx, cy + dy
                            if 0 <= nx < w and 0 <= ny < h and not seen[nx][ny] and a[nx, ny] > 40:
                                seen[nx][ny] = True; q.append((nx, ny))
                islands.append(pts)
    islands.sort(key=len, reverse=True)
    for pts in islands[1:]:
        if min(x for x, _ in pts) <= 1 or max(x for x, _ in pts) >= w - 2:
            for x, y in pts: px[x, y] = (0, 0, 0, 0)
    return im

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art' / 'assets'
OUT = ROOT / 'game-assets'
for d in ('bg', 'sprites', 'portraits', 'items'): (OUT / d).mkdir(parents=True, exist_ok=True)
manifest = {'bg': [], 'sprites': {}, 'portraits': {}, 'items': []}

# Colour grade for the few plates that drift from the lamp-lit palette of the rest (measured: the kitchen's
# grey-cream tiles are brighter and colder than the other interiors). warm = how far
# to multiply towards lamp light, bright / sat = ImageEnhance factors.
from PIL import ImageEnhance, ImageChops
FLIP = {'bg-kitchen'}
GRADE = {'bg-kitchen': dict(warm=0.30, bright=0.86, sat=1.12)}
LAMP = (255, 196, 128)
def grade(im, warm=0.0, bright=1.0, sat=1.0):
    if warm: im = Image.blend(im, ImageChops.multiply(im, Image.new('RGB', im.size, LAMP)), warm)
    if bright != 1.0: im = ImageEnhance.Brightness(im).enhance(bright)
    if sat != 1.0: im = ImageEnhance.Color(im).enhance(sat)
    return im

# backgrounds: full size (1376x768), webp
for f in sorted((SRC / 'backgrounds').glob('*.jpg')):
    im = Image.open(f).convert('RGB')
    # The kitchen sits between the dining car and the lounge (as on the map), so its plate is mirrored:
    # the dining car must be on its left. engine/scenes.js uses the mirrored coordinates.
    if f.stem in FLIP: im = im.transpose(Image.FLIP_LEFT_RIGHT)
    grade(im, **GRADE.get(f.stem, {})).save(OUT / 'bg' / f'{f.stem}.webp', 'WEBP', quality=90, method=6)
    manifest['bg'].append(f.stem)

# sprites: poses from the slices, normalised to 300 px tall, feet at the bottom edge
POSES = ['front', 'left', 'right', 'back', 'walk', 'talk']
for f in sorted((SRC / 'slices').glob('*-*.png')):
    char, pose = f.stem.rsplit('-', 1)
    if pose not in POSES: continue
    im = Image.open(f).convert('RGBA'); bb = im.getchannel('A').point(lambda v: 255 if v > 60 else 0).getbbox()
    if bb: im = im.crop(bb)
    im = drop_edge_islands(im.resize((round(im.width * 300 / im.height), 300), Image.LANCZOS))
    im.save(OUT / 'sprites' / f'{char}-{pose}.png', optimize=True)
    manifest['sprites'].setdefault(char, []).append(pose)
# Side views: the generated sheets' "left" and "right" poses don't reliably face those ways (for most of the cast
# both were swapped, for some both faced right), so a character could never look one way. Keep ONE true
# right-facing profile per character (checked by eye) and make "left" its exact mirror.
RIGHT_PROFILE = {'sorel': 'right', 'ferrand': 'left', 'irina': 'left', 'hale': 'left', 'mila': 'left',
                 'brandt': 'left', 'theo': 'right', 'castelli': 'left', 'cook': 'right'}
for char, src in RIGHT_PROFILE.items():
    p = OUT / 'sprites' / f'{char}-{src}.png'
    if not p.exists(): continue
    right = Image.open(p).convert('RGBA'); right.load()
    right.save(OUT / 'sprites' / f'{char}-right.png', optimize=True)
    right.transpose(Image.FLIP_LEFT_RIGHT).save(OUT / 'sprites' / f'{char}-left.png', optimize=True)
# seated poses: already sized so the head matches the 300 px standing sprites (art/assets/characters/sit/,
# keyed and head-matched into slices/<id>-sit.png), so copy them as they are; never renormalise to 300 px
for f in sorted((SRC / 'slices').glob('*-sit.png')):
    Image.open(f).save(OUT / 'sprites' / f.name, optimize=True)
    manifest['sprites'].setdefault(f.stem.rsplit('-', 1)[0], []).append('sit')
body = SRC / 'slices' / 'char-lazar-body.png'
if body.exists(): Image.open(body).save(OUT / 'sprites' / 'lazar-body.png', optimize=True)

# portraits: three framed expressions per sheet -> find the cream frames and crop each one
def frames(im):
    g = im.convert('L'); w, h = g.size
    third = w // 3; out = []
    for i in range(3):
        part = g.crop((i * third, 0, (i + 1) * third, h))
        mask = part.point(lambda v: 255 if v > 190 else 0)        # the cream parchment frame
        bb = mask.getbbox()
        out.append(im.crop((i * third + bb[0], bb[1], i * third + bb[2], bb[3])) if bb else im.crop((i * third, 0, (i + 1) * third, h)))
    return out
for f in sorted((SRC / 'portraits').glob('portrait-*.jpg')):
    char = f.stem.split('-', 1)[1]
    for i, fr in enumerate(frames(Image.open(f).convert('RGB'))):
        fr = fr.resize((256, round(fr.height * 256 / fr.width)), Image.LANCZOS)
        fr.save(OUT / 'portraits' / f'{char}-{i}.webp', 'WEBP', quality=90)
    manifest['portraits'][char] = 3
# the victim: one sepia "in memoriam" portrait (single frame, not a sheet) -> lazar-0
dead = SRC / 'portraits' / 'lazar-deceased.jpg'
if dead.exists():
    im = Image.open(dead).convert('RGB'); im = im.crop((6, 6, im.width - 6, im.height - 6))
    im.resize((256, round(im.height * 256 / im.width)), Image.LANCZOS).save(OUT / 'portraits' / 'lazar-0.webp', 'WEBP', quality=90)
    manifest['portraits']['lazar'] = 1
# the illustrated train map (engine/map.js lays HTML labels over it)
tmap = SRC / 'map' / 'train-map.jpg'
if tmap.exists():
    (OUT / 'ui').mkdir(exist_ok=True)
    Image.open(tmap).convert('RGB').save(OUT / 'ui' / 'train-map.webp', 'WEBP', quality=88, method=6)

# clue items
for f in sorted((SRC / 'slices').glob('*.png')):
    if f.stem.startswith(('e_', 'x_')):
        im = Image.open(f).convert('RGBA'); im.thumbnail((160, 160), Image.LANCZOS); im.save(OUT / 'items' / f'{f.stem}.png', optimize=True)
        manifest['items'].append(f.stem)

(OUT / 'manifest.json').write_text(json.dumps(manifest, indent=1))
print({k: len(v) for k, v in manifest.items()})
