#!/usr/bin/env python3
# Cierra las ranuras que faltan, por punto fijo.
#
# POR QUE HIZO FALTA ESTO
#
# Trazar sobre una cadena con el almacenamiento vacio descubre poco: la
# ejecucion se desvia enseguida. Un `transfer` lee saldo cero y revierte antes
# de llegar a calcular la ranura del destinatario; un `mint` falla en la
# comprobacion de dueño. La maquina virtual dice la verdad, pero sobre un
# estado que no es el nuestro, asi que las ranuras que revela son las de otra
# historia.
#
# LA SALIDA: REALIMENTAR
#
# Del volcado ya sabemos leer 1.225 de 1.385 ranuras. Si se le dan ESAS al
# banco, la ejecucion llega mas lejos y descubre ranuras nuevas. Cada ranura
# nueva se busca en el volcado —su huella es keccak(ranura), y el valor ya lo
# teniamos— y se suma al estado del banco. Se repite hasta que una vuelta no
# aporta nada.
#
# Converge porque cada vuelta desbloquea un tramo mas profundo de ejecucion, y
# termina sola: o no aparecen ranuras nuevas, o no quedan huerfanas.
#
# LO QUE NO HACE, A PROPOSITO
#
# No inventa valores. Una ranura descubierta solo se acepta si su huella esta
# en el volcado; si no esta, es una ranura que la cadena vieja no tiene y no
# pinta nada en el genesis.

import json, os, subprocess, sys, time, urllib.request
from Crypto.Hash import keccak as _K

BANCO = os.environ.get('OG_BANCO', 'http://127.0.0.1:8546')
VIEJA = os.environ.get('OG_RPC', 'https://rpc.ordenglobal-rpc.com/')

def keccak(b):
    k = _K.new(digest_bits=256); k.update(b); return '0x' + k.hexdigest()

def rpc(url, m, p, intentos=3):
    for i in range(intentos):
        try:
            b = json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode()
            return json.load(urllib.request.urlopen(
                urllib.request.Request(url, b, {'Content-Type': 'application/json'}), timeout=30)).get('result')
        except Exception:
            if i == intentos - 1: return None
            time.sleep(1.0)

def ranura_de(clave):
    """Misma conversion que el constructor del genesis: etiqueta -> ranura."""
    def kc(b):
        k = _K.new(digest_bits=256); k.update(b); return k.digest()
    def pad(x):
        if isinstance(x, str): return bytes.fromhex(x[2:].rjust(64, '0'))
        return (int(x) % (1 << 256)).to_bytes(32, 'big')
    t = clave[0]
    if t == 'fija': return pad(clave[1])
    if t in ('mapa', 'mapa-num', 'posicion'):
        base = kc(pad(clave[1]) + pad(clave[2]))
        return ((int.from_bytes(base, 'big') + clave[3]) % (1 << 256)).to_bytes(32, 'big')
    if t == 'anidado':
        return kc(pad(clave[2]) + kc(pad(clave[1]) + pad(clave[3])))
    if t == 'arreglo':
        base = int.from_bytes(kc(pad(clave[1])), 'big')
        return ((base + clave[2]) % (1 << 256)).to_bytes(32, 'big')
    if t == 'rol':
        interno = kc(pad(clave[1]) + pad(clave[3]))
        return ((int.from_bytes(kc(pad(clave[2]) + interno), 'big') + clave[4]) % (1 << 256)).to_bytes(32, 'big')
    raise ValueError('etiqueta desconocida: %r' % (clave,))

def escribir_genesis(estado, conocidas, ruta, plantilla, chain_id):
    """El genesis del banco: codigo de todos, y las ranuras que ya sabemos leer."""
    alloc = {}
    for c in estado['cuentas']:
        d = c.get('direccion')
        if not d or not c.get('codigo'): continue
        fila = {'balance': hex(int(c['saldo'])), 'nonce': hex(c['nonce']), 'code': c['codigo']}
        s = conocidas.get(d) or {}
        if s: fila['storage'] = dict(s)
        alloc[d] = fila
    g = json.load(open(plantilla))
    g['config']['chainId'] = chain_id
    g['alloc'] = alloc
    json.dump(g, open(ruta, 'w'), indent=1)
    return len(alloc), sum(len(v) for v in conocidas.values())

