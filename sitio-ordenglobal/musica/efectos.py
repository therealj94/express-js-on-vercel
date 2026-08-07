# Efectos de escena para "El viaje del valor".
#
# No son adornos: cada uno está atado a un instante concreto de lo que se ve en
# pantalla. La pala muerde la roca y suena la pala. La barra de oro se deshace y
# se oye deshacerse. La moneda termina de formarse y se oye el golpe del metal.
#
# Hay dos familias.
#
#   Golpes    suenan una vez, cuando el desplazamiento cruza el punto exacto de
#             la escena. Van en la lista CUES de la página.
#
#   Bucles    suenan continuamente mientras dura el capítulo, y su volumen y su
#             tono siguen la velocidad de la mano. El motor y los hidráulicos de
#             la excavadora son de estos: la máquina se mueve cuando uno mueve.
#
# Todo está afinado en mi menor, la tonalidad de la música. Un golpe en
# cualquier nota suena a efecto de biblioteca; el mismo golpe en la tónica suena
# como si perteneciera a la pieza. Es la diferencia entre poner un sonido encima
# y componerlo dentro.
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

MI_MENOR = [hz(n) for n in ("E4", "F#4", "G4", "B4", "D5", "E5", "G5", "B5", "D6", "E6")]


# ── Herramientas ─────────────────────────────────────────────────────────────

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

def grano(f, largo, ruidoso=0.0):
    """Un grano: una chispa de sonido demasiado corta para ser una nota.

    Miles de estos, esparcidos, son la textura de algo que se deshace o que se
    está juntando. Uno solo no es nada; es la nube lo que se oye.
    """
    t = np.arange(largo) / SR
    v = np.sin(2 * np.pi * f * t)
    if ruidoso:
        v = v * (1 - ruidoso) + banda(rng.standard_normal(largo), f * 0.6, f * 3) * ruidoso
    return v * np.hanning(largo)

def cerrar_bucle(izq, der, cruce=0.35):
    """Cose el final con el principio, para los efectos que suenan sin parar.

    Se sintetiza de más y ese sobrante se funde sobre el arranque: a partir de
    ahí el último instante y el primero son el mismo material y la vuelta no se
    oye. Sin esto, un motor en bucle da un golpe seco cada pocos segundos.
    """
    nc = int(cruce * SR)
    n = len(izq) - nc
    sube = np.sin(np.linspace(0, np.pi / 2, nc)) ** 2
    for canal in (izq, der):
        canal[:nc] = canal[:nc] * sube + canal[n:n + nc] * (1 - sube)
    return izq[:n], der[:n]

def guardar(nombre, izq, der, cola=0.30, bucle=False):
    izq, der = np.asarray(izq, float).copy(), np.asarray(der, float).copy()
    if bucle:
        izq, der = cerrar_bucle(izq, der)
    else:
        # El tic dura una décima y la cola pedía tres: hay que quedarse con lo
        # que el efecto tenga, no con lo que se pidió.
        nb = min(int(cola * SR), len(izq))
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
    print(f"  {nombre:<12} {len(izq)/SR:5.2f} s{'  (bucle)' if bucle else ''}")

def ancho(x, ms=11, atenua=0.96):
    d = int(ms / 1000 * SR)
    return x, np.concatenate([np.zeros(d), x[:-d]]) * atenua


# ══ LA TIERRA ════════════════════════════════════════════════════════════════

def motor():
    """El diésel, en bucle. Suena mientras el capítulo esté en pantalla.

    Un motor no es un zumbido limpio: son explosiones seguidas que nunca caen
    exactamente en el mismo sitio. Ese desorden mínimo es lo único que separa un
    motor de una nota grave, y sin él la excavadora suena a sintetizador.
    """
    D = 4.0 + 0.35
    L = int(D * SR); t = np.arange(L) / SR
    tiemble = 1 + 0.045 * pasabajos(rng.standard_normal(L), 5)
    fase = 2 * np.pi * np.cumsum(24.0 * tiemble) / SR
    x = np.zeros(L)
    for k, g in ((1, 1.0), (2, 0.60), (3, 0.38), (4, 0.22), (6, 0.13), (8, 0.07)):
        x += np.sin(k * fase) * g * 0.20
    # El escape: un soplido grave que va y viene con el motor.
    x += banda(rng.standard_normal(L), 70, 900) * (0.5 + 0.5 * np.sin(fase / 2)) * 0.055
    # Y el traqueteo de la cadena de orugas, arriba.
    x += banda(rng.standard_normal(L), 1800, 7000) * (0.35 + 0.65 * np.abs(np.sin(fase))) * 0.020
    return ancho(sala(x, 1.8, 3.0, 0.018), ms=9)

