# Banda sonora de "El viaje del valor" (ordenglobal.org).
#
# ── Por qué es propia y no una licencia ──────────────────────────────────────
#
# La referencia es "Bitter Sweet Symphony": orquesta lenta que camina sobre una
# batería, en menor, girando sin resolver nunca.
#
# Esa canción es el caso de manual de lo que no hay que hacer. The Verve
# grabaron su propia orquesta y aun así perdieron el cien por ciento de las
# regalías, porque lo que se protege no es la grabación sino la melodía. Da
# igual que uno sintetice cada muestra desde cero: si la línea se reconoce, es
# la misma obra.
#
# Así que se toma lo que no tiene dueño — el tempo, el bucle de cuatro acordes,
# la orquesta sobre el ritmo, el gesto de avanzar sin descanso — y la melodía se
# escribe aquí.
#
# ── Por qué son cinco archivos y no uno ──────────────────────────────────────
#
# Una pista de fondo suena igual en el prólogo que en el final, y el lector
# nota que la música no lo está acompañando. Aquí se exportan cinco capas del
# mismo compás y la misma duración, alineadas al sample. El navegador las
# arranca todas a la vez y solo sube y baja sus volúmenes según el capítulo que
# se esté leyendo: en el prólogo suena una, en el final suenan las cinco.
#
# Como todas comparten reloj, entran y salen sin desfase por más que el lector
# suba, baje o se detenga. Es la única forma de que la música siga a alguien que
# controla el tiempo con el dedo.
#
#   fondo   colchón de cuerdas y aire        siempre
#   pulso   bajo y batería                   desde la tierra
#   alma    la melodía                       desde la bóveda
#   senal   campanas y datos                 desde la cadena
#   cumbre  octava alta, timbales, pedal     desde ORIGEN
#
# Mi menor, 86 pulsos por minuto, 32 compases: minuto y medio que se muerde la
# cola. Em - C - G - D, ocho vueltas.
#
#   python3 componer.py        → capas/*.wav

import numpy as np, wave, struct, time, os

SR = 44100
BPM = 86.0
PULSO = 60.0 / BPM
COMPAS = 4 * PULSO
COMPASES = 32
DUR = COMPASES * COMPAS                    # 89,3 s
n = int(round(SR * DUR))
CRUCE = int(round(SR * COMPAS))            # un compás entero de cruce
# Se sintetiza un compás de más: es el primero de la vuelta siguiente, y es
# justo lo que hay que mezclar sobre el principio para que el bucle no tenga
# empalme audible. La orquestación se indexa módulo 32, así que ese compás 33
# toca literalmente lo mismo que el 1 y encaja al sample.
n_gen = n + CRUCE
rng = np.random.default_rng(11)
SALIDA = "/tmp/musica/capas"

CAPAS = ["fondo", "pulso", "alma", "senal", "cumbre"]
bus = {c: [np.zeros(n_gen), np.zeros(n_gen)] for c in CAPAS}
seco = {c: [np.zeros(n_gen), np.zeros(n_gen)] for c in CAPAS}   # lo que va sin sala

reloj = time.monotonic()
def paso(que):
    print(f"  {que:<28} {time.monotonic()-reloj:5.1f} s")


# ── Notas ────────────────────────────────────────────────────────────────────

CROMATICA = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

def hz(nombre):
    letra, octava = nombre[:-1], int(nombre[-1])
    return 440.0 * 2 ** ((CROMATICA.index(letra) + 12 * (octava + 1) - 69) / 12)

# Em - C - G - D. La voz de arriba casi no se mueve (G4 G4 G4 F#4): eso es lo
# que hace que el bucle gire en vez de avanzar, y que no canse a la octava vuelta.
ACORDES = [
    (["E3", "B3", "E4", "G4"],  "E2"),
    (["C3", "G3", "E4", "G4"],  "C2"),
    (["G2", "D3", "B3", "G4"],  "G2"),
    (["D3", "A3", "D4", "F#4"], "D2"),
]


# ── Filtros ──────────────────────────────────────────────────────────────────
# Sin scipy, así que se hacen a mano con senos enventanados.

def _nucleo(corte, taps=127):
    m = np.arange(taps) - (taps - 1) / 2
    h = np.sinc(2 * corte / SR * m) * np.hamming(taps)
    return h / h.sum()

def pasabajos(x, corte):
    return np.convolve(x, _nucleo(corte), mode="same")

