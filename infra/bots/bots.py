#!/usr/bin/env python3
# Dos bots que se mandan ORIGEN en la red de PRUEBAS 5534, cada 3 horas.
#
# PARA QUE SIRVE
#
# Una cadena que no recibe transacciones parece sana aunque no lo este. Estos
# dos bots la usan de verdad cada tres horas y dejan escrito el resultado: si
# un dia la transaccion no entra, no confirma, o el gas deja de aceptarse, se
# sabe por esto y no por un usuario.
#
# DONDE NO CORRE, Y ES LO MAS IMPORTANTE DE ESTE ARCHIVO
#
# **Nunca en la cadena vieja 8532.** Esta congelada, y el genesis de la 5550 se
# construyo de su estado cerrado y se juzgo con cero diferencias. UNA SOLA
# transaccion ahi cambia la raiz de estado y obliga a rehacer la migracion
# entera. Por eso este archivo comprueba el chainId antes de firmar nada y se
# niega a seguir si no es 5534.
#
# QUIEN PAGA
#
# Los cuatro validadores, que habian ido cobrando el gas de la propia red. Se
# les vacio una vez a las dos billeteras de los bots. Como el gas que gastan
# los bots vuelve a los validadores, el ORIGEN circula: solo hay que rellenar
# de vez en cuando.
#
# LAS LLAVES
#
# Viven en /etc/ogb-bots/*.key, de root y solo de root. No estan en el
# repositorio, ni en S3, ni en ningun parte. Se generaron en la propia maquina
# y no han salido de ella.

import json, os, sys, time, urllib.request

RPC = 'http://127.0.0.1:8545'
CADENA = 5534                      # si no es esta, no se firma nada
LLAVES = '/etc/ogb-bots'
DIARIO = '/var/log/ogb-bots'
IMPORTE = 10 ** 15                 # 0,001 ORIGEN por envio
ESPERA = 90                        # segundos que se espera la confirmacion


def rpc(metodo, params):
    cuerpo = json.dumps({'jsonrpc': '2.0', 'id': 1,
                         'method': metodo, 'params': params}).encode()
    pet = urllib.request.Request(RPC, data=cuerpo,
                                 headers={'content-type': 'application/json'})
    r = json.loads(urllib.request.urlopen(pet, timeout=30).read())
    if 'error' in r:
        raise RuntimeError('%s: %s' % (metodo, r['error']))
    return r['result']


def cuenta(nombre):
    from eth_account import Account
    return Account.from_key(open(os.path.join(LLAVES, nombre + '.key')).read().strip())


def guardar(parte):
    os.makedirs(DIARIO, exist_ok=True)
    json.dump(parte, open(os.path.join(DIARIO, 'ultimo.json'), 'w'),
              ensure_ascii=False, indent=2)
    with open(os.path.join(DIARIO, 'historial.jsonl'), 'a') as f:
        f.write(json.dumps(parte, ensure_ascii=False) + '\n')


def main():
    parte = {'cuando': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
    try:
        # 1 · La comprobacion que impide el desastre.
        visto = int(rpc('eth_chainId', []), 16)
        if visto != CADENA:
            raise SystemExit('ESTE NODO SIRVE LA CADENA %d, NO LA %d. No se '
                             'firma nada. Si esto pasa en la 8532, una sola '
                             'transaccion invalida el genesis de la 5550.'
                             % (visto, CADENA))

        a, b = cuenta('bot-a'), cuenta('bot-b')
        saldos = {c.address: int(rpc('eth_getBalance', [c.address, 'latest']), 16)
                  for c in (a, b)}

        # 2 · Manda el que mas tiene. Asi se reparten solos y ninguno se seca:
        # el que envia paga el gas ademas del importe, asi que si mandara
        # siempre el mismo acabaria a cero.
        emisor, receptor = (a, b) if saldos[a.address] >= saldos[b.address] else (b, a)

        precio = int(rpc('eth_gasPrice', []), 16)
        coste = 21000 * precio
        parte['gasGwei'] = precio / 1e9
        parte['saldos'] = {'bot-a': saldos[a.address] / 1e18,
                           'bot-b': saldos[b.address] / 1e18}
        parte['enviosQueQuedan'] = int(sum(saldos.values()) / coste)

        if saldos[emisor.address] < coste + IMPORTE:
            parte.update(estado='sin-saldo',
                         detalle='El emisor no llega ni para el gas. Hay que '
                                 'rellenar desde los validadores.')
            guardar(parte); print(json.dumps(parte)); return

        tx = {'to': receptor.address, 'value': IMPORTE, 'gas': 21000,
              'gasPrice': precio, 'chainId': CADENA,
              'nonce': int(rpc('eth_getTransactionCount',
                               [emisor.address, 'pending']), 16)}
        crudo = emisor.sign_transaction(tx).raw_transaction.hex()
        if not crudo.startswith('0x'):
            crudo = '0x' + crudo
        h = rpc('eth_sendRawTransaction', [crudo])
        parte.update(de=emisor.address, a=receptor.address, hash=h,
                     importe=IMPORTE / 1e18)

        # 3 · Enviar no es llegar: se espera el recibo y se mira el estado.
        arranque = time.time()
        recibo = None
        while time.time() - arranque < ESPERA:
            recibo = rpc('eth_getTransactionReceipt', [h])
            if recibo:
                break
            time.sleep(3)

        if not recibo:
            parte.update(estado='sin-confirmar',
                         detalle='%d segundos sin recibo. La cadena hace un '
                                 'bloque cada 10 segundos: esto es un aviso '
                                 'de verdad.' % ESPERA)
        elif int(recibo['status'], 16) != 1:
            parte.update(estado='revertida', bloque=int(recibo['blockNumber'], 16))
        else:
            parte.update(estado='bien',
                         bloque=int(recibo['blockNumber'], 16),
                         gasUsado=int(recibo['gasUsed'], 16),
                         segundos=round(time.time() - arranque, 1))
    except SystemExit:
        raise
    except Exception as e:
        parte.update(estado='falla', detalle=str(e)[:400])

    guardar(parte)
    print(json.dumps(parte, ensure_ascii=False))
    if parte.get('estado') not in ('bien',):
        sys.exit(1)


if __name__ == '__main__':
    main()