def hidraulico():
    """El brazo moviéndose, en bucle. El tono sube con la velocidad de la mano.

    Es el efecto que más hace: mientras nadie se mueve casi no se oye, y en
    cuanto uno desplaza la página la bomba sube de vueltas y la máquina parece
    obedecer. La página deja de ser un video y pasa a ser algo que responde.
    """
    D = 2.6 + 0.35
    L = int(D * SR); t = np.arange(L) / SR
    # La bomba: un tono medio con su propio vaivén, sucio de armónicos.
    f = 232.0 * (1 + 0.02 * np.sin(2 * np.pi * 0.7 * t))
    fase = 2 * np.pi * np.cumsum(f) / SR
    x = sum(np.sin(k * fase) * g for k, g in ((1, 0.5), (2, 0.28), (3, 0.16), (5, 0.07))) * 0.16
    # El aceite a presión: siseo estrecho, que es lo que suena a hidráulico y no
    # a motor eléctrico.
    x += banda(rng.standard_normal(L), 900, 4200) * (0.6 + 0.4 * np.sin(2 * np.pi * 1.3 * t)) * 0.055
    x += banda(rng.standard_normal(L), 200, 700) * 0.030
    return ancho(sala(x, 1.2, 4.0, 0.012), ms=7)

def pala():
    """Los dientes del cucharón entrando en la roca."""
    D = 2.2; L = int(D * SR); t = np.arange(L) / SR
    x = np.zeros(L)
    # El impacto: metal contra piedra, y el peso detrás.
    x[:int(.5 * SR)] += banda(rng.standard_normal(int(.5 * SR)), 1500, 11000) \
        * np.exp(-t[:int(.5 * SR)] * 26) * 0.55
    f = hz("E1") * (1 + 0.55 * np.exp(-t * 16))
    x += np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 3.4) * 0.40
    # Y la piedra suelta cayendo después, que es lo que lo hace creíble.
    for cuando in rng.uniform(0.12, 1.5, 26):
        Lg = int(rng.uniform(0.03, 0.13) * SR); tg = np.arange(Lg) / SR
        ini = int(cuando * SR)
        x[ini:ini + Lg] += banda(rng.standard_normal(Lg), 400, 5000) \
            * np.exp(-tg * rng.uniform(28, 70)) * rng.uniform(0.05, 0.16)
    return ancho(sala(x, 2.4, 2.2, 0.028), ms=13)


# ══ LA BÓVEDA ════════════════════════════════════════════════════════════════

def boveda():
    """La puerta. Primero el mecanismo, después el peso: al revés no se entiende
    que algo se cerró."""
    D = 6.5; L = int(D * SR); t = np.arange(L) / SR
    x = np.zeros(L)
    for i, cuando in enumerate(np.cumsum(rng.uniform(0.10, 0.17, 7)) + 0.35):
        Lc = int(0.28 * SR); tc = np.arange(Lc) / SR
        clic = banda(rng.standard_normal(Lc), 2200, 11000) * np.exp(-tc * 46)
        clic += np.sin(2 * np.pi * hz("B5") * (1 + 0.01 * i) * tc) * np.exp(-tc * 34) * 0.30
        ini = int(cuando * SR)
        x[ini:ini + Lc] += clic * 0.22
    ini = int(1.55 * SR); Li = L - ini; ti = np.arange(Li) / SR
    f = hz("E1") * (1 + 0.62 * np.exp(-ti * 20))
    golpe = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-ti * 2.2) * 0.75
    golpe += banda(rng.standard_normal(Li), 40, 300) * np.exp(-ti * 8) * 0.30
    # Una plancha de acero no vibra en armónicos ordenados: por eso resuena a
    # bóveda y no a campana de iglesia.
    for parcial, g, dec in ((hz("E2"), 0.16, 1.1), (hz("E2") * 2.41, 0.09, 1.5),
                            (hz("E2") * 3.83, 0.05, 2.0), (hz("B3"), 0.07, 1.3)):
        golpe += np.sin(2 * np.pi * parcial * ti) * np.exp(-ti * dec) * g
    x[ini:ini + Li] += golpe
    x += banda(rng.standard_normal(L), 150, 2000) * np.exp(-np.abs(t - 1.5) * 1.6) * 0.05
    return ancho(sala(x, 3.2, 1.5, 0.040), ms=17)

