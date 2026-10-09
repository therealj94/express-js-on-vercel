"""Convierte world-atlas (topojson) en trazos SVG de Centroamérica para el lienzo 1080x1920."""
import json, math
T = json.load(open('../../mapa/countries-50m.json'))
sc, tr = T['transform']['scale'], T['transform']['translate']
arcs = []
for a in T['arcs']:
    x = y = 0; pts = []
    for dx, dy in a:
        x += dx; y += dy; pts.append((x * sc[0] + tr[0], y * sc[1] + tr[1]))
    arcs.append(pts)
def arc(i): return arcs[i] if i >= 0 else arcs[~i][::-1]
def ring(r):
    out = []
    for i in r:
        p = arc(i); out += p if not out else p[1:]
    return out
PAISES = ['Honduras', 'El Salvador', 'Guatemala', 'Nicaragua', 'Belize', 'Costa Rica', 'Panama', 'Mexico']
# encuadre: lon -92.5..-82.5, lat 7..18.6 (Mercator), centrado en Honduras
L0, L1, A0, A1 = -92.8, -77.0, 7.0, 18.6
my = lambda la: math.log(math.tan(math.pi / 4 + math.radians(la) / 2))
Y0, Y1 = my(A0), my(A1)
W, H = 1080, 1920
k = min(W / (L1 - L0), H / math.degrees(Y1 - Y0)) * 1.0
cx = (L0 + L1) / 2; cy = (Y0 + Y1) / 2
def P(lo, la): return (W / 2 + (lo - cx) * k, H / 2 - math.degrees(my(la) - cy) * k)
out, bord = {}, {}
for g in T['objects']['countries']['geometries']:
    n = g['properties']['name']
    if n not in PAISES: continue
    polys = g['arcs'] if g['type'] == 'MultiPolygon' else [g['arcs']]
    d = ''
    for poly in polys:
        for r in poly:
            pts = [P(*p) for p in ring(r)]
            if all(x < -200 or x > W + 200 or y < -200 or y > H + 200 for x, y in pts): continue
            d += 'M' + 'L'.join(f'{x:.1f},{y:.1f}' for x, y in pts) + 'Z'
    out[n] = d
    bord[n] = {i if i >= 0 else ~i for poly in polys for r in poly for i in r}
# frontera Honduras–El Salvador = arcos compartidos
com = bord['Honduras'] & bord['El Salvador']
fr = ''
for i in com:
    pts = [P(*p) for p in arcs[i]]
    fr += 'M' + 'L'.join(f'{x:.1f},{y:.1f}' for x, y in pts)
cap = {'Tegucigalpa': P(-87.2068, 14.0723), 'San Salvador': P(-89.2182, 13.6929)}
json.dump({'paises': out, 'frontera': fr, 'cap': cap}, open('codigo/mapa.json', 'w'))
print({k: len(v) for k, v in out.items()}, len(fr), cap)
