"""Build the nose-gear-door evidence images from the verification shots.

Produces:
  shots/doors-gear-up-down.png    sealed (gear up) vs open (gear down), below + front
  shots/doors-retraction-strip.png  gear 1.00 -> 0.00 captured in the game itself
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT_PATHS = [r'C:\Windows\Fonts\consola.ttf', r'C:\Windows\Fonts\segoeui.ttf']


def font(size):
    for path in FONT_PATHS:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def load(rel):
    path = ROOT / rel
    if not path.exists():
        raise SystemExit(f'missing shot: {path}')
    return Image.open(path).convert('RGB')


def crop_scale(image, box, size):
    part = image.crop(box)
    part.thumbnail(size, Image.LANCZOS)
    canvas = Image.new('RGB', size, (11, 15, 18))
    canvas.paste(part, ((size[0] - part.width) // 2,
                        (size[1] - part.height) // 2))
    return canvas


def sheet(rows, out, header, sublabel, cell=(520, 340)):
    pad = 14
    header_h = 96
    width = pad + len(rows[0][1]) * (cell[0] + pad)
    height = header_h + len(rows) * (cell[1] + 32 + pad)
    canvas = Image.new('RGB', (width, height), (8, 12, 15))
    draw = ImageDraw.Draw(canvas)
    draw.text((pad, 14), header, fill=(190, 235, 215), font=font(20))
    draw.text((pad, 46), sublabel, fill=(120, 165, 150), font=font(14))
    for r, (row_label, cells) in enumerate(rows):
        y = header_h + r * (cell[1] + 32 + pad)
        draw.text((pad, y - 20), row_label, fill=(150, 200, 185), font=font(15))
        for c, (caption, image, box) in enumerate(cells):
            x = pad + c * (cell[0] + pad)
            canvas.paste(crop_scale(image, box, cell), (x, y))
            draw.rectangle([x, y, x + cell[0] - 1, y + cell[1] - 1],
                           outline=(40, 62, 56))
            draw.text((x + 6, y + 6), caption, fill=(240, 250, 245), font=font(15))
    canvas.save(ROOT / out)
    print(f'{out}  {canvas.width}x{canvas.height}')


def gear_up_down():
    below = (430, 130, 890, 760)     # nose-gear bay frame
    front = (395, 60, 885, 760)      # front camera frame
    sheet(
        [
            ('from below (nose under)', [
                ('GEAR UP — sealed, door solids not drawn',
                 load('shots/final/up-below.png'), below),
                ('GEAR DOWN — doors open', load('shots/final/down-below.png'), below),
            ]),
            ('from the front', [
                ('GEAR UP — nothing stands out', load('shots/final/up-front.png'), front),
                ('GEAR DOWN — doors hang open',
                 load('shots/final/down-front.png'), front),
            ]),
        ],
        'shots/doors-gear-up-down.png',
        'SKYFORGE · F-16CM nose gear doors · gear up vs gear down',
        'rendered by tools/gear-preview.html with the shipped JetModel; the body '
        '(cc52) carries the closed belly panel, the door solids only draw when down',
    )


def retraction_strip():
    frames = [
        ('gear 1.00 — down, doors open', 'shots/strip/gear-100.png'),
        ('gear 0.75', 'shots/strip/gear-075.png'),
        ('gear 0.50', 'shots/strip/gear-050.png'),
        ('gear 0.25', 'shots/strip/gear-025.png'),
        ('gear 0.00 — retracted, doors sealed', 'shots/strip/gear-000.png'),
    ]
    box = (420, 170, 860, 700)
    sheet(
        [('retraction, gear 1.00 -> 0.00, captured in the game', [
            (caption, load(path), box) for caption, path in frames
        ])],
        'shots/doors-retraction-strip.png',
        'SKYFORGE · F-16CM nose gear doors · retraction filmstrip',
        'tools/game-door-strip.mjs drove player.systems.gear in the shipped game; '
        'nose-door angle 0.0deg -> 74.6deg as the bay closes',
        cell=(300, 400),
    )


if __name__ == '__main__':
    gear_up_down()
    retraction_strip()