def desmorona():
    """El lingote deshaciéndose en píxeles.

    Empieza siendo metal — una barra golpeada, con sus parciales inarmónicos — y
    se va convirtiendo en polvo: miles de granos que caen, cada vez más agudos,
    cada vez más separados, hasta que no queda nada sólido.

    El truco está en que los granos bajan de tono mientras la nube se dispersa.
    Subiendo suena a magia de dibujo animado; bajando suena a algo que se pierde,
    que es lo que la escena está contando.
    """
    D = 5.0; L = int(D * SR); t = np.arange(L) / SR
    x = np.zeros(L); y = np.zeros(L)

    # El metal, todavía entero.
    for r, g, dec in ((1.0, 1.0, 2.6), (2.37, 0.5, 3.4), (3.71, 0.3, 4.2), (5.02, 0.16, 5.5)):
        v = np.sin(2 * np.pi * hz("E3") * r * t) * np.exp(-t * dec) * g * 0.13
        x += v; y += v * 0.98
    x[:int(.04 * SR)] += banda(rng.standard_normal(int(.04 * SR)), 2000, 12000) * 0.35
    y[:int(.04 * SR)] += banda(rng.standard_normal(int(.04 * SR)), 2000, 12000) * 0.35

    # Y el polvo. La densidad crece, revienta y se apaga; el tono cae todo el rato.
    for _ in range(2600):
        cuando = rng.beta(1.7, 2.6) * (D - 0.6) + 0.10
        avance = cuando / D
        Lg = int(rng.uniform(0.012, 0.055) * SR)
        # Cada grano cae desde la escala de mi menor hacia el grave: el conjunto
        # se desmorona en vez de evaporarse hacia arriba.
        f = MI_MENOR[rng.integers(0, len(MI_MENOR))] * (1.35 - 0.75 * avance) * rng.uniform(.97, 1.03)
        g = grano(f, Lg, ruidoso=0.25 + 0.45 * avance) * rng.uniform(0.006, 0.028) * (1 - 0.55 * avance)
        pan = np.clip(rng.normal(0, 0.55), -1, 1)
        ini = int(cuando * SR)
        x[ini:ini + Lg] += g * np.sqrt((1 - pan) / 2)
        y[ini:ini + Lg] += g * np.sqrt((1 + pan) / 2)

    # Lo que queda cayendo al fondo.
    x += banda(rng.standard_normal(L), 90, 800) * np.clip((t - 0.8) / 1.2, 0, 1) * np.exp(-t * 0.7) * 0.030
    y += banda(rng.standard_normal(L), 90, 800) * np.clip((t - 0.8) / 1.2, 0, 1) * np.exp(-t * 0.7) * 0.030
    return sala(x, 3.0, 1.9, 0.030), sala(y, 3.0, 1.8, 0.030)


# ══ LA CADENA ════════════════════════════════════════════════════════════════