def pasaaltos(x, corte):
    h = -_nucleo(corte)
    h[(len(h) - 1) // 2] += 1.0
    return np.convolve(x, h, mode="same")

def repisa_grave(x, corte, ganancia):
    """Sube o baja todo lo que hay por debajo del corte, sin tocar el resto."""
    return x + (ganancia - 1.0) * pasabajos(x, corte)

def circular(x, H):
    """Filtra el bucle ya cerrado, sin relleno de ceros.

    Rellenar con ceros mete un escalón al final de la señal; el filtro lo
    convierte en repique y ese repique ensucia justo los dos bordes que tienen
    que empalmar — se probó, y el salto en el empalme pasó de 0,0001 a 0,59.
    Aquí la periodicidad de la FFT no es un defecto que haya que esconder: la
    pieza es de verdad periódica, y filtrarla como tal es lo correcto.
    """
    return np.fft.irfft(np.fft.rfft(x) * H, len(x))

def respuesta_retumbe(N, corte=30.0):
    f = np.fft.rfftfreq(N, 1 / SR)
    r = np.zeros_like(f)
    np.divide(f, corte, out=r, where=f > 0)
    return r ** 3 / np.sqrt(1 + r ** 6)            # tercer orden, -3 dB en el corte


# ── La cuerda ────────────────────────────────────────────────────────────────
# Una sola onda suena a sintetizador. Lo que convierte cuatro notas en una
# sección son los detalles que nadie escucha por separado: cada atril entra unos
# milisegundos tarde, afina un pelo distinto y vibra a su propio ritmo. Sumadas,
# esas diferencias son el sonido de un grupo de personas tocando.

def cuerda(f, largo, armonicos=11, vib_hz=5.2, vib=0.004, fase0=0.0, brillo=1.0):
    t = np.arange(largo) / SR
    # El vibrato entra después del ataque: nadie lo aplica desde la primera
    # milésima, y esa demora es la mitad de la ilusión.
    entra = np.clip((t - 0.30) / 0.55, 0, 1)
    frec = f * (1 + vib * entra * np.sin(2 * np.pi * vib_hz * t + fase0))
    fase = 2 * np.pi * np.cumsum(frec) / SR
    onda = np.zeros(largo)
    for k in range(1, armonicos + 1):
        if f * k > 15000:
            break
        # Espectro de arco: cae como 1/k, con la caja del instrumento
        # levantando la zona media. Sin ese realce suena a órgano.
        cuerpo = 1.0 + 0.55 * np.exp(-((f * k - 480) / 400) ** 2)
        onda += np.sin(k * fase) * cuerpo / k ** (1.0 / brillo)
    return onda / 3.2

def sobre(largo, sube, baja, meseta=1.0):
    e = np.full(largo, meseta)
    ns, nb = min(int(sube * SR), largo), min(int(baja * SR), largo)
    if ns: e[:ns] *= np.sin(np.linspace(0, np.pi / 2, ns)) ** 2
    if nb: e[-nb:] *= np.sin(np.linspace(np.pi / 2, 0, nb)) ** 2
    return e

def poner(destino, x, ini, gan, pan):
    """pan: -1 izquierda, 0 centro, +1 derecha."""
    ini = int(ini)
    if ini >= n_gen or ini + len(x) <= 0:
        return
    a, b = max(0, ini), min(n_gen, ini + len(x))
    frag = x[a - ini:b - ini] * gan
    destino[0][a:b] += frag * np.sqrt((1 - pan) / 2)
    destino[1][a:b] += frag * np.sqrt((1 + pan) / 2)


# ── Forma interna del bucle ──────────────────────────────────────────────────
# El arco grande de la historia ya lo hace el navegador encendiendo y apagando
# capas. Estas curvas solo evitan que el minuto y medio suene plano: son
# variaciones de dos o tres decibelios, no un crescendo. El último valor vuelve
# al primero, que es la condición para que el bucle cierre.

def curva(v):
    return np.array(v, dtype=float)

C_FONDO  = curva([.82,.83,.85,.86,  .88,.89,.91,.92,  .94,.95,.96,.97,
                  .98,.99,1.0,1.0,  1.0,1.0,1.0,.99,  .98,.97,.96,.94,
                  .92,.90,.88,.87,  .86,.85,.84,.82])
C_PULSO  = curva([.80,.82,.85,.88,  .92,.94,.96,.98,  1,1,1,1,
                  1,1,1,1,          1,1,1,1,          1,1,.98,.96,
                  .94,.92,.88,.84,  0,0,.62,.74])
C_SENAL  = curva([.55,.58,.62,.66,  .72,.76,.80,.84,  .88,.90,.92,.94,
                  .96,.98,1.0,1.0,  1.0,1.0,.98,.96,  .94,.90,.86,.82,
                  .78,.72,.68,.64,  .60,.58,.56,.55])
C_CUMBRE = curva([.60,.62,.64,.66,  .70,.74,.78,.82,  .86,.88,.90,.92,
                  .94,.96,.98,1.0,  1.0,1.0,1.0,1.0,  .98,.94,.90,.86,
                  .80,.76,.72,.68,  .66,.64,.62,.60])
# La melodía dice su frase dos veces y calla ocho compases. Una melodía que no
# para de cantar cansa a los tres minutos, y aquí hay gente que se va a quedar
# diez leyendo.
FRASE_EN = (4, 16)


# ── fondo · el colchón que gira ──────────────────────────────────────────────

VOCES = 5
PANEO = [-0.75, -0.30, 0.10, 0.55]        # primeros, segundos, violas, chelos

for c in range(COMPASES + 1):
    notas, _ = ACORDES[c % 4]
    nivel = C_FONDO[c % COMPASES]
    largo = int(COMPAS * SR * 1.28)        # se solapan: nunca hay un hueco
    for i, nombre in enumerate(notas):
        f = hz(nombre)
        env = sobre(largo, 0.55, 0.95)
        peso = [0.62, 0.78, 0.92, 1.0][i]  # las voces graves pesan más
        for v in range(VOCES):
            # Cada atril: su afinación, su entrada, su vibrato.
            onda = cuerda(f * (1 + rng.normal(0, 0.0019)), largo,
                          vib_hz=5.2 + rng.normal(0, 0.45),
                          fase0=rng.random() * 2 * np.pi)
            poner(bus["fondo"], onda * env,
                  c * COMPAS * SR + int(abs(rng.normal(0, 0.012)) * SR),
                  0.030 * peso * nivel / VOCES ** 0.5,
                  np.clip(PANEO[i] + rng.normal(0, 0.16), -1, 1))
paso("fondo · cuerdas")


# ── pulso · el bajo, que es lo que hace caminar la pieza ─────────────────────
# Corcheas, no notas largas. Es la diferencia entre una pieza que flota y una
# que avanza, y avanzar es de lo que trata la página.

PATRON_BAJO = [(0.0, 1.00), (1.5, 0.55), (2.0, 0.80), (3.0, 0.62), (3.5, 0.45)]

for c in range(COMPASES + 1):
    _, raiz = ACORDES[c % 4]
    nivel = C_PULSO[c % COMPASES]
    if nivel <= 0:
        continue
    f = hz(raiz)
    largo = int(0.85 * PULSO * SR)
    t = np.arange(largo) / SR
    # La tentación es poner toda la energía en la fundamental, y suena enorme
    # en unos audífonos buenos. Pero el altavoz de un teléfono no baja de los
    # 400 hercios: ahí esa nota no existe. Los armónicos son los que la hacen
    # audible, porque el oído reconstruye el grave a partir de ellos.
    cuerpo = (0.60 * np.sin(2 * np.pi * f * t)
              + 0.58 * np.sin(2 * np.pi * 2 * f * t)
              + 0.30 * np.sin(2 * np.pi * 3 * f * t)
              + 0.13 * np.sin(2 * np.pi * 4 * f * t))
    env = np.exp(-t * 2.6) * sobre(largo, 0.012, 0.10)
    for pulso, fuerza in PATRON_BAJO:
        poner(bus["pulso"], cuerpo * env,
              (c * COMPAS + pulso * PULSO) * SR, 0.105 * fuerza * nivel, 0.0)
paso("pulso · bajo")


# ── pulso · percusión ────────────────────────────────────────────────────────

def bombo():
    L = int(0.40 * SR); t = np.arange(L) / SR
    f = 55 + 90 * np.exp(-t * 40)               # el pitido que baja: eso es el golpe
    grave = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 11)
    # El golpe de la maza contra el parche. Es lo único del bombo que sale por
    # el altavoz de un teléfono: sin esto, en móvil el ritmo desaparece y queda
    # una orquesta flotando sin piso.
    maza = pasaaltos(rng.standard_normal(L), 1300) * np.exp(-t * 140) * 0.50
    parche = np.sin(2 * np.pi * 165 * t) * np.exp(-t * 42) * 0.28
    return (grave * 0.82 + maza + parche) * 0.95

