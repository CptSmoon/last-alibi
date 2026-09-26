"""Build the scene-by-scene asset review page: art/review/index.html + art/review/img/.
Also slices sprite sheets into poses and item sheets into single clue icons (art/assets/slices/).
   python3 tools/build-review.py
"""
import json, html
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / 'art'
OUT = ART / 'review'
IMG = OUT / 'img'
SL = ART / 'assets' / 'slices'
for d in (IMG, SL): d.mkdir(parents=True, exist_ok=True)
CASE = json.loads((ROOT / 'scenario' / 'orient.json').read_text())
EV = {e['id']: e for e in CASE['evidence']}

def web(src, name, w=1100, q=80):
    im = Image.open(src)
    if im.width > w: im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    if im.mode in ('RGBA', 'LA'):
        im.save(IMG / f'{name}.webp', 'WEBP', quality=q, method=6)
    else:
        im.convert('RGB').save(IMG / f'{name}.webp', 'WEBP', quality=q, method=6)
    return f'img/{name}.webp'

def key_magenta(src):
    """Cut the flat magenta background (and its darker shadow tints) out of a generated JPG."""
    im = Image.open(src).convert('RGBA'); px = im.load(); w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            if r > 90 and b > 90 and g < 0.62 * min(r, b) and abs(r - b) < 110: px[x, y] = (0, 0, 0, 0)
    return im