def cadena():
    """Los bloques encajando: doce pulsos subiendo por la escala, cada vez más
    juntos, y el acorde que queda sosteniéndose solo."""
    D = 6.0; L = int(D * SR)
    x = np.zeros(L); y = np.zeros(L)
    ESCALA = ["E4", "F#4", "G4", "B4", "D5", "E5", "F#5", "G5", "B5", "D6", "E6", "B6"]
    cuando = 0.25
    for i, nombre in enumerate(ESCALA):
        f = hz(nombre)
        Lp = int(1.1 * SR); tp = np.arange(Lp) / SR
        p = (np.sin(2 * np.pi * f * tp) * np.exp(-tp * 9)
             + 0.30 * np.sin(2 * np.pi * f * 4.02 * tp) * np.exp(-tp * 26)
             + banda(rng.standard_normal(Lp), 3000, 12000) * np.exp(-tp * 70) * 0.18)
        ini = int(cuando * SR)
        if ini + Lp > L:
            break
        lado = -0.8 if i % 2 else 0.8          # rebota de un nodo al otro
        g = 0.16 + 0.020 * i
        x[ini:ini + Lp] += p * g * np.sqrt((1 - lado) / 2)
        y[ini:ini + Lp] += p * g * np.sqrt((1 + lado) / 2)
        cuando += 0.40 * (0.86 ** i) + 0.045   # acelera: los bloques se acercan
    ini = int(min(cuando + 0.15, D - 2.6) * SR); Lf = L - ini; tf = np.arange(Lf) / SR
    for nombre, g in (("E3", 0.20), ("B3", 0.14), ("E4", 0.12), ("G4", 0.09), ("B4", 0.07)):
        f = hz(nombre)
        acorde = (np.sin(2 * np.pi * f * tf) + 0.3 * np.sin(2 * np.pi * f * 2 * tf)) * np.exp(-tf * 0.9)
        x[ini:ini + Lf] += acorde * g
        y[ini:ini + Lf] += acorde * g * 0.98
    return sala(x, 2.8, 2.2, 0.034), sala(y, 2.8, 2.1, 0.034)

def rayo():
    """Un pulso viajando de un nodo a otro.

    Es corto a propósito: la página lo dispara muchas veces mientras el lector
    recorre el capítulo, cada vez en un punto distinto del estéreo y a un tono
    distinto. Un solo archivo, decenas de rayos, ninguno igual — que es como se
    ve la red en pantalla.
    """
    D = 0.85; L = int(D * SR); t = np.arange(L) / SR
    # La salida: un barrido que sube rápido, como algo que arranca y se va.
    f = 380 * np.exp(t * 5.2)
    viaje = np.sin(2 * np.pi * np.cumsum(np.minimum(f, 9000)) / SR) * np.exp(-t * 5.5) * 0.5
    viaje += banda(rng.standard_normal(L), 2500, 12000) * np.exp(-t * 9) * 0.22
    # La llegada: el chasquido de encajar en el otro extremo.
    lleg = int(0.34 * SR); Ll = L - lleg; tl = np.arange(Ll) / SR
    viaje[lleg:] += (np.sin(2 * np.pi * hz("B5") * tl) * np.exp(-tl * 22) * 0.28
                     + banda(rng.standard_normal(Ll), 4000, 14000) * np.exp(-tl * 60) * 0.20)
    return ancho(sala(viaje, 1.4, 3.6, 0.022), ms=5)


# ══ ORIGEN ═══════════════════════════════════════════════════════════════════

def particula():
    """El polvo dorado juntándose para formar la moneda.

    Es el desmoronamiento al revés, y por eso funciona: los granos empiezan
    esparcidos y desafinados, y van convergiendo hacia el mi hasta quedar todos
    en la misma nota justo cuando el metal se cierra. Se dispara un poco antes
    del golpe, para que el golpe suene a consecuencia y no a sorpresa.
    """
    D = 3.6; L = int(D * SR); t = np.arange(L) / SR
    x = np.zeros(L); y = np.zeros(L)
    destino = hz("E5")
    for _ in range(2200):
        cuando = rng.beta(1.5, 1.5) * (D - 0.5)
        avance = cuando / D
        Lg = int(rng.uniform(0.010, 0.048) * SR)
        # Al principio cada grano está donde quiere; al final todos han caído en
        # la misma nota. Esa convergencia es lo que se oye como "juntándose".
        suelto = MI_MENOR[rng.integers(0, len(MI_MENOR))] * rng.uniform(0.75, 1.5)
        f = suelto * (1 - avance ** 1.6) + destino * avance ** 1.6
        g = grano(f, Lg, ruidoso=0.30 * (1 - avance)) * rng.uniform(0.006, 0.026) * (0.4 + 0.9 * avance)
        # Y se van cerrando hacia el centro del estéreo, como el polvo hacia el disco.
        pan = np.clip(rng.normal(0, 0.85 * (1 - avance ** 1.3)), -1, 1)
        ini = int(cuando * SR)
        x[ini:ini + Lg] += g * np.sqrt((1 - pan) / 2)
        y[ini:ini + Lg] += g * np.sqrt((1 + pan) / 2)
    # Un aire que crece por debajo: la sensación de que algo va a pasar.
    sube = banda(rng.standard_normal(L), 600, 9000) * (t / D) ** 2.6 * 0.10
    return sala(x + sube, 2.6, 2.2, 0.030), sala(y + sube * 0.97, 2.6, 2.1, 0.030)

