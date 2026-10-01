#!/usr/bin/env python3
# Quién tiene qué en la red 5550, separado entre cuentas de Veta Wallet y «los demás».
#
# PARA QUÉ
#
# La v2 de las monedas se acuña solo con los saldos de las cuentas de Veta
# Wallet; lo que está en tesorería o en cualquier otra dirección no pasa. Antes
# del corte hay que saber exactamente qué queda fuera, dirección por dirección.
# Este script lo calcula. Es de solo lectura: no firma ni envía nada.
#
# DE DÓNDE SACA LAS DIRECCIONES
#
#   · los eventos Transfer de los tokens en la 5550, desde el génesis;
#   · las direcciones que aparecen en transacciones nativas (ORIGEN) en la 5550;
#   · las del inventario de la cadena 8532, si se pasa con --inventario
#     (el génesis copió el estado, no los eventos: sin el inventario, los
#     tenedores que no se han movido desde agosto no aparecen);
#   · las de Veta Wallet y las internas, si se pasan.
#
# La comprobación de cierre es la de siempre: la suma de los saldos de las
# direcciones encontradas tiene que igualar el supply. Lo que falta se informa
# como «sin ubicar», nunca se reparte ni se supone.
#
# USO
#
#   python3 tenedores.py                                   # solo datos públicos
#   python3 tenedores.py --veta veta.json --internas internas.json \
#           --inventario inventario-8532.json --bloque 312000
#
# veta.json e internas.json: lista JSON de direcciones (ver direcciones-veta.js).
# No subir esos archivos al repositorio.

import argparse, json, os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

RPC = os.environ.get('OG_RPC', 'https://rpc.ordenglobal-rpc.com/')
TRAMO = 1000          # límite de eth_getLogs del nodo
LOTE = 20             # el nodo rechaza lotes de 25 o más
TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
ORIGEN_SUPPLY = 10**12 * 10**18   # supply fijo declarado (SFSP §10.1)

CATALOGO = {
  'AUKA':    '0x6facc8df79cedc6c5065442ce27e915aa3a26b9b',
  'AGKA':    '0x961f798f998c7ff44d47d62c7fa1b572ef187a4b',
  'ONDK':    '0xfb83eea4b384a4b18e5a1eba7a4bb4c0b7ca19c1',
  'HARV':    '0x0fa04d11f28b28cbc9b98dd016f02023addb1923',
  'IBS':     '0x7af11d3e94a174f6fc290a5b7791a6dee2718e62',   # canónico por confirmar
  'MONARKA': '0x18b6680cff71c11067bec312fc48786be2e54ead',
  'AMOR':    '0x638f2ba0e3e1083d1ba570b449bd266f3860d164',
}
# Direcciones de sistema conocidas (del inventario de la migración de cadena).
CONOCIDAS = {
  '0xf777de573e67e78ececd2afe19dd18dd046fd4d0': 'validador (Edge)',
  '0xa07a2ba9735568b989378bbb3b1439ee9c5e5714': 'desplegador',
  '0x697bc55e4c184f4c1f3e1e55d8a4090a66a61aa0': 'sistema',
  '0x8979d32c407e22073e258d27adc15b78afc91781': 'sistema',
}
CERO = '0x' + '0' * 40


