# Efectos de escena para "El viaje del valor".
#
# Uno por capítulo. Suenan una sola vez, cuando el lector entra en la escena, y
# se mezclan por debajo de la música: la idea es que no se noten como "efectos"
# sino que la escena se sienta más presente sin que uno sepa por qué.
#
# Todos están afinados en mi menor, que es la tonalidad de la música. Un golpe
# de bóveda en cualquier nota suena a efecto de biblioteca; el mismo golpe en la
# tónica suena como si perteneciera a la pieza. Es la diferencia entre poner un
# sonido encima y componerlo dentro.
#
#   tierra   la excavadora y el metal en la roca
#   boveda   la puerta que se cierra
#   cadena   los bloques encajando
#   origen   la moneda golpeada
#   fin      la apertura
#
#   python3 efectos.py         → efectos/*.wav

import numpy as np, wave, struct, os

SR = 44100
rng = np.random.default_rng(23)
SALIDA = "/tmp/musica/efectos"

CROMATICA = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
def hz(nombre):
    letra, octava = nombre[:-1], int(nombre[-1])
    return 440.0 * 2 ** ((CROMATICA.index(letra) + 12 * (octava + 1) - 69) / 12)


def _nucleo(corte, taps=127):
    m = np.arange(taps) - (taps - 1) / 2
    h = np.sinc(2 * corte / SR * m) * np.hamming(taps)
    return h / h.sum()

def pasabajos(x, corte):
    return np.convolve(x, _nucleo(corte), mode="same")

def pasaaltos(x, corte):
    h = -_nucleo(corte); h[(len(h) - 1) // 2] += 1.0
    return np.convolve(x, h, mode="same")

def banda(x, bajo, alto):
    return pasaaltos(pasabajos(x, alto), bajo)

def sala(x, segundos=2.2, caida=2.4, nivel=0.03):
    L = int(segundos * SR)
    imp = pasabajos(rng.standard_normal(L) * np.exp(-np.arange(L) / SR * caida), 7000)
    imp[0] = 1.0
    N = 1 << (len(x) + L - 2).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, N) * np.fft.rfft(imp * nivel, N), N)[:len(x)]
    return x * 0.72 + y * 0.28

def guardar(nombre, izq, der, cola=0.35):
    """Guarda con silencio al final y desvanecido, para que nunca corte en seco."""
    nb = int(cola * SR)
    for canal in (izq, der):
        canal[-nb:] *= np.linspace(1, 0, nb) ** 2
    pico = max(np.abs(izq).max(), np.abs(der).max())
    izq, der = izq / pico * 0.88, der / pico * 0.88
    est = np.empty(len(izq) * 2)
    est[0::2], est[1::2] = izq, der
    os.makedirs(SALIDA, exist_ok=True)
    with wave.open(f"{SALIDA}/{nombre}.wav", "w") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(struct.pack("<%dh" % len(est), *(np.clip(est, -1, 1) * 32767).astype(np.int16)))
    print(f"  {nombre:<8} {len(izq)/SR:4.1f} s")


# ── tierra · la excavadora ───────────────────────────────────────────────────
# Un motor grande no es un zumbido: es una frecuencia baja con sus armónicos,
# irregular, porque ningún motor gira perfectamente parejo. Esa irregularidad es
# lo que lo hace sonar a máquina y no a nota.
def tierra():
    D = 7.0; L = int(D * SR); t = np.arange(L) / SR
    x = np.zeros(L)

    # El motor: 27 golpes por segundo con sus armónicos y su temblor.
    tiemble = 1 + 0.035 * pasabajos(rng.standard_normal(L), 6)
    fase = 2 * np.pi * np.cumsum(27.0 * tiemble) / SR
    for k, g in ((1, 1.0), (2, 0.55), (3, 0.34), (5, 0.16), (7, 0.09)):
        x += np.sin(k * fase) * g * 0.20
    x *= np.clip(t / 1.8, 0, 1) * np.clip((D - t) / 2.4, 0, 1)

    # La tierra cediendo: ruido grave que va y viene, no parejo.
    tierra_suelta = banda(rng.standard_normal(L), 60, 700)
    x += tierra_suelta * (0.35 + 0.65 * pasabajos(np.abs(rng.standard_normal(L)), 3)) * 0.09

    # El metal contra la roca: raspones cortos y brillantes, repartidos.
    for golpe in rng.uniform(1.2, D - 1.5, 9):
        Lg = int(rng.uniform(0.10, 0.34) * SR); tg = np.arange(Lg) / SR
        raspa = banda(rng.standard_normal(Lg), 1800, 9000) * np.exp(-tg * rng.uniform(9, 22))
        ini = int(golpe * SR)
        x[ini:ini + Lg] += raspa * rng.uniform(0.10, 0.26)

    # Un impacto sordo: la pala que toca fondo. En mi, la tónica de la pieza.
    ini = int(2.6 * SR); Li = int(2.6 * SR); ti = np.arange(Li) / SR
    f = hz("E1") * (1 + 0.5 * np.exp(-ti * 14))
    x[ini:ini + Li] += np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-ti * 1.9) * 0.42

    x = sala(x, 2.6, 2.0, 0.030)
    return x * 1.0, np.concatenate([np.zeros(int(0.013 * SR)), x[:-int(0.013 * SR)]]) * 0.96