def moneda():
    """El metal golpeado.

    Las parciales de un disco de metal no son múltiplos enteros — por eso una
    moneda tintinea y una cuerda canta. Los números son aproximadamente los de
    un disco libre, y son la razón de que esto suene a metal y no a sintetizador.
    """
    D = 5.5; L = int(D * SR); t = np.arange(L) / SR
    f0 = hz("E5")
    PARCIALES = [(1.00, 1.00, 1.3), (1.59, 0.62, 1.8), (2.14, 0.44, 2.2),
                 (2.65, 0.30, 2.8), (3.41, 0.22, 3.4), (4.06, 0.15, 4.2),
                 (5.43, 0.10, 5.5), (6.79, 0.06, 6.8)]
    x = np.zeros(L)
    for r, g, dec in PARCIALES:
        # El batido: dos parciales casi iguales que se cruzan. Es el temblor que
        # tiene una moneda de verdad girando sobre la mesa.
        x += (np.sin(2 * np.pi * f0 * r * t) + np.sin(2 * np.pi * f0 * r * 1.003 * t)) \
             * np.exp(-t * dec) * g * 0.5
    x *= 0.22
    Lg = int(0.06 * SR); tg = np.arange(Lg) / SR
    x[:Lg] += banda(rng.standard_normal(Lg), 2500, 14000) * np.exp(-tg * 150) * 0.55
    # Y debajo, el peso del oro: una nota grave que sostiene el destello.
    x += np.sin(2 * np.pi * hz("E2") * t) * np.exp(-t * 1.4) * 0.16
    x += np.sin(2 * np.pi * hz("E3") * t) * np.exp(-t * 1.8) * 0.09
    return ancho(sala(x, 3.0, 1.8, 0.032), ms=8)


# ══ EL PRÓLOGO Y EL PUENTE ═══════════════════════════════════════════════════

def tic():
    """El clic del contador que baja.

    Dura cuatro centésimas y se dispara decenas de veces. Tiene que ser
    minúsculo: si se nota como sonido, a los diez segundos es insoportable. Lo
    que se busca es que el número se sienta mecánico, no que suene.
    """
    D = 0.10; L = int(D * SR); t = np.arange(L) / SR
    x = banda(rng.standard_normal(L), 1800, 8000) * np.exp(-t * 190) * 0.5
    x += np.sin(2 * np.pi * hz("E6") * t) * np.exp(-t * 150) * 0.22
    x += np.sin(2 * np.pi * hz("E4") * t) * np.exp(-t * 90) * 0.10
    return ancho(x, ms=3, atenua=0.9)

def puente():
    """El capital cruzando de un lado al otro.

    Empieza a la izquierda y termina a la derecha, literal: es lo único que hace
    y es exactamente lo que dice el capítulo. Un tono cálido que se desliza y un
    aire que lo acompaña de un extremo al otro.
    """
    D = 3.4; L = int(D * SR); t = np.arange(L) / SR
    avance = np.clip((t - 0.25) / 2.4, 0, 1)
    # Arranca y frena sin tirones. La curva es u²(3−2u): con u(3−2u) se pasa de
    # uno por el camino — llega a 1,125 hacia la mitad — y la raíz del paneo se
    # vuelve raíz de un número negativo.
    u = avance ** 1.4
    suave = u * u * (3 - 2 * u)
    # La nota sube de mi a si mientras cruza: llega más arriba de donde salió.
    f = hz("E3") * (1 - suave) + hz("B3") * suave
    voz = sum(np.sin(2 * np.pi * f * k * t + rng.random() * 6.28) * g
              for k, g in ((1, 1.0), (2, 0.35), (3, 0.16), (4, 0.07)))
    env = np.clip(t / 0.5, 0, 1) * np.clip((D - t) / 1.3, 0, 1)
    cuerpo = voz * env * 0.13
    aire = banda(rng.standard_normal(L), 900, 7000) * env * (0.25 + 0.75 * np.sin(np.pi * suave)) * 0.045
    # Y la llegada, cuando el recurso toca el otro lado.
    fin = int(2.55 * SR); Lf = L - fin; tf = np.arange(Lf) / SR
    llegada = np.zeros(L)
    llegada[fin:] = (np.sin(2 * np.pi * hz("B4") * tf) * np.exp(-tf * 3.0) * 0.20
                     + np.sin(2 * np.pi * hz("E5") * tf) * np.exp(-tf * 3.6) * 0.12)
    total = cuerpo + aire
    izq = total * np.sqrt(1 - suave * 0.94) + llegada * 0.30
    der = total * np.sqrt(0.06 + suave * 0.94) + llegada
    return sala(izq, 2.6, 2.0, 0.030), sala(der, 2.6, 1.9, 0.030)