def rpc(cuerpo, intentos=6):
    for i in range(intentos):
        try:
            req = urllib.request.Request(RPC, data=json.dumps(cuerpo).encode(),
                                         headers={'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.load(r)
        except Exception:
            time.sleep(1.5 * (i + 1))
    raise RuntimeError('el nodo no respondió')


def uno(metodo, params):
    j = rpc({'jsonrpc': '2.0', 'id': 1, 'method': metodo, 'params': params})
    if 'error' in j:
        raise RuntimeError(f'{metodo}: {j["error"]}')
    return j['result']


def lote(llamadas):
    """[(metodo, params)] -> [resultado | None], de a LOTE por petición."""
    salida = []
    for i in range(0, len(llamadas), LOTE):
        trozo = llamadas[i:i + LOTE]
        j = rpc([{'jsonrpc': '2.0', 'id': k, 'method': m, 'params': p} for k, (m, p) in enumerate(trozo)])
        if not isinstance(j, list):
            raise RuntimeError(f'lote rechazado: {str(j)[:200]}')
        por_id = {x.get('id'): x for x in j}
        salida += [por_id.get(k, {}).get('result') for k in range(len(trozo))]
    return salida


def direcciones_de_eventos(hasta):
    vistas = set()
    for desde in range(0, hasta + 1, TRAMO):
        logs = uno('eth_getLogs', [{'fromBlock': hex(desde), 'toBlock': hex(min(desde + TRAMO - 1, hasta)),
                                    'topics': [TRANSFER]}])
        for l in logs:
            if len(l['topics']) >= 3:
                vistas.add('0x' + l['topics'][1][-40:])
                vistas.add('0x' + l['topics'][2][-40:])
    return vistas


def direcciones_nativas(hasta, hilos=4):
    """Remitentes y destinatarios de toda transacción de la 5550."""
    def tramo(desde):
        bloques = lote([('eth_getBlockByNumber', [hex(b), True])
                        for b in range(desde, min(desde + 200, hasta + 1))])
        vistas = set()
        for b in bloques:
            for tx in (b or {}).get('transactions', []):
                vistas.add(tx['from'].lower())
                if tx.get('to'):
                    vistas.add(tx['to'].lower())
        return vistas
    vistas = set()
    with ThreadPoolExecutor(hilos) as ex:
        for i, v in enumerate(ex.map(tramo, range(0, hasta + 1, 200))):
            vistas |= v
            if i % 100 == 0:
                print(f'  · bloques {i * 200:,} de {hasta:,}', file=sys.stderr)
    return vistas


def leer_lista(ruta):
    if not ruta:
        return set()
    datos = json.load(open(ruta))
    if isinstance(datos, dict):
        datos = datos.get('direcciones') or list(datos.keys())
    return {d.lower() for d in datos if isinstance(d, str) and d.startswith('0x')}


def leer_inventario(ruta):
    if not ruta:
        return set()
    inv = json.load(open(ruta))
    vistas = set()
    for clave in ('cuentas', 'direcciones', 'tenedores', 'saldos'):
        bloque = inv.get(clave)
        if isinstance(bloque, dict):
            for v in bloque.values():
                vistas |= set(v.keys()) if isinstance(v, dict) else set()
            vistas |= {k for k in bloque.keys() if k.startswith('0x')}
        elif isinstance(bloque, list):
            vistas |= {x for x in bloque if isinstance(x, str)}
    return {d.lower() for d in vistas if d.startswith('0x') and len(d) == 42}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--veta'); ap.add_argument('--internas'); ap.add_argument('--inventario')
    ap.add_argument('--bloque', type=int, help='bloque de la foto (por defecto, el último)')
    ap.add_argument('--salida', default='tenedores-5550.json')
    ap.add_argument('--sin-nativas', action='store_true', help='no barrer transacciones (más rápido)')
    a = ap.parse_args()

    bloque = a.bloque or int(uno('eth_blockNumber', []), 16)
    etiqueta = hex(bloque)
    veta, internas = leer_lista(a.veta), leer_lista(a.internas)
    print(f'Foto en el bloque {bloque:,}', file=sys.stderr)

    candidatas = set(CONOCIDAS) | veta | internas | leer_inventario(a.inventario)
    print('Barriendo eventos de tokens…', file=sys.stderr)
    candidatas |= direcciones_de_eventos(bloque)
    if not a.sin_nativas:
        print('Barriendo transacciones nativas…', file=sys.stderr)
        candidatas |= direcciones_nativas(bloque)
    candidatas.discard(CERO)
    candidatas = sorted(candidatas)
    print(f'{len(candidatas)} direcciones candidatas', file=sys.stderr)

    def clase(d):
        if d in veta: return 'veta'
        if d in internas: return 'interna'
        if d in CONOCIDAS: return 'sistema'
        return 'otra'

    activos = {'ORIGEN': None, **CATALOGO}
    informe = {'bloque': bloque, 'rpc': RPC, 'fuentes': {
        'veta': len(veta), 'internas': len(internas), 'inventario': bool(a.inventario),
        'nativas': not a.sin_nativas}, 'activos': {}}

    for nombre, contrato in activos.items():
        if contrato:
            supply = int(uno('eth_call', [{'to': contrato, 'data': '0x18160ddd'}, etiqueta]), 16)
            res = lote([('eth_call', [{'to': contrato, 'data': '0x70a08231' + d[2:].rjust(64, '0')}, etiqueta])
                        for d in candidatas])
        else:
            supply = ORIGEN_SUPPLY
            res = lote([('eth_getBalance', [d, etiqueta]) for d in candidatas])
        saldos = {d: int(r, 16) for d, r in zip(candidatas, res) if r and int(r, 16) > 0}
        sumas = {'veta': 0, 'interna': 0, 'sistema': 0, 'otra': 0}
        for d, s in saldos.items():
            sumas[clase(d)] += s
        ubicado = sum(sumas.values())
        informe['activos'][nombre] = {
            'contrato': contrato, 'supply': str(supply),
            'veta': str(sumas['veta']), 'internas': str(sumas['interna']),
            'sistema': str(sumas['sistema']), 'otras': str(sumas['otra']),
            'sin_ubicar': str(supply - ubicado),
            'tenedores': {d: {'saldo': str(s), 'clase': clase(d)}
                          for d, s in sorted(saldos.items(), key=lambda x: -x[1])},
        }

    json.dump(informe, open(a.salida, 'w'), indent=1)

    f = lambda x: f'{int(x) / 1e18:,.2f}'
    print(f'\n{"ACTIVO":9} {"SUPPLY":>22} {"VETA WALLET":>20} {"INTERNAS":>20} {"OTRAS+SIST.":>20} {"SIN UBICAR":>22}')
    for n, d in informe['activos'].items():
        print(f'{n:9} {f(d["supply"]):>22} {f(d["veta"]):>20} {f(d["internas"]):>20} '
              f'{f(int(d["otras"]) + int(d["sistema"])):>20} {f(d["sin_ubicar"]):>22}')
    print(f'\nDetalle por dirección en {a.salida}')


if __name__ == '__main__':
    main()
