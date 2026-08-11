#!/usr/bin/env python3
# Construye el génesis Besu a partir del ARBOL DE ESTADO, no del RPC.
#
# POR QUE ESTE Y NO construir-genesis.py
#
# El otro leía el estado por RPC, preguntando por ranuras que ya sospechaba.
# Este parte del volcado del árbol de Merkle-Patricia, que trae el estado
# entero. La diferencia práctica: aquél no podía saber lo que se le escapaba;
# éste cuenta cada ranura y se niega a emitir un contrato al que le falte una.
#
# LA REGLA QUE GOBIERNA TODO EL ARCHIVO
#
# Un contrato viaja ENTERO o no viaja. Emitir un contrato con nueve de cada
# diez ranuras produce algo peor que no emitirlo: una cadena que arranca,
# responde y miente. Por eso la salida separa en dos listas —completos e
# incompletos— y el informe por contrato es la parte importante, no el JSON.

import argparse, json, sys
from collections import defaultdict

VACIO = '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470'

def ranura_de(clave):
    """De la etiqueta del emparejamiento a la ranura real de 32 bytes."""
    from Crypto.Hash import keccak as K
    def kc(b):
        k = K.new(digest_bits=256); k.update(b); return k.digest()
    def pad(x):
        if isinstance(x, str):
            return bytes.fromhex(x[2:].rjust(64, '0'))
        return (int(x) % (1 << 256)).to_bytes(32, 'big')
    t = clave[0]
    if t == 'fija':
        return pad(clave[1])
    if t == 'mapa':
        base = kc(pad(clave[1]) + pad(clave[2]))
        return ((int.from_bytes(base, 'big') + clave[3]) % (1 << 256)).to_bytes(32, 'big')
    if t == 'mapa-num':
        base = kc(pad(clave[1]) + pad(clave[2]))
        return ((int.from_bytes(base, 'big') + clave[3]) % (1 << 256)).to_bytes(32, 'big')
    if t == 'posicion':
        # Igual que un mapping, salvo que la clave ya viene formada: es el
        # keccak del empaquetado de 26 bytes que usa Uniswap V3.
        base = kc(pad(clave[1]) + pad(clave[2]))
        return ((int.from_bytes(base, 'big') + clave[3]) % (1 << 256)).to_bytes(32, 'big')
    if t == 'triple':
        # getPool[a][b][fee] de la factoria de Uniswap V3: tres niveles.
        interno = kc(pad(clave[1]) + pad(clave[4]))
        medio = kc(pad(clave[2]) + interno)
        return kc(pad(clave[3]) + medio)
    if t == 'anidado-num':
        # mapa[direccion][indice]: el keccak de adentro lleva la direccion y la
        # ranura base; el de afuera, el indice.
        interno = kc(pad(clave[1]) + pad(clave[3]))
        return kc(pad(clave[2]) + interno)
    if t == 'anidado':
        interno = kc(pad(clave[1]) + pad(clave[3]))
        return kc(pad(clave[2]) + interno)
    if t == 'arreglo':
        base = int.from_bytes(kc(pad(clave[1])), 'big')
        return ((base + clave[2]) % (1 << 256)).to_bytes(32, 'big')
    raise ValueError('etiqueta desconocida: %r' % (clave,))

