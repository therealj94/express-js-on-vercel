#!/usr/bin/env python3
"""Construye el genesis nuevo de la 5550 a partir de la FOTO del estado.

    python3 construir-genesis-nuevo.py foto-estado-5550.json genesis-al-corte.json \\
            > genesis-nuevo.json

LA REGLA, en las palabras de Jose (25-ago):

    «Cierra todo. Lo unico origen que quedan son los 1 origen que se
     repartieron, y los tokens como estaban al dia de hoy en las billeteras.
     Con eso reiniciamos. Solo es recuperar esas origen que quedaron en esas
     pruebas.»

De ahi salen cuatro reglas, y ninguna otra:

  1. Las 155 billeteras sembradas quedan con 1 ORIGEN EXACTO. Las que gastaron
     gas se reponen; las que recibieron de mas se recortan.
  2. Todo el demas ORIGEN fuera de las cuatro asignaciones grandes vuelve al
     tesoro: contratos, pools, restos de prueba y comisiones de validador.
  3. Los saldos ERC-20 quedan COMO ESTAN HOY. No se toca ni uno... salvo
     WORIGEN, que no es una excepcion sino la consecuencia: al quitarle al
     wrapper el ORIGEN que lo respalda, sus saldos tienen que ir a cero o el
     contrato queda insolvente. Se hacen las dos cosas o ninguna.
  4. Las tres asignaciones preservadas de 250.000 millones no se tocan. Mover
     el tesoro exige instruccion escrita de la Junta, y esto no lo es.

LO QUE ESTE GUION SE NIEGA A HACER

Si la suma total de ORIGEN antes y despues no es identica al ultimo wei, no
emite nada. Un genesis que no cuadra produce una cadena que arranca, responde
y miente, que es peor que no tener cadena.
"""
import json
import sys

UNO = 10 ** 18
TESORO = '0x3d5510e5081822877d14cd51b356bf01df2c32c9'
WRAPPER = '0xccbe0c6690bf61d1f23f95f3998e4ba0d7b89f75'
PRESERVADAS = {
    '0x3011f7f9d263d7f73a1ac2130ac7afe426495718',
    '0x50219186545980b35912adc89550522e63667f74',
    '0xacc03b7fe0c658cb3872726d05da24d0554f44b8',
}
# Indice del mapa de saldos en los tokens de esta cadena. Comprobado contra
# ranuras conocidas, no supuesto.
IDX_SALDOS = 3


def ent(x):
    if x is None:
        return 0
    if isinstance(x, str):
        return int(x, 16) if x.startswith('0x') else int(x)
    return int(x)


def hx(n):
    return '0x' + format(n, 'x')


def ranura_saldo(direccion, idx=IDX_SALDOS):
    from Crypto.Hash import keccak
    h = keccak.new(digest_bits=256)
    h.update(bytes.fromhex(direccion[2:].rjust(64, '0')) + idx.to_bytes(32, 'big'))
    return '0x' + h.hexdigest()


def construir(foto, viejo, ranuras_token):
    al = {a.lower(): v for a, v in viejo['alloc'].items()}
    cuentas = foto['cuentas']
    ranuras = foto['ranuras']

    # --- quien estaba sembrada con 1 ORIGEN exacto en el genesis viejo ---
    sembradas = {a for a, v in al.items() if ent(v.get('balance')) == UNO}

    nuevo = {}
    recuperado = 0
    repuesto = 0
    informe = {'sembradas': len(sembradas), 'repuestas': [], 'recortadas': [],
               'barridas': [], 'contratos': []}

    for a, c in cuentas.items():
        hoy = ent(c.get('eth_getBalance'))
        codigo = c.get('eth_getCode') or '0x'
        esContrato = codigo != '0x'

        if a == TESORO or a in PRESERVADAS:
            saldo = hoy                      # se ajusta despues, si es el tesoro
        elif a in sembradas:
            saldo = UNO
            if hoy < UNO:
                repuesto += UNO - hoy
                informe['repuestas'].append([a, hoy, UNO])
            elif hoy > UNO:
                recuperado += hoy - UNO
                informe['recortadas'].append([a, hoy, UNO])
        else:
            saldo = 0
            if hoy:
                recuperado += hoy
                (informe['contratos'] if esContrato else informe['barridas']).append([a, hoy])

        # --- el almacenamiento, tal como esta hoy ---
        sto = dict(ranuras.get(a, {}))
        sto = {r: v for r, v in sto.items() if ent(v) != 0}
        for p in ranuras_token:
            if p['token'] == a and ent(p.get('valor')) != 0:
                sto[p['ranura']] = p['valor']

        if a == WRAPPER:
            # Los saldos de WORIGEN se van a cero junto con su respaldo. El
            # wrapper es estilo WETH: no guarda totalSupply, lo calcula como su
            # propio saldo, asi que vaciarlo lo deja emitido en cero sin dejar
            # WORIGEN huerfano. Las ranuras que NO son saldos (nombre, simbolo,
            # permisos) se dejan: sin saldos ya no pueden mover nada.
            aBorrar = {ranura_saldo(x) for x in list(cuentas) + [p['tenedor'] for p in ranuras_token]}
            aBorrar |= {ranura_saldo(x) for x in TENEDORES_WORIGEN}
            sto = {r: v for r, v in sto.items() if r not in aBorrar}

        ent_nuevo = {'balance': str(saldo)}
        if ent(c.get('eth_getTransactionCount')):
            ent_nuevo['nonce'] = hx(ent(c.get('eth_getTransactionCount')))
        if esContrato:
            ent_nuevo['code'] = codigo
        if sto:
            ent_nuevo['storage'] = dict(sorted(sto.items()))
        nuevo[a] = ent_nuevo

    neto = recuperado - repuesto
    nuevo[TESORO]['balance'] = str(ent(cuentas[TESORO]['eth_getBalance']) + neto)
    informe['recuperado'] = recuperado
    informe['repuesto'] = repuesto
    informe['neto'] = neto
    return nuevo, informe