def caja():
    L = int(0.36 * SR); t = np.arange(L) / SR
    ruido = pasaaltos(rng.standard_normal(L), 950) * np.exp(-t * 16)
    piel = (np.sin(2 * np.pi * 186 * t) + np.sin(2 * np.pi * 334 * t)) * np.exp(-t * 25)
    return (ruido * 0.9 + piel * 0.45) * 0.62

def sacudida():
    L = int(0.11 * SR); t = np.arange(L) / SR
    return pasaaltos(rng.standard_normal(L), 5800) * np.exp(-t * 42) * 0.55

def pandereta():
    L = int(0.34 * SR); t = np.arange(L) / SR
    return pasaaltos(rng.standard_normal(L), 6200) * np.exp(-t * 13) * 0.38

BOMBO, CAJA, PANDERETA = bombo(), caja(), pandereta()
SACUDIDAS = [sacudida() for _ in range(6)]      # seis copias: nunca dos golpes iguales

# Bombo en 1 y en las anticipaciones, caja en 2 y 4: un patrón de hip-hop
# debajo de una orquesta. Ese choque es todo el asunto.
GOLPES_BOMBO = [(0.0, 1.0), (1.5, 0.62), (2.0, 0.72), (3.25, 0.55)]

for c in range(COMPASES + 1):
    nivel = C_PULSO[c % COMPASES]
    if nivel <= 0:
        continue
    for pulso, fuerza in GOLPES_BOMBO:
        poner(seco["pulso"], BOMBO, (c * COMPAS + pulso * PULSO) * SR, 0.50 * fuerza * nivel, 0.0)
    for pulso in (1.0, 3.0):
        poner(seco["pulso"], CAJA, (c * COMPAS + pulso * PULSO) * SR, 0.34 * nivel, -0.06)
        poner(bus["pulso"], CAJA, (c * COMPAS + pulso * PULSO) * SR, 0.10 * nivel, -0.06)
    if c % 8 == 7:                              # remate al cerrar cada frase
        poner(seco["pulso"], CAJA, (c * COMPAS + 3.5 * PULSO) * SR, 0.20 * nivel, 0.22)

