#!/usr/bin/env python3
"""Manda la carta de «instalá la app» a la gente que tiene cuenta.

    python3 enviar.py --lista gente.csv --prueba          # a MI, una sola
    python3 enviar.py --lista gente.csv --cuantos 5       # a los 5 primeros
    python3 enviar.py --lista gente.csv --de-verdad       # a todos

── POR QUE NO MANDA NADA SIN QUE SE LO PIDAN CON ESAS PALABRAS ──────────────

Un correo masivo no se puede deshacer. No hay «cancelar», no hay «borrar para
todos»: en el segundo en que sale, esta en el telefono de gente de verdad, con
nuestro nombre encima.

Asi que la opcion por omision de este archivo es NO MANDAR. Hay que escribir
`--de-verdad`, entero, y ademas confirmar. Que sea incomodo es el punto.

── LO QUE PROTEGE, Y POR QUE IMPORTA MAS QUE EL CORREO ──────────────────────

El dominio manda TAMBIEN los correos de recuperar la contrasena. Si esta carta
se marca como basura, se quema la reputacion de `ordenglobal.org` para TODO —
incluido el correo que alguien necesita para volver a entrar a su cuenta. La
salida barata protege lo caro.

Por eso:

  · CADA carta lleva su enlace de baja, firmado con la llave del servidor.
    Un enlace del tipo `/baja?c=alguien@correo.com` dejaria que cualquiera
    diera de baja a cualquiera. Ver `routes/avisos.js` del backend.
  · Se manda DESPACIO. SES aguanta mucho mas, pero un pico de miles de correos
    identicos en un minuto es exactamente el dibujo que miran los filtros.
  · Se apunta a quien se le mando, para no mandarle dos veces si esto se corre
    de nuevo. Un correo repetido molesta mas que uno no enviado.

── LO QUE ESTE ARCHIVO NO SABE ─────────────────────────────────────────────

De donde sale la lista. No se conecta a ninguna base de datos ni adivina
correos: se le pasa un CSV con `correo,nombre` y manda a eso y nada mas.

Es a proposito. El dia que este archivo pueda leer la base de usuarios solo,
un error de una linea manda una carta a todo el mundo.
"""

import argparse
import csv
import hashlib
import hmac
import os
import pathlib
import sys
import time
import urllib.parse

AQUI = pathlib.Path(__file__).resolve().parent

DE = 'Orden Global <info@ordenglobal.org>'
ASUNTO = 'Tu app de Orden Global ya está lista para instalar'
ENLACE = ('https://expo.dev/artifacts/eas/'
          'kEEJv7Dn4TfA06aMVWX-CpiZRPtUooi6DnGfyA-f69U.apk')
BAJA_BASE = 'https://vetawallet-1a2e38ac52b1.herokuapp.com/avisos/baja'

# Uno cada dos segundos. SES da 50.000 al dia y aguanta mucho mas por segundo;
# el freno no es por SES, es por los filtros de Gmail y Outlook.
PAUSA = 2.0

APUNTADOS = AQUI / 'ya-enviados.txt'


def enlace_de_baja(correo, llave):
    """El mismo formato que espera `routes/avisos.js`: prefijo distinto al de
    las sesiones, para que una firma de baja jamas pase por una de sesion."""
    firma = hmac.new(llave.encode(), ('baja:' + correo).encode(),
                     hashlib.sha256).hexdigest()
    return (f'{BAJA_BASE}?c={urllib.parse.quote(correo)}&f={firma}')


def ya_enviados():
    try:
        return {l.strip() for l in APUNTADOS.read_text().splitlines() if l.strip()}
    except Exception:
        return set()


def apuntar(correo):
    with open(APUNTADOS, 'a', encoding='utf8') as f:
        f.write(correo + '\n')


def carta(nombre, correo, llave):
    t = (AQUI / 'carta.txt').read_text(encoding='utf8')
    # El asunto va en la primera linea del archivo; se quita del cuerpo.
    if t.startswith('Asunto:'):
        t = t.split('\n', 1)[1].lstrip('\n')
    return (t.replace('{nombre}', (nombre or '').strip() or 'hola')
             .replace('{enlace}', ENLACE)
             .replace('{baja}', enlace_de_baja(correo, llave)))


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--lista', required=True, help='CSV con correo,nombre')
    p.add_argument('--prueba', action='store_true',
                   help='manda UNA sola, a la direccion de prueba')
    p.add_argument('--cuantos', type=int, default=0,
                   help='manda solo a los N primeros')
    p.add_argument('--de-verdad', action='store_true',
                   help='manda a TODOS. Hay que confirmar ademas.')
    a = p.parse_args()

    llave = (os.environ.get('PASS_TOKEN') or '').strip()
    if not llave:
        print('Falta PASS_TOKEN: sin eso los enlaces de baja no valen, y una\n'
              'carta masiva sin salida es spam. No mando nada.', file=sys.stderr)
        return 2

    with open(a.lista, encoding='utf8') as f:
        gente = [(r.get('correo', '').strip(), r.get('nombre', '').strip())
                 for r in csv.DictReader(f) if r.get('correo', '').strip()]

    fuera = ya_enviados()
    gente = [(c, n) for c, n in gente if c not in fuera]
    if a.cuantos:
        gente = gente[:a.cuantos]

    if a.prueba:
        gente = [('mjoseenamorado1994@gmail.com', 'José')]
        print('PRUEBA: una sola carta, a la dirección de prueba.\n')
    elif not a.de_verdad:
        print(f'{len(gente)} personas en la lista (sin contar {len(fuera)} '
              f'a las que ya se les mandó).\n\n'
              'NO mandé nada. Para mandar de verdad: --de-verdad\n'
              'Para probar primero: --prueba\n\n'
              'Así se ve la primera carta:\n' + '─' * 60)
        if gente:
            print(carta(gente[0][1], gente[0][0], llave)[:1400])
        return 0
    else:
        print(f'Vas a mandarle a {len(gente)} personas. Esto NO se puede '
              f'deshacer.')
        if input('Escribí «mandar» para seguir: ').strip() != 'mandar':
            print('No mandé nada.')
            return 0

    import boto3
    ses = boto3.client('sesv2', region_name='us-east-1')
    hechas = fallidas = 0
    for correo, nombre in gente:
        try:
            ses.send_email(
                FromEmailAddress=DE,
                Destination={'ToAddresses': [correo]},
                Content={'Simple': {
                    'Subject': {'Data': ASUNTO, 'Charset': 'UTF-8'},
                    'Body': {'Text': {'Data': carta(nombre, correo, llave),
                                      'Charset': 'UTF-8'}}}})
            apuntar(correo)
            hechas += 1
            print(f'  ✓ …{correo[-18:]}')
        except Exception as e:
            fallidas += 1
            print(f'  ✗ …{correo[-18:]}  {type(e).__name__} {str(e)[:70]}')
        time.sleep(PAUSA)
    print(f'\n{hechas} enviadas · {fallidas} fallidas')
    return 0


if __name__ == '__main__':
    sys.exit(main())
