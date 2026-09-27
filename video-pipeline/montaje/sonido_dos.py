#!/usr/bin/env python3
"""Diseño de sonido de las opciones 2 y 3, escrito antes de tener los clips.

Cada pieza tiene una regla y un silencio. La regla construye, el silencio
remata. Es lo que aprendimos hoy: el ambiente por encima de 0.30 se come las
consonantes, y el golpe siempre está donde el sonido desaparece.
"""
import numpy as np, soundfile as sf
SR = 48000
rng = np.random.default_rng(23)


def pb(x, c):
    a = np.exp(-2 * np.pi * c / SR); y = np.zeros_like(x); p = 0.0
    for i, v in enumerate(x):
        p = (1 - a) * v + a * p; y[i] = p
    return y


def ventana(N, a, b, s=0.35, e=0.35):
    v = np.zeros(N); i0, i1 = int(a * SR), int(b * SR); v[i0:i1] = 1
    ns, ne = int(s * SR), int(e * SR)
    v[i0:i0 + ns] = np.linspace(0, 1, ns); v[i1 - ne:i1] = np.linspace(1, 0, ne)
    return v


def bolsa(N, cuando, dur, nivel, brillo):
    """Papel o plástico. El brillo es lo que distingue una bolsa de estraza
    de una de supermercado: el plástico tiene mucho más agudo."""
    n = int(dur * SR)
    b = rng.standard_normal(n); b -= pb(b, 400 if brillo > 0.6 else 1100)
    env = np.zeros(n); p = 0
    while p < n:
        L = rng.integers(int(0.01 * SR), int(0.05 * SR))
        seg = np.hanning(min(L, n - p)) * rng.uniform(0.3, 1.0)
        env[p:p + len(seg)] += seg
        p += len(seg) + rng.integers(0, int(0.04 * SR))
    s = np.zeros(N); i = int(cuando * SR); m = min(n, N - i)
    s[i:i + m] += (b * env * nivel)[:m]
    return s


def nevera(N, t):
    """Un frigorífico. Grave, constante, y solo se nota cuando se apaga."""
    return (0.05 * np.sin(2 * np.pi * 118 * t)
            + 0.02 * np.sin(2 * np.pi * 236 * t)) * (0.9 + 0.1 * np.sin(2 * np.pi * 0.6 * t))


def mesa(dur=55.0):
    """OPCIÓN 2. La regla: tres bolsas, tres materiales, cada una más barata
    que la anterior. El silencio: la mesa vacía, cinco segundos sin nada."""
    N = int(SR * dur); t = np.arange(N) / SR
    r = pb(rng.standard_normal(N), 2400)
    aire = pb(r, 1600) * 0.026 * ventana(N, 0, 42)
    # La nevera se apaga justo cuando llega la mesa vacía y no vuelve.
    frigo = nevera(N, t) * ventana(N, 0, 41.5, 1.0, 0.8)
    fx = (bolsa(N, 1.2, 1.4, 0.075, 0.35)   # papel de estraza, 1985
          + bolsa(N, 5.0, 1.1, 0.065, 0.35)
          + bolsa(N, 13.0, 1.2, 0.060, 0.85)  # plástico, 2005
          + bolsa(N, 17.0, 0.9, 0.055, 0.85)
          + bolsa(N, 24.0, 0.7, 0.050, 0.95)  # plástico fino, hoy
          + bolsa(N, 28.0, 0.6, 0.045, 0.95))
    x = aire + frigo + fx
    x = x / (np.max(np.abs(x)) + 1e-9) * 0.40
    sf.write("son_mesa.wav", np.column_stack([x, x]), SR)
    return "son_mesa.wav · la nevera se apaga en el 41,5 y la mesa vacía va en silencio"


def undia(dur=61.0):
    """OPCIÓN 3. La regla: el pitido de la caja registradora la persigue todo
    el día, cada vez más bajo. El silencio: cuando aparece su cara, todo se
    corta de golpe."""
    N = int(SR * dur); t = np.arange(N) / SR
    r = pb(rng.standard_normal(N), 2400)
    # Cada época del día suma una capa, sin que se note.
    aire = (pb(r, 900) * 0.020 * ventana(N, 0, 8)        # el cuarto de madrugada
            + pb(r, 1800) * 0.034 * ventana(N, 8, 16)    # el bus
            + pb(r, 2200) * 0.042 * ventana(N, 16, 32)   # la oficina y la caja
            + pb(r, 1500) * 0.030 * ventana(N, 32, 44)   # la calle y el pasillo
            + pb(r, 800) * 0.018 * ventana(N, 44, 46.2, 0.3, 0.25))  # el cuarto otra vez
    # El fluorescente zumbando en los tramos institucionales.
    fluo = (0.030 * np.sin(2 * np.pi * 100 * t) + 0.012 * np.sin(2 * np.pi * 300 * t))
    fluo = fluo * (ventana(N, 16, 32) + ventana(N, 33, 40)) * 0.8

    def pitido(cuando, nivel):
        n = int(0.09 * SR); e = np.exp(-np.arange(n) / (0.02 * SR))
        x = np.sin(2 * np.pi * 2100 * np.arange(n) / SR) * e * nivel
        s = np.zeros(N); i = int(cuando * SR); m = min(n, N - i); s[i:i + m] += x[:m]
        return s

    # El sonido de su trabajo persiguiéndola el resto del día, apagándose.
    caja = sum(pitido(x, n) for x, n in
               ((17.2, .09), (18.1, .09), (19.0, .09), (19.9, .09), (20.8, .09),
                (24.5, .05), (28.0, .035), (34.0, .02), (40.0, .012)))
    x = aire + fluo + caja
    x = x / (np.max(np.abs(x)) + 1e-9) * 0.40
    # EL CORTE: en el 46,2 desaparece todo. Ni un aire de habitación.
    x[int(46.2 * SR):] = 0.0
    sf.write("son_dia.wav", np.column_stack([x, x]), SR)
    return "son_dia.wav · el pitido de la caja se apaga a lo largo del día y en el 46,2 se corta TODO"


if __name__ == "__main__":
    print(mesa()); print(undia())
