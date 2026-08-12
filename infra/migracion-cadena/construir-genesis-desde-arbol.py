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

# ---- el extraData de QBFT ------------------------------------------------
#
# Hasta hoy este archivo escribia un texto de relleno y dejaba el trabajo a un
# `besu rlp encode` que habia que acordarse de correr a mano. El fallo era
# benigno --Besu se niega a arrancar con el relleno-- pero pasaba en la noche
# del corte, con el reloj corriendo, y es justo cuando no se quiere pensar.
#
# El formato es RLP de cinco cosas: los 32 bytes de vanidad, la lista de
# validadores ORDENADA, la lista de votos (vacia en el bloque cero), la ronda
# (cero) y los sellos (vacios en el bloque cero).
#
# Comprobado contra la realidad, no contra la documentacion: lo que sale de
# aqui para los cuatro validadores de la 5534 es byte por byte lo mismo que
# tiene el bloque cero de la 5534 en marcha, que lo escribio `besu rlp encode`.
# Ese vector esta abajo y se comprueba en cada ejecucion.

VECTOR_5534 = (
    ['0x69e8a7b25586511a0c14430b45100e9439aae36c',
     '0x65f987264bd77c3a094badfd88e4ba84c0b36382',
     '0xc548464725d5fd4a15b882a221da67b9cfd29514',
     '0x48ccec9a54b9357623458f26afadcd7412a6a833'],
    '0xf87aa00000000000000000000000000000000000000000000000000000000000000000'
    'f8549448ccec9a54b9357623458f26afadcd7412a6a8339465f987264bd77c3a094badfd'
    '88e4ba84c0b363829469e8a7b25586511a0c14430b45100e9439aae36c94c548464725d5'
    'fd4a15b882a221da67b9cfd29514c080c0')


