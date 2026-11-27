"""
Tiny blurred placeholders for the 3D stills (src/assets/3d/stills/placeholders.json), written into
the page itself (data: URIs, about 1 KB each), so a 3D stage is never an empty frame, even before
its still has downloaded. Re-run after re-rendering the stills:
  python3 scripts/still-placeholders.py
"""
import base64, glob, io, json, os
from PIL import Image

out = {}
for path in sorted(glob.glob('src/assets/3d/stills/*.jpg') + glob.glob('src/assets/3d/stills/*.png')):
    name = os.path.splitext(os.path.basename(path))[0]
    im = Image.open(path)
    w = 40
    im = im.resize((w, max(1, round(im.height * w / im.width))), Image.LANCZOS)
    buf = io.BytesIO()
    if im.mode == 'RGBA':
        im.save(buf, 'PNG', optimize=True)
        mime = 'image/png'
    else:
        im.convert('RGB').save(buf, 'JPEG', quality=55, optimize=True)
        mime = 'image/jpeg'
    out[name] = f'data:{mime};base64,{base64.b64encode(buf.getvalue()).decode()}'
json.dump(out, open('src/assets/3d/stills/placeholders.json', 'w'), indent=0)
print({k: len(v) for k, v in out.items()})
