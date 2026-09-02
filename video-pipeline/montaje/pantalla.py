#!/usr/bin/env python3
"""Mete una interfaz DENTRO de la pantalla del teléfono, siguiéndola al moverse.

El problema que resuelve: las pantallas de los clips van encendidas pero
ilegibles —el modelo no sabe dibujar una interfaz y no se le puede pedir—, así
que el espectador ve a alguien tocando un teléfono y no sabe qué hace. José lo
dijo sin rodeos: "no se puede ver qué están dentro y tocan ahí".

Cómo funciona, que no es magia:

1. **Encuentra la pantalla** en el primer fotograma. No a ojo: la pantalla es la
   mancha más oscura (apagada) o más clara (encendida) de un tamaño razonable,
   y su contorno se reduce a cuatro esquinas.
2. **La sigue** con flujo óptico de Lucas-Kanade sobre puntos repartidos por el
   cristal, y de cada par de fotogramas saca una homografía. Cuatro esquinas
   sueltas se despegan enseguida; treinta puntos con RANSAC aguantan.
3. **Pega la interfaz** deformada a esas cuatro esquinas, y le suma el brillo
   del cristal en vez de taparlo: una pantalla emite luz, no es una pegatina.
   Por eso se compone en modo suma con la luminancia original como guía.

    python3 montaje/pantalla.py clip.mp4 interfaz.png salida.mp4 --oscura
"""
from __future__ import annotations

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np


def buscar_pantalla(gris: np.ndarray, oscura: bool) -> np.ndarray | None:
    """Las cuatro esquinas de la pantalla en un fotograma, o None.

    Se prueban varios umbrales porque la exposición cambia mucho entre planos;
    vale el primero que dé un cuadrilátero convexo de tamaño de pantalla."""
    h, w = gris.shape
    suave = cv2.GaussianBlur(gris, (5, 5), 0)
    umbrales = range(30, 96, 8) if oscura else range(200, 129, -8)
    mejor = None
    for u in umbrales:
        m = (suave < u) if oscura else (suave > u)
        m = cv2.morphologyEx(m.astype(np.uint8) * 255, cv2.MORPH_CLOSE,
                             np.ones((7, 7), np.uint8))
        cont, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c in cont:
            area = cv2.contourArea(c)
            if not (0.02 * h * w < area < 0.45 * h * w):
                continue
            caja = cv2.boxPoints(cv2.minAreaRect(c))
            # Una pantalla es alargada y el contorno debe llenar su caja: así se
            # descartan sombras y ventanas, que son irregulares.
            if cv2.contourArea(caja.astype(np.float32)) > area * 1.7:
                continue
            lados = [np.linalg.norm(caja[i] - caja[(i + 1) % 4]) for i in range(4)]
            largo, corto = max(lados), min(lados)
            if corto < 1 or not (1.3 < largo / corto < 4.0):
                continue
            if mejor is None or area > mejor[0]:
                mejor = (area, caja)
        if mejor:
            break
    return None if mejor is None else ordenar(mejor[1])


def ordenar(p: np.ndarray) -> np.ndarray:
    """Esquinas en orden: arriba-izq, arriba-der, abajo-der, abajo-izq."""
    p = np.array(p, dtype=np.float32)
    c = p.mean(axis=0)
    ang = np.arctan2(p[:, 1] - c[1], p[:, 0] - c[0])
    p = p[np.argsort(ang)]
    i = int(np.argmin(p.sum(axis=1)))          # la de menor x+y es la de arriba-izq
    return np.roll(p, -i, axis=0)


def componer(fondo: np.ndarray, ui: np.ndarray, esquinas: np.ndarray,
             fuerza: float, opaco: bool = False) -> np.ndarray:
    """La interfaz deformada a las cuatro esquinas, SUMADA al cristal.

    Sumar y no tapar es lo que hace que parezca una pantalla: se conservan los
    reflejos y la mano que pasa por delante sigue viéndose."""
    h, w = fondo.shape[:2]
    alto, ancho = ui.shape[:2]
    M = cv2.getPerspectiveTransform(
        np.float32([[0, 0], [ancho, 0], [ancho, alto], [0, alto]]), esquinas)
    capa = cv2.warpPerspective(ui, M, (w, h), flags=cv2.INTER_LINEAR)
    mascara = cv2.warpPerspective(np.ones((alto, ancho), np.float32), M, (w, h))
    mascara = cv2.GaussianBlur(mascara, (0, 0), 2.0)[..., None]
    f = fondo.astype(np.float32)
    if opaco:
        # Una pantalla YA encendida y clara no se puede sumar: se lavaría. Se
        # apaga primero lo que hay debajo y se pone la interfaz en su sitio.
        return np.clip(f * (1 - mascara * 0.92) + capa.astype(np.float32) * mascara,
                       0, 255).astype(np.uint8)
    return np.clip(f + capa.astype(np.float32) * mascara * fuerza, 0, 255).astype(np.uint8)


