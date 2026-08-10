#!/usr/bin/env python3
# Descubre ranuras de almacenamiento haciendo que las calcule la maquina virtual.
#
# EL PROBLEMA QUE RESUELVE
#
# El arbol de estado guarda keccak(ranura), no la ranura. Para los contratos
# corrientes basta con generar candidatos —campos sueltos, mapas con clave de
# direccion— y ver cual encaja. Pero eso se agota: un contrato desconocido puede
# guardar su estado de cualquier forma, y adivinar deja de rendir.
#
# LA IDEA
#
# No hace falta adivinar como calcula el contrato sus ranuras: se le pide que lo
# haga. Besu expone debug_traceCall, que devuelve cada SLOAD con la ranura que
# fue a buscar. Se llama a una funcion y la traza dice, sin ambiguedad, que
# ranura toco.
#
# Y lo que lo vuelve general: la ranura depende del CODIGO y del ARGUMENTO, no
# de lo que haya guardado. Asi que basta con levantar una cadena de usar y tirar
# con el codigo de esos contratos —sin su estado, que es justamente lo que no
# tenemos— y trazar. Cada ranura que sale se convierte en keccak(ranura) y se
# compara con las huellas del volcado que aun no sabemos leer.
#
# NO SE ADIVINAN NI LAS FUNCIONES
#
# Los selectores estan en el despachador del propio bytecode, empujados con
# PUSH4. Se extraen de ahi, asi que tampoco hace falta el ABI. Un selector mal
# leido no hace dano: la llamada revierte enseguida y no produce SLOAD.

import json, os, sys, time, urllib.request
from Crypto.Hash import keccak as _K

VIEJA = os.environ.get('OG_RPC', 'https://rpc.ordenglobal-rpc.com/')
BANCO = os.environ.get('OG_BANCO', 'http://127.0.0.1:8546')

def keccak(b: bytes) -> str:
    k = _K.new(digest_bits=256); k.update(b); return '0x' + k.hexdigest()

def rpc(url, m, p, intentos=3):
    for i in range(intentos):
        try:
            b = json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode()
            r = json.load(urllib.request.urlopen(
                urllib.request.Request(url, b, {'Content-Type': 'application/json'}), timeout=30))
            return r.get('result')
        except Exception:
            if i == intentos - 1: return None
            time.sleep(1.0)

def selectores(codigo_hex: str):
    """Los selectores que el despachador compara, leidos del bytecode.

    Se recorre buscando PUSH4 (0x63). Hay que saltar el cuerpo de cada PUSH,
    porque si no un dato cualquiera de 32 bytes se lee como si fuera codigo y
    salen selectores fantasma.
    """
    b = bytes.fromhex(codigo_hex[2:]) if codigo_hex.startswith('0x') else bytes.fromhex(codigo_hex)
    out, i = [], 0
    while i < len(b):
        op = b[i]
        if op == 0x63 and i + 5 <= len(b):
            out.append('0x' + b[i+1:i+5].hex())
        if 0x60 <= op <= 0x7f:          # PUSH1..PUSH32: saltar su cuerpo
            i += 1 + (op - 0x5f)
        else:
            i += 1
    # se conserva el orden de aparicion, sin repetidos
    vistos, orden = set(), []
    for s in out:
        if s not in vistos:
            vistos.add(s); orden.append(s)
    return orden

def trazar(destino, datos):
    r = rpc(BANCO, 'debug_traceCall',
            [{"to": destino, "data": datos}, "latest",
             {"disableStorage": False, "disableMemory": True, "disableStack": False}])
    if not isinstance(r, dict): return []
    ranuras = []
    for l in r.get('structLogs') or []:
        if l.get('op') == 'SLOAD' and l.get('stack'):
            v = l['stack'][-1]
            ranuras.append(bytes.fromhex(v[2:].rjust(64, '0')) if v.startswith('0x')
                           else bytes.fromhex(v.rjust(64, '0')))
    return ranuras

def arg32(x):
    if isinstance(x, str):
        return bytes.fromhex(x[2:].rjust(64, '0'))
    return (int(x) % (1 << 256)).to_bytes(32, 'big')

def main():
    if len(sys.argv) < 3:
        print('uso: trazar-ranuras.py <estado.json> <candidatos.json> [salida.json]', file=sys.stderr)
        sys.exit(2)
    est = json.load(open(sys.argv[1]))
    cand = json.load(open(sys.argv[2]))
    salida = sys.argv[3] if len(sys.argv) > 3 else 'ranuras-trazadas.json'

    # Lo que aun no sabemos leer, por contrato.
    pendientes = {}
    for c in est['cuentas']:
        d = c.get('direccion')
        alm = c.get('almacen') or {}
        claves = c.get('claves') or {}
        falta = set(alm) - set(claves)
        if d and falta:
            pendientes[d] = falta
    print(f'contratos con ranuras pendientes: {len(pendientes)}', flush=True)

    args = [arg32(x) for x in cand.get('direcciones', [])[:400]]
    args += [arg32(int(x)) for x in cand.get('numericas', [])]
    args += [arg32(x) for x in cand.get('clavesBytes32', [])]
    args = [b''] + args            # primero sin argumento: campos sueltos
    print(f'argumentos a probar por selector: {len(args)}', flush=True)

    hallado = {}
    total_pendiente = sum(len(v) for v in pendientes.values())

    for n, (c, falta) in enumerate(sorted(pendientes.items(), key=lambda x: -len(x[1]))):
        codigo = rpc(VIEJA, 'eth_getCode', [c, 'latest'])
        if not codigo or codigo == '0x':
            continue
        sels = selectores(codigo)
        encontrados = {}
        for sel in sels:
            if not falta - set(encontrados): break
            for a in args:
                r = trazar(c, sel + a.hex())
                for ranura in r:
                    h = keccak(ranura)
                    if h in falta and h not in encontrados:
                        encontrados[h] = '0x' + ranura.hex()
                if not falta - set(encontrados): break
        if encontrados:
            hallado[c] = encontrados
        print(f'  [{n+1}/{len(pendientes)}] {c}: {len(encontrados)} de {len(falta)} '
              f'· {len(sels)} selectores', flush=True)

    json.dump(hallado, open(salida, 'w'), indent=1)
    resueltas = sum(len(v) for v in hallado.values())
    print(f'\nRESULTADO: {resueltas} de {total_pendiente} ranuras pendientes, resueltas por traza')
    print(f'escrito {salida}')

if __name__ == '__main__':
    main()
