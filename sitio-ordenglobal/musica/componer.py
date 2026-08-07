# Música ambiente original para "El viaje del valor".
#
# Se compone aquí, con síntesis aditiva, en vez de tomar una pista existente:
# el sitio es público y comercial, y una obra propia no tiene dueño que reclame.
#
# La pieza sigue el arco del relato. Arranca sola y oscura (el problema), se
# abre cuando entran las cuerdas (la tierra y la bóveda), y hacia el final
# aparece un brillo agudo y frío — el mismo giro de oro a señal que hace la
# página cuando el metal se vuelve digital.
#
# Progresión en re menor: Dm - Bb - F - C. Cuatro acordes, dos vueltas, 60 s
# exactos para que el bucle cierre sobre sí mismo sin costura.

import numpy as np, wave, struct

SR = 44100
DUR = 60.0
n = int(SR * DUR)
CRUCE = int(3.0 * SR)          # el fundido que cose el final con el principio
# Se sintetizan tres segundos de más: son el arranque de la vuelta siguiente, y
# es justo lo que hay que mezclar sobre el principio para que el bucle no tenga
# costura. Sin ese material extra el empalme salta y se oye un clic cada vuelta.
n_gen = n + CRUCE
t = np.arange(n_gen) / SR

# ── Los acordes, en hercios ──────────────────────────────────────────────────
ACORDES = [
    ("Dm", [146.83, 174.61, 220.00, 293.66]),   # D3  F3  A3  D4
    ("Bb", [116.54, 174.61, 233.08, 293.66]),   # Bb2 F3  Bb3 D4
    ("F",  [130.81, 174.61, 261.63, 349.23]),   # C3  F3  C4  F4
    ("C",  [130.81, 196.00, 261.63, 329.63]),   # C3  G3  C4  E4
]
VUELTAS = 2
POR_ACORDE = DUR / (len(ACORDES) * VUELTAS)     # 7,5 s cada uno

audio = np.zeros(n_gen, dtype=np.float64)

def sobre(largo, subida, bajada):
    """Envolvente suave: una cuerda que entra y sale sin golpe."""
    e = np.ones(largo)
    ns, nb = int(subida * SR), int(bajada * SR)
    if ns: e[:ns] = np.sin(np.linspace(0, np.pi / 2, ns)) ** 2
    if nb: e[-nb:] = np.sin(np.linspace(np.pi / 2, 0, nb)) ** 2
    return e

# ── Las cuerdas: cada nota con sus armónicos y dos copias desafinadas ────────
# El desafine mínimo entre las copias es lo que da la sensación de conjunto:
# una sola onda suena a sintetizador, tres apenas separadas suenan a sección.
TOTAL_ACORDES = int(np.ceil(n_gen / (POR_ACORDE * SR))) + 1
for idx in range(TOTAL_ACORDES):
    _, notas = ACORDES[idx % len(ACORDES)]
    ini = int(idx * POR_ACORDE * SR)
    largo = min(int(POR_ACORDE * SR * 1.35), n_gen - ini)   # se solapan: nunca hay silencio
    if largo <= 0: continue
    if True:
        tl = np.arange(largo) / SR
        env = sobre(largo, 2.2, 3.0)
        # La pieza respira: se abre y se recoge a lo largo de los 60 s, y vuelve
        # al mismo punto donde empezó. Si no cerrara el ciclo, el bucle daría un
        # salto de volumen en cada vuelta.
        fase_ciclo = 2 * np.pi * (ini / SR) / DUR
        cuerpo = 0.72 + 0.28 * np.sin(fase_ciclo - np.pi / 2)
        for k, f in enumerate(notas):
            peso = [1.0, 0.7, 0.5, 0.32][k]
            for detune, pan in ((0.0, 1.0), (-0.14, 0.8), (0.15, 0.8)):
                for arm, ganancia in ((1, 1.0), (2, 0.30), (3, 0.13), (4, 0.06)):
                    fase = np.random.rand() * 2 * np.pi
                    audio[ini:ini+largo] += (
                        np.sin(2*np.pi*(f+detune)*arm*tl + fase)
                        * peso * ganancia * pan * env * cuerpo * 0.030
                    )

