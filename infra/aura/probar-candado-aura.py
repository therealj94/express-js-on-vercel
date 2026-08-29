#!/usr/bin/env python3
"""Que el candado de AU-RA abra lo que cierra el navegador.

POR QUE ESTA PRUEBA EXISTE

`candado.py` reimplementa en Python la caja fuerte que `candado.js` hace con
WebCrypto. Son cinco detalles que tienen que cuadrar al byte:

    ECDH sobre P-256 · llave publica en `raw` (punto sin comprimir)
    HKDF-SHA256 con sal VACIA e info "pulse2chat/sobre/v1"
    AES-GCM con vector de 12 bytes
    base64URL SIN relleno
    el sobre guarda la llave del mensaje, no el mensaje

Cualquiera de los cinco mal y no abre nada — y no falla diciendo «la info del
HKDF no coincide»: falla con un error de autenticacion de AES, que se parece
mucho a «llave equivocada» y no dice donde mirar. Eso son horas.

Asi que la prueba CIERRA un bulto siguiendo la receta de candado.js paso a
paso, escrita aparte y a mano, y comprueba que candado.py lo abre. Si alguien
cambia un detalle en cualquiera de los dos lados, esto se pone rojo el mismo
dia.

No se importa nada de candado.py para cerrar: si el mismo fichero cerrara y
abriera, la prueba pasaria aunque los dos lados estuvieran igual de mal.
"""

import base64
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from candado import Candado, carga_del_adjunto

mal = 0


def ok(nombre, cierto, detalle=''):
    global mal
    if cierto:
        print(f'  ok    {nombre}' + (f'  · {detalle}' if detalle else ''))
    else:
        mal += 1
        print(f'  FALLA {nombre}' + (f'\n          {detalle}' if detalle else ''))


# ── el navegador, escrito a mano ─────────────────────────────────────────────

def _b64(b):
    return base64.urlsafe_b64encode(b).decode().rstrip('=')


def cerrar_como_el_navegador(texto, aparatos):
    """`cerrar()` de candado.js, paso por paso.

    `aparatos` es [(id, publica_b64)]. Devuelve el bulto tal cual viaja.
    """
    mi_priv = ec.generate_private_key(ec.SECP256R1())
    mi_pub = _b64(mi_priv.public_key().public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint))

    llave_msg = os.urandom(32)
    iv = os.urandom(12)
    ct = AESGCM(llave_msg).encrypt(iv, texto.encode(), None)

    sobres = []
    for ident, pub_b64 in aparatos:
        suya = ec.EllipticCurvePublicKey.from_encoded_point(
            ec.SECP256R1(),
            base64.urlsafe_b64decode(pub_b64 + '=' * ((4 - len(pub_b64) % 4) % 4)))
        crudo = mi_priv.exchange(ec.ECDH(), suya)
        k = HKDF(algorithm=hashes.SHA256(), length=32, salt=b'',
                 info=b'pulse2chat/sobre/v1').derive(crudo)
        iv_s = os.urandom(12)
        sobres.append({'a': ident, 'iv': _b64(iv_s),
                       'k': _b64(AESGCM(k).encrypt(iv_s, llave_msg, None))})

    return {'v': 2, 'de': mi_pub, 'iv': _b64(iv), 'ct': _b64(ct), 's': sobres}


# ── las comprobaciones ───────────────────────────────────────────────────────

import tempfile

caja = tempfile.mkdtemp(prefix='candado-aura-')
c = Candado(os.path.join(caja, 'candado.json'))

print('\n── la llave ─────────────────────────────────────────────────')
ok('la publica sale en formato raw, sin comprimir',
   base64.urlsafe_b64decode(c.publica_b64 + '==')[0] == 0x04
   and len(base64.urlsafe_b64decode(c.publica_b64 + '==')) == 65,
   f'{len(base64.urlsafe_b64decode(c.publica_b64 + "=="))} bytes')

ok('se guarda solo para el dueño',
   oct(os.stat(os.path.join(caja, 'candado.json')).st_mode)[-3:] == '600',
   oct(os.stat(os.path.join(caja, 'candado.json')).st_mode)[-3:])

otro = Candado(os.path.join(caja, 'candado.json'))
ok('al volver a arrancar es LA MISMA llave, no una nueva',
   otro.id == c.id and otro.publica_b64 == c.publica_b64,
   'si cambiara, cada reinicio dejaria ilegible todo lo anterior')

print('\n── abrir lo que cierra el navegador ─────────────────────────')
bulto = cerrar_como_el_navegador('hola AU-RA, esto va cerrado',
                                 [(c.id, c.publica_b64)])
ok('abre un bulto cerrado con la receta de candado.js',
   c.abrir(bulto) == 'hola AU-RA, esto va cerrado', repr(c.abrir(bulto)))

ok('y tambien si llega como texto JSON, que es como viaja',
   c.abrir(json.dumps(bulto)) == 'hola AU-RA, esto va cerrado')

print('\n── lo que NO tiene que abrir ────────────────────────────────')
ajeno = Candado(os.path.join(caja, 'otro.json'))
bulto_ajeno = cerrar_como_el_navegador('esto no es para ella',
                                       [(ajeno.id, ajeno.publica_b64)])
ok('un bulto sin sobre suyo devuelve None, no revienta',
   c.abrir(bulto_ajeno) is None)

ok('una basura cualquiera devuelve None', c.abrir('no soy un bulto') is None)
ok('un bulto a medias devuelve None', c.abrir({'s': []}) is None)

print('\n── el sobre de VARIOS aparatos ──────────────────────────────')
muchos = cerrar_como_el_navegador(
    'para tres', [(ajeno.id, ajeno.publica_b64), (c.id, c.publica_b64),
                  ('otro-mas', ajeno.publica_b64)])
ok('encuentra el suyo entre varios', c.abrir(muchos) == 'para tres')

print('\n── el adjunto ───────────────────────────────────────────────')
audio = b'\x00\x01esto seria un opus\xff' * 40
llave = os.urandom(32)
iv = os.urandom(12)
cerrado = AESGCM(llave).encrypt(iv, audio, None)
ok('descifra los bytes de un adjunto',
   Candado.abrir_bytes(cerrado, _b64(llave), _b64(iv)) == audio,
   f'{len(audio)} bytes')

texto_con_adj = '{' + json.dumps({'t': 'mirá esto', 'k': _b64(llave), 'iv': _b64(iv)})
t, k, i = carga_del_adjunto(texto_con_adj)
ok('saca la llave del archivo del texto del mensaje',
   t == 'mirá esto' and k == _b64(llave) and i == _b64(iv), f'{t!r}')

t2, k2, _ = carga_del_adjunto('un mensaje normal')
ok('un mensaje normal no se confunde con un adjunto',
   t2 == 'un mensaje normal' and k2 is None)

t3, k3, _ = carga_del_adjunto('{"parece": "json pero no lo es"}')
ok('un texto que ES json tampoco se confunde',
   k3 is None, 'la marca es la doble llave del principio, no que parsee')

print(f'\n{mal} en rojo\n' if mal else '\nEl candado de AU-RA cuadra con el del navegador\n')
sys.exit(1 if mal else 0)
