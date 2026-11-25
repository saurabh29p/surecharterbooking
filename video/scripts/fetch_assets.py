"""
Fetches the CC0 assets used by the film from Poly Haven (polyhaven.com, all CC0) and writes small,
processed copies to public/assets/ (committed, so renders do not depend on the download):
  sky/<name>.jpg   8k HDRI, elevation band -8..+62 deg, Reinhard-compressed to sRGB (the shader
                   inverts the curve to recover HDR highlights for bloom)
  env/<name>.hdr   1k HDRI for image-based lighting and reflections
  tex/<name>_{diff,nor,rough}.jpg   1k PBR maps
Run: python -I scripts/fetch_assets.py   (needs numpy + opencv-python-headless)
"""
import hashlib, json, os, sys, urllib.request
import numpy as np, cv2

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'public', 'assets')
CACHE = os.environ.get('ASSET_CACHE', os.path.join(ROOT, 'out', 'asset-cache'))
os.makedirs(CACHE, exist_ok=True)
SKIES = {'belfast_sunset_puresky': 1.0, 'kloppenheim_02_puresky': 1.0}
TEXTURES = ['asphalt_02', 'painted_plaster_wall', 'old_sandstone_02', 'leafy_grass']
ELEV = (-8.0, 62.0)


def get(url):
    path = os.path.join(CACHE, url.split('/')[-1])
    if not os.path.exists(path):
        req = urllib.request.Request(url, headers={'User-Agent': 'film-asset-fetch'})
        with urllib.request.urlopen(req, timeout=300) as r, open(path + '.part', 'wb') as f:
            f.write(r.read())
        os.replace(path + '.part', path)
    return path


manifest = {'source': 'Poly Haven (polyhaven.com), CC0', 'skies': {}, 'textures': {}}
for name in SKIES:
    big = get(f'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/8k/{name}_8k.hdr')
    small = get(f'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/{name}_1k.hdr')
    with open(small, 'rb') as f, open(os.path.join(OUT, 'env', f'{name}.hdr'), 'wb') as g:
        g.write(f.read())
    im = cv2.imread(big, cv2.IMREAD_ANYDEPTH | cv2.IMREAD_COLOR).astype(np.float32)  # BGR, linear
    h, w = im.shape[:2]
    r0 = int((0.5 - ELEV[1] / 180) * h); r1 = int((0.5 - ELEV[0] / 180) * h)
    band = im[r0:r1]
    lum = band.mean(axis=2)
    mid = float(np.median(lum))
    exposure = 0.35 / mid                           # median sky -> 0.35 before compression
    x = band * exposure
    x = x / (1.0 + x)                               # Reinhard: [0, inf) -> [0, 1)
    srgb = np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(np.clip(x, 1e-8, 1), 1 / 2.4) - 0.055)
    cv2.imwrite(os.path.join(OUT, 'sky', f'{name}.jpg'), np.clip(srgb * 255 + 0.5, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 86])
    # brightest point (sun / moon) in the band, as a direction for the scenes
    y, xpix = np.unravel_index(np.argmax(cv2.GaussianBlur(lum, (0, 0), 6)), lum.shape)
    elev = ELEV[1] - (y / band.shape[0]) * (ELEV[1] - ELEV[0])
    u = (xpix + 0.5) / w
    manifest['skies'][name] = {'file': f'sky/{name}.jpg', 'env': f'env/{name}.hdr', 'elevMin': ELEV[0], 'elevMax': ELEV[1],
                               'exposure': exposure, 'brightU': round(u, 5), 'brightElev': round(float(elev), 3), 'width': w, 'height': int(r1 - r0)}
    print(name, manifest['skies'][name])
for t in TEXTURES:
    info = json.loads(urllib.request.urlopen(urllib.request.Request(f'https://api.polyhaven.com/files/{t}', headers={'User-Agent': 'film-asset-fetch'}), timeout=60).read())
    out = {}
    for key, short in [('Diffuse', 'diff'), ('nor_gl', 'nor'), ('Rough', 'rough')]:
        src = get(info[key]['1k']['jpg']['url'])
        img = cv2.imread(src, cv2.IMREAD_COLOR)
        dst = os.path.join(OUT, 'tex', f'{t}_{short}.jpg')
        cv2.imwrite(dst, img, [cv2.IMWRITE_JPEG_QUALITY, 85 if short != 'nor' else 92])
        out[short] = f'tex/{t}_{short}.jpg'
    manifest['textures'][t] = out
    print(t, out)
with open(os.path.join(ROOT, 'src', 'data', 'assets.json'), 'w') as f:
    json.dump(manifest, f, indent=1)