# Semicorcheas de sonaja, acentuadas a contratiempo y nunca al mismo volumen:
# es lo que le da el balanceo humano al patrón.
for c in range(COMPASES + 1):
    nivel = max(0.55, C_PULSO[c % COMPASES])    # la sonaja no calla en el hueco
    for paso16 in range(16):
        acento = 1.0 if paso16 % 4 == 2 else (0.55 if paso16 % 2 == 0 else 0.40)
        arrastre = 0.014 * PULSO if paso16 % 2 else 0.0   # los contratiempos, un pelo tarde
        poner(seco["pulso"], SACUDIDAS[rng.integers(0, 6)],
              (c * COMPAS + paso16 * PULSO / 4 + arrastre) * SR,
              0.15 * acento * nivel * rng.uniform(0.85, 1.15),
              np.clip(rng.normal(0.30, 0.12), -1, 1))
    if C_PULSO[c % COMPASES] > 0.9:
        poner(seco["pulso"], PANDERETA, (c * COMPAS + 2 * PULSO) * SR, 0.13, -0.38)
paso("pulso · percusión")


# ── alma · la melodía ────────────────────────────────────────────────────────
# Original. Baja donde uno esperaría que subiera, y de esa caída sale lo
# agridulce: el Si sobre el acorde de Do, en el segundo compás de cada frase,
# es la nota que duele.
#
# (compás dentro de la frase, pulso, nota, duración en pulsos)
FRASE = [
    (0, 0.0, "B4",  2.0), (0, 2.0, "D5", 1.0), (0, 3.0, "B4", 1.0),
    (1, 0.0, "C5",  3.0), (1, 3.0, "B4", 1.0),
    (2, 0.0, "A4",  2.0), (2, 2.0, "G4", 2.0),
    (3, 0.0, "F#4", 3.0), (3, 3.0, "A4", 1.0),
    (4, 0.0, "E5",  2.0), (4, 2.0, "D5", 1.0), (4, 3.0, "B4", 1.0),
    (5, 0.0, "G5",  2.0), (5, 2.0, "E5", 2.0),
    (6, 0.0, "D5",  2.0), (6, 2.0, "B4", 2.0),
    (7, 0.0, "A4",  3.5),
]

