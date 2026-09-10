#!/usr/bin/env python3
# Convierte el inventario en el génesis de la cadena nueva (Besu · QBFT).
#
# LA IDEA CENTRAL
#
# La cadena nueva no «importa» la vieja: NACE con el estado de la vieja ya
# puesto. Cada contrato aparece en el bloque 0 con su mismo código, su mismo
# almacenamiento y en su MISMA dirección; cada cuenta con su saldo y su nonce.
# Para una billetera no cambió nada: misma dirección, mismo saldo, mismo
# chain ID.
#
# POR QUE EL NONCE TAMBIEN SE COPIA
#
# Parece un detalle y es una defensa: si una cuenta volviera a nonce 0, las
# transacciones viejas firmadas podrían reejecutarse en la cadena nueva
# (repetición). Con el nonce copiado, ninguna firma vieja vale dos veces.
#
# LO QUE SE DEJA FUERA, A PROPOSITO
#
#   · El contrato de staking (0x…1001). Es la pieza propietaria de
#     polygon-edge; en Besu los validadores los gestiona QBFT con votos de los
#     propios validadores. Copiarlo sería arrastrar el problema que se migra
#     para resolver.
#   · Los 10 ORIGEN que ese contrato tiene en garantía NO se pierden: se
#     devuelven a la dirección validadora en el génesis (--devolver-stake).
#
# EL extraData NO SE ESCRIBE AQUI
#
# El extraData del génesis QBFT lleva la lista de validadores en RLP con un
# formato muy fácil de escribir mal a mano. Besu trae el codificador oficial:
#
#   besu rlp encode --from=validadores.json --type=QBFT_EXTRA_DATA
#
# Este script emite `validadores.json` de ejemplo y deja el hueco marcado.
# Escribirlo a mano y equivocarse produce una cadena que no arranca — o peor,
# que arranca con otros validadores.

import argparse, json, sys

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('inventario')
    ap.add_argument('--salida', default='genesis-besu-8532.json')
    ap.add_argument('--periodo', type=int, default=10, help='segundos por bloque')
    # Sin valor por omisión, a propósito: el chain ID es la única defensa
    # contra que una transacción firmada para una cadena valga en la otra.
    # Equivocarlo en silencio es peor que no arrancar, así que hay que decirlo.
    #   5550  · la red principal nueva
    #   5534  · la red de pruebas
    #   55330 · el ensayo desechable, que nunca se registra
    #   8532  · la cadena vieja; NUNCA para una cadena nueva que conviva con ella
    ap.add_argument('--chain-id', type=int, required=True,
                    help='5550 red · 5534 pruebas · 55330 ensayo')
    ap.add_argument('--devolver-stake', action='store_true',
                    help='suma al validador los ORIGEN retenidos por el contrato de staking viejo')
    a = ap.parse_args()

    if a.chain_id == 8532:
        print('ABORTADO: 8532 es la cadena vieja. Si las dos conviven, una firma '
              'hecha para una vale en la otra. Usar 5550, 5534 o 55330.', file=sys.stderr)
        sys.exit(2)

    inv = json.load(open(a.inventario))
    STAKING = '0x0000000000000000000000000000000000001001'
    VALIDADOR = '0xf777de573e67e78ececd2afe19dd18dd046fd4d0'

    alloc = {}

    # ── contratos de token: código + almacenamiento completo ────────────────
    for c, meta in inv['tokens'].items():
        ranura = meta['ranuraSaldos']
        if ranura is None and inv['saldosToken'].get(c):
            print(f'ABORTADO: {meta["simbolo"]} tiene tenedores pero no se detectó la ranura', file=sys.stderr)
            sys.exit(1)
        storage = dict(inv['ranurasEstaticas'].get(c, {}))
        for d, v in inv['saldosToken'].get(c, {}).items():
            from Crypto.Hash import keccak as K
            k = K.new(digest_bits=256)
            k.update(bytes.fromhex(d[2:].zfill(64)) + int(ranura).to_bytes(32, 'big'))
            storage['0x' + k.hexdigest()] = '0x' + int(v).to_bytes(32, 'big').hex()
        alloc[c] = {'balance': '0x0', 'code': inv['codigos'][c],
                    'storage': {k: v for k, v in storage.items()}}

    # ── cuentas: saldo y nonce ──────────────────────────────────────────────
    stake_retenido = 0
    for d, fila in inv['nativos'].items():
        if d == STAKING:
            stake_retenido = int(fila['saldo'])
            continue  # el contrato de staking NO viaja
        if d in alloc:
            alloc[d]['balance'] = hex(int(fila['saldo']))
            alloc[d]['nonce'] = hex(fila['nonce'])
        else:
            alloc[d] = {'balance': hex(int(fila['saldo'])), 'nonce': hex(fila['nonce'])}

    if a.devolver_stake and stake_retenido:
        v = alloc.setdefault(VALIDADOR, {'balance': '0x0'})
        v['balance'] = hex(int(v.get('balance', '0x0'), 16) + stake_retenido)
        print(f'stake devuelto al validador: {stake_retenido/1e18:g} ORIGEN')

    genesis = {
        'config': {
            'chainId': a.chain_id,
            'homesteadBlock': 0, 'eip150Block': 0, 'eip155Block': 0, 'eip158Block': 0,
            'byzantiumBlock': 0, 'constantinopleBlock': 0, 'petersburgBlock': 0,
            'istanbulBlock': 0, 'berlinBlock': 0, 'londonBlock': 0,
            'zeroBaseFee': True,   # el gas sigue en cero, como hoy
            'qbft': {
                'blockperiodseconds': a.periodo,
                'epochlength': 30000,
                'requesttimeoutseconds': max(4, a.periodo * 2),
            },
        },
        'nonce': '0x0',
        'timestamp': '0x0',
        'gasLimit': '0x989680',   # 10.000.000, como la cadena actual
        'difficulty': '0x1',
        'coinbase': '0x0000000000000000000000000000000000000000',
        'mixHash': '0x63746963616c2062797a616e74696e65206661756c7420746f6c6572616e6365',
        'extraData': 'PENDIENTE: besu rlp encode --from=validadores.json --type=QBFT_EXTRA_DATA',
        'alloc': alloc,
    }
    json.dump(genesis, open(a.salida, 'w'), indent=1)
    print(f'chain ID de esta cadena: {a.chain_id}')
    json.dump([VALIDADOR], open('validadores.json', 'w'))

    total = sum(int(x['balance'], 16) for x in alloc.values())
    print(f'génesis escrito en {a.salida}')
    print(f'cuentas: {len(alloc)} · ORIGEN total en el génesis: {total/1e18:,.4f}')
    print('validadores.json de ejemplo escrito (1 validador; añadir los demás por votos QBFT tras el corte)')

if __name__ == '__main__':
    main()