def main() -> int:
    a = argparse.ArgumentParser()
    a.add_argument("clip")
    a.add_argument("ui")
    a.add_argument("salida")
    a.add_argument("--oscura", action="store_true",
                   help="la pantalla está apagada (busca la mancha oscura)")
    a.add_argument("--fuerza", type=float, default=0.95)
    a.add_argument("--opaco", action="store_true",
                   help="la pantalla ya está encendida: se sustituye en vez de sumarse")
    a.add_argument("--desde", type=float, default=0.0,
                   help="segundo en el que se busca la pantalla")
    a.add_argument("--esquinas", help="8 números x0,y0,...,x3,y3 si la detección falla")
    a = a.parse_args()

    cap = cv2.VideoCapture(a.clip)
    fps = cap.get(cv2.CAP_PROP_FPS) or 24
    fotos = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        fotos.append(f)
    cap.release()
    if not fotos:
        sys.exit("no se pudo leer el clip")

    n0 = min(len(fotos) - 1, int(a.desde * fps))
    gris0 = cv2.cvtColor(fotos[n0], cv2.COLOR_BGR2GRAY)
    if a.esquinas:
        q = ordenar(np.array([float(v) for v in a.esquinas.split(",")]).reshape(4, 2))
    else:
        q = buscar_pantalla(gris0, a.oscura)
        if q is None:
            sys.exit("no encontré la pantalla; pasa --esquinas")
    print("pantalla en el fotograma %d: %s" % (n0, np.round(q).astype(int).tolist()))

    ui = cv2.imread(a.ui, cv2.IMREAD_COLOR)
    if ui is None:
        sys.exit("no pude leer la interfaz")

    # Puntos a seguir: dentro del cristal, que es donde el movimiento es el del
    # teléfono y no el de la mano ni el del fondo.
    mask = np.zeros(gris0.shape, np.uint8)
    cv2.fillConvexPoly(mask, q.astype(np.int32), 255)
    mask = cv2.erode(mask, np.ones((9, 9), np.uint8))
    p0 = cv2.goodFeaturesToTrack(gris0, maxCorners=200, qualityLevel=0.01,
                                 minDistance=6, mask=mask)
    if p0 is None or len(p0) < 8:
        # Un cristal negro no tiene textura que seguir: se siguen los bordes.
        borde = cv2.dilate(mask, np.ones((25, 25), np.uint8)) - cv2.erode(mask, np.ones((5, 5), np.uint8))
        p0 = cv2.goodFeaturesToTrack(gris0, 200, 0.01, 6, mask=borde)
    if p0 is None or len(p0) < 6:
        sys.exit("no hay puntos que seguir en la pantalla")
    print(f"{len(p0)} puntos de seguimiento")

    quads = {n0: q}
    for direccion in (1, -1):
        pts, gris, H = p0.copy(), gris0.copy(), np.eye(3, dtype=np.float32)
        i = n0
        while 0 <= i + direccion < len(fotos):
            i += direccion
            g2 = cv2.cvtColor(fotos[i], cv2.COLOR_BGR2GRAY)
            p2, st, _ = cv2.calcOpticalFlowPyrLK(gris, g2, pts, None,
                                                 winSize=(21, 21), maxLevel=3)
            if p2 is None or st.sum() < 6:
                quads[i] = quads[i - direccion]
                continue
            b, a2 = p2[st.ravel() == 1], pts[st.ravel() == 1]
            paso, _ = cv2.findHomography(a2, b, cv2.RANSAC, 3.0)
            if paso is None:
                quads[i] = quads[i - direccion]
                continue
            H = paso @ H
            quads[i] = cv2.perspectiveTransform(q.reshape(-1, 1, 2), H).reshape(4, 2)
            pts, gris = b.reshape(-1, 1, 2), g2

    tmp = Path(tempfile.mkdtemp())
    for i, f in enumerate(fotos):
        cv2.imwrite(str(tmp / f"{i:05d}.png"), componer(f, ui, quads[i], a.fuerza, a.opaco))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(fps),
                    "-i", str(tmp / "%05d.png"), "-c:v", "libx264", "-crf", "17",
                    "-preset", "slow", "-pix_fmt", "yuv420p", a.salida], check=True)
    print(f"listo: {a.salida} · {len(fotos)} fotogramas")
    return 0


if __name__ == "__main__":
    sys.exit(main())