# ══ EL FINAL ═════════════════════════════════════════════════════════════════

def fin():
    """Lo contrario de todo lo anterior: nada golpea, todo se abre."""
    D = 8.0; L = int(D * SR); t = np.arange(L) / SR
    x = np.zeros(L)
    # El crecimiento: ruido que además se va abriendo de agudos, no solo subiendo
    # de volumen. Abrir el filtro es lo que da la sensación de amanecer.
    sub = int(3.2 * SR)
    ruido = rng.standard_normal(sub)
    abierto = np.zeros(sub)
    for i, (lo, hi) in enumerate(((200, 900), (700, 2600), (2000, 7000), (5000, 15000))):
        cuando = np.clip((np.arange(sub) / sub - i * 0.22) / 0.4, 0, 1)
        abierto += banda(ruido, lo, hi) * cuando
    x[:sub] += abierto * (np.arange(sub) / sub) ** 2.2 * 0.30
    ini = sub; Li = L - ini; ti = np.arange(Li) / SR
    f = hz("E1") * (1 + 0.42 * np.exp(-ti * 11))
    x[ini:ini + Li] += np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-ti * 1.5) * 0.50
    for nombre, g in (("E2", 0.16), ("B2", 0.11), ("E3", 0.13),
                      ("G3", 0.10), ("B3", 0.09), ("E4", 0.08)):
        f = hz(nombre)
        voz = sum(np.sin(2 * np.pi * (f + d) * ti + rng.random() * 6.28) for d in (-0.12, 0.0, 0.13))
        env = np.clip(ti / 1.2, 0, 1) * np.exp(-np.clip(ti - 1.2, 0, None) * 0.55)
        x[ini:ini + Li] += voz / 3 * env * g
    return ancho(sala(x, 3.6, 1.4, 0.042), ms=15)

def chispa():
    """El estallido del botón final. Corto, dorado, sin bajos: va encima de todo
    lo demás sonando a la vez."""
    D = 2.6; L = int(D * SR); t = np.arange(L) / SR
    x = np.zeros(L)
    x[:int(.05 * SR)] += banda(rng.standard_normal(int(.05 * SR)), 3000, 15000) * 0.5
    for nombre, g, dec in (("E5", .22, 2.4), ("B5", .16, 2.8), ("E6", .12, 3.4), ("G6", .08, 4.0)):
        f = hz(nombre)
        x += (np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * f * 2.01 * t)) * np.exp(-t * dec) * g * 0.5
    for cuando in rng.uniform(0.02, 1.1, 40):     # las chispas que saltan
        Lg = int(rng.uniform(0.02, 0.09) * SR); ini = int(cuando * SR)
        x[ini:ini + Lg] += grano(MI_MENOR[rng.integers(4, len(MI_MENOR))] * rng.uniform(.98, 1.02),
                                 Lg, ruidoso=0.2) * rng.uniform(0.02, 0.07)
    return ancho(sala(x, 2.4, 2.4, 0.030), ms=10)


print("efectos de escena:")
for nombre, fn, bucle in (
    ("motor",      motor,      True),
    ("hidraulico", hidraulico, True),
    ("pala",       pala,       False),
    ("boveda",     boveda,     False),
    ("desmorona",  desmorona,  False),
    ("cadena",     cadena,     False),
    ("rayo",       rayo,       False),
    ("particula",  particula,  False),
    ("moneda",     moneda,     False),
    ("tic",        tic,        False),
    ("puente",     puente,     False),
    ("fin",        fin,        False),
    ("chispa",     chispa,     False),
):
    guardar(nombre, *fn(), bucle=bucle)
