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
import base64
import csv
import re
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
BAJA_BASE = 'https://vetawallet-1a2e38ac52b1.herokuapp.com/baja'

# Uno cada dos segundos. SES da 50.000 al dia y aguanta mucho mas por segundo;
# el freno no es por SES, es por los filtros de Gmail y Outlook.
PAUSA = 2.0

APUNTADOS = AQUI / 'ya-enviados.txt'


def enlace_de_baja(correo, llave):
    """La firma EXACTA que espera el servidor. Ver `lib/firmaBaja.js`.

    Tres cosas tienen que coincidir o el enlace no sirve, y las tres me las
    equivoque en la primera version:

      · el prefijo `baja:` —distinto al de las sesiones, para que una firma de
        baja jamas pueda pasar por una de sesion;
      · BASE64URL, no hexadecimal;
      · RECORTADA A 24 caracteres, porque el servidor compara en tiempo
        constante y exige el mismo largo.

    Se comprobo contra el servidor de verdad antes de mandar nada. Un enlace de
    baja roto convierte la carta en algo indistinguible del correo basura, y lo
    que se quema no es esta campana: es el dominio que manda TAMBIEN el correo
    de recuperar la contrasena.
    """
    crudo = 'baja:' + correo.strip().lower()
    firma = base64.urlsafe_b64encode(
        hmac.new(llave.encode(), crudo.encode(), hashlib.sha256).digest()
    ).decode().rstrip('=')[:24]
    return f'{BAJA_BASE}?c={urllib.parse.quote(correo)}&f={urllib.parse.quote(firma)}"'.rstrip('"')


def ya_enviados():
    try:
        return {l.strip() for l in APUNTADOS.read_text().splitlines() if l.strip()}
    except Exception:
        return set()


def apuntar(correo):
    with open(APUNTADOS, 'a', encoding='utf8') as f:
        f.write(correo + '\n')


def como_le_digo(nombre, correo):
    """El nombre de pila, o nada.

    ── POR QUE ESTO NO ES UN DETALLE ────────────────────────────────────────

    En la base, el campo del nombre trae MUCHAS VECES el correo: de 418
    personas, solo 69 tienen un nombre de verdad. Sin esta comprobacion la
    carta empezaba «Hola 0aldair0@gmail.com:», que es peor que no saludar —
    dice a la cara que esto lo mando una maquina que no sabe quien sos.

    Cuando no hay nombre usable se saluda sin el. «Hola:» es una carta; «Hola
    0aldair0@gmail.com:» es un formulario.

    Y del nombre completo se usa SOLO EL PRIMERO: «Hola Alberto» se lee como
    una persona escribiendo; «Hola Alberto Jesus Morales Martinez» se lee como
    una base de datos.
    """
    n = (nombre or '').strip()
    if not n or '@' in n:
        return ''
    if n.lower() == correo.split('@')[0].lower():
        return ''
    if not re.search(r'[A-Za-zÁÉÍÓÚÑáéíóúñ]{2}', n):
        return ''
    primero = n.split()[0]
    # TODO EN MAYUSCULAS se lee como un grito; se arregla, no se descarta.
    return primero.capitalize() if primero.isupper() else primero


CARTA_JS = (AQUI / '../../veta-wallet-backend/lib/cartaInstalar.js').resolve()


def carta(nombre, correo):
    """La carta, DIBUJADA POR LA PLANTILLA DE LA CASA.

    ── POR QUE SE LLAMA A NODE EN VEZ DE REESCRIBIRLA AQUI ──────────────────

    El marco de los correos —el borde, el pie, el aviso de que nunca pedimos
    la contrasena— vive en `lib/correo.js` y lo usan las cinco cartas que la
    casa ya manda. Copiarlo a Python serian DOS marcos que se tienen que poner
    de acuerdo, y el dia que alguien cambie el pie por una razon legal, una de
    las dos cartas seguiria mandando el viejo.

    Asi que esto no dibuja nada: le pide la carta al mismo archivo que la
    dibuja para todos los demas, y manda lo que le devuelva.

    Devuelve `(asunto, html, texto)`. Las DOS versiones, porque hay clientes
    que no pintan HTML y una carta que llega en blanco es peor que no
    mandarla.
    """
    import json
    import subprocess
    guion = (
        "import {cartaInstalar} from %s;"
        "const c=cartaInstalar(JSON.parse(process.argv[1]));"
        "process.stdout.write(JSON.stringify(c));"
        % json.dumps(str(CARTA_JS))
    )
    r = subprocess.run(
        ['node', '--input-type=module', '-e', guion,
         json.dumps({'nombre': nombre or '', 'correo': correo})],
        capture_output=True, text=True, timeout=60,
        env={**os.environ})
    if r.returncode != 0 or not r.stdout.strip():
        raise RuntimeError('la plantilla no dibujo: ' + (r.stderr or '')[:200])
    d = json.loads(r.stdout)
    return d['asunto'], d['html'], d['texto']


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
            _a, _h, t = carta(gente[0][1], gente[0][0])
            print(t[:1200])
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
            asunto, html, texto = carta(nombre, correo)
            ses.send_email(
                FromEmailAddress=DE,
                Destination={'ToAddresses': [correo]},
                Content={'Simple': {
                    'Subject': {'Data': asunto, 'Charset': 'UTF-8'},
                    'Body': {'Html': {'Data': html, 'Charset': 'UTF-8'},
                             'Text': {'Data': texto, 'Charset': 'UTF-8'}}}})
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
