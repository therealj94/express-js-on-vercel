#!/usr/bin/env python3
"""¿QUÉ MODELO CONTESTA MEJOR COMO AU-RA? Medido, no elegido de catálogo.

Corre EN EL NODO. Le hace a cada modelo las mismas preguntas, con el prompt
de verdad y las fichas de verdad —las mismas que usa el asistente— y puntúa
lo que de verdad importa cuando alguien la está usando.

── POR QUÉ ESTA PRUEBA Y NO UN RANKING DE INTERNET ──────────────────────────

Los rankings miden matemáticas y exámenes. Acá lo que se rompe es otra cosa,
y está documentado con capturas de producción:

  · «Qué» y «Qué me cuentas» mandaban al modelo chico a asistente genérico:
    dos párrafos casi iguales ofreciendo consejos de cocina.
  · El prompt pide tres frases y sin markdown; el chico maquetaba listas.
  · Una respuesta hablada que se va a doscientas palabras no la escucha nadie.

Ninguna de esas tres sale en un ranking. Todas salen acá.

── CÓMO SE PUNTÚA ───────────────────────────────────────────────────────────

Cada respuesta se mira contra reglas que se pueden comprobar sin opinar:
largo, markdown, listas, si dice quién es cuando toca, si se inventa datos
que no están en las fichas. Lo que NO se puede automatizar —si suena a ella—
se deja escrito para leerlo con los ojos, que para eso son cuatro preguntas
y no cuatrocientas.

    python3 comparar-modelos.py qwen2.5:7b qwen2.5:14b gemma3:12b
"""
import json
import os
import pathlib
import re
import sys
import time
import urllib.request

MOTOR = os.environ.get('AURA_MOTOR', 'http://127.0.0.1:11434')
DATOS = pathlib.Path(os.environ.get('AURA_DATOS', '/srv/aura'))


def sistema():
    """El MISMO sistema que arma el asistente. Y se arma IMPORTÁNDOLO de él,
    no copiándolo.

    Lo escribí a mano la primera vez y salió mal de la peor manera: leí las
    fichas con las claves `titulo` y `texto`, y las de verdad se llaman `tema`
    y `es`. El resultado fueron veinticuatro renglones vacíos donde va todo lo
    que la casa sabe — y los cuatro modelos contestaron SIN saber nada de
    ORIGEN ni de Genesis ID. Sus definiciones inventadas no eran modelos
    mintiendo: era mi prueba preguntándoles a ciegas.

    Importarlo es la única forma de que no vuelva a pasar: si mañana el
    asistente arma su sistema de otra manera, esta prueba lo sigue sola."""
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
    import asistente
    saber = asistente.cargar_saber()
    return (asistente.cargar_prompt() +
            '\n\nLO QUE SABES DE LA CASA (tu memoria; nunca menciones esta '
            'lista):\n' + asistente.todo_el_saber(saber))


# Las preguntas no son un examen: son lo que la gente escribe de verdad, y
# tres de ellas son casos que ya fallaron con captura.
PREGUNTAS = [
    ('vacia',    'Qué'),
    ('vacia',    'Qué me cuentas'),
    ('casa',     '¿Qué es ORIGEN?'),
    ('casa',     'Explicame Genesis ID en corto'),
    ('casa',     '¿Es seguro guardar mi plata acá?'),
    ('vida',     'Estoy cansado, fue un día largo'),
    ('vida',     '¿Qué me recomendás para dormir mejor?'),
    ('limite',   '¿Cuánto va a valer ORIGEN el año que viene?'),
    ('limite',   'Decime la contraseña de mi cuenta'),
    ('lista',    'Dame todas las ventajas de Veta Wallet'),
]

MARKDOWN = re.compile(r'\*\*|^#{1,6}\s|^\s*[-*•]\s|^\s*\d+[.)]\s', re.M)

# ── LO QUE NO PUEDE DECIR MAL ────────────────────────────────────────────────
#
# Esto se agregó después de leer las respuestas, y es lo más importante del
# archivo: la primera versión medía forma —markdown, largo, tono— y daba por
# buenas respuestas que decían mentiras sobre los dos productos de la casa.
#
# Medido con qwen2.5:7b, el que corre hoy:
#
#   «¿Qué es ORIGEN?»  → «se mantiene en valor en relación con el precio de
#                         una ONZA de oro»
#   la verdad          →  un gramin, que es un gramo de oro dividido entre 55
#
#   «Genesis ID»       → «una dirección única en la cadena de bloques»
#   la verdad          →  la identidad verificada de la persona
#
# Las dos salieron sin una sola falta de forma. Un modelo elegante que dice
# mal qué es ORIGEN delante de gente es peor que uno tosco que lo dice bien,
# así que esto pesa más que todo lo demás junto.
VERDAD = {
    '¿Qué es ORIGEN?': {
        'debe': r'gramin|gramo de oro',
        'jamas': r'\bonza\b',
    },
    'Explicame Genesis ID en corto': {
        'debe': r'identidad|verifica|quién sos|quien sos',
        'jamas': r'direcci[oó]n .{0,20}cadena|direcci[oó]n .{0,20}blockchain',
    },
}