# Los tenedores de WORIGEN, sacados del almacenamiento del wrapper y
# comprobados: sus saldos suman EXACTAMENTE el ORIGEN que respalda al wrapper.
TENEDORES_WORIGEN = [
    '0xd3790bfd26fd215491e68180f1e2da2c3b8d973d',
    '0x0186450cd6e7c93c466815facd9e97cadcd0ca1f',
    '0x57c0860440314430e563a15bd2a7e6eb62b22060',
    '0x0d9d6e3256f3ba9a7b1c33d07ca33d83cefea3ff',
    '0x1615ebd2f63133d9a2fa76b0608be116a3d771fd',
    '0x90141ef5f6b453dae06ffbb84e8b13cbdf80ffe6',
    '0xef6cbe22d49c6e3007404c99ca96901c89259aed',
    '0xbc4bed0581eb1546b918cebd37a2de05b9cfbc8a',
    '0xd149ffed1083db8c96bcf4c9723d163d3a524ac0',
    '0x6ce65a0fb39f2a1173298ce404ff560658d22d76',
    '0x2b4edb108cca5b875cea5d04408ea6231abef483',
    '0x3063a26b5f7efb2dbb96637514650dd64de80ac0',
    '0x95bbab35cab7606979c50caa36e2bd8f708f4ce0',
    '0x4f249b2a104c7eefa1cd0c1e2c3cb9c9c64f0566',
]


# Los cuatro que el genesis viejo lista, y los siete que validan hoy. Estan
# escritos y no deducidos a proposito: si manana el conjunto cambia, el guion
# tiene que fallar y obligar a mirar, no adivinar.
VALIDADORES_VIEJOS = [
    '0x48ccec9a54b9357623458f26afadcd7412a6a833',   # node4
    '0x65f987264bd77c3a094badfd88e4ba84c0b36382',   # node5
    '0x69e8a7b25586511a0c14430b45100e9439aae36c',   # node3
    '0xc548464725d5fd4a15b882a221da67b9cfd29514',   # node6
]
VALIDADORES_HOY = sorted(VALIDADORES_VIEJOS + [
    '0xbc820391f2a8ae402d00ef8bf4d0ec09ea0caf2a',   # node1, alta por voto el 20-ago
    '0x4c03eb38c7dc49eed7784c323089a4af2c698036',   # node2, idem
    '0x453493fcf778f133c51505cb81397f08850fc12e',   # node7, idem
])


def main():
    foto = json.load(open(sys.argv[1]))
    viejo = json.load(open(sys.argv[2]))
    ranuras_token = json.load(open(sys.argv[3])) if len(sys.argv) > 3 else []

    antes = sum(ent(c.get('eth_getBalance')) for c in foto['cuentas'].values())
    nuevo, inf = construir(foto, viejo, ranuras_token)
    despues = sum(ent(v['balance']) for v in nuevo.values())

    if antes != despues:
        raise SystemExit(f'NO CUADRA: antes {antes} != despues {despues} '
                         f'(diferencia {despues - antes} wei). No se emite nada.')

    salida = {k: viejo[k] for k in viejo if k != 'alloc'}

    # --- los SIETE validadores, no los cuatro del genesis viejo ---
    # node1, node2 y node7 entraron por votacion QBFT el 20-ago, y esa votacion
    # vive en la historia que el reinicio borra. Reiniciando con el extraData
    # tal cual, la cadena vuelve con cuatro validadores y aguanta una caida en
    # vez de dos. Van los siete al genesis.
    import extradata_qbft as ed
    igual, d = ed.probarse(viejo['extraData'])
    if not igual:
        raise SystemExit('el codificador de extraData no reproduce el de produccion')
    if sorted(x.lower() for x in d['validadores']) != sorted(VALIDADORES_VIEJOS):
        raise SystemExit(f'el genesis viejo no lista los 4 esperados: {d["validadores"]}')
    salida['extraData'] = ed.codificar(d['vanidad'], VALIDADORES_HOY,
                                       d['votos'], d['ronda'], d['sellos'])

    salida['alloc'] = dict(sorted(nuevo.items()))
    json.dump(salida, sys.stdout, indent=1)

    print(f'\nCUADRA: {antes/1e18:,.9f} ORIGEN antes y despues', file=sys.stderr)
    print(f'recuperado al tesoro: {inf["recuperado"]/1e18:,.9f}', file=sys.stderr)
    print(f'repuesto a sembradas: {inf["repuesto"]/1e18:,.9f}', file=sys.stderr)
    print(f'neto al tesoro:       {inf["neto"]/1e18:,.9f}', file=sys.stderr)
    json.dump(inf, open('informe-genesis-nuevo.json', 'w'), indent=1)


if __name__ == '__main__':
    main()
