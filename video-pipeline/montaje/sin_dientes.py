"""Quita los «dientes» blancos que la IA le dibujó a la guara dentro del pico abierto (W01 al final y L02).

Un diente es una mancha blanca pequeña rodeada de boca oscura. Se buscan solo en la zona de la boca, por
debajo de los ojos (así el brillo de la pupila no cuenta), y se repintan con el color de alrededor.
"""
import cv2
import numpy as np

BOCA = (.36, .70, .39, .52)  # x0, x1, y0, y1 (proporción del cuadro) en W01 (final) y L02


def sin_dientes(f, zona=BOCA):
    h, w = f.shape[:2]; esc = w / 1088
    x0, x1, y0, y1 = int(zona[0] * w), int(zona[1] * w), int(zona[2] * h), int(zona[3] * h)
    sub = f[y0:y1, x0:x1]
    hsv = cv2.cvtColor(sub, cv2.COLOR_BGR2HSV); s, v = hsv[..., 1], hsv[..., 2]
    blanco = ((v > 145) & (s < 125)).astype(np.uint8)  # blanco cálido; el pico beige y la lengua son más saturados
    n, lab, st, _ = cv2.connectedComponentsWithStats(blanco)
    r = max(3, int(8 * esc)); ker = np.ones((2 * r + 1, 2 * r + 1), np.uint8)
    dientes = np.zeros_like(blanco)
    for i in range(1, n):
        x, y, bw, bh, a = st[i]
        if not (10 < a < 1800 * esc * esc and bw < 95 * esc and bh < 50 * esc): continue
        m = (lab[max(0, y - r):y + bh + r, max(0, x - r):x + bw + r] == i).astype(np.uint8)
        anillo = cv2.dilate(m, ker).astype(bool) & ~m.astype(bool)
        vv = v[max(0, y - r):y + bh + r, max(0, x - r):x + bw + r][anillo]
        if vv.size and np.median(vv) < 150: dientes[lab == i] = 1  # rodeada de boca y lengua (el pico beige es más claro)
    if not dientes.any(): return f
    dientes = cv2.dilate(dientes, np.ones((int(5 * esc) | 1,) * 2, np.uint8))
    out = f.copy()
    out[y0:y1, x0:x1] = cv2.inpaint(sub, dientes * 255, int(7 * esc), cv2.INPAINT_TELEA)
    return out