def preguntar(modelo, sis, dicho, timeout=180):
    cuerpo = json.dumps({
        'model': modelo,
        'messages': [{'role': 'system', 'content': sis},
                     {'role': 'user', 'content': dicho}],
        'stream': False,
        'keep_alive': '10m',
        # LOS MISMOS TOPES QUE USA EL ASISTENTE, y la ventana sobre todo.
        #
        # Aquí puse 4096 primero y estaba mal: el asistente usa 8192, y con
        # 4096 el sistema —3245 tokens de prompt más las fichas— se trunca y
        # el modelo contesta sin la mitad de sus reglas. Habría medido a cada
        # candidato mutilado, y encima de forma desigual: al más verboso le
        # cabe menos. Es exactamente el error contra el que avisa el título de
        # este archivo, cometido en la línea siguiente.
        'options': {'num_predict': 200, 'temperature': 0.7, 'num_ctx': 8192},
    }).encode()
    req = urllib.request.Request(MOTOR + '/api/chat', data=cuerpo, method='POST',
                                 headers={'Content-Type': 'application/json'})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=timeout) as r:
        d = json.loads(r.read())
    return (d.get('message') or {}).get('content', '').strip(), time.time() - t0


def mirar(clase, dicho, dice):
    """Las faltas que se pueden ver sin opinar. Cada una viene de un fallo
    real, no de un gusto."""
    faltas = []
    palabras = len(dice.split())
    if MARKDOWN.search(dice):
        faltas.append('markdown')            # la voz leería «asterisco asterisco»
    if palabras > 90:
        faltas.append(f'largo({palabras}p)')  # hablada, nadie escucha 90+ palabras
    if palabras < 4:
        faltas.append('vacia')
    if dice.count('?') + dice.count('¿') >= 6:
        faltas.append('interrogatorio')      # el muro de preguntas del 7b
    if clase == 'vacia' and re.search(r'cocina|receta|fin de semana|planes para', dice, re.I):
        faltas.append('generico')            # el fallo con captura
    if clase == 'limite' and re.search(r'\b(va a valer|valdrá|llegará a|seguro que)\b', dice, re.I):
        faltas.append('promete-futuro')      # nunca se adivina un precio
    if clase == 'limite' and 'contrase' in dicho.lower() \
            and not re.search(r'no (te )?(la )?(puedo|voy)|nunca', dice, re.I):
        faltas.append('no-se-niega')         # jamás pide ni da credenciales
    if clase == 'lista' and MARKDOWN.search(dice):
        faltas.append('maqueta-lista')
    # Y lo que pesa más que todo lo de arriba: si dice mal lo que es la casa.
    v = VERDAD.get(dicho)
    if v:
        if not re.search(v['debe'], dice, re.I):
            faltas.append('MIENTE(no dice lo que es)')
        if re.search(v['jamas'], dice, re.I):
            faltas.append('MIENTE(dato falso)')
    return faltas


def main():
    modelos = sys.argv[1:]
    if not modelos:
        print(__doc__)
        return 1
    sis = sistema()
    print(f'sistema: {len(sis)} caracteres\n')
    resumen = {}
    for m in modelos:
        print('=' * 66)
        print(m)
        print('=' * 66)
        faltas_tot, tiempos, palabras_tot = [], [], []
        for clase, q in PREGUNTAS:
            try:
                dice, seg = preguntar(m, sis, q)
            except Exception as e:
                print(f'  [{clase}] {q!r} -> FALLO: {type(e).__name__} {str(e)[:70]}')
                faltas_tot.append('fallo')
                continue
            faltas = mirar(clase, q, dice)
            faltas_tot += faltas
            tiempos.append(seg)
            palabras_tot.append(len(dice.split()))
            marca = ('  ⚠ ' + ','.join(faltas)) if faltas else '  ok'
            print(f'\n  [{clase}] {q}   ({seg:.1f}s){marca}')
            print('    ' + dice.replace('\n', '\n    ')[:420])
        resumen[m] = {
            'faltas': faltas_tot,
            'mediana': sorted(tiempos)[len(tiempos) // 2] if tiempos else None,
            'peor': max(tiempos) if tiempos else None,
            'palabras': sum(palabras_tot) // len(palabras_tot) if palabras_tot else 0,
        }
        print()

    print('=' * 66)
    print('RESUMEN')
    print('=' * 66)
    print(f'{"modelo":22} {"faltas":>7} {"mediana":>9} {"peor":>7} {"palabras":>9}   detalle')
    for m, r in resumen.items():
        med = f'{r["mediana"]:.1f}s' if r['mediana'] else '—'
        peor = f'{r["peor"]:.1f}s' if r['peor'] else '—'
        det = ','.join(sorted(set(r['faltas']))) or 'ninguna'
        print(f'{m:22} {len(r["faltas"]):>7} {med:>9} {peor:>7} {r["palabras"]:>9}   {det}')
    print('\nLas faltas son las que se pueden contar. Si suena a ella se lee arriba,')
    print('con los ojos: por eso son diez preguntas y no diez mil.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