def clave_arbol(ranura):
    """Del numero de ranura a la clave con que el arbol la indexa: keccak."""
    from Crypto.Hash import keccak as K
    k = K.new(digest_bits=256)
    k.update(bytes.fromhex(ranura.lower().removeprefix('0x').rjust(64, '0')))
    return '0x' + k.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('estado', help='estado-final.json de emparejar-preimagenes.py')
    ap.add_argument('--chain-id', type=int, required=True, help='5550 red · 5534 pruebas · 55330 ensayo')
    ap.add_argument('--periodo', type=int, default=10)
    ap.add_argument('--salida', default='genesis-besu.json')
    ap.add_argument('--informe', default='informe-completitud.json')
    ap.add_argument('--incompletos', action='store_true',
                    help='emitir igual los contratos incompletos (SOLO para ensayo)')
    ap.add_argument('--ranuras', help='ranuras-cerradas.json de cerrar-ranuras.py: '
                    'ranuras ya resueltas, ranura -> valor, por contrato')
    ap.add_argument('--fuentes', nargs='*', default=[],
                    help='los estados de los que salio este, para comprobar que el '
                         'recuento de huerfanas no bajo sin haberlas resuelto')
    a = ap.parse_args()

    if a.chain_id == 8532:
        print('ABORTADO: 8532 es la cadena vieja; con el mismo número una firma '
              'hecha para una vale en la otra.', file=sys.stderr)
        sys.exit(2)

    # La 5550 es la cadena de produccion: no se construye a medias. El 11-ago-2026
    # un estado unido declaro cero huerfanas sin haberlas resuelto, se construyo
    # con --incompletos, y salieron siete contratos con la raiz distinta. El
    # informe decia que todo cuadraba. Que no vuelva a poder pasar.
    if a.incompletos and a.chain_id == 5550:
        print('ABORTADO: --incompletos es para ensayar. La cadena de produccion '
              'no se construye con contratos a medias.', file=sys.stderr)
        sys.exit(2)

    est = json.load(open(a.estado))

    # Un contador de huerfanas que puede bajar solo es peor que no tenerlo: da
    # por buena una migracion incompleta. Si este estado declara menos que sus
    # fuentes, las que faltan tienen que estar resueltas de verdad, o aborta.
    if a.fuentes:
        mias = {(h[0].lower(), h[1].lower()) for h in est.get('huerfanas', [])}
        resueltas = set()
        for c in est['cuentas']:
            d = (c.get('direccion') or '').lower()
            for k in (c.get('claves') or {}):
                resueltas.add((d, k.lower()))
        perdidas = []
        for f in a.fuentes:
            for h in json.load(open(f)).get('huerfanas', []):
                par = (h[0].lower(), h[1].lower())
                if par not in mias and par not in resueltas:
                    perdidas.append(par)
        if perdidas:
            print('ABORTADO: %d ranuras que las fuentes daban por huerfanas '
                  'desaparecieron sin quedar resueltas.' % len(perdidas), file=sys.stderr)
            for c, k in perdidas[:8]:
                print('   %s  %s' % (c, k), file=sys.stderr)
            if len(perdidas) > 8:
                print('   … y %d mas' % (len(perdidas) - 8), file=sys.stderr)
            sys.exit(2)
    # Las ranuras que cerro el bucle de punto fijo vienen ya como ranura->valor,
    # sin pasar por una etiqueta: la maquina virtual las calculo, no se
    # dedujeron. Cuando estan, mandan.
    directas = json.load(open(a.ranuras)) if a.ranuras else {}
    huerfanasPor = defaultdict(int)
    for h in est.get('huerfanas', []):
        huerfanasPor[h[0]] += 1

    STAKING = '0x0000000000000000000000000000000000001001'
    filas, alloc, excluidos = [], {}, []

    for c in est['cuentas']:
        d = c.get('direccion')
        alm = c.get('almacen') or {}
        claves = c.get('claves') or {}
        prop = directas.get(d) if d else None
        # Las ranuras trazadas COMPLEMENTAN a las etiquetadas, no las
        # reemplazan: unas salen de la maquina virtual y otras de deducir la
        # disposicion, y cada contrato suele necesitar las dos. Contarlas por
        # separado dejaba fuera todo lo ya identificado.
        resueltas = len(set(claves) | set(clave_arbol(r) for r in (prop or {})))
        faltan = len(alm) - resueltas
        es_contrato = bool(c.get('codigo')) and c['hashCodigo'] != VACIO
        filas.append({'direccion': d, 'hash': c['hashDireccion'], 'contrato': es_contrato,
                      'ranuras': len(alm), 'resueltas': resueltas, 'faltan': faltan,
                      'saldo': c['saldo'], 'nonce': c['nonce']})

        if d is None:
            excluidos.append({'que': c['hashDireccion'], 'porque': 'no se conoce su dirección'})
            continue
        if d == STAKING:
            continue  # el contrato de staking de Edge no viaja: QBFT vota
        if faltan and not a.incompletos:
            excluidos.append({'que': d, 'porque': f'le faltan {faltan} de {len(alm)} ranuras'})
            continue

        fila = {'balance': hex(int(c['saldo'])), 'nonce': hex(c['nonce'])}
        if es_contrato:
            fila['code'] = c['codigo']
            almacen = {}
            for hclave, etiqueta in claves.items():
                r = ranura_de(tuple(etiqueta))
                almacen['0x' + r.hex()] = alm[hclave]
            # Lo trazado va encima: cuando las dos fuentes hablan de la misma
            # ranura, manda la que calculo la maquina virtual.
            if prop:
                almacen.update(prop)
            if almacen:
                fila['storage'] = almacen
        alloc[d] = fila

    contratos = [f for f in filas if f['contrato']]
    completos = [f for f in contratos if f['faltan'] == 0 and f['direccion']]
    print(f"cuentas: {len(filas)} · contratos: {len(contratos)}")
    print(f"contratos COMPLETOS (todas sus ranuras identificadas): {len(completos)}")
    print(f"contratos incompletos o sin dirección: {len(contratos) - len(completos)}")
    print(f"\nen el génesis van {len(alloc)} cuentas · quedan fuera {len(excluidos)}\n")

    peores = sorted([f for f in contratos if f['faltan']], key=lambda x: -x['faltan'])[:15]
    if peores:
        print('los que faltan, por cuántas ranuras les quedan sin identificar:')
        for f in peores:
            print(f"   {f['direccion'] or f['hash']}  {f['faltan']:>4} de {f['ranuras']}")

    genesis = {
        'config': {
            'chainId': a.chain_id,
            'homesteadBlock': 0, 'eip150Block': 0, 'eip155Block': 0, 'eip158Block': 0,
            'byzantiumBlock': 0, 'constantinopleBlock': 0, 'petersburgBlock': 0,
            'istanbulBlock': 0, 'berlinBlock': 0, 'londonBlock': 0,
            'zeroBaseFee': True,
            'qbft': {'blockperiodseconds': a.periodo, 'epochlength': 30000,
                     'requesttimeoutseconds': max(4, a.periodo * 2)},
        },
        'nonce': '0x0', 'timestamp': '0x0',
        'gasLimit': '0x989680', 'difficulty': '0x1',
        'coinbase': '0x0000000000000000000000000000000000000000',
        'mixHash': '0x63746963616c2062797a616e74696e65206661756c7420746f6c6572616e6365',
        'extraData': 'PENDIENTE: besu rlp encode --from=validadores.json --type=QBFT_EXTRA_DATA',
        'alloc': alloc,
    }
    json.dump(genesis, open(a.salida, 'w'), indent=1)
    json.dump({'filas': filas, 'excluidos': excluidos}, open(a.informe, 'w'), indent=1)
    print(f"\ngénesis en {a.salida} · informe en {a.informe}")
    if excluidos and not a.incompletos:
        print('\nEste génesis NO es apto para el corte: hay contratos fuera.')
        sys.exit(3)

if __name__ == '__main__':
    main()
