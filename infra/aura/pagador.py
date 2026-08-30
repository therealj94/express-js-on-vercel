# El pagador: manda el 1 ORIGEN del premio y entrega el recibo. Solo.
#
# ── POR QUE ESTE ARCHIVO EXISTE APARTE ──────────────────────────────────────
#
# `premio.py` tiene prohibido —con prueba que lo vigila— firmar o mandar
# transacciones: corre dentro del asistente, pegado a un modelo de lenguaje
# que habla con desconocidos. Este modulo es lo contrario: NO conversa con
# nadie, no importa el motor, no lee texto de la gente. Lee un archivo de
# reclamos que ya paso todas las comprobaciones, paga, y avisa.
#
# La separacion es la seguridad: el proceso que habla no puede pagar, y el
# proceso que paga no escucha a nadie.
#
# ── POR QUE PUEDE PAGAR SOLO SIN QUE DE MIEDO ───────────────────────────────
#
#   · LA BILLETERA ES DEDICADA. Se fondea con lo justo para la campana. El
#     peor fallo imaginable pierde lo que hay en ella y ni un gramin mas: el
#     tope de perdida se decidio ANTES, fondeando, no despues, deseando.
#   · EL MONTO ESTA GRABADO EN EL CODIGO. Un ORIGEN. No se lee del archivo de
#     reclamos ni de una variable: un archivo corrupto o una variable mal
#     puesta no pueden convertir 1 en 1000.
#   · SOLO PAGA RECLAMOS QUE `premio` DEJO ESCRITOS, con sus dos llaves de
#     dedupe ya comprobadas, y aun asi vuelve a negar las billeteras internas.
#   · POCOS POR VUELTA. Cinco pagos por corrida y a esperar el proximo
#     temporizador: un fallo raro avanza despacio, y despacio se nota.
#
# ── EL CRASH NO PUEDE PAGAR DOS VECES ───────────────────────────────────────
#
# El hash de una transaccion se conoce ANTES de mandarla (es el hash de la
# firma). El orden es sagrado:
#
#   1. firmar            → ya se sabe el hash
#   2. APUNTAR en vuelo  → direccion, hash y la transaccion cruda, A DISCO
#   3. mandar
#   4. confirmar         → marcar pagado, borrar de en-vuelo, avisar
#
# Si el proceso muere entre 3 y 4, al arrancar se revisa lo que quedo en
# vuelo: ¿la cadena tiene recibo de ese hash? Si → era paso 4, se termina.
# No → se REENVIA LA MISMA transaccion cruda. Mismo nonce: la cadena acepta
# una sola, repetirla es fisicamente imposible. Nunca se firma de nuevo un
# pago en vuelo — firmar de nuevo cambia el nonce y ahi si se pagaria doble.

import json
import os
import pathlib
import sys
import time
import urllib.request

import premio
import registro
import whatsapp

DATOS = pathlib.Path(os.environ.get('AURA_DATOS', '/srv/aura'))
RPC = os.environ.get('AURA_RPC', 'https://rpc.ordenglobal-rpc.com/')
CADENA_ID = int(os.environ.get('AURA_CADENA', '5550'))

# UN ORIGEN. Grabado, no configurable: ver la cabecera.
MONTO_WEI = 10 ** 18
GAS = 21000
POR_VUELTA = 5

# La llave vive SOLO en el nodo, en un archivo 600 que systemd le pasa por
# entorno. Nunca en el repositorio, nunca en un chat, nunca en un parametro.
LLAVE = (os.environ.get('AURA_PAGOS_LLAVE') or '').strip()


def _rpc(metodo, params):
    cuerpo = json.dumps({'jsonrpc': '2.0', 'method': metodo,
                         'params': params, 'id': 1}).encode()
    req = urllib.request.Request(RPC, data=cuerpo,
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.loads(r.read())
    if 'error' in d:
        raise RuntimeError(f"{metodo}: {d['error'].get('message', d['error'])}")
    return d.get('result')


# ── Lo que esta en vuelo ────────────────────────────────────────────────────

def _vuelo_archivo():
    return DATOS / 'pagos-en-vuelo.json'


def _vuelo_cargar():
    f = _vuelo_archivo()
    if not f.exists():
        return []
    return json.loads(f.read_text(encoding='utf8'))


def _vuelo_guardar(lista):
    import stat
    f = _vuelo_archivo()
    tmp = f.with_suffix('.tmp')
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC,
                 stat.S_IRUSR | stat.S_IWUSR)
    with os.fdopen(fd, 'w', encoding='utf8') as fh:
        json.dump(lista, fh)
    os.replace(tmp, f)


