"""
Before/after sheets (film v1 vs v2), one per scene: v1 on the left, v2 on the right, labelled.
Usage: python scripts/before_after.py <out_dir> <label>=<v1.png>,<v2.png> [...]
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont

FONT = '/usr/share/fonts/opentype/inter/Inter-SemiBold.otf'
out_dir = sys.argv[1]
os.makedirs(out_dir, exist_ok=True)
for arg in sys.argv[2:]:
    label, pair = arg.split('=', 1)
    a, b = pair.split(',')
    A, B = Image.open(a).convert('RGB'), Image.open(b).convert('RGB')
    h = 540
    A = A.resize((round(A.width * h / A.height), h), Image.LANCZOS)
    B = B.resize((round(B.width * h / B.height), h), Image.LANCZOS)
    pad, top = 16, 104
    W = A.width + B.width + pad * 3
    sheet = Image.new('RGB', (W, h + top + pad), (11, 16, 32))
    sheet.paste(A, (pad, top)); sheet.paste(B, (pad * 2 + A.width, top))
    d = ImageDraw.Draw(sheet)
    f = ImageFont.truetype(FONT, 26) if os.path.exists(FONT) else ImageFont.load_default()
    d.text((pad, 16), label, font=f, fill=(243, 237, 226))
    d.text((pad, 62), 'Before: v1 (film-v1.0)', font=f, fill=(170, 166, 160))
    d.text((pad * 2 + A.width, 62), 'After: v2 (film-v2.0)', font=f, fill=(244, 227, 181))
    name = label.split(' ')[0].lower()
    p = os.path.join(out_dir, f'before-after-{name}.jpg')
    sheet.save(p, quality=90)
    print(p)
