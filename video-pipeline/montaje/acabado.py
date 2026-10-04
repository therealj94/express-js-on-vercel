#!/usr/bin/env python3
"""Lo que separa un motion graphics barato de uno caro. Todo calculable.

Un director creativo miró la primera versión de la película del ecosistema y
dijo: «existe lo minimalista y existe lo pobre; esto es pobre». Su diagnóstico
no fue que los gráficos vectoriales sobre negro estén mal —Apple ha hecho piezas
enteras así—, sino que los míos eran «estáticos y bidimensionales: sin
desenfoque de movimiento, sin partículas, sin reflejos».

Analizando técnicamente la pieza de Apple que trajo José salieron siete reglas
concretas. Ninguna necesita GPU ni material filmado; todas son aritmética sobre
píxeles, y esto las implementa.

    from acabado import salida, grano, aberracion, sombra_larga, motion_blur
"""
from __future__ import annotations

import numpy as np
from PIL import Image, ImageFilter


# --------------------------------------------------------------------------
# 1. LAS CURVAS. La regla número uno: "si tu curva de velocidad parece un
#    triángulo, es amateur; debe tener entrada vertical y salida muy larga".
# --------------------------------------------------------------------------
def salida(x: float, potencia: float = 5.0) -> float:
    """Ease-out exponencial. Recorre el 80 % del camino en el primer 20 % del
    tiempo y dedica el resto a asentarse. Es la curva de Apple.

    El smoothstep que usaba antes es simétrico: acelera y frena igual, y por eso
    todo se movía con la misma blandura de plantilla."""
    x = min(max(x, 0.0), 1.0)
    return 1.0 - (1.0 - x) ** potencia


def salida_rebote(x: float, exceso: float = 0.055) -> float:
    """Igual pero pasándose un poco y volviendo.

    No es el rebote elástico de dibujos animados: es un frenado físico, del 5 %,
    el que hace un objeto pesado bien amortiguado. Es lo que hace que algo
    parezca que tiene masa en vez de aparecer."""
    x = min(max(x, 0.0), 1.0)
    if x >= 1.0:
        return 1.0
    base = 1.0 - (1.0 - x) ** 4.2
    # La onda de sobrepaso muere sola hacia el final.
    return base + exceso * np.sin(np.pi * x ** 0.7) * (1 - x) ** 0.5


def escalonar(indice: int, retardo_fotogramas: float = 2.0, fps: int = 30) -> float:
    """Segundos que este elemento espera antes de entrar.

    Regla cuatro: nunca animes dos cosas a la vez. Dos fotogramas de desfase
    entre elementos es lo que convierte un grupo en una secuencia."""
    return indice * retardo_fotogramas / fps


# --------------------------------------------------------------------------
# 2. LA TEXTURA. "El diseño digital limpio se ve barato. Un 2 % de grano añade
#    textura profesional instantáneamente" — y además mata el bandeado de los
#    degradados, que es lo que delata un halo hecho por código.
# --------------------------------------------------------------------------
def grano(arr: np.ndarray, fuerza: float = 0.010, semilla: int = 0) -> np.ndarray:
    """Grano de película, monocromo. Sobre las zonas oscuras se nota más, igual
    que en película real, donde la sombra es la que tiene el grano.

    El 1 % no es un capricho: a 2,2 % la pieza pesaba 408 MB porque cada
    fotograma lleva ruido distinto y el compresor no puede predecir nada. Al
    apretarlo, o pesaba 62 MB o el codec se comía el grano entero. Al 1 %
    sobrevive a un CRF razonable y sigue rompiendo la perfección de render, que
    es para lo que está."""
    rng = np.random.default_rng(semilla)
    h, w = arr.shape[:2]
    ruido = rng.standard_normal((h, w, 1)).astype(np.float32) * 255 * fuerza
    # Más grano donde hay menos luz: es como se comporta el negativo.
    peso = 1.0 - arr[..., :3].mean(2, keepdims=True) / 255.0 * 0.55
    return np.clip(arr[..., :3] + ruido * peso, 0, 255)


_MAPAS = {}