# ── boveda · la puerta ───────────────────────────────────────────────────────
# Primero el mecanismo, después el peso. El orden importa: si el golpe viene
# antes que los clics, no se entiende que algo se cerró.
def boveda():
    D = 6.5; L = int(D * SR); t = np.arange(L) / SR
    x = np.zeros(L)

    # Los pernos: metálicos, secos, acelerando como un cerrojo que gira.
    for i, cuando in enumerate(np.cumsum(rng.uniform(0.10, 0.17, 7)) + 0.35):
        Lc = int(0.28 * SR); tc = np.arange(Lc) / SR
        clic = banda(rng.standard_normal(Lc), 2200, 11000) * np.exp(-tc * 46)
        clic += np.sin(2 * np.pi * hz("B5") * (1 + 0.01 * i) * tc) * np.exp(-tc * 34) * 0.30
        ini = int(cuando * SR)
        x[ini:ini + Lc] += clic * 0.22

    # El peso: la puerta que asienta. Grave, con la resonancia larga del metal.
    ini = int(1.55 * SR); Li = L - ini; ti = np.arange(Li) / SR
    f = hz("E1") * (1 + 0.62 * np.exp(-ti * 20))
    golpe = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-ti * 2.2) * 0.75
    golpe += banda(rng.standard_normal(Li), 40, 300) * np.exp(-ti * 8) * 0.30
    # Una plancha de acero no vibra en armónicos ordenados: por eso resuena a
    # bóveda y no a campana de iglesia.
    for parcial, g, dec in ((hz("E2"), 0.16, 1.1), (hz("E2")*2.41, 0.09, 1.5),
                            (hz("E2")*3.83, 0.05, 2.0), (hz("B3"), 0.07, 1.3)):
        golpe += np.sin(2 * np.pi * parcial * ti) * np.exp(-ti * dec) * g
    x[ini:ini + Li] += golpe

    # El aire moviéndose con la puerta.
    x += banda(rng.standard_normal(L), 150, 2000) * np.exp(-np.abs(t - 1.5) * 1.6) * 0.05

    x = sala(x, 3.2, 1.5, 0.040)          # una bóveda es una sala dura y grande
    return x, np.concatenate([np.zeros(int(0.017 * SR)), x[:-int(0.017 * SR)]]) * 0.95


# ── cadena · los bloques encajando ───────────────────────────────────────────
# Doce pulsos subiendo por la escala de mi menor, cada vez más juntos, y al
# final el acorde que queda sostenido: la cadena cerrada.
def cadena():
    D = 6.0; L = int(D * SR)
    x = np.zeros(L); y = np.zeros(L)     # se construye en estéreo desde el principio
    ESCALA = ["E4", "F#4", "G4", "B4", "D5", "E5", "F#5", "G5", "B5", "D6", "E6", "B6"]

    cuando = 0.25
    for i, nombre in enumerate(ESCALA):
        f = hz(nombre)
        Lp = int(1.1 * SR); tp = np.arange(Lp) / SR
        # Corto y cristalino, con una parcial alta desafinada: suena a dato, no
        # a instrumento.
        p = (np.sin(2 * np.pi * f * tp) * np.exp(-tp * 9)
             + 0.30 * np.sin(2 * np.pi * f * 4.02 * tp) * np.exp(-tp * 26)
             + banda(rng.standard_normal(Lp), 3000, 12000) * np.exp(-tp * 70) * 0.18)
        ini = int(cuando * SR)
        if ini + Lp > L:
            break
        lado = -0.8 if i % 2 else 0.8     # rebota de un nodo al otro
        g = 0.16 + 0.020 * i
        x[ini:ini + Lp] += p * g * np.sqrt((1 - lado) / 2)
        y[ini:ini + Lp] += p * g * np.sqrt((1 + lado) / 2)
        cuando += 0.40 * (0.86 ** i) + 0.045   # acelera: los bloques se acercan

    # El acorde que queda: la cadena cerrada y sosteniéndose sola.
    ini = int(min(cuando + 0.15, D - 2.6) * SR); Lf = L - ini; tf = np.arange(Lf) / SR
    for nombre, g in (("E3", 0.20), ("B3", 0.14), ("E4", 0.12), ("G4", 0.09), ("B4", 0.07)):
        f = hz(nombre)
        acorde = (np.sin(2 * np.pi * f * tf) + 0.3 * np.sin(2 * np.pi * f * 2 * tf)) * np.exp(-tf * 0.9)
        x[ini:ini + Lf] += acorde * g
        y[ini:ini + Lf] += acorde * g * 0.98

    return sala(x, 2.8, 2.2, 0.034), sala(y, 2.8, 2.1, 0.034)


