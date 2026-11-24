# Contact sheet: python3 scripts/sheet.py out.png a.png b.png c.png d.png  (2 columns, half size)
import sys
from PIL import Image, ImageDraw
out, files = sys.argv[1], sys.argv[2:]
ims = [Image.open(f).convert('RGB') for f in files]
w, h = ims[0].size
sc = 0.5 if w >= 1080 else 1
tw, th = int(w * sc), int(h * sc)
cols = 2 if len(ims) > 1 else 1
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (tw * cols + 8 * (cols - 1), th * rows + 8 * (rows - 1)), (40, 40, 40))
for i, (im, f) in enumerate(zip(ims, files)):
    x, y = (i % cols) * (tw + 8), (i // cols) * (th + 8)
    sheet.paste(im.resize((tw, th), Image.LANCZOS), (x, y))
    ImageDraw.Draw(sheet).text((x + 8, y + 6), f.split('/')[-1], fill=(255, 80, 80))
sheet.save(out)