# ── El bajo: una sola nota larga por acorde, muy abajo, que sostiene todo ────
for idx in range(TOTAL_ACORDES):
    _, notas = ACORDES[idx % len(ACORDES)]
    ini = int(idx * POR_ACORDE * SR)
    largo = min(int(POR_ACORDE * SR * 1.2), n_gen - ini)
    if largo > 0:
        tl = np.arange(largo) / SR
        f = notas[0] / 2
        audio[ini:ini+largo] += np.sin(2*np.pi*f*tl) * sobre(largo, 1.5, 2.5) * 0.10
        audio[ini:ini+largo] += np.sin(2*np.pi*f*2*tl) * sobre(largo, 1.5, 2.5) * 0.035

# ── El brillo digital: entra en el último tercio ─────────────────────────────
# Campanitas agudas y frías sobre la escala, cada vez más presentes. Es el eco
# sonoro de la metamorfosis de oro a señal.
ESCALA = [587.33, 698.46, 880.00, 1046.50, 1174.66]   # D5 F5 A5 C6 D6
rng = np.random.default_rng(7)
for golpe in np.arange(0.0, n_gen / SR, 1.9):
    ini = int(golpe * SR)
    largo = min(int(3.2 * SR), n_gen - ini)
    if largo <= 0: continue
    tl = np.arange(largo) / SR
    f = ESCALA[rng.integers(0, len(ESCALA))]
    # El brillo entra y se retira dentro de la misma vuelta: crece hacia la
    # mitad y se apaga al llegar al empalme, para que el bucle no delate donde
    # vuelve a empezar.
    fuerza = (1 - np.cos(2 * np.pi * (golpe % DUR) / DUR)) / 2
    decaimiento = np.exp(-tl * 1.5)
    audio[ini:ini+largo] += np.sin(2*np.pi*f*tl) * decaimiento * 0.055 * (0.35 + fuerza)
    audio[ini:ini+largo] += np.sin(2*np.pi*f*2.01*tl) * decaimiento * 0.018 * (0.35 + fuerza)

# ── Aire: un siseo muy tenue filtrado, para que no suene estéril ─────────────
ruido = rng.standard_normal(n_gen)
b = np.exp(-2*np.pi*900/SR)                    # pasa-bajos de un polo
filtrado = np.zeros(n_gen)
acc = 0.0
for i in range(n_gen):
    acc = (1-b)*ruido[i] + b*acc
    filtrado[i] = acc
audio += filtrado * 0.006

# ── Reverberación: le da la sala ─────────────────────────────────────────────
largo_rev = int(1.6 * SR)
impulso = rng.standard_normal(largo_rev) * np.exp(-np.arange(largo_rev)/SR * 3.2)
impulso[0] = 1.0
mojado = np.convolve(audio, impulso * 0.012, mode="full")[:n_gen]
audio = audio * 0.72 + mojado * 0.28

# ── Bucle sin costura: el final se funde con el principio ────────────────────
# Se mezcla el arranque de la vuelta siguiente (lo que va de n a n+CRUCE)
# sobre los primeros segundos. Asi el ultimo instante enlaza con el primero.
subida = np.sin(np.linspace(0, np.pi / 2, CRUCE)) ** 2      # potencia constante
audio[:CRUCE] = audio[:CRUCE] * subida + audio[n:n + CRUCE] * (1 - subida)
audio = audio[:n]

# ── Entrada y salida suaves, y nivel final ───────────────────────────────────
# Sin fundido de entrada: el bucle ya cierra solo, y bajar el arranque a cero
# haria un bache de volumen en cada vuelta.
pico = np.max(np.abs(audio))
audio = audio / pico * 0.72
audio = np.tanh(audio * 1.05) * 0.94          # limitador suave

# ── Estéreo: la copia derecha va unos milisegundos tarde, y eso abre el campo ─
retardo = int(0.011 * SR)
izq = audio
der = np.concatenate([np.zeros(retardo), audio[:-retardo]])
estereo = np.empty(len(audio) * 2)
estereo[0::2] = izq
estereo[1::2] = der * 0.97

with wave.open("/tmp/musica/ambiente.wav", "w") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(struct.pack("<%dh" % len(estereo), *(np.clip(estereo, -1, 1) * 32767).astype(np.int16)))

print(f"compuesta: {len(audio)/SR:.1f} s, pico {np.max(np.abs(audio)):.2f}")
