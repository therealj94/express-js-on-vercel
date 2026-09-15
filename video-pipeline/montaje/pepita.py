#!/usr/bin/env python3
"""Una pepita de oro que parece oro, no un polígono amarillo.

La primera versión era un polígono irregular con unas manchas claras encima, y
se notaba: el oro no se reconoce por el color sino por CÓMO refleja. Un metal
tiene un brillo especular muy concentrado que se mueve con la superficie, y
sombras que caen en los huecos. Sin eso, cualquier amarillo es plastilina.

Así que aquí no se dibuja una forma: se construye un relieve y se ilumina.

  1. Un campo de alturas fractal —ruido a varias escalas— da los bultos y las
     grietas que tiene una pepita de verdad.
  2. De ese relieve salen las normales, que dicen hacia dónde mira cada punto.
  3. Con las normales se calcula, por píxel, cuánta luz difusa recibe y cuánto
     brillo especular devuelve hacia la cámara.
  4. El color sale de una rampa de oro: los huecos tiran a marrón rojizo, las
     crestas a amarillo claro, y el especular quema a blanco.

Todo con numpy, sin GPU y sin librerías de render.

    python3 montaje/pepita.py salida.png 520
"""
from __future__ import annotations

import sys

import numpy as np
from PIL import Image

# Rampa del oro, de la sombra al brillo. Un oro real no va de negro a amarillo:
# pasa por marrón rojizo, que es lo que le da el tono cálido.
RAMPA = np.array([
    (28, 16, 4), (86, 52, 12), (150, 100, 28),
    (205, 155, 55), (236, 200, 110), (252, 240, 205),
], np.float64)


def ruido_fractal(n, semilla, octavas=6):
    """Ruido a varias escalas sumadas. Una sola escala da bultos todos iguales;
    la suma es lo que produce grietas grandes con grano fino encima."""
    rng = np.random.default_rng(semilla)
    campo = np.zeros((n, n))
    amp = 1.0
    for o in range(octavas):
        lado = max(2, int(4 * 2 ** o))
        base = rng.random((lado, lado))
        capa = np.array(Image.fromarray((base * 255).astype(np.uint8))
                        .resize((n, n), Image.BICUBIC)) / 255.0
        campo += capa * amp
        amp *= 0.5
    campo -= campo.min()
    return campo / (campo.max() + 1e-9)


def pepita(n=520, semilla=7):
    """Devuelve la pepita en RGBA con el fondo transparente."""
    rng = np.random.default_rng(semilla)
    y, x = np.mgrid[-1:1:complex(n), -1:1:complex(n)]

    # Silueta: un círculo deformado por ruido angular. Una pepita no es redonda,
    # pero tampoco es un polígono de aristas rectas.
    ang = np.arctan2(y, x)
    r = np.sqrt(x**2 + y**2)
    borde = 0.74
    for k, (f, a) in enumerate(((3, 0.10), (5, 0.06), (9, 0.03), (17, 0.015))):
        borde = borde + a * np.sin(f * ang + rng.uniform(0, 6.28))
    dentro = r < borde

    # Relieve: una cúpula (para que tenga volumen) más el ruido fractal (para
    # que tenga bultos). Sin la cúpula parece una piedra plana.
    cupula = np.sqrt(np.clip(1 - (r / borde) ** 2, 0, 1))
    altura = cupula * 0.75 + ruido_fractal(n, semilla) * 0.42
    altura = np.where(dentro, altura, 0)

    # Normales por diferencias finitas. El 46 exagera el relieve: la primera
    # versión iba a 26 y salía una masa lisa con forma de nugget de pollo.
    gy, gx = np.gradient(altura * 46)
    nz = np.ones_like(gx)
    ln = np.sqrt(gx**2 + gy**2 + nz**2)
    nx, ny, nz = -gx / ln, -gy / ln, nz / ln

    # AQUI ESTABA EL ERROR. Un metal casi no tiene componente difusa: es casi
    # todo reflejo, y su color sale del TINTE de ese reflejo, no de un relleno
    # amarillo. Sombreandolo como plastico difuso, cualquier oro sale plastilina.
    #
    # Reflejo de entorno falso: se mira hacia donde apunta la normal y se le
    # devuelve cielo claro arriba y suelo oscuro abajo. Eso solo ya lee como
    # metal, porque es lo que hace un metal de verdad.
    entorno = np.clip(0.5 - ny * 0.85, 0, 1) ** 1.5
    horizonte = np.exp(-((ny + 0.05) ** 2) / 0.006) * 0.55

    # Dos especulares: uno ancho que da el cuerpo y otro estrechisimo que es el
    # destello. Sin el estrecho no hay chispa y no parece metal.
    L = np.array([-0.52, -0.66, 0.54]); L /= np.linalg.norm(L)
    V = np.array([0.0, 0.0, 1.0])
    H = (L + V); H /= np.linalg.norm(H)
    hn = np.clip(nx*H[0] + ny*H[1] + nz*H[2], 0, 1)
    espec_ancho = hn ** 12 * 0.55
    espec_fino = hn ** 220 * 1.6

    # Oclusion: los huecos reciben menos luz rebotada. Separa las grietas.
    ocl = np.clip(altura / (altura.max() + 1e-9), 0, 1) ** 0.8 * 0.75 + 0.25

    luz = np.clip((entorno * 0.85 + horizonte + espec_ancho) * ocl, 0, 1.6)

    TINTE = np.array([1.00, 0.76, 0.32])
    rgb = (luz[..., None] * TINTE * 255) * 1.15
    rgb += espec_fino[..., None] * 255

    chispa = (ruido_fractal(n, semilla + 3, 7) > 0.88) & dentro & (hn > 0.55)
    rgb[chispa] = np.minimum(rgb[chispa] + 120, 255)
    rgb *= dentro[..., None]

    rgba = np.zeros((n, n, 4), np.uint8)
    rgba[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    # Borde suavizado: el alfa duro delata el recorte.
    alfa = np.clip((borde - r) * n * 0.45, 0, 1)
    rgba[..., 3] = (alfa * 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


if __name__ == "__main__":
    sal = sys.argv[1] if len(sys.argv) > 1 else "pepita.png"
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 520
    im = pepita(n)
    fondo = Image.new("RGB", (n, n), (11, 11, 12))
    fondo.paste(im, (0, 0), im)
    fondo.save(sal)
    print(f"{sal} · {n}x{n}")