# ── El recibo ───────────────────────────────────────────────────────────────
#
# Es el momento mas importante de todo el embudo: la persona acaba de recibir
# dinero de un desconocido de internet, y lo que decide si se queda es poder
# COMPROBARLO sin creernos. Por eso el recibo no dice «confia»: dice «anda a
# mirarlo vos», con el hash entero.

def _recibo(direccion, tx, idioma):
    corta = direccion[:6] + '…' + direccion[-4:]
    if idioma == 'en':
        return ('🌱 Your 1 ORIGEN just landed in your wallet!\n\n'
                'And don\'t take my word for it — check it yourself:\n\n'
                '📜 Receipt\n'
                f'• 1 ORIGEN → {corta}\n'
                f'• Transaction:\n{tx}\n\n'
                'Paste that number into ordenscan.com and there it is, written '
                'on the chain. Nobody can take it back or erase it — that is '
                'the whole point.\n\n'
                'See it in your balance at app.vetawallet.com. Welcome. 🤝')
    return ('🌱 ¡Tu 1 ORIGEN ya está en tu billetera!\n\n'
            'Y no me creas a mí — comprobalo vos:\n\n'
            '📜 Recibo\n'
            f'• 1 ORIGEN → {corta}\n'
            f'• Transacción:\n{tx}\n\n'
            'Pegá ese número en ordenscan.com y ahí está, escrito en la '
            'cadena. Nadie te lo puede quitar ni borrar — de eso se trata '
            'todo esto.\n\n'
            'Miralo en tu saldo en app.vetawallet.com. Bienvenido. 🤝')


def _idioma_de(quien):
    try:
        p = json.loads((DATOS / 'perfiles.json').read_text(encoding='utf8'))
        return (p.get(quien) or {}).get('idioma') or 'es'
    except Exception:
        return 'es'


def _avisar(rel, quien, direccion, tx):
    try:
        rel.enviar(quien, _recibo(direccion, tx, _idioma_de(quien)))
        return True
    except Exception as e:
        # El pago YA salio y esta anotado: el aviso caido no lo deshace. La
        # persona lo ve en su saldo igual; se deja dicho y no se reintenta un
        # mensaje sobre dinero, que duplicado asusta mas que ausente.
        print(f'pago hecho pero el aviso no salio a …{quien[-4:]}: {e}',
              file=sys.stderr)
        return False


# ── Pagar ───────────────────────────────────────────────────────────────────

def _firmar(cuenta, para, nonce, gas_precio):
    from eth_account import Account
    tx = {'chainId': CADENA_ID, 'nonce': nonce, 'to': para,
          'value': MONTO_WEI, 'gas': GAS, 'gasPrice': gas_precio}
    f = Account.sign_transaction(tx, cuenta.key)
    return f.hash.hex() if f.hash.hex().startswith('0x') else '0x' + f.hash.hex(), \
        f.raw_transaction.hex() if f.raw_transaction.hex().startswith('0x') \
        else '0x' + f.raw_transaction.hex()


