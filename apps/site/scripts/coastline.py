"""
India's coastline for the destinations map (src/three/data/coast.json), from Natural Earth's
1:50m coastline (public domain, https://www.naturalearthdata.com/).

Only the coast is drawn, from the Gulf of Kutch round the peninsula to the Bengal delta, plus
Lakshadweep and the Andaman & Nicobar Islands. No land border is drawn anywhere: the map fades into
the night to the north, and both ends of the coast fade out before any international boundary.

  curl -o ne_50m_coastline.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_coastline.geojson
  python3 scripts/coastline.py ne_50m_coastline.geojson
"""
import json, math, sys

LON0, LAT0 = 79.0, 20.0
K = math.cos(math.radians(20.0))


def proj(lon, lat):
    return [round((lon - LON0) * K, 3), round(LAT0 - lat, 3)]


def dp(pts, tol):
    """Douglas-Peucker simplification."""
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    n = math.hypot(dx, dy) or 1e-9
    i_max, d_max = 0, -1.0
    for i in range(1, len(pts) - 1):
        p = pts[i]
        d = abs(dy * (p[0] - a[0]) - dx * (p[1] - a[1])) / n
        if d > d_max:
            i_max, d_max = i, d
    if d_max <= tol:
        return [a, b]
    return dp(pts[: i_max + 1], tol)[:-1] + dp(pts[i_max:], tol)


def main(path):
    d = json.load(open(path))
    rings = []
    for f in d['features']:
        g = f['geometry']
        rings += [g['coordinates']] if g['type'] == 'LineString' else g['coordinates']
    # mainland: the run of the Eurasia coastline inside India's coastal box
    main_ring = max(rings, key=len)
    inside = lambda p: 68.45 <= p[0] <= 88.85 and 6.0 <= p[1] <= 23.9
    runs, cur = [], []
    for p in main_ring:
        if inside(p):
            cur.append(p)
        elif cur:
            runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    coast = max(runs, key=len)
    islands = []
    for r in rings:
        if r is main_ring:
            continue
        lon = sum(p[0] for p in r) / len(r)
        lat = sum(p[1] for p in r) / len(r)
        lakshadweep = 71.5 <= lon <= 74.5 and 7.5 <= lat <= 12.5
        andaman = 92.0 <= lon <= 94.2 and 6.0 <= lat <= 14.0
        if lakshadweep or andaman:
            islands.append(r)
    out = {
        'source': 'Natural Earth 1:50m coastline (public domain)',
        'projection': {'lon0': LON0, 'lat0': LAT0, 'k': round(K, 6)},
        'coast': dp([proj(*p) for p in coast], 0.015),
        'islands': [dp([proj(*p) for p in r], 0.01) for r in islands],
    }
    dst = 'src/three/data/coast.json'
    json.dump(out, open(dst, 'w'), separators=(',', ':'))
    print(dst, len(out['coast']), 'coast points,', len(out['islands']), 'islands')


main(sys.argv[1])