def _mapas(h, w, px):
    """Los índices de la aberración y la máscara de viñeta, calculados una vez.

    Recalcularlos en cada fotograma multiplicaba por diez el tiempo de render:
    1.395 fotogramas x dos mallas de 2 millones de píxeles. Como solo dependen
    del tamaño, se cachean."""
    clave = (h, w, px)
    if clave not in _MAPAS:
        y, x = np.mgrid[0:h, 0:w]
        cx, cy = w / 2, h / 2
        r = np.sqrt(((x - cx) / cx) ** 2 + ((y - cy) / cy) ** 2)
        d = (r * px).astype(int)
        vin = (1 - 0.28 * np.clip(r - 0.35, 0, 1.6) ** 1.7)[..., None]
        _MAPAS[clave] = (y, np.clip(x + d, 0, w - 1), np.clip(x - d, 0, w - 1), vin)
    return _MAPAS[clave]


def aberracion(arr: np.ndarray, px: float = 1.4) -> np.ndarray:
    """Aberración cromática: separa el rojo y el azul un par de píxeles.

    Ninguna lente real enfoca los tres colores en el mismo plano. Un render
    perfectamente alineado es la firma de que no pasó por un objetivo."""
    h, w = arr.shape[:2]
    y, fuera, dentro, _ = _mapas(h, w, px)
    out = arr[..., :3].copy()
    out[..., 0] = arr[y, fuera, 0]                   # rojo hacia fuera
    out[..., 2] = arr[y, dentro, 2]                  # azul hacia dentro
    return out


def vineta(arr: np.ndarray, fuerza: float = 0.28) -> np.ndarray:
    """Caída de luz hacia las esquinas. Todo objetivo la tiene."""
    h, w = arr.shape[:2]
    return np.clip(arr[..., :3] * _mapas(h, w, 1.4)[3], 0, 255)


def acabar(im: Image.Image, semilla: int = 0, con_aberracion: bool = True
           ) -> Image.Image:
    """Pasada final: aberración, viñeta y grano, en ese orden.

    El grano va el ÚLTIMO. Si se pone antes, la aberración lo duplica en los
    bordes y se ve como suciedad en vez de como textura."""
    arr = np.array(im.convert("RGB")).astype(np.float32)
    if con_aberracion:
        arr = aberracion(arr)
    arr = vineta(arr)
    arr = grano(arr, semilla=semilla)
    return Image.fromarray(arr.astype(np.uint8), "RGB")


# --------------------------------------------------------------------------
# 3. LA PROFUNDIDAD. "Sombras con mucha expansión y opacidad baja (10-15 %)",
#    no sombras negras y cortas.
# --------------------------------------------------------------------------
def sombra_larga(base: Image.Image, capa: Image.Image, pos, radio: int = 90,
                 opacidad: float = 0.34, dy: int = 26) -> None:
    """Proyecta bajo la capa una sombra muy difusa y muy suave.

    Es lo que despega un elemento del fondo sin ensuciarlo. Una sombra dura y
    negra hace lo contrario: pega el objeto y lo abarata."""
    alfa = capa.split()[3]
    som = Image.new("RGBA", capa.size, (0, 0, 0, 0))
    som.putalpha(alfa.point(lambda v: int(v * opacidad)))
    som = som.filter(ImageFilter.GaussianBlur(radio))
    base.alpha_composite(som, (pos[0], pos[1] + dy))


def motion_blur(fabricante, t: float, dt: float, muestras: int = 5
                ) -> Image.Image:
    """Desenfoque de movimiento promediando sub-fotogramas.

    `fabricante(t)` devuelve el fotograma en ese instante. Se promedian varias
    posiciones dentro del mismo fotograma, que es exactamente lo que hace un
    obturador abierto. Cuesta N veces más, así que se reserva para los tramos
    donde algo se mueve rápido: en los quietos no cambia nada y se paga igual."""
    acc = None
    for k in range(muestras):
        # Obturador de 180°: solo la mitad del fotograma está expuesta.
        sub = fabricante(t + (k / muestras - 0.5) * dt * 0.5)
        a = np.array(sub.convert("RGB")).astype(np.float64)
        acc = a if acc is None else acc + a
    return Image.fromarray((acc / muestras).astype(np.uint8), "RGB")
