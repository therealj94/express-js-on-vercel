#!/usr/bin/env python3
# Arma la red de pruebas 5534: genesis, validadores y arranque de los tres nodos.
#
# QUE ES ESTA RED Y QUE NO ES
#
# Es la red barata donde equivocarse. Si el genesis o el procedimiento tienen un
# fallo, aparece aqui y no en produccion. Por eso se levanta ANTES que la red
# principal y se inscribe antes en el registro publico: es el ensayo publico del
# procedimiento entero.
#
# NACE VACIA, Y ESO ES A PROPOSITO
#
# No lleva los saldos reales. Copiarlos seria repartir algo que parece dinero: a
# la vista de una billetera, un token de prueba con el mismo nombre y el mismo
# saldo es indistinguible del de verdad. Aqui la moneda se llama tORIGEN, no
# vale nada, y sale de un grifo.
#
# TRES VALIDADORES DESDE EL PRIMER BLOQUE
#
# La red principal tiene hoy uno solo, que es su riesgo mayor. La de pruebas
# nace con tres justamente para ensayar lo que falta: que la cadena siga
# produciendo cuando uno se cae. Con tres, QBFT tolera que falte uno.

import json, os, subprocess, sys

CHAIN_ID = 5534
PERIODO = 5          # segundos por bloque; mas rapido que produccion, para probar

def main():
    nodos = json.load(open(sys.argv[1]))          # [{instancia, validador}]
    grifo = sys.argv[2] if len(sys.argv) > 2 else None
    salida = sys.argv[3] if len(sys.argv) > 3 else 'genesis-testnet-5534.json'

    validadores = [n['validador'].lower() for n in nodos]
    if len(set(validadores)) != len(validadores):
        print('ABORTADO: hay validadores repetidos. Cada nodo necesita su propia '
              'llave, o la cadena cree que es el mismo firmante tres veces.',
              file=sys.stderr)
        sys.exit(2)

    alloc = {}
    if grifo:
        # Diez millones de tORIGEN para el grifo. No representan nada: son el
        # combustible de las pruebas.
        alloc[grifo.lower()] = {'balance': hex(10_000_000 * 10**18)}

    genesis = {
        'config': {
            'chainId': CHAIN_ID,
            'homesteadBlock': 0, 'eip150Block': 0, 'eip155Block': 0, 'eip158Block': 0,
            'byzantiumBlock': 0, 'constantinopleBlock': 0, 'petersburgBlock': 0,
            'istanbulBlock': 0, 'berlinBlock': 0, 'londonBlock': 0,
            'zeroBaseFee': True,
            'qbft': {'blockperiodseconds': PERIODO, 'epochlength': 30000,
                     'requesttimeoutseconds': max(4, PERIODO * 2)},
        },
        'nonce': '0x0', 'timestamp': '0x0',
        'gasLimit': '0x989680', 'difficulty': '0x1',
        'coinbase': '0x0000000000000000000000000000000000000000',
        'mixHash': '0x63746963616c2062797a616e74696e65206661756c7420746f6c6572616e6365',
        'extraData': 'PENDIENTE',
        'alloc': alloc,
    }
    json.dump(genesis, open(salida, 'w'), indent=1)
    json.dump(validadores, open('validadores-testnet.json', 'w'))

    print(f'genesis de la testnet escrito en {salida}')
    print(f'chain ID {CHAIN_ID} · {len(validadores)} validadores · periodo {PERIODO}s')
    for v in validadores:
        print(f'   validador {v}')
    if grifo:
        print(f'grifo {grifo} con 10.000.000 tORIGEN')
    print('\nFalta el extraData. Se codifica con el codificador oficial, no a mano:')
    print('   besu rlp encode --from=validadores-testnet.json --type=QBFT_EXTRA_DATA')
    print('y hay que filtrar los codigos de color que besu mete en su salida, o el')
    print('campo queda con basura y la cadena no arranca.')

if __name__ == '__main__':
    main()