def cantar(destino, arranque, octava, gan, armonicos=13, vibrato=0.0055, brillo=1.15,
           voces=5, base=0.098, pan_medio=-0.10):
    for compas_rel, pulso, nombre, dur in FRASE:
        c = arranque + compas_rel
        if c >= COMPASES + 1:
            continue
        f = hz(nombre) * octava
        largo = int((dur * PULSO + 0.42) * SR)
        t = np.arange(largo) / SR
        # Nadie toca dos notas al mismo volumen: cada una crece un poco hacia su
        # mitad. Sin eso la frase suena escrita, no tocada.
        env = sobre(largo, 0.11, 0.38) * (0.80 + 0.20 * np.sin(np.pi * t / t[-1]))
        for v in range(voces):
            onda = cuerda(f * (1 + rng.normal(0, 0.0013)), largo, armonicos=armonicos,
                          vib_hz=5.6 + rng.normal(0, 0.4), vib=vibrato,
                          fase0=rng.random() * 2 * np.pi, brillo=brillo)
            poner(destino, onda * env,
                  (c * COMPAS + pulso * PULSO + abs(rng.normal(0, 0.008))) * SR,
                  base * gan / voces ** 0.5,
                  np.clip(rng.normal(pan_medio, 0.28), -1, 1))
        yield c, f, largo, env, pulso

for arranque in FRASE_EN:
    for _ in cantar(bus["alma"], arranque, 1, 1.0):
        pass
paso("alma · melodía")


# ── cumbre · la octava de arriba, los timbales y el pedal ────────────────────
# Los violines doblando una octava arriba y los chelos una abajo son el truco
# más viejo del cine y siguen funcionando: la línea deja de ser bonita y se
# vuelve inevitable. Esta capa solo se enciende en ORIGEN y el final.

for arranque in FRASE_EN:
    for c, f, largo, env, pulso in cantar(bus["cumbre"], arranque, 2, 0.95,
                                          voces=4, base=0.086, pan_medio=0.0):
        poner(bus["cumbre"], cuerda(f / 4, largo, armonicos=11, vib=0.0035) * env,
              (c * COMPAS + pulso * PULSO) * SR, 0.030, 0.35)

# Pedal de mi: una sola nota grave sostenida bajo los cuatro acordes. Contra el
# Do es la tercera, contra el Sol la sexta, contra el Re una novena tensa. Es lo
# que hace que el bucle suene sin resolver aunque los acordes cambien.
for c in range(COMPASES + 1):
    largo = int(COMPAS * SR * 1.3)
    for f, g in ((hz("E2"), 0.055), (hz("E3"), 0.028)):
        poner(bus["cumbre"], cuerda(f, largo, armonicos=9, vib=0.002) * sobre(largo, 1.2, 1.4),
              c * COMPAS * SR, g * C_CUMBRE[c % COMPASES], 0.0)

def timbal(nombre):
    f = hz(nombre)
    L = int(2.8 * SR); t = np.arange(L) / SR
    fase = 2 * np.pi * np.cumsum(f * (1 + 0.16 * np.exp(-t * 8))) / SR
    piel = np.sin(fase) + 0.42 * np.sin(1.5 * fase) + 0.18 * np.sin(2.35 * fase)
    return (piel * np.exp(-t * 1.8) + rng.standard_normal(L) * np.exp(-t * 85) * 0.22) * 0.75

# Cuatro golpes en minuto y medio. Un timbal que suena todo el rato deja de
# significar algo.
for c, nombre in ((0, "E2"), (8, "C2"), (16, "E2"), (24, "G2")):
    poner(bus["cumbre"], timbal(nombre), c * COMPAS * SR, 0.24, 0.0)
    poner(seco["cumbre"], timbal(nombre), c * COMPAS * SR, 0.14, 0.0)
paso("cumbre · octava, pedal, timbales")


# ── senal · el oro que se vuelve dato ────────────────────────────────────────
# Campanas frías sobre notas del acorde y un goteo de semicorcheas que rebota
# de un lado a otro, como un paquete saltando entre nodos. Esta capa entra en el
# capítulo de la cadena, que es donde la página convierte el metal en señal.

