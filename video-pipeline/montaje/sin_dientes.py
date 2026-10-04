"""Quita los «dientes» blancos que la IA le dibujó a la guara dentro del pico abierto.

En la zona de la cara busca la boca (la mancha oscura grande que no toca el borde de esa zona) y repinta
lo blanco que cae dentro de su envolvente con el color de la boca. La pupila es pequeña y no cuenta.
"""
import cv2
import numpy as np

ZONA = (.30, .75, .28, .58)  # x0, x1, y0, y1 (proporción del cuadro): la cara de la guara en W01 y L02


def sin_dientes(f, zona=ZONA):
    h, w = f.shape[:2]; esc = w / 1088
    x0, x1, y0, y1 = int(zona[0] * w), int(zona[1] * w), int(zona[2] * h), int(zona[3] * h)
    sub = f[y0:y1, x0:x1]
    hsv = cv2.cvtColor(sub, cv2.COLOR_BGR2HSV); s, v = hsv[..., 1], hsv[..., 2]
    oscuro = (v < 100).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(oscuro)
    H, Wd = oscuro.shape; boca = np.zeros_like(oscuro)
    for i in range(1, n):
        x, y, bw, bh, a = st[i]
        if a > 4000 * esc * esc and x > 2 and y > 2 and x + bw < Wd - 2 and y + bh < H - 2:
            boca[lab == i] = 1
    if not boca.any(): return f
    cs, _ = cv2.findContours(boca, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    lleno = np.zeros_like(boca)
    for c in cs: cv2.drawContours(lleno, [cv2.convexHull(c)], -1, 1, -1)
    blanco = (v > 140) & (s < 80)  # diente: blanco; el pico es beige más saturado
    dientes = (lleno.astype(bool) & blanco).astype(np.uint8)
    if dientes.sum() < 15: return f
    dientes = cv2.dilate(dientes, np.ones((int(7 * esc) | 1,) * 2, np.uint8)) & lleno
    out = f.copy()
    out[y0:y1, x0:x1] = cv2.inpaint(sub, dientes * 255, int(9 * esc), cv2.INPAINT_TELEA)
    return out
