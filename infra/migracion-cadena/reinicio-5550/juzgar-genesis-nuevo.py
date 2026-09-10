#!/usr/bin/env python3
"""Juzga el genesis nuevo contra la foto del estado. No lo construye: lo audita.

    python3 juzgar-genesis-nuevo.py genesis-nuevo.json foto-estado-5550.json \\
            genesis-al-corte.json ranuras-tokens.json

Esta escrito aparte del constructor a proposito. Un guion que construye y se
aprueba a si mismo no comprueba nada: repite su propio error con las mismas
cuentas. Este parte de la foto y del genesis viejo, y no mira el constructor.

Doce comprobaciones. Si una falla, el genesis no se despliega.
"""
import json
import sys

UNO = 10 ** 18
TESORO = '0x3d5510e5081822877d14cd51b356bf01df2c32c9'
WRAPPER = '0xccbe0c6690bf61d1f23f95f3998e4ba0d7b89f75'
PRESERVADAS = ['0x3011f7f9d263d7f73a1ac2130ac7afe426495718',
               '0x50219186545980b35912adc89550522e63667f74',
               '0xacc03b7fe0c658cb3872726d05da24d0554f44b8']
DOSCIENTOS_CINCUENTA_MIL_MILLONES = 250_000_000_000 * UNO
IDX_SALDOS = 3

fallos = []
avisos = []


def ent(x):
    if x is None:
        return 0
    if isinstance(x, str):
        return int(x, 16) if x.startswith('0x') else int(x)
    return int(x)


def comprobar(nombre, condicion, detalle=''):
    print(f'  [{"OK " if condicion else "MAL"}] {nombre}' + (f'  · {detalle}' if detalle else ''))
    if not condicion:
        fallos.append(nombre)


def ranura_saldo(direccion, idx=IDX_SALDOS):
    from Crypto.Hash import keccak
    h = keccak.new(digest_bits=256)
    h.update(bytes.fromhex(direccion[2:].rjust(64, '0')) + idx.to_bytes(32, 'big'))
    return '0x' + h.hexdigest()


nuevo = json.load(open(sys.argv[1]))
foto = json.load(open(sys.argv[2]))
viejo = json.load(open(sys.argv[3]))
rtok = json.load(open(sys.argv[4]))

na = {a.lower(): v for a, v in nuevo['alloc'].items()}
va = {a.lower(): v for a, v in viejo['alloc'].items()}
cu = foto['cuentas']
ra = foto['ranuras']
sembradas = {a for a, v in va.items() if ent(v.get('balance')) == UNO}

print(f'\nJUEZ DEL GENESIS NUEVO · foto a la altura {foto["altura"]}\n')

# 1 · la suma total
antes = sum(ent(c.get('eth_getBalance')) for c in cu.values())
despues = sum(ent(v['balance']) for v in na.values())
comprobar('la suma total de ORIGEN es identica al ultimo wei', antes == despues,
          f'{antes/1e18:,.9f}  (diferencia {despues-antes} wei)')

# 2 · la emision no cambio
comprobar('la emision sigue siendo un billon', despues == 1_000_000_000_000 * UNO,
          f'{despues/1e18:,.9f}')

# 3 · las tres preservadas
for p in PRESERVADAS:
    comprobar(f'preservada {p[:12]}… intacta en 250.000 millones',
              ent(na.get(p, {}).get('balance')) == DOSCIENTOS_CINCUENTA_MIL_MILLONES,
              f'{ent(na.get(p,{}).get("balance"))/1e18:,.6f}')

# 4 · el wrapper, a cero por los dos lados
comprobar('el wrapper no tiene ORIGEN', ent(na[WRAPPER]['balance']) == 0)
tenedores = {p['tenedor'] for p in rtok} | set(cu)
sw = na[WRAPPER].get('storage', {})
vivas = [r for r in sw if r in {ranura_saldo(t) for t in tenedores}]
comprobar('el wrapper no tiene ningun saldo de WORIGEN', not vivas,
          f'{len(vivas)} ranuras de saldo vivas')

# 5 · el wrapper: TODA ranura que le quede tiene que estar identificada.
# Layout comprobado, no supuesto: 0 nombre, 1 simbolo, 2 decimales,
# 3 el mapa de saldos, 4 el mapa de permisos. No guarda totalSupply — es
# estilo WETH y lo calcula como su propio saldo, asi que vaciarlo lo deja
# emitido en cero. Los permisos que sobreviven son inertes: un permiso para
# gastar un token que ya nadie tiene no mueve nada.
FIJAS = {'0x' + format(i, '064x'): n for i, n in
         ((0, 'nombre'), (1, 'simbolo'), (2, 'decimales'))}
PERMISOS = {
    '0x008baae4f4748430ea5ecda48239f50a28f6da0d3aade95551643bc0fe3fecb1',
    '0x77853b230e9ac865c046799035a5d5c893eef7e7cb324d249dd386de8d761ac5',
    '0xbe6be1f1c61e4400283a23b5159a7998ba2a30d3db59f813bf69649240ee2d42',
    '0xe38f27aa8cce7ca1adce859184acdec2f2d693a493556e5a09225e76d14dbe57',
}
sin_explicar = [r for r in sw if r not in FIJAS and r not in PERMISOS]
comprobar('cada ranura que le queda al wrapper esta identificada', not sin_explicar,
          f'{len(sw)} ranuras: {len([r for r in sw if r in FIJAS])} fijas, '
          f'{len([r for r in sw if r in PERMISOS])} permisos, '
          f'{len(sin_explicar)} sin explicar')