for c in range(COMPASES + 1):
    notas, _ = ACORDES[c % 4]
    nivel = C_SENAL[c % COMPASES]
    for golpe in (0.0, 1.5, 2.5):
        f = hz(notas[rng.integers(2, 4)]) * 2
        L = int(2.6 * SR); tb = np.arange(L) / SR
        # Las parciales de una campana no son múltiplos exactos: por eso una
        # campana suena a campana y no a flauta.
        campana = (np.sin(2 * np.pi * f * tb) * np.exp(-tb * 1.7)
                   + 0.30 * np.sin(2 * np.pi * f * 2.01 * tb) * np.exp(-tb * 2.6)
                   + 0.14 * np.sin(2 * np.pi * f * 3.02 * tb) * np.exp(-tb * 3.6))
        poner(bus["senal"], campana, (c * COMPAS + golpe * PULSO) * SR,
              0.032 * nivel, np.clip(rng.normal(0, 0.55), -1, 1))

    # El goteo de datos: semicorcheas cortas y cristalinas, alternando lados.
    for paso16 in range(16):
        if rng.random() > 0.42:
            continue
        f = hz(notas[rng.integers(1, 4)]) * (2 if rng.random() < 0.6 else 4)
        L = int(0.42 * SR); td = np.arange(L) / SR
        pulso_dato = (np.sin(2 * np.pi * f * td) * np.exp(-td * 13)
                      + 0.25 * np.sin(2 * np.pi * f * 4.03 * td) * np.exp(-td * 30))
        lado = 0.8 if paso16 % 2 else -0.8
        ini = (c * COMPAS + paso16 * PULSO / 4) * SR
        poner(bus["senal"], pulso_dato, ini, 0.020 * nivel, lado)
        # El eco al otro lado: es lo que da la sensación de red y no de reloj.
        poner(bus["senal"], pulso_dato, ini + 0.19 * PULSO * SR, 0.009 * nivel, -lado)

# El barrido antes del compás 17: dos compases de platos creciendo. Sin él, la
# apertura del clímax se siente accidental.
L = int(2 * COMPAS * SR); t = np.arange(L) / SR
barrido = pasaaltos(rng.standard_normal(L), 2600) * (t / t[-1]) ** 3.0
for lado in (-0.25, 0.25):
    poner(bus["senal"], barrido, 14 * COMPAS * SR, 0.075, lado)
paso("senal · campanas y datos")


# ── Aire ─────────────────────────────────────────────────────────────────────
# Un siseo casi inaudible. No se escucha; se nota cuando falta, porque sin él el
# silencio entre notas suena a archivo digital y no a sala.
for canal in (0, 1):
    bus["fondo"][canal] += pasabajos(rng.standard_normal(n_gen), 1100) * 0.0055
paso("aire")


# ── Sala ─────────────────────────────────────────────────────────────────────

def sala(x, impulso):
    N = 1 << (len(x) + len(impulso) - 2).bit_length()
    return np.fft.irfft(np.fft.rfft(x, N) * np.fft.rfft(impulso, N), N)[:len(x)]

def impulsos(segundos, caida, corte, nivel, retardo=0.009):
    L = int(segundos * SR)
    base = pasabajos(rng.standard_normal(L) * np.exp(-np.arange(L) / SR * caida), corte)
    base[0] = 1.0
    d = int(retardo * SR)
    der = np.concatenate([np.zeros(d), base[:-d]]); der[0] = 1.0
    return base * nivel, der * nivel

# Cada capa en su propia sala. La orquesta en una grande, el ritmo casi seco: una
# batería mojada en la misma reverberación que las cuerdas pierde el golpe, y el
# golpe es lo que empuja la pieza hacia adelante.
SALAS = {
    "fondo":  (impulsos(2.4, 2.6, 7000, 0.016), 0.26),
    "alma":   (impulsos(2.4, 2.8, 8000, 0.016), 0.28),
    "cumbre": (impulsos(2.8, 2.2, 8000, 0.018), 0.30),
    "senal":  (impulsos(2.2, 2.9, 12000, 0.014), 0.34),   # más brillante y más lejos
    "pulso":  (impulsos(1.6, 3.4, 6000, 0.012), 0.16),
}
CORTA = impulsos(0.28, 14, 9000, 0.010, retardo=0.004)

for c in CAPAS:
    (imp_i, imp_d), mezcla = SALAS[c]
    bus[c][0] = bus[c][0] * (1 - mezcla) + sala(bus[c][0], imp_i) * mezcla
    bus[c][1] = bus[c][1] * (1 - mezcla) + sala(bus[c][1], imp_d) * mezcla
    for canal, imp in ((0, CORTA[0]), (1, CORTA[1])):
        if seco[c][canal].any():
            bus[c][canal] += seco[c][canal] * 0.90 + sala(seco[c][canal], imp) * 0.10
paso("salas")


# ── Sitio para el grave ──────────────────────────────────────────────────────
# El colchón de cuerdas y el bajo pelean por la misma zona, y cuando dos cosas
# ocupan el mismo sitio ninguna se escucha. Se le quita grave al colchón para
# que el bajo y el bombo tengan el sótano para ellos. Se hace con ecualización y
# no con un compresor disparado por el bombo, porque las capas se encienden por
# separado: un colchón que respira al ritmo de una batería que no está sonando
# se oiría como un defecto.
for canal in (0, 1):
    bus["fondo"][canal] = repisa_grave(bus["fondo"][canal], 150, 0.55)
    bus["senal"][canal] = repisa_grave(bus["senal"][canal], 220, 0.45)
    bus["alma"][canal] = repisa_grave(bus["alma"][canal], 180, 0.70)