def arrancar(script, log):
    # El patron tiene que apuntar al PROCESO DE BESU y a nada mas. Con
    # `pkill -f genesis-banco` este mismo script se suicidaba: su propia linea
    # de comandos lleva la ruta del genesis como argumento, asi que coincidia
    # consigo mismo y el bucle moria en la primera vuelta sin decir nada.
    subprocess.run(['pkill', '-f', 'data-path=/opt/banco/nodo'], capture_output=True)
    time.sleep(3)
    # Cada vuelta lleva un génesis distinto, y Besu se niega a arrancar sobre
    # datos escritos con otro. Se borra la base y se conserva la llave del nodo:
    # sin esto la vuelta 2 arranca con el génesis de la 1 y todo el bucle miente
    # en silencio, que es la peor forma de fallar.
    import shutil
    for sub in ('database', 'caches'):
        shutil.rmtree(os.path.join(os.path.dirname(script), 'nodo', sub), ignore_errors=True)
    subprocess.Popen(['nohup', script], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(40):
        time.sleep(3)
        if rpc(BANCO, 'eth_blockNumber', []): return True
    return False

def trazar(c, datos, desde=None):
    ll = {"to": c, "data": datos}
    if desde: ll["from"] = desde
    r = rpc(BANCO, 'debug_traceCall', [ll, "latest",
            {"disableStorage": False, "disableMemory": True, "disableStack": False}])
    if not isinstance(r, dict): return []
    out = []
    for l in r.get('structLogs') or []:
        if l.get('op') in ('SLOAD', 'SSTORE') and l.get('stack'):
            v = l['stack'][-1]
            out.append(bytes.fromhex((v[2:] if v.startswith('0x') else v).rjust(64, '0')))
    return out

def main():
    estado = json.load(open(sys.argv[1]))
    txs = json.load(open(sys.argv[2]))
    plantilla = sys.argv[3]
    ruta_gen = sys.argv[4]
    script = sys.argv[5]
    vueltas = int(os.environ.get('OG_VUELTAS', '6'))

    # huella -> valor, y lo que ya sabemos colocar
    valor, pendiente, conocidas = {}, {}, {}
    for c in estado['cuentas']:
        d = c.get('direccion')
        if not d: continue
        alm = c.get('almacen') or {}
        claves = c.get('claves') or {}
        for h, v in alm.items(): valor[(d, h)] = v
        conocidas[d] = {}
        for h, etq in claves.items():
            r = ranura_de(tuple(etq))
            conocidas[d]['0x' + r.hex()] = alm[h]
        f = set(alm) - set(claves)
        if f: pendiente[d] = f

    porContrato = {}
    for t in txs: porContrato.setdefault(t['to'].lower(), []).append(t)

    print(f'pendientes al empezar: {sum(len(v) for v in pendiente.values())} '
          f'en {len(pendiente)} contratos', flush=True)

    for vuelta in range(1, vueltas + 1):
        n, r = escribir_genesis(estado, conocidas, ruta_gen, plantilla, 55331)
        if not arrancar(script, None):
            print('el banco no arranco', file=sys.stderr); sys.exit(1)
        print(f'\n— vuelta {vuelta} — banco con {n} contratos y {r} ranuras sembradas', flush=True)
        nuevas = 0
        for c, falta in sorted(pendiente.items(), key=lambda x: -len(x[1])):
            if not falta: continue
            for t in porContrato.get(c, []):
                if not falta: break
                ent = t.get('input') or '0x'
                if len(ent) < 10: continue
                for ranura in trazar(c, ent, t.get('from')):
                    h = keccak(ranura)
                    if h in falta:
                        conocidas[c]['0x' + ranura.hex()] = valor[(c, h)]
                        falta.discard(h); nuevas += 1
            print(f'   {c}: quedan {len(falta)}', flush=True)
        print(f'   vuelta {vuelta}: +{nuevas} ranuras · quedan '
              f'{sum(len(v) for v in pendiente.values())}', flush=True)
        if nuevas == 0: break

    json.dump({c: s for c, s in conocidas.items() if s}, open('ranuras-cerradas.json', 'w'), indent=1)
    quedan = sum(len(v) for v in pendiente.values())
    print(f'\nRESULTADO: quedan {quedan} ranuras sin identificar')
    sys.exit(0 if quedan == 0 else 3)

if __name__ == '__main__':
    main()