comprobar('el wrapper conserva sus 18 decimales',
          ent(sw.get('0x' + format(2, '064x'), '0x0')) == 18)

# 6 · las 155 sembradas, en 1 exacto
mal = [a for a in sembradas if ent(na.get(a, {}).get('balance')) != UNO]
comprobar(f'las {len(sembradas)} billeteras sembradas tienen 1 ORIGEN exacto', not mal,
          f'{len(sembradas)-len(mal)} de {len(sembradas)}')

# 7 · nadie mas tiene ORIGEN
otros = [(a, ent(v['balance'])) for a, v in na.items()
         if ent(v['balance']) and a not in sembradas and a != TESORO and a not in PRESERVADAS]
comprobar('ninguna otra cuenta conserva ORIGEN', not otros,
          '; '.join(f'{a[:12]}…={b/1e18:,.6f}' for a, b in otros[:4]) or 'ninguna')

# 8 · la cuenta del tesoro
suma_otros = sum(ent(v['balance']) for a, v in na.items() if a != TESORO)
comprobar('el tesoro recibe exactamente lo que falta para el billon',
          ent(na[TESORO]['balance']) + suma_otros == 1_000_000_000_000 * UNO,
          f'tesoro = {ent(na[TESORO]["balance"])/1e18:,.9f}')

# 9 · el codigo de cada contrato, intacto
malcod = [a for a, c in cu.items()
          if (c.get('eth_getCode') or '0x') != (na.get(a, {}).get('code', '0x') or '0x')]
comprobar('el codigo de los contratos no cambio', not malcod, f'{len(malcod)} distintos')

# 10 · los saldos ERC-20, iguales a hoy salvo WORIGEN
malstor = []
for a, rs in ra.items():
    if a == WRAPPER:
        continue
    ns = na.get(a, {}).get('storage', {})
    for r, v in rs.items():
        if ent(v) != ent(ns.get(r, '0x0')):
            malstor.append((a, r))
for p in rtok:
    if p['token'] == WRAPPER:
        continue
    ns = na.get(p['token'], {}).get('storage', {})
    if ent(p.get('valor')) != ent(ns.get(p['ranura'], '0x0')):
        malstor.append((p['token'], p['ranura']))
comprobar('todos los saldos ERC-20 quedan como estan hoy (salvo WORIGEN)', not malstor,
          f'{len(malstor)} ranuras distintas')

# 11 · los nonces, como hoy
maln = [a for a, c in cu.items()
        if ent(c.get('eth_getTransactionCount')) != ent(na.get(a, {}).get('nonce', 0))]
comprobar('los nonces quedan como estan hoy', not maln, f'{len(maln)} distintos')

# 12 · la cabecera de la cadena
cfg_igual = nuevo.get('config') == viejo.get('config')
comprobar('chainId, gasLimit y la configuracion no cambiaron',
          cfg_igual and nuevo.get('gasLimit') == viejo.get('gasLimit'),
          f'chainId {nuevo.get("config",{}).get("chainId")}')

# 13 · el extraData tiene que listar a los SIETE que validan hoy.
# El genesis viejo solo nombra a cuatro: node1, node2 y node7 entraron por
# votacion QBFT el 20-ago, y esa votacion vive en la historia que el reinicio
# borra. Si el extraData no cambia, la cadena vuelve con cuatro validadores y
# aguanta una caida en vez de dos. Por eso aqui se exige lo contrario: que SI
# haya cambiado, y que liste exactamente los siete.
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
import extradata_qbft as ed
SIETE = sorted([
    '0x453493fcf778f133c51505cb81397f08850fc12e', '0x48ccec9a54b9357623458f26afadcd7412a6a833',
    '0x4c03eb38c7dc49eed7784c323089a4af2c698036', '0x65f987264bd77c3a094badfd88e4ba84c0b36382',
    '0x69e8a7b25586511a0c14430b45100e9439aae36c', '0xbc820391f2a8ae402d00ef8bf4d0ec09ea0caf2a',
    '0xc548464725d5fd4a15b882a221da67b9cfd29514'])
dn = ed.decodificar(nuevo['extraData'])
comprobar('el extraData lista exactamente los siete validadores de hoy',
          sorted(x.lower() for x in dn['validadores']) == SIETE,
          f'{len(dn["validadores"])} validadores')
dv = ed.decodificar(viejo['extraData'])
comprobar('y son mas que los del genesis viejo, que solo nombra cuatro',
          len(dn['validadores']) == 7 and len(dv['validadores']) == 4,
          f'viejo {len(dv["validadores"])} -> nuevo {len(dn["validadores"])}')
comprobar('la vanidad, los votos y la ronda del extraData no cambian',
          dn['vanidad'] == dv['vanidad'] and dn['votos'] == dv['votos']
          and dn['ronda'] == dv['ronda'])

print()
if fallos:
    print(f'FALLAN {len(fallos)} COMPROBACIONES. El genesis NO se despliega:')
    for f in fallos:
        print('   ·', f)
    sys.exit(1)
print('LAS COMPROBACIONES PASAN. El genesis se puede llevar al ensayo.')