paso("ecualización")


# ── El bucle se muerde la cola ───────────────────────────────────────────────
# El compás de más se mezcla sobre el primero. A partir de aquí el último
# instante y el primero son el mismo material, así que la vuelta no se oye.
subida = np.sin(np.linspace(0, np.pi / 2, CRUCE)) ** 2      # potencia constante
H = respuesta_retumbe(n)
for c in CAPAS:
    for canal in (0, 1):
        x = bus[c][canal]
        x[:CRUCE] = x[:CRUCE] * subida + x[n:n + CRUCE] * (1 - subida)
        # Debajo de 30 hercios no hay música, hay retumbe: nadie lo escucha y sin
        # embargo se lleva la mitad del margen. Va después del cierre del bucle y
        # sobre el largo exacto, para no volver a romper el empalme.
        bus[c][canal] = circular(x[:n], H)


# ── Balance ──────────────────────────────────────────────────────────────────
# Cuánto pesa cada capa respecto al colchón, en decibelios. Esta tabla es la
# mezcla: es la decisión de qué se escucha por encima de qué.
#
# Sin ella el ritmo se comía todo — quedaba a un decibelio y medio del total, o
# sea que de la orquesta no se oía nada. Pasa siempre que se ajustan las
# ganancias instrumento por instrumento: un bombo con ganancia 0,5 y un violín
# con 0,03 parecen razonables por separado y son un desastre juntos.
PESO = {"fondo": 0.0, "pulso": 1.0, "alma": -1.0, "senal": -7.0, "cumbre": -2.0}

