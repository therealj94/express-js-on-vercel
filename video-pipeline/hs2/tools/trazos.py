"""Convierte un dibujo de línea blanca sobre negro en trazos ordenados para la luz.

    python3 tools/trazos.py entrada.png salida.json [--min 40] [--eps 1.2]

Salida: {"trazos": [[[x, y], ...], ...], "largo": L} con x, y normalizados a [-1, 1] (y hacia arriba),
en el orden en que la luz debe dibujarlos (vecino más cercano, invirtiendo trazos cuando conviene).
"""
import argparse, json, math

import cv2
import networkx as nx
import numpy as np
from skimage.morphology import skeletonize


def esqueleto(ruta):
    im = cv2.imread(ruta, cv2.IMREAD_GRAYSCALE)
    im = cv2.GaussianBlur(im, (3, 3), 0)
    _, b = cv2.threshold(im, 110, 255, cv2.THRESH_BINARY)
    b = cv2.morphologyEx(b, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))  # cierra cortes finos
    return skeletonize(b > 0), im.shape


def grafo(sk):
    G = nx.Graph()
    ys, xs = np.nonzero(sk)
    pts = set(zip(ys.tolist(), xs.tolist()))
    for y, x in pts:
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if (dy or dx) and (y + dy, x + dx) in pts:
                    G.add_edge((y, x), (y + dy, x + dx), weight=math.hypot(dy, dx))
    return G


def ramas(G):
    """Divide el esqueleto en tramos entre extremos/cruces."""
    nodos = {n for n in G if G.degree(n) != 2}
    vistos, out = set(), []
    for a in nodos:
        for b in G.neighbors(a):
            if (a, b) in vistos: continue
            camino, prev, cur = [a, b], a, b
            vistos.add((a, b)); vistos.add((b, a))
            while cur not in nodos:
                sig = [n for n in G.neighbors(cur) if n != prev]
                if not sig: break
                prev, cur = cur, sig[0]
                vistos.add((prev, cur)); vistos.add((cur, prev))
                camino.append(cur)
            out.append(camino)
    for comp in nx.connected_components(G):  # lazos cerrados sin extremos
        if not (comp & nodos):
            ciclo = [u for u, v in nx.find_cycle(G.subgraph(comp))]
            out.append(ciclo + [ciclo[0]])
    return out


def unir(rs, tol=6):
    """Encadena ramas cuyos extremos se tocan, para tener trazos largos y continuos."""
    rs = [list(r) for r in rs]
    cambiado = True
    while cambiado:
        cambiado = False
        for i in range(len(rs)):
            for j in range(len(rs)):
                if i == j or not rs[i] or not rs[j]: continue
                a, b = rs[i], rs[j]
                d = lambda p, q: math.hypot(p[0] - q[0], p[1] - q[1])
                if d(a[-1], b[0]) < tol: rs[i] = a + b; rs[j] = []
                elif d(a[-1], b[-1]) < tol: rs[i] = a + b[::-1]; rs[j] = []
                else: continue
                cambiado = True
        rs = [r for r in rs if r]
    return rs


def suavizar(p, eps):
    c = np.array([[x, y] for y, x in p], np.float32).reshape(-1, 1, 2)
    s = cv2.approxPolyDP(c, eps, False).reshape(-1, 2).astype(float)
    for _ in range(3):  # Chaikin
        if len(s) < 3: break
        q = [s[0]]
        for a, b in zip(s[:-1], s[1:]):
            q += [0.75 * a + 0.25 * b, 0.25 * a + 0.75 * b]
        q.append(s[-1]); s = np.array(q)
    return s


def largo(p):
    return float(np.sum(np.hypot(*np.diff(p, axis=0).T))) if len(p) > 1 else 0.0


def ordenar(trazos):
    """Orden de dibujo: empieza abajo a la izquierda y sigue al extremo más cercano."""
    rest = list(trazos); out = []
    cur = min((t[0] for t in rest), key=lambda p: p[0] - p[1])
    while rest:
        best = min(range(len(rest)), key=lambda i: min(np.hypot(*(rest[i][0] - cur)), np.hypot(*(rest[i][-1] - cur))))
        t = rest.pop(best)
        if np.hypot(*(t[-1] - cur)) < np.hypot(*(t[0] - cur)): t = t[::-1]
        out.append(t); cur = t[-1]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("entrada"); ap.add_argument("salida")
    ap.add_argument("--min", type=float, default=40); ap.add_argument("--eps", type=float, default=1.2)
    a = ap.parse_args()
    sk, (h, w) = esqueleto(a.entrada)
    rs = unir(ramas(grafo(sk)))
    ts = [suavizar(r, a.eps) for r in rs]
    ts = [t for t in ts if largo(t) >= a.min]
    ts = ordenar(ts)
    allp = np.vstack(ts); c = (allp.max(0) + allp.min(0)) / 2; esc = (allp.max(0) - allp.min(0)).max() / 2
    norm = [[[round((x - c[0]) / esc, 4), round(-(y - c[1]) / esc, 4)] for x, y in t] for t in ts]
    json.dump({"trazos": norm, "largo": round(sum(largo(np.array(t)) for t in norm), 3)}, open(a.salida, "w"))
    print(a.salida, len(norm), "trazos", sum(len(t) for t in norm), "puntos")


if __name__ == "__main__":
    main()