def segments(im, n, join=3, equal=False):
    """Split a transparent sheet into objects: connected components on a coarse alpha mask (nearby parts are
    joined), then reading order (rows top to bottom, left to right). Extra small pieces merge into neighbours."""
    S = 4
    w, h = im.size; sw, sh = w // S, h // S
    a = im.getchannel('A').resize((sw, sh), Image.BOX)
    m = [[a.getpixel((x, y)) > 60 for x in range(sw)] for y in range(sh)]
    # dilate to join close parts
    d = [[any(m[yy][xx] for yy in range(max(0, y - join), min(sh, y + join + 1)) for xx in range(max(0, x - join), min(sw, x + join + 1))) for x in range(sw)] for y in range(sh)]
    seen = [[False] * sw for _ in range(sh)]; boxes = []
    for y in range(sh):
        for x in range(sw):
            if d[y][x] and not seen[y][x]:
                st = [(x, y)]; seen[y][x] = True; x0 = x1 = x; y0 = y1 = y; cnt = 0
                while st:
                    cx, cy = st.pop(); cnt += 1
                    x0, x1, y0, y1 = min(x0, cx), max(x1, cx), min(y0, cy), max(y1, cy)
                    for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                        if 0 <= nx < sw and 0 <= ny < sh and d[ny][nx] and not seen[ny][nx]: seen[ny][nx] = True; st.append((nx, ny))
                if cnt > 12: boxes.append([x0, y0, x1, y1, cnt])
    if len(boxes) < n and equal:                     # poses touching (e.g. hat brims): fall back to equal columns
        out = []
        for i in range(n):
            piece = im.crop((i * w // n, 0, (i + 1) * w // n, h)); bb = piece.getchannel('A').point(lambda v: 255 if v > 40 else 0).getbbox()
            out.append(piece.crop(bb) if bb else piece)
        return out
    while len(boxes) > n:                           # merge the smallest into its nearest neighbour
        boxes.sort(key=lambda b: b[4]); sm = boxes.pop(0)
        cx, cy = (sm[0] + sm[2]) / 2, (sm[1] + sm[3]) / 2
        nb = min(boxes, key=lambda b: ((b[0] + b[2]) / 2 - cx) ** 2 + ((b[1] + b[3]) / 2 - cy) ** 2)
        nb[0], nb[1], nb[2], nb[3], nb[4] = min(nb[0], sm[0]), min(nb[1], sm[1]), max(nb[2], sm[2]), max(nb[3], sm[3]), nb[4] + sm[4]
    rows = []                                        # reading order: cluster by vertical centre
    for b in sorted(boxes, key=lambda b: (b[1] + b[3]) / 2):
        c = (b[1] + b[3]) / 2
        if rows and abs(rows[-1][0] - c) < sh * 0.15: rows[-1][1].append(b)
        else: rows.append([c, [b]])
    out = []
    for _, r in rows:
        for b in sorted(r, key=lambda b: b[0]):
            box = (max(0, (b[0] - join) * S), max(0, (b[1] - join) * S), min(w, (b[2] + join + 1) * S), min(h, (b[3] + join + 1) * S))
            piece = im.crop(box); bb = piece.getchannel('A').point(lambda v: 255 if v > 40 else 0).getbbox()
            out.append(piece.crop(bb) if bb else piece)
    return out

def slice_sheet(png, n, names, scale_h=None, join=3, equal=False):
    p = ART / 'assets' / png
    if not p.exists(): return {}
    im = key_magenta(p)
    res = {}
    for name, piece in zip(names, segments(im, n, join, equal)):
        if scale_h and piece.height > scale_h: piece = piece.resize((round(piece.width * scale_h / piece.height), scale_h), Image.LANCZOS)
        piece.save(SL / f'{name}.png')
        res[name] = web(SL / f'{name}.png', f'slice-{name}', w=400, q=85)
    return res

# ---- slices ----
ITEM_SHEETS = {
    'items/items-c7.png': ['e_notebook', 'e_blotter', 'e_letters', 'e_contract', 'e_camphor', 'e_bolt', 'e_handkerchief'],
    'items/items-train.png': ['e_ampoule_tip', 'e_grappa', 'e_scorecard', 'e_medbag', 'e_tumbler', 'e_passports', 'e_marked_cards'],
    'items/items-facts.png': ['e_wet_shoes', 'e_callboard', 'e_trainlog', 'x_magnifier', 'x_magnifier2', 'x_fedora', 'x_notebook'],
}
ITEM_IMG = {}
for sheet, names in ITEM_SHEETS.items(): ITEM_IMG.update(slice_sheet(sheet.replace('.png', '.jpg'), len(names), names, scale_h=260))
CHARS = ['sorel', 'ferrand', 'irina', 'hale', 'mila', 'brandt', 'theo', 'castelli', 'cook']
POSES = ['front', 'left', 'right', 'back', 'walk', 'talk']
POSE_IMG = {c: slice_sheet(f'characters/char-{c}.jpg', 6, [f'{c}-{p}' for p in POSES], scale_h=420, join=1, equal=True) for c in CHARS}
def keyed(rel, name, w):
    p = ART / 'assets' / rel
    if not p.exists(): return None
    im = key_magenta(p); bb = im.getchannel('A').getbbox(); im = im.crop(bb) if bb else im
    im.save(SL / f'{name}.png'); return web(SL / f'{name}.png', name, w=w)
BODY = keyed('characters/char-lazar-body.jpg', 'char-lazar-body', 700)

NAMES = {'sorel': 'Inspector Sorel', 'ferrand': 'Dr Ferrand', 'irina': 'Countess Voss', 'hale': 'Major Hale', 'mila': 'Mila Novak',
         'brandt': 'Herr Brandt', 'theo': 'Théo', 'castelli': 'Castelli', 'cook': 'Luigi, the cook', 'lazar': 'Anton Lazăr'}
ROLES = {'sorel': 'You. Sûreté, Paris', 'ferrand': 'Physician (the killer)', 'irina': 'Austrian widow', 'hale': 'Retired Indian Army', 'mila': 'Cabaret singer',
         'brandt': 'Oil company agent', 'theo': 'Sleeping-car conductor', 'castelli': 'Chef de train', 'cook': 'Dining-car cook', 'lazar': 'The victim'}
X_ITEMS = {'x_magnifier': ('Magnifying glass', 'UI prop: the examine cursor.'), 'x_fedora': ("Sorel's fedora", 'UI prop: menu and save icon.'), 'x_notebook': ("Sorel's notebook", 'UI prop: the notebook button.')}

def img(p, alt, cls=''):
    return f'<img src="{p}" alt="{html.escape(alt)}" loading="lazy" class="{cls}">' if p else '<div class="missing">not generated</div>'

def still(n):
    f = next((ART / 'scenes').glob(f'{n}*.jpg'), None)
    return web(f, f'still-{n}') if f else None

def bg(id_):
    f = ART / 'assets' / 'backgrounds' / f'{id_}.jpg'
    return web(f, id_) if f.exists() else None

def item_card(eid):
    e = EV.get(eid); name, desc, kind = (e['name'], e['description'], 'Pick up' if e.get('take') else 'Fact, noted') if e else (*X_ITEMS[eid], 'UI')
    return f'''<figure class="item"><div class="chk">{img(ITEM_IMG.get(eid), name)}</div>
      <figcaption><b>{html.escape(name)}</b><span class="kind">{kind}</span><span class="id">{eid}</span></figcaption></figure>'''

def person(c, pose='front'):
    p = BODY if c == 'lazar' else POSE_IMG.get(c, {}).get(f'{c}-{pose}')
    return f'''<figure class="who"><div class="chk tall">{img(p, NAMES[c])}</div><figcaption><b>{NAMES[c]}</b><span>{ROLES[c]}</span></figcaption></figure>'''

SCENES = [
    ('00', 'The avalanche', 'Simplon line, 23:40', 'Opening cinematic. The train runs, the mountain comes down, the engine is buried. About 5 seconds, then fade to morning.', ['00'], 'bg-night', [], []),
    ('01', 'Breakfast', 'Dining car, 07:00 to 07:04', 'Tutorial: walk, say good morning. Around 25 seconds in, Théo bursts through the left door with "!" and everyone turns.', ['01', '02'], 'bg-dining', ['sorel', 'ferrand', 'hale', 'irina', 'mila', 'brandt', 'castelli', 'theo'], []),
    ('03', 'The forced door', 'Sleeping-car corridor, 07:12', 'Castelli has forced door 7 with a crowbar; Théo in shock, Ferrand kneeling in the doorway. The handkerchief lies by the door. Doors 1 to 7, call board at the left end.', ['03'], 'bg-corridor', ['sorel', 'castelli', 'theo', 'ferrand'], ['e_handkerchief', 'e_bolt', 'e_callboard']),
    ('04', 'Compartment 7', 'The crime scene, 07:20', 'The envoy in his berth. Window catch undone, snow on the sill and a puddle below. Items are separate sprites so they can be picked up; the body is its own sprite.', ['04'], 'bg-c7', ['sorel', 'lazar'], ['e_notebook', 'e_blotter', 'e_camphor', 'e_letters', 'e_contract']),
    ('05', 'The lounge', 'Lounge car, 08:30', 'Bar, piano, stove, observation windows. Hale at the abandoned piquet game, Mila smoking by the glass, Brandt reading.', ['05'], 'bg-lounge', ['sorel', 'hale', 'mila', 'brandt'], ['e_scorecard']),
    ('06', 'The kitchen', 'Dining car kitchen, 08:10', "Luigi at the stove. Théo's cap still on its hook; through the window, the footprints. The grappa glasses give Théo away.", ['06'], 'bg-kitchen', ['sorel', 'cook'], ['e_grappa']),
    ('07', 'Outside, in the snow', 'North side of the train, 08:45', 'The buried engine, the open window of No. 7, one line of prints to the dining car door, and the glint of glass in the snow.', ['07'], 'bg-outside', ['sorel'], ['e_ampoule_tip']),
    ('08', 'Compartment 3', "Dr Ferrand's compartment, 09:00", 'Shoes stuffed with newspaper under the berth, trousers drying on the heater, the doctor\'s bag on the seat.', ['08'], 'bg-c3', ['sorel'], ['e_medbag', 'e_wet_shoes']),
    ('09', 'Compartment 6', "Herr Brandt's compartment, 09:10", 'Next door to No. 7. The tooth glass on the shelf, pressed to the wall.', ['09'], 'bg-c6', ['sorel', 'brandt'], ['e_tumbler']),
    ('10', 'The accusation', 'Dining car, 10:00', 'Everyone gathered. Sorel points; Ferrand goes pale. Same background as breakfast, staged differently.', ['10'], 'bg-dining', ['sorel', 'ferrand', 'irina', 'hale', 'mila', 'brandt', 'theo', 'castelli'], ['e_trainlog']),
]
COMPS = [('bg-c1', 'Compartment 1', "Sorel's own", []), ('bg-c2', 'Compartment 2', "Major Hale's", ['e_marked_cards']),
         ('bg-c4', 'Compartment 4', "Mila Novak's", ['e_passports']), ('bg-c5', 'Compartment 5', "Countess Voss's", [])]

nav, body = [], []
for sid, title, where, note, stills, bgid, cast, items in SCENES:
    nav.append(f'<a href="#s{sid}"><span class="n">{sid}</span>{html.escape(title)}</a>')
    st = ''.join(f'<figure class="plate"><div class="tag">Target still{" · beat " + str(i + 1) if len(stills) > 1 else ""}</div>{img(still(s), title + " still")}</figure>' for i, s in enumerate(stills))
    body.append(f'''<section class="scene" id="s{sid}">
  <header><span class="num">{sid}</span><div><h2>{html.escape(title)}</h2><p class="where">{html.escape(where)}</p></div></header>
  <p class="note">{html.escape(note)}</p>
  <div class="plates">{st}<figure class="plate"><div class="tag bgtag">Background plate · empty</div>{img(bg(bgid), title + " background")}<figcaption class="id">{bgid}</figcaption></figure></div>
  {f'<h3>People in this scene</h3><div class="row">{"".join(person(c) for c in cast)}</div>' if cast else ''}
  {f'<h3>Clues in this scene</h3><div class="row">{"".join(item_card(i) for i in items)}</div>' if items else ''}
</section>''')

nav.append('<a href="#comps"><span class="n">+</span>Compartments</a>')
body.append('<section class="scene" id="comps"><header><span class="num">+</span><div><h2>The other compartments</h2><p class="where">Sleeping car, Nos. 1, 2, 4, 5</p></div></header>'
            '<p class="note">No target still yet: drawn from the compartment 3 template so the camera, size and berth line up.</p><div class="plates four">'
            + ''.join(f'<figure class="plate"><div class="tag bgtag">{t} · {o}</div>{img(bg(i), t)}{"".join(item_card(x) for x in its)}</figure>' for i, t, o, its in COMPS) + '</div></section>')

nav.append('<a href="#cast"><span class="n">★</span>Cast</a>')
cast_html = []
for c in CHARS:
    poses = ''.join(f'<figure class="pose"><div class="chk tall">{img(POSE_IMG.get(c, {}).get(f"{c}-{p}"), p)}</div><figcaption>{p}</figcaption></figure>' for p in POSES)
    pf = ART / 'assets' / 'portraits' / f'portrait-{c}.jpg'
    cast_html.append(f'''<article class="char"><header><h3>{NAMES[c]}</h3><span>{ROLES[c]}</span></header>
      <div class="poses">{poses}</div>
      <figure class="portraits">{img(web(pf, f"portrait-{c}") if pf.exists() else None, NAMES[c] + " portraits")}<figcaption>Dialogue portraits: neutral · nervous · shocked</figcaption></figure></article>''')
body.append(f'<section class="scene" id="cast"><header><span class="num">★</span><div><h2>The cast</h2><p class="where">Sprite poses and dialogue portraits</p></div></header>'
            f'<p class="note">Each sheet is cut into six poses: front, left, right, back, walking, talking. Walk cycles still need in-between frames drawn by hand or generated one by one.</p>{"".join(cast_html)}'
            f'<article class="char"><header><h3>{NAMES["lazar"]}</h3><span>{ROLES["lazar"]}</span></header><div class="poses"><figure class="pose wide"><div class="chk">{img(BODY, "body")}</div><figcaption>in the berth</figcaption></figure></div></article></section>')

nav.append('<a href="#items"><span class="n">◆</span>Items</a>')
all_items = [i for names in ITEM_SHEETS.values() for i in names if i != 'x_magnifier2']
body.append(f'<section class="scene" id="items"><header><span class="num">◆</span><div><h2>Every clue item</h2><p class="where">{len(all_items)} cut-outs from three sheets</p></div></header><div class="row">{"".join(item_card(i) for i in all_items)}</div></section>')

nav.append('<a href="#ui"><span class="n">▣</span>UI kit</a>')
uk = ART / 'assets' / 'ui' / 'ui-kit.png'
body.append(f'<section class="scene" id="ui"><header><span class="num">▣</span><div><h2>UI kit</h2><p class="where">Buttons, plates, labels, dialogue box, slots, bubbles</p></div></header>'
            f'<p class="note">The game draws all text itself, so every plate here is blank.</p><figure class="plate"><div class="chk">{img(keyed('ui/ui-kit.jpg', 'ui-kit', 1200), "UI kit")}</div></figure></section>')

counts = {'stills': len(list((ART / 'scenes').glob('*.jpg'))), 'bgs': len(list((ART / 'assets/backgrounds').glob('*.jpg'))),
          'chars': len(list((ART / 'assets/characters').glob('*.png'))), 'items': len([p for p in SL.glob('e_*.png')])}

page = f'''<title>Simplon-Orient Asset Bible</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@500;700&family=Alegreya+Sans:ital,wght@0,400;0,500;0,700;1,400&family=IBM+Plex+Mono:wght@400&display=swap">
<style>
:root {{ color-scheme: dark; --wood:#1e130d; --panel:#2b1a11; --panel2:#352216; --line:#4a3020; --parch:#f1e6c8; --ink:#2a1a10; --brass:#d3a54e; --wine:#8a2a3c; --pine:#4f8a6c; --muted:#c3ab86; --text:#f3e9d2;
  --display:'Pixelify Sans', 'Courier New', monospace; --body:'Alegreya Sans', 'Gill Sans', 'Trebuchet MS', sans-serif; --mono:'IBM Plex Mono', ui-monospace, Menlo, monospace; }}
* {{ box-sizing: border-box; }}
body {{ margin: 0; background: var(--wood); color: var(--text); font: 17px/1.55 var(--body); padding-inline: 16px;
  background-image: repeating-linear-gradient(90deg, rgba(255,255,255,.012) 0 3px, transparent 3px 11px); }}
.wrap {{ max-width: 1240px; margin: 0 auto; padding-block: 32px 80px; }}
.hero {{ display: grid; gap: 10px; padding-block: 12px 26px; border-bottom: 2px solid var(--line); }}
.hero .kicker {{ font: 500 14px var(--display); color: var(--brass); letter-spacing: .12em; text-transform: uppercase; }}
h1 {{ font: 700 clamp(34px, 6vw, 60px)/1 var(--display); margin: 0; color: var(--parch); text-wrap: balance; }}
.hero p {{ max-width: 68ch; margin: 0; color: var(--muted); }}
.stats {{ display: flex; flex-wrap: wrap; gap: 8px 22px; font: 13px var(--mono); color: var(--muted); }}
.stats b {{ color: var(--brass); font-weight: 400; font-size: 15px; }}
nav {{ position: sticky; top: env(safe-area-inset-top, 0px); z-index: 5; background: rgba(30,19,13,.94); backdrop-filter: blur(6px); border-bottom: 1px solid var(--line);
  display: flex; gap: 6px; overflow-x: auto; padding-block: 10px; margin-inline: -16px; padding-inline: 16px; scrollbar-width: thin; }}
nav a {{ flex: none; display: inline-flex; gap: 6px; align-items: baseline; color: var(--text); text-decoration: none; font-size: 14px; padding: 5px 10px 5px 8px;
  border: 1px solid var(--line); border-radius: 4px; background: var(--panel); }}
nav a:hover, nav a:focus-visible {{ border-color: var(--brass); outline: none; }}
nav .n {{ font: 500 12px var(--display); color: var(--brass); }}
.scene {{ padding-block: 44px 8px; scroll-margin-top: 60px; display: grid; gap: 14px; }}
.scene > header {{ display: flex; gap: 16px; align-items: center; }}
.num {{ font: 700 30px/1 var(--display); color: var(--ink); background: var(--brass); min-width: 56px; height: 56px; display: grid; place-items: center; border-radius: 4px;
  box-shadow: inset 0 0 0 3px #f0c96a, 0 3px 0 #7a5424; }}
h2 {{ font: 700 clamp(24px, 3.4vw, 34px)/1.1 var(--display); margin: 0; color: var(--parch); text-wrap: balance; }}
.where {{ margin: 2px 0 0; color: var(--brass); font-size: 15px; }}
.note {{ max-width: 72ch; margin: 0; color: var(--muted); }}
h3 {{ font: 500 15px var(--display); letter-spacing: .08em; text-transform: uppercase; color: var(--brass); margin: 10px 0 0; }}
.plates {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr)); gap: 14px; }}
.plates.four {{ grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); }}
figure {{ margin: 0; }}
.plate {{ background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 8px; display: grid; gap: 8px; }}
.plate img {{ width: 100%; height: auto; display: block; border-radius: 3px; image-rendering: auto; }}
.tag {{ font: 500 12px var(--display); letter-spacing: .1em; text-transform: uppercase; color: var(--parch); }}
.bgtag {{ color: var(--pine); }}
.id {{ font: 12px var(--mono); color: var(--muted); }}
.row {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }}
.chk {{ background-color: #e9dcb9; background-image: conic-gradient(#dccda6 25%, transparent 0 50%, #dccda6 0 75%, transparent 0); background-size: 16px 16px;
  border-radius: 4px; display: grid; place-items: center; aspect-ratio: 1; padding: 8px; overflow: hidden; }}
.chk.tall {{ aspect-ratio: 3/4; }}
.chk img {{ max-width: 100%; max-height: 100%; object-fit: contain; }}
.item, .who {{ background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 6px; display: grid; gap: 6px; align-content: start; }}
.item figcaption, .who figcaption {{ display: grid; gap: 1px; font-size: 14px; line-height: 1.3; padding-inline: 2px; }}
.item b, .who b {{ color: var(--parch); font-weight: 700; }}
.kind {{ font-size: 12px; color: var(--pine); }}
.who span {{ font-size: 13px; color: var(--muted); }}
.char {{ background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 12px; display: grid; gap: 10px; }}
.char > header {{ display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; }}
.char h3 {{ margin: 0; font-size: 18px; color: var(--parch); letter-spacing: .02em; text-transform: none; }}
.char > header span {{ color: var(--muted); font-size: 14px; }}
.poses {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; }}
.pose.wide {{ grid-column: span 3; }} .pose.wide .chk {{ aspect-ratio: 2/1; }}
.pose figcaption, .portraits figcaption {{ font: 12px var(--mono); color: var(--muted); text-align: center; margin-top: 3px; }}
.portraits img {{ width: 100%; height: auto; border-radius: 4px; display: block; }}
.missing {{ font: 12px var(--mono); color: var(--wine); padding: 20px; text-align: center; }}
footer {{ margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--line); color: var(--muted); font-size: 14px; }}
@media (prefers-reduced-motion: reduce) {{ html {{ scroll-behavior: auto; }} }}
html {{ scroll-behavior: smooth; }}
</style>
<div class="wrap">
  <div class="hero">
    <div class="kicker">Last Stop, Simplon-Orient · Art review</div>
    <h1>Simplon-Orient Asset Bible</h1>
    <p>Every stage of the case, scene by scene: the approved target still, the empty background plate the game will draw on, the people who appear there, and the clues you can find. All generated with Gemini from the locked Gather-style reference and the approved cast.</p>
    <div class="stats"><span><b>{counts["stills"]}</b> target stills</span><span><b>{counts["bgs"]}</b> background plates</span><span><b>{counts["chars"]}</b> sprite sheets</span><span><b>{counts["items"]}</b> clue items</span><span><b>9</b> portrait sheets</span><span><b>1</b> UI kit</span></div>
  </div>
  <nav aria-label="Scenes">{"".join(nav)}</nav>
  {"".join(body)}
  <footer>Generated 26 Sept 2026 with gemini-3.1-flash-image · style bible: art/STYLE.md · regenerate with tools/gen-assets.mjs and tools/gen-scenes.mjs.</footer>
</div>'''
(OUT / 'index.html').write_text(page)
print('wrote', OUT / 'index.html', 'images:', len(list(IMG.glob('*.webp'))))