def sonoridad(izq, der, bloque=0.25):
    """Cuánto suena una capa cuando suena, no en promedio.

    La melodía calla dieciséis de los treinta y dos compases; su promedio la
    haría parecer la mitad de fuerte de lo que es. Se mide el percentil 80 de
    los tramos, que es aproximadamente lo que el oído recuerda.
    """
    b = int(bloque * SR)
    m = (izq[:len(izq) // b * b] ** 2 + der[:len(der) // b * b] ** 2) / 2
    return np.sqrt(np.percentile(m.reshape(-1, b).mean(axis=1), 80))

ref = sonoridad(*bus["fondo"])
for c in CAPAS:
    k = (10 ** (PESO[c] / 20) * ref) / max(sonoridad(*bus[c]), 1e-9)
    bus[c][0] *= k
    bus[c][1] *= k

suma = [sum(bus[c][k] for c in CAPAS) for k in (0, 1)]
ganancia = 10 ** (-14.5 / 20) / np.sqrt(((suma[0] ** 2 + suma[1] ** 2) / 2).mean())


for c in CAPAS:
    bus[c][0] *= ganancia
    bus[c][1] *= ganancia

# No hay limitador aquí, y es a propósito. Un golpe de bombo marca el pico de
# toda la pieza, así que la tentación es limitar y ganar los nueve decibelios
# que ese golpe cuesta. Pero la reducción quedaría grabada en las cinco capas, y
# en el prólogo suena el colchón solo: se oiría un colchón latiendo al ritmo de
# una batería que no está. El defecto sería peor que el problema.
#
# El limitador va en el navegador, sobre la mezcla que de verdad está sonando en
# ese momento. Por eso la suma teórica de las cinco capas pasa de uno: nunca se
# reproduce así de plano, y cuando se acerca, el limitador de la página la
# recoge.


# ── A disco ──────────────────────────────────────────────────────────────────
# Cada capa se guarda a su mejor nivel y el navegador la baja a donde le toca.
# Guardarlas ya mezcladas dejaría a las más suaves treinta decibelios abajo,
# que es tirar la mitad de la resolución del archivo por nada.

os.makedirs(SALIDA, exist_ok=True)
mezcla = {}
print()
for c in CAPAS:
    izq, der = bus[c]
    pico = max(np.abs(izq).max(), np.abs(der).max())
    escala = 0.90 / pico
    mezcla[c] = 1.0 / escala                    # lo que el navegador tiene que devolver
    est = np.empty(n * 2)
    est[0::2], est[1::2] = izq * escala, der * escala
    with wave.open(f"{SALIDA}/{c}.wav", "w") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(struct.pack("<%dh" % len(est), *(np.clip(est, -1, 1) * 32767).astype(np.int16)))
    r = 20 * np.log10(np.sqrt(((izq ** 2 + der ** 2) / 2).mean()) + 1e-12)
    print(f"  {c:<7} en la mezcla {r:6.1f} dB · guardada a pico 0.90 · "
          f"ganancia en el navegador {mezcla[c]:.3f}")

s0 = sum(bus[c][0] for c in CAPAS); s1 = sum(bus[c][1] for c in CAPAS)
print(f"\n  MEZCLA JS = {{" + ", ".join(f'{c}:{mezcla[c]:.3f}' for c in CAPAS) + "}")
print(f"  suma: pico {max(np.abs(s0).max(), np.abs(s1).max()):.3f} · "
      f"rms {20*np.log10(np.sqrt(((s0**2+s1**2)/2).mean())):.1f} dB")
print(f"  {n/SR:.2f} s · {BPM:.0f} ppm · {COMPASES} compases")

# El empalme no se mide comparando el último sample con el primero: en el primero
# cae un bombo, y un bombo es una discontinuidad de verdad. Se compara el salto
# del bucle contra el salto que hay en los otros treinta y un tiempos fuertes.
# Si se parece a cualquiera de ellos, la vuelta suena como un compás más.
saltos = [abs(s0[int(round(k * COMPAS * SR)) - 1] - s0[int(round(k * COMPAS * SR))])
          for k in range(1, COMPASES)]
print(f"  empalme: salto {abs(s0[-1]-s0[0]):.4f} · "
      f"otros tiempos fuertes: mediana {np.median(saltos):.4f}, máximo {max(saltos):.4f}")


# ── La mezcla plana ──────────────────────────────────────────────────────────
# Las cinco capas sonando a la vez, que es como suena el último capítulo. Sirve
# para dos cosas: es lo que se reproduce en el navegador raro que no tenga audio
# programable, y es lo que hay que escuchar para juzgar la pieza como música.
#
# Aquí sí lleva limitador, porque esto ya es una mezcla terminada y no una capa
# que se vaya a encender sola.

def limitar(izq, der, techo=0.94, bloque=128, relajacion=0.25, adelanto=0.020):
    pico = np.maximum(np.abs(izq), np.abs(der))
    nb = len(pico) // bloque
    picos = pico[:nb * bloque].reshape(nb, bloque).max(axis=1)
    caida = np.exp(-bloque / SR / relajacion)
    env = np.empty(nb); acc = 0.0
    for i, p in enumerate(picos):                  # suelta despacio
        acc = max(p, acc * caida); env[i] = acc
    subida = np.exp(-bloque / SR / adelanto)
    for i in range(nb - 2, -1, -1):                # y baja antes del golpe
        env[i] = max(env[i], env[i + 1] * subida)
    # Sin ese segundo repaso hacia atrás, suavizar la curva volvería a levantar
    # la ganancia justo en el instante del pico y el limitador se pasaría de
    # largo — se midió: la suma se iba a 1,44 con el techo puesto en 0,92.
    red = np.minimum(1.0, techo / np.maximum(env, 1e-9))
    r = np.interp(np.arange(len(izq)), np.arange(nb) * bloque + bloque / 2, red,
                  left=red[0], right=red[-1])
    v = np.hanning(int(0.02 * SR)); v /= v.sum()
    r = np.convolve(r, v, mode="same")
    return izq * r, der * r, r

m0, m1, r = limitar(s0, s1)
# Suavizar la curva de ganancia la levanta un pelo justo donde no debe, así que
# el limitador se pasa de largo por unas milésimas. Un recorte blando al final
# se ocupa de esas: solo toca lo que roza el techo y deja el resto intacto.
sobrante = max(np.abs(m0).max(), np.abs(m1).max())
m0, m1 = np.tanh(m0 / 0.97) * 0.97, np.tanh(m1 / 0.97) * 0.97
print(f"\n  mezcla plana: cede hasta {20*np.log10(r.min()):.1f} dB · "
      f"pico {sobrante:.3f} antes del recorte, "
      f"{max(np.abs(m0).max(), np.abs(m1).max()):.3f} después · "
      f"rms {20*np.log10(np.sqrt(((m0**2+m1**2)/2).mean())):.1f} dB")
est = np.empty(n * 2); est[0::2], est[1::2] = m0, m1
with wave.open(f"{SALIDA}/../mezcla.wav", "w") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(struct.pack("<%dh" % len(est), *(np.clip(est, -1, 1) * 32767).astype(np.int16)))