def _recuperar(rel):
    """Lo que quedo en vuelo de una corrida anterior. Ver la cabecera."""
    vuelo = _vuelo_cargar()
    if not vuelo:
        return
    quedan = []
    for v in vuelo:
        if v.get('revertida'):
            quedan.append(v)          # bloqueada hasta que la mire una persona
            continue
        recibo = _rpc('eth_getTransactionReceipt', [v['hash']])
        if recibo and recibo.get('status') == '0x1':
            premio.marcar_pagado(v['direccion'], v['hash'])
            registro.anotar('pago', recuperado=1)
            print(f"recuperado: {v['hash'][:14]}… ya estaba en la cadena")
            if not v.get('avisado'):
                _avisar(rel, v['quien'], v['direccion'], v['hash'])
        elif recibo:
            # Revirtio. Con una transferencia simple casi no puede pasar; si
            # paso, NO se reintenta solo — dinero raro lo mira una persona.
            # Se queda en vuelo MARCADA: eso bloquea a `main` de volver a
            # firmarle un pago a esa direccion hasta que alguien la mire.
            if not v.get('revertida'):
                registro.anotar('pago', revertido=1)
                print(f"REVERTIDA {v['hash']}: la mira una persona",
                      file=sys.stderr)
            v['revertida'] = True
            quedan.append(v)
        else:
            # No llego. LA MISMA cruda otra vez — mismo nonce, imposible pagar
            # doble. Jamas se firma de nuevo.
            try:
                _rpc('eth_sendRawTransaction', [v['crudo']])
                print(f"reenviada la misma transacción {v['hash'][:14]}…")
            except Exception as e:
                if 'nonce' in str(e).lower() or 'known' in str(e).lower():
                    pass          # ya la tiene la cadena; el proximo turno la ve
                else:
                    print(f'no se pudo reenviar: {e}', file=sys.stderr)
            quedan.append(v)
    _vuelo_guardar(quedan)


def main():
    if not LLAVE:
        print('sin AURA_PAGOS_LLAVE: no pago nada (y esta bien: la llave se '
              'pone una vez en el nodo, no aqui)')
        return 0

    from eth_account import Account
    cuenta = Account.from_key(LLAVE)
    premio.preparar(DATOS)
    registro.preparar(DATOS)
    rel = whatsapp.RelevoWhatsApp(cuenta=os.environ.get('ZERNIO_CUENTA', ''))

    _recuperar(rel)

    pendientes = premio.por_pagar()
    if not pendientes:
        return 0

    saldo = int(_rpc('eth_getBalance', [cuenta.address, 'latest']), 16)
    gas_precio = int(_rpc('eth_gasPrice', []), 16) or 1
    costo = MONTO_WEI + GAS * gas_precio

    # Lo que sigue en vuelo NO se vuelve a firmar: o esta esperando recibo, o
    # esta revertida esperando a una persona. Firmarle de nuevo seria el doble
    # pago que todo este archivo existe para impedir.
    en_vuelo = {v['direccion'] for v in _vuelo_cargar()}

    hechos = 0
    for r in pendientes[:POR_VUELTA]:
        para = (r.get('direccion') or '').lower()
        quien = r.get('quien') or ''
        if para in en_vuelo:
            continue
        if not para or premio.problema_con(para):
            # Nunca a una billetera nuestra, aunque el archivo lo diga.
            registro.anotar('pago', rechazado=1)
            continue
        if saldo < costo:
            print(f'saldo insuficiente: {saldo / 1e18:.2f} ORIGEN — '
                  f'el parte ya lo esta avisando', file=sys.stderr)
            break

        nonce = int(_rpc('eth_getTransactionCount',
                         [cuenta.address, 'pending']), 16)
        hash_, crudo = _firmar(cuenta, para, nonce, gas_precio)

        # A DISCO ANTES DE MANDAR. Es la linea que hace imposible el doble
        # pago tras un crash: ver la cabecera.
        vuelo = _vuelo_cargar()
        vuelo.append({'quien': quien, 'direccion': para,
                      'hash': hash_, 'crudo': crudo, 'nonce': nonce,
                      'cuando': int(time.time())})
        _vuelo_guardar(vuelo)

        _rpc('eth_sendRawTransaction', [crudo])

        confirmada = False
        for _ in range(15):
            time.sleep(2)
            rec = _rpc('eth_getTransactionReceipt', [hash_])
            if rec:
                confirmada = rec.get('status') == '0x1'
                break

        if confirmada:
            premio.marcar_pagado(para, hash_)
            _vuelo_guardar([v for v in _vuelo_cargar() if v['hash'] != hash_])
            registro.anotar('pago', pagado=1)
            _avisar(rel, quien, para, hash_)
            saldo -= costo
            hechos += 1
            print(f'pagado 1 ORIGEN → …{para[-6:]} · {hash_[:14]}…')
        else:
            # Queda en vuelo: la proxima corrida la recupera o la reenvia.
            print(f'sin recibo todavia para {hash_[:14]}…, queda en vuelo')

    if hechos:
        print(f'{hechos} premio(s) pagados y avisados')
    return 0


if __name__ == '__main__':
    sys.exit(main())