# ── origen · la moneda ───────────────────────────────────────────────────────
# Metal golpeado. Las parciales de un disco de metal no son múltiplos enteros —
# por eso una moneda tintinea y una cuerda canta. Los números de abajo son
# aproximadamente los de un disco libre, y son la razón de que esto suene a
# metal en vez de a sintetizador.
def origen():
    D = 5.5; L = int(D * SR); t = np.arange(L) / SR
    f0 = hz("E5")
    PARCIALES = [(1.00, 1.00, 1.3), (1.59, 0.62, 1.8), (2.14, 0.44, 2.2),
                 (2.65, 0.30, 2.8), (3.41, 0.22, 3.4), (4.06, 0.15, 4.2),
                 (5.43, 0.10, 5.5), (6.79, 0.06, 6.8)]
    x = np.zeros(L)
    for r, g, dec in PARCIALES:
        # El batido: dos parciales casi iguales que se cruzan. Es el temblor que
        # tiene una moneda de verdad cuando gira sobre la mesa.
        x += (np.sin(2 * np.pi * f0 * r * t) + np.sin(2 * np.pi * f0 * r * 1.003 * t)) \
             * np.exp(-t * dec) * g * 0.5
    x *= 0.22

    # El golpe seco del canto contra la superficie.
    Lg = int(0.06 * SR); tg = np.arange(Lg) / SR
    x[:Lg] += banda(rng.standard_normal(Lg), 2500, 14000) * np.exp(-tg * 150) * 0.55

    # Y debajo, el peso del oro: una nota grave que sostiene el destello.
    x += np.sin(2 * np.pi * hz("E2") * t) * np.exp(-t * 1.4) * 0.16
    x += np.sin(2 * np.pi * hz("E3") * t) * np.exp(-t * 1.8) * 0.09

    x = sala(x, 3.0, 1.8, 0.032)
    d = int(0.008 * SR)
    return x, np.concatenate([np.zeros(d), x[:-d]]) * 0.97


# ── fin · la apertura ────────────────────────────────────────────────────────
# Lo contrario de todo lo anterior: nada golpea, todo se abre. Ruido que crece,
# un impacto grave y un acorde de mi menor que se queda flotando.
def fin():
    D = 8.0; L = int(D * SR); t = np.arange(L) / SR
    x = np.zeros(L)

    # El crecimiento: ruido que además se va abriendo de agudos, no solo
    # subiendo de volumen. Abrir el filtro es lo que da la sensación de amanecer.
    sub = int(3.2 * SR)
    ruido = rng.standard_normal(sub)
    abierto = np.zeros(sub)
    for i, (lo, hi) in enumerate(((200, 900), (700, 2600), (2000, 7000), (5000, 15000))):
        cuando = np.clip((np.arange(sub) / sub - i * 0.22) / 0.4, 0, 1)
        abierto += banda(ruido, lo, hi) * cuando
    x[:sub] += abierto * (np.arange(sub) / sub) ** 2.2 * 0.30

    # El impacto, justo cuando el crecimiento llega arriba.
    ini = sub; Li = L - ini; ti = np.arange(Li) / SR
    f = hz("E1") * (1 + 0.42 * np.exp(-ti * 11))
    x[ini:ini + Li] += np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-ti * 1.5) * 0.50

    # Y el acorde que se queda: mi menor abierto, subiendo despacio.
    for nombre, g, pan in (("E2", 0.16, 0), ("B2", 0.11, 0), ("E3", 0.13, 0),
                           ("G3", 0.10, 0), ("B3", 0.09, 0), ("E4", 0.08, 0)):
        f = hz(nombre)
        voz = np.zeros(Li)
        for det in (-0.12, 0.0, 0.13):
            voz += np.sin(2 * np.pi * (f + det) * ti + rng.random() * 6.28)
        env = np.clip(ti / 1.2, 0, 1) * np.exp(-np.clip(ti - 1.2, 0, None) * 0.55)
        x[ini:ini + Li] += voz / 3 * env * g

    x = sala(x, 3.6, 1.4, 0.042)
    d = int(0.015 * SR)
    return x, np.concatenate([np.zeros(d), x[:-d]]) * 0.94


print("efectos de escena:")
for nombre, fn in (("tierra", tierra), ("boveda", boveda), ("cadena", cadena),
                   ("origen", origen), ("fin", fin)):
    guardar(nombre, *fn())
