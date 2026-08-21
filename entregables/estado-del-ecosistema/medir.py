#!/usr/bin/env python3
"""Mide todo lo que aparece en el documento, y guarda con qué se midió.

Existe para que ninguna cifra del PDF pueda venir de la memoria de nadie. Si un
número no está en `datos.json`, no entra en el documento — y si esta medición
no corre, el documento muestra una raya en vez de inventarlo.
"""
import json, urllib.request, datetime, re, io, os

RPC = 'https://rpc.ordenglobal-rpc.com/'
AQUI = os.path.dirname(os.path.abspath(__file__))
CADENA_JS = os.path.join(AQUI, '..', '..', 'apps-web', 'veta-wallet', 'cadena.js')


def rpc(metodo, params=None):
    q = urllib.request.Request(RPC, method='POST',
        data=json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': metodo,
                         'params': params or []}).encode(),
        headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(q, timeout=25) as x:
        return json.load(x).get('result')


def main():
    alto = int(rpc('eth_blockNumber'), 16)
    # El bloque 0 lleva fecha cero —un valor por defecto de polygon-edge, no un
    # dato— así que la red se fecha desde el bloque 1.
    b1 = int(rpc('eth_getBlockByNumber', ['0x1', False])['timestamp'], 16)
    bu = int(rpc('eth_getBlockByNumber', [hex(alto), False])['timestamp'], 16)

    # El turno REAL de los últimos 60 bloques: es lo que dibuja el pulso de la
    # página 3, y tiene que ser quién firmó cada uno, no una secuencia que
    # parezca variada.
    turno = []
    for i in range(alto - 59, alto + 1):
        b = rpc('eth_getBlockByNumber', [hex(i), False])
        if b:
            turno.append(b['miner'])

    segundos = bu - b1
    d = {
        'medidoEn': datetime.datetime.now(datetime.timezone.utc).strftime('%d/%m/%Y %H:%M UTC'),
        'cadena': int(rpc('eth_chainId'), 16),
        'bloque': alto,
        'pares': int(rpc('net_peerCount'), 16),
        'desde': datetime.datetime.fromtimestamp(b1, datetime.timezone.utc).strftime('%d/%m/%Y'),
        'dias': round(segundos / 86400, 1),
        'segundosPorBloque': round(segundos / alto, 1),
        'validadores': len(set(turno)),
        'ritmo': round(alto / (segundos / 10) * 100, 1),
        'turno': turno,
        'fuenteCadena': 'eth_blockNumber · eth_getBlockByNumber · net_peerCount en ' + RPC,
    }

    # Los tokens se cuentan de la tabla que usa la aplicación y se comprueba
    # uno por uno contra su contrato: «quince activos» no vale si tres no
    # responden.
    s = io.open(CADENA_JS, encoding='utf-8').read()
    ini = s.index('  const TOKENS = [')
    bloque = s[ini:s.index('  ];', ini)]
    toks = re.findall(r"\{ s: '([A-Z]+)'(?:, contrato: '(0x[0-9a-fA-F]{40})')?.*?publico: (true|false)", bloque)
    vivos = 0
    for _, contrato, _p in toks:
        if not contrato:
            vivos += 1          # el nativo de la red no es un contrato
            continue
        r = rpc('eth_call', [{'to': contrato, 'data': '0x18160ddd'}, 'latest'])
        if r and r != '0x':
            vivos += 1
    d.update({'tokens': len(toks), 'tokensPublicos': sum(1 for t in toks if t[2] == 'true'),
              'tokensVivos': vivos, 'fuenteTokens': 'totalSupply() de cada contrato'})

    with urllib.request.urlopen('https://genesis-id.onrender.com/healthz', timeout=30) as x:
        g = json.load(x)['comprobaciones']
    d.update({'gidBitacora': g['bitacoraEntradas'], 'gidIntegra': g['bitacoraIntegra'],
              'gidBiometria': g['proveedorBiometria'], 'gidCadena': g['cadenaQueContesta'],
              'fuenteGid': 'genesis-id.onrender.com/healthz'})

    json.dump(d, open(os.path.join(AQUI, 'datos.json'), 'w'), ensure_ascii=False, indent=2)
    for k, v in d.items():
        if k != 'turno':
            print(f'  {k}: {v}')
    print(f'  turno: {len(turno)} bloques, {len(set(turno))} firmantes distintos')


if __name__ == '__main__':
    main()