def _cabecera(n, base):
    if n < 56:
        return bytes([base + n])
    b = n.to_bytes((n.bit_length() + 7) // 8, 'big')
    return bytes([base + 55 + len(b)]) + b


def rlp(x):
    if isinstance(x, (bytes, bytearray)):
        x = bytes(x)
        if len(x) == 1 and x[0] < 0x80:
            return x
        return _cabecera(len(x), 0x80) + x
    dentro = b''.join(rlp(i) for i in x)
    return _cabecera(len(dentro), 0xc0) + dentro


def extra_data_qbft(validadores):
    dirs = []
    for v in validadores:
        d = v.lower().removeprefix('0x')
        if len(d) != 40 or any(c not in '0123456789abcdef' for c in d):
            raise ValueError('no es una direccion: %r' % v)
        dirs.append(d)
    if len(set(dirs)) != len(dirs):
        raise ValueError('hay un validador repetido en la lista')
    orden = [bytes.fromhex(d) for d in sorted(set(dirs))]
    return '0x' + rlp([b'\x00' * 32, orden, [], b'', []]).hex()


def comprobar_extra_data():
    v, esperado = VECTOR_5534
    salio = extra_data_qbft(v)
    if salio != esperado:
        print('ABORTADO: el codificador de extraData no reproduce el bloque cero '
              'de la 5534.\n  esperado %s\n  salio    %s' % (esperado, salio),
              file=sys.stderr)
        sys.exit(2)


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
    ap.add_argument('--consolidar-origen', metavar='DIRECCION',
                    help='deja exactamente --origen-por-billetera en cada billetera de '
                         'persona y manda todo el resto a esta direccion. Los contratos '
                         'conservan el suyo: su saldo respalda valor de la gente.')
    ap.add_argument('--preservar', nargs='*', default=[], metavar='DIRECCION',
                    help='billeteras que conservan su saldo pese a la consolidacion. '
                         'Van aca las asignaciones de emision, que no son saldos de '
                         'usuario: tocarlas es mover el tesoro y lo decide la Junta.')
    ap.add_argument('--origen-por-billetera', type=int, default=1,
                    help='ORIGEN enteros que queda en cada billetera de persona (por omision 1)')
    ap.add_argument('--validadores', metavar='ARCHIVO',
                    help='JSON nombre->direccion (validadores-5550.json) o una '
                         'lista de direcciones separadas por coma. Con esto el '
                         'extraData de QBFT sale calculado y no hay que correr '
                         '`besu rlp encode` a mano.')
    ap.add_argument('--sin-shanghai', action='store_true',
                    help='deja la cadena en London, sin PUSH0. Solo para '
                         'reproducir el genesis viejo: ver la nota en el codigo.')
    ap.add_argument('--fuentes', nargs='*', default=[],
                    help='los estados de los que salio este, para comprobar que el '
                         'recuento de huerfanas no bajo sin haberlas resuelto')
    a = ap.parse_args()

    comprobar_extra_data()

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

    if a.chain_id == 5550 and not a.validadores:
        print('ABORTADO: la 5550 se construye con --validadores. Un genesis con '
              'el extraData de relleno no arranca, y descubrirlo la noche del '
              'corte cuesta media hora que no hay.', file=sys.stderr)
        sys.exit(2)
    if a.chain_id == 5550 and a.sin_shanghai:
        print('ABORTADO: --sin-shanghai deja la 5550 sin PUSH0, y solc >= 0.8.20 '
              'lo emite por omision: no compilaria nada moderno.', file=sys.stderr)
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

    # ---- consolidacion del ORIGEN nativo ----------------------------------
    # Decidido el 11-ago-2026: cada billetera de persona lleva exactamente un
    # ORIGEN --alcanza para unas 210 transferencias a 93 gwei, asi que nadie
    # queda sin poder pagar el gas-- y el resto se junta en una sola direccion.
    #
    # Los contratos son la excepcion y conservan su saldo, porque no son
    # billeteras: el ORIGEN que guarda Wrapped Origen es el respaldo de los
    # tokens envueltos que la gente tiene afuera, y vaciarlo lo dejaria
    # insolvente. Lo mismo con la liquidez de los pools.
    if a.consolidar_origen:
        destino = a.consolidar_origen.lower()
        if destino not in alloc:
            print('ABORTADO: la direccion de consolidacion %s no esta en el genesis.'
                  % destino, file=sys.stderr)
            sys.exit(2)
        UNO = 10 ** 18
        preservar = {x.lower() for x in a.preservar}
        faltantes = preservar - set(alloc)
        if faltantes:
            print('ABORTADO: estas direcciones a preservar no estan en el genesis: %s'
                  % ', '.join(sorted(faltantes)), file=sys.stderr)
            sys.exit(2)
        antes = sum(int(v['balance'], 16) for v in alloc.values())
        piso = a.origen_por_billetera * UNO
        personas = quitado = 0
        rellenadas = []
        for d, fila in alloc.items():
            if d == destino or 'code' in fila or d in preservar:
                continue
            tenia = int(fila['balance'], 16)
            fila['balance'] = hex(piso)
            quitado += tenia - piso
            if tenia < piso:
                rellenadas.append((d, tenia))
            personas += 1

        # La consolidacion no solo baja saldos: a quien tenia MENOS del piso se
        # lo sube, y ese ORIGEN sale de la billetera unica. La suma seguia
        # cuadrando --por eso el invariante de abajo no lo veia-- pero son
        # cuentas que reciben dinero que no tenian, y si fueran muchas o el
        # piso fuera alto, la billetera unica podia quedar en negativo y
        # hex() de un numero negativo produce un genesis que Besu no lee.
        # Se dice en voz alta y se comprueba.
        if rellenadas:
            print('   billeteras que RECIBEN para llegar al piso: %d  (%.6f ORIGEN '
                  'en total, sale de la billetera unica)'
                  % (len(rellenadas), sum(piso - t for _, t in rellenadas) / UNO))
            for d, t in sorted(rellenadas, key=lambda x: x[1])[:5]:
                print('      %s  tenia %.6f' % (d, t / UNO))
            if len(rellenadas) > 5:
                print('      … y %d mas' % (len(rellenadas) - 5))
        if int(alloc[destino]['balance'], 16) + quitado < 0:
            print('ABORTADO: rellenar hasta el piso de %d ORIGEN deja la billetera '
                  'de consolidacion en negativo. Bajar --origen-por-billetera.'
                  % a.origen_por_billetera, file=sys.stderr)
            sys.exit(2)
        alloc[destino]['balance'] = hex(int(alloc[destino]['balance'], 16) + quitado)
        despues = sum(int(v['balance'], 16) for v in alloc.values())
        # La emision no se crea ni se destruye: si esto no cuadra, algo se perdio
        # por el camino y no se publica una cadena con la emision cambiada.
        if antes != despues:
            print('ABORTADO: la emision cambio en la consolidacion: %d -> %d'
                  % (antes, despues), file=sys.stderr)
            sys.exit(2)
        print('consolidacion del ORIGEN:')
        print('   billeteras de persona con %d ORIGEN : %d' % (a.origen_por_billetera, personas))
        print('   contratos que conservan su saldo    : %d'
              % sum(1 for f in alloc.values() if 'code' in f and int(f['balance'], 16) > 0))
        print('   billeteras preservadas              : %d  (%.4f ORIGEN)'
              % (len(preservar), sum(int(alloc[d]['balance'], 16) for d in preservar) / UNO))
        print('   a la billetera unica                : %.6f'
              % (int(alloc[destino]['balance'], 16) / UNO))
        print('   emision antes y despues             : %.6f  (cuadra)' % (antes / UNO))

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

    cfg = {
        'chainId': a.chain_id,
        'homesteadBlock': 0, 'eip150Block': 0, 'eip155Block': 0, 'eip158Block': 0,
        'byzantiumBlock': 0, 'constantinopleBlock': 0, 'petersburgBlock': 0,
        'istanbulBlock': 0, 'berlinBlock': 0, 'londonBlock': 0,
        'zeroBaseFee': True,
        'qbft': {'blockperiodseconds': a.periodo, 'epochlength': 30000,
                 'requesttimeoutseconds': max(4, a.periodo * 2)},
    }
    # SHANGHAI, o por que una cadena que nace en 2026 no puede quedarse en London.
    #
    # El genesis anterior llegaba hasta London. London no tiene PUSH0, que es
    # de Shanghai. Y solc, desde la 0.8.20, EMITE PUSH0 por omision. Es decir:
    # cualquiera que compile un contrato hoy con la configuracion de fabrica
    # obtiene bytecode que esta cadena rechaza.
    #
    # No es una suposicion. Medido el 12-ago-2026 contra las dos cadenas, con
    # eth_call de un codigo que solo hace PUSH0:
    #   5534  -> "Invalid opcode: 0x5f"
    #   8532  -> "opcode not found"
    # y el mismo codigo con PUSH1 pasa en las dos. Heredar eso a la 5550 seria
    # estrenar en 2026 una cadena donde no compila nada moderno.
    #
    # Va a 0 --activo desde el bloque cero-- porque en una cadena que nace no
    # hay historia que respetar. Cancun queda fuera a proposito: trae mas
    # superficie (blobs, TSTORE) y no resuelve ningun problema que tengamos.
    if not a.sin_shanghai:
        cfg['shanghaiTime'] = 0

    if a.validadores:
        if a.validadores.endswith('.json'):
            v = json.load(open(a.validadores))
            lista = list(v.values()) if isinstance(v, dict) else list(v)
        else:
            lista = [x.strip() for x in a.validadores.split(',') if x.strip()]
        if len(lista) < 4:
            print('ABORTADO: %d validadores. QBFT tolera un caido con cuatro; '
                  'con tres, cualquier reinicio para la cadena.' % len(lista),
                  file=sys.stderr)
            sys.exit(2)
        extra = extra_data_qbft(lista)
        print('\nextraData de QBFT calculado para %d validadores:' % len(lista))
        for d in sorted(x.lower() for x in lista):
            print('   ' + d)
    else:
        extra = ('PENDIENTE: correr de nuevo con --validadores validadores-%d.json'
                 % a.chain_id)

    genesis = {
        'config': cfg,
        'nonce': '0x0', 'timestamp': '0x0',
        'gasLimit': '0x989680', 'difficulty': '0x1',
        'coinbase': '0x0000000000000000000000000000000000000000',
        'mixHash': '0x63746963616c2062797a616e74696e65206661756c7420746f6c6572616e6365',
        'extraData': extra,
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
