#!/usr/bin/env python3
"""Locución de los tres anuncios con voces latinoamericanas reales.

Lo importante de este archivo no es la API: es el REPARTO. Antes narraba
una sola voz de principio a fin, y eso contradecía el propio guion. En los
tres anuncios hablan tres personas distintas:

  narrador  el que mira desde fuera y cuenta lo que cambió con los años
  testigo   el que lo está viviendo, y solo dice "¿Tiene que ser así?"
  og        el joven de la camisa que contesta "Por eso hicimos esto. Por ti."

Que la pregunta y la respuesta salgan de bocas distintas es el anuncio
entero. Con una sola voz, el cierre suena a que el narrador se autorresponde.

La dirección también cambia por época: 1985 se lee con calidez y algo de
nostalgia, hoy se lee seco y más lento. El dato duro (los treinta y tres
años de salario) se lee sin ninguna emoción: el número ya pesa solo.

    EL_KEY=... python3 voces_el.py llave mesa dia
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

import soundfile as sf

API = "https://api.elevenlabs.io/v1/text-to-speech"

REPARTO = {
    "narrador": "aviXFY7Zd7b9DnCUwaCh",  # Maico, latinoamericano, cálido y seco
    "testigo": "J3JSkWXJwqClE1dIxQM9",   # Diego, íntimo, casi susurrado
    "og": "LY1fdYL8QcEDyEkAT4Qq",        # Brian CM, joven, el que responde
}

# Cada tono es una forma de leer. "stability" alta aplana la interpretación;
# baja la deja suelta y arriesga. "style" empuja la expresividad.
TONOS = {
    "calido":  {"stability": 0.42, "similarity_boost": 0.80, "style": 0.28},
    "neutro":  {"stability": 0.52, "similarity_boost": 0.80, "style": 0.14},
    "seco":    {"stability": 0.66, "similarity_boost": 0.82, "style": 0.03},
    "dato":    {"stability": 0.80, "similarity_boost": 0.85, "style": 0.00},
    "intimo":  {"stability": 0.38, "similarity_boost": 0.82, "style": 0.35},
    "abierto": {"stability": 0.40, "similarity_boost": 0.80, "style": 0.30},
}

# Papel y tono línea por línea. El índice es el número de línea del guion.
DIRECCION = {
    "llave": {
        1: ("narrador", "calido"), 2: ("narrador", "calido"),
        3: ("narrador", "calido"), 4: ("narrador", "neutro"),
        5: ("narrador", "neutro"), 6: ("narrador", "neutro"),
        7: ("narrador", "calido"), 8: ("narrador", "seco"),
        9: ("narrador", "seco"), 10: ("narrador", "seco"),
        11: ("narrador", "dato"), 12: ("narrador", "seco"),
        13: ("og", "abierto"),
    },
    "mesa": {
        1: ("narrador", "calido"), 2: ("narrador", "calido"),
        3: ("narrador", "calido"), 4: ("narrador", "neutro"),
        5: ("narrador", "neutro"), 6: ("narrador", "neutro"),
        7: ("narrador", "seco"), 8: ("narrador", "seco"),
        9: ("narrador", "seco"), 10: ("narrador", "dato"),
        11: ("og", "abierto"),
    },
    "dia": {
        1: ("narrador", "neutro"), 2: ("narrador", "neutro"),
        3: ("narrador", "neutro"), 4: ("narrador", "seco"),
        5: ("narrador", "seco"), 6: ("narrador", "seco"),
        7: ("narrador", "seco"), 8: ("narrador", "seco"),
        9: ("narrador", "dato"), 10: ("narrador", "seco"),
        11: ("testigo", "intimo"),   # "¿Tiene que ser así?" — la vive él
        12: ("og", "abierto"),
    },
}


def sintetizar(texto: str, voz: str, ajustes: dict) -> bytes:
    cuerpo = json.dumps({
        "text": texto,
        "model_id": "eleven_v3",
        "voice_settings": ajustes,
    }).encode()
    pet = urllib.request.Request(
        f"{API}/{voz}?output_format=mp3_44100_128", data=cuerpo,
        headers={"xi-api-key": os.environ["EL_KEY"],
                 "Content-Type": "application/json"})
    for intento in range(4):
        try:
            return urllib.request.urlopen(pet, timeout=240).read()
        except urllib.error.HTTPError as e:
            if e.code < 500 or intento == 3:
                raise RuntimeError(f"{e.code} {e.read()[:200].decode('replace')}")
    raise RuntimeError("sin respuesta")


def duracion(ruta: str) -> float:
    # Este build de ffmpeg viene sin ffprobe, así que la duración sale del
    # propio wav ya escrito.
    info = sf.info(ruta)
    return info.frames / info.samplerate


def a_wav(mp3: bytes, destino: str) -> float:
    """MP3 -> wav 48k mono, sin aire muerto y nivelado.

    El silencio de cabeza no es cosmético: la mezcla coloca cada línea con
    adelay al milisegundo del guion, así que medio segundo de aire delante
    desplaza la frase entera y la saca de su plano.

    Los silencios de EN MEDIO también se recortan a 0,35 s. El modelo v3
    interpreta, y cuando interpreta se toma pausas de casi un segundo dentro
    de la frase. En una locución suelta eso queda bien; aquí cada línea tiene
    su hueco medido contra la imagen, y esas pausas son las que la desbordan.
    Recortar el aire respeta la velocidad de habla; acelerar la frase, no."""
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", "pipe:0",
         "-af", "silenceremove=start_periods=1:start_silence=0.02:"
                "start_threshold=-50dB,areverse,"
                "silenceremove=start_periods=1:start_silence=0.08:"
                "start_threshold=-50dB,areverse,"
                "silenceremove=stop_periods=-1:stop_duration=0.35:"
                "stop_threshold=-45dB,"
                "loudnorm=I=-18:TP=-2:LRA=9",
         "-ar", "48000", "-ac", "1", destino],
        input=mp3, check=True, capture_output=True)
    return duracion(destino)


def encajar(ruta: str, tope: float) -> float:
    """Último recurso: comprimir la frase para que quepa en su hueco.

    Hasta un 12 % no se percibe como prisa. Por encima sí, y entonces vale
    más avisar y que alguien decida, que entregar una línea atropellada."""
    dur = duracion(ruta)
    if dur <= tope:
        return dur
    factor = dur / tope
    if factor > 1.12:
        return dur
    tmp = ruta + ".tmp.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", ruta,
                    "-af", f"atempo={factor:.4f}", tmp], check=True)
    os.replace(tmp, ruta)
    return duracion(ruta)


def main(nombres):
    fallos = 0
    for pfx in nombres:
        guion = json.load(open(f"guion_{pfx}.json"))
        direccion = DIRECCION[pfx]
        print(f"\n=== {pfx} ({len(guion)} lineas) ===")
        duraciones = []
        for i, (t, texto) in enumerate(guion, 1):
            papel, tono = direccion[i]
            salida = f"v{pfx[0]}_{i}.wav"
            # 0,12 s de margen: dos frases que se tocan justo suenan pegadas
            # aunque técnicamente no se solapen.
            tope = guion[i][0] - t - 0.12 if i < len(guion) else 1e9

            # El modelo no da dos veces la misma toma: la misma frase salió
            # entre 3,90 s y 4,73 s en pruebas. Así que se hace como en un
            # estudio —se repite la toma hasta que entra en su hueco— en vez
            # de acelerar una toma larga y que se oiga la prisa.
            # Se queda la toma MÁS CORTA de las intentadas, no la última: si
            # se guarda siempre la última, cuatro intentos pueden acabar peor
            # que el primero, que es justo lo que pasaba.
            mejor, dur, toma = None, None, 0
            for intento in range(4):
                d = a_wav(sintetizar(texto, REPARTO[papel], TONOS[tono]),
                          salida)
                d = encajar(salida, tope)
                if dur is None or d < dur:
                    dur, toma = d, intento
                    mejor = salida + ".mejor.wav"
                    os.replace(salida, mejor)
                if dur <= tope:
                    break
            os.replace(mejor, salida)
            duraciones.append((i, t, dur))
            repe = f" (toma {toma + 1})" if toma else ""
            print(f"  {i:2}. {papel:8} {tono:8} {dur:5.2f}s  "
                  f"{texto[:44]}{repe}")

        # Cuando una frase no cabe en su hueco, casi siempre le sobra sitio
        # ANTES: la anterior acabó pronto y quedó silencio. Adelantarla medio
        # segundo no se nota contra la imagen; acelerarla, sí. Así que primero
        # se busca ese sitio y solo si no aparece se da por fallida.
        tiempos = []
        for n, (i, t, dur) in enumerate(duraciones):
            if n + 1 < len(duraciones) and dur > duraciones[n + 1][1] - t:
                falta = dur - (duraciones[n + 1][1] - t) + 0.12
                suelo = tiempos[-1] + duraciones[n - 1][2] + 0.12 if n else 0.0
                nuevo = max(t - min(falta, 0.60), suelo)
                if nuevo < t:
                    print(f"  ·  linea {i} adelantada {t - nuevo:.2f}s "
                          f"(cabía antes, no despues)")
                t = nuevo
            tiempos.append(t)

        # Y ahora sí se vuelve a medir el encaje: el primer intento se hizo
        # con el tiempo del guion, antes de saber que la línea se iba a
        # adelantar. Con el hueco ya definitivo, un ajuste mínimo la cuadra.
        for n, (i, t, dur) in enumerate(duraciones):
            if n + 1 < len(duraciones):
                d = encajar(f"v{pfx[0]}_{i}.wav",
                            duraciones[n + 1][1] - tiempos[n] - 0.12)
                duraciones[n] = (i, t, d)

        # Una línea que invade la siguiente se oye como atropello. Vale más
        # detectarlo aquí que descubrirlo al ver el anuncio montado.
        for n, (i, t, dur) in enumerate(duraciones):
            if n + 1 < len(duraciones):
                hueco = duraciones[n + 1][1] - tiempos[n]
                if dur > hueco:
                    print(f"  !! linea {i} dura {dur:.2f}s y solo tiene "
                          f"{hueco:.2f}s hasta la siguiente")
                    fallos += 1

        # La mezcla coloca cada línea con estos tiempos, no con los del guion.
        json.dump([round(x, 3) for x in tiempos],
                  open(f"tiempos_{pfx}.json", "w"))
    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:] or ["llave", "mesa", "dia"]))
