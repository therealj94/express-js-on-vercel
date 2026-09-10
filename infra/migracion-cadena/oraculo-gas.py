#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Oraculo del gas de la cadena Orden Global 5550.

Un ORIGEN es un gramo de oro dividido en 55. De ahi sale todo:

    ORIGEN_USD = (oro_USD_por_onza / 31,1034768) / 55
    gwei       = objetivo_USD / ORIGEN_USD * 1e18 / gas_de_referencia / 1e9

El objetivo es que una transferencia de token --la operacion normal de la
billetera, 51.000 de gas-- cueste un centavo. Sube el oro, baja el gas en gwei,
y la transferencia sigue costando lo mismo.

Tres decisiones que no son tecnicas y conviene no tocar sin pensarlas:

  * Se toma la MEDIANA de varias fuentes, no una sola. Con una fuente, el dia
    que devuelva basura la cadena cobra basura.
  * BANDA MUERTA: si el precio nuevo difiere menos del 5 % del vigente, no se
    toca. Sin esto se reescribe el gas todos los dias por ruido de mercado.
  * TOPE: ningun ajuste mueve el precio mas de un 20 % de una vez. Un dato malo
    que pase los demas filtros no puede disparar el gas de golpe.

Por omision NO aplica nada: hay que pedirlo con --aplicar.
"""

import argparse, json, os, sys, time, urllib.request

ONZA_EN_GRAMOS = 31.1034768
GRAMOS_POR_ORIGEN = 55        # un ORIGEN es un gramo dividido en 55
GAS_REFERENCIA = 51000        # transferencia de un token ERC-20
OBJETIVO_USD = 0.01

# Cotas de cordura. No pretenden acertarle al mercado: sirven para descartar
# una fuente que devuelve cero, un texto de error o un numero absurdo.
ORO_MINIMO, ORO_MAXIMO = 500.0, 20000.0

BANDA_MUERTA = 0.05
TOPE_POR_AJUSTE = 0.20


def _pedir(url, saca):
    pet = urllib.request.Request(url, headers={'User-Agent': 'orden-global-oraculo/1'})
    with urllib.request.urlopen(pet, timeout=25) as r:
        return float(saca(json.load(r)))


FUENTES = [
    ('oro al contado', 'https://api.gold-api.com/price/XAU',
     lambda d: d['price']),
    ('PAXG', 'https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd',
     lambda d: d['pax-gold']['usd']),
    ('XAUT', 'https://api.coingecko.com/api/v3/simple/price?ids=tether-gold&vs_currencies=usd',
     lambda d: d['tether-gold']['usd']),
]


def precio_del_oro():
    """La mediana de las fuentes que contestan algo creible."""
    leidas, fallos = [], []
    for nombre, url, saca in FUENTES:
        try:
            v = _pedir(url, saca)
            if ORO_MINIMO <= v <= ORO_MAXIMO:
                leidas.append((nombre, v))
            else:
                fallos.append('%s: %.2f fuera de rango' % (nombre, v))
        except Exception as e:
            fallos.append('%s: %s' % (nombre, e.__class__.__name__))
    if len(leidas) < 2:
        raise SystemExit('ABORTADO: solo %d fuente(s) creible(s). %s'
                         % (len(leidas), ' · '.join(fallos)))
    valores = sorted(v for _, v in leidas)
    medio = valores[len(valores) // 2] if len(valores) % 2 else \
        (valores[len(valores) // 2 - 1] + valores[len(valores) // 2]) / 2
    return medio, leidas, fallos


def origen_usd(oro_onza):
    return (oro_onza / ONZA_EN_GRAMOS) / GRAMOS_POR_ORIGEN


def gwei_objetivo(oro_onza, objetivo=OBJETIVO_USD, gas=GAS_REFERENCIA):
    return objetivo / origen_usd(oro_onza) * 1e18 / gas / 1e9


def decidir(gwei_ahora, gwei_ideal):
    """Devuelve (gwei_nuevo, motivo). gwei_nuevo es None si no hay que tocar."""
    if gwei_ahora <= 0:
        return int(round(gwei_ideal)), 'no habia precio vigente'
    cambio = abs(gwei_ideal - gwei_ahora) / gwei_ahora
    if cambio < BANDA_MUERTA:
        return None, 'dentro de la banda muerta (%.2f %% < %.0f %%)' % (cambio * 100, BANDA_MUERTA * 100)
    tope_arriba = gwei_ahora * (1 + TOPE_POR_AJUSTE)
    tope_abajo = gwei_ahora * (1 - TOPE_POR_AJUSTE)
    if gwei_ideal > tope_arriba:
        return int(round(tope_arriba)), 'limitado por el tope: pedia %.1f' % gwei_ideal
    if gwei_ideal < tope_abajo:
        return int(round(tope_abajo)), 'limitado por el tope: pedia %.1f' % gwei_ideal
    return int(round(gwei_ideal)), 'ajuste normal (%.2f %%)' % (cambio * 100)


def rpc(url, metodo, params, espera=20):
    cuerpo = json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': metodo, 'params': params}).encode()
    pet = urllib.request.Request(url, cuerpo, {'Content-Type': 'application/json'})
    with urllib.request.urlopen(pet, timeout=espera) as r:
        return json.load(r)


def main():
    ap = argparse.ArgumentParser(description='Ajusta el precio del gas de la 5550 contra el oro.')
    ap.add_argument('--nodos', nargs='*', default=[],
                    help='RPC de los validadores, ej http://10.0.0.1:8545')
    ap.add_argument('--aplicar', action='store_true',
                    help='aplicar de verdad. Sin esto solo dice que haria.')
    ap.add_argument('--objetivo', type=float, default=OBJETIVO_USD)
    ap.add_argument('--gas-referencia', type=int, default=GAS_REFERENCIA)
    ap.add_argument('--gwei-actual', type=float, default=None,
                    help='forzar el precio vigente en vez de leerlo de un nodo')
    ap.add_argument('--registro', default='/var/log/og-oraculo.jsonl')
    a = ap.parse_args()

    oro, leidas, fallos = precio_del_oro()
    org = origen_usd(oro)
    ideal = gwei_objetivo(oro, a.objetivo, a.gas_referencia)

    print('fuentes que contestaron:')
    for n, v in leidas:
        print('   %-16s %10.2f USD/oz' % (n, v))
    for f in fallos:
        print('   (descartada) %s' % f)
    print('mediana del oro   : %.2f USD/oz  ·  %.2f USD/gramo' % (oro, oro / ONZA_EN_GRAMOS))
    print('ORIGEN            : %.6f USD' % org)
    print('gas ideal         : %.1f gwei  (transferencia de token = %.4f USD)'
          % (ideal, ideal * 1e9 * a.gas_referencia / 1e18 * org))

    actual = a.gwei_actual
    if actual is None and a.nodos:
        try:
            actual = int(rpc(a.nodos[0], 'eth_gasPrice', [])['result'], 16) / 1e9
        except Exception as e:
            print('no se pudo leer el precio vigente: %s' % e.__class__.__name__)
            actual = 0.0
    if actual is None:
        actual = 0.0
    nuevo, motivo = decidir(actual, ideal)
    print('gas vigente       : %.1f gwei' % actual)
    print('decision          : %s' % (('%d gwei — %s' % (nuevo, motivo)) if nuevo else 'no tocar — ' + motivo))

    apunte = {'cuando': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
              'oro_usd_onza': round(oro, 4), 'fuentes': {n: v for n, v in leidas},
              'descartadas': fallos, 'origen_usd': round(org, 8),
              'gwei_vigente': round(actual, 3), 'gwei_ideal': round(ideal, 3),
              'gwei_nuevo': nuevo, 'motivo': motivo, 'aplicado': False}

    if nuevo and a.aplicar and a.nodos:
        wei = int(nuevo * 1e9)
        resultados = {}
        for url in a.nodos:
            try:
                r = rpc(url, 'miner_setMinGasPrice', [hex(wei)])
                resultados[url] = r.get('result', r.get('error'))
            except Exception as e:
                resultados[url] = '%s: %s' % (e.__class__.__name__, e)
        apunte['aplicado'] = True
        apunte['nodos'] = resultados
        print('aplicado en %d nodo(s):' % len(a.nodos))
        for u, r in resultados.items():
            print('   %-34s %s' % (u, r))
    elif nuevo and not a.aplicar:
        print('(no se aplico nada: falta --aplicar)')

    # Cada ajuste queda anotado. Si nadie puede auditarlo despues, el usuario no
    # tiene como saber por que pago lo que pago.
    try:
        os.makedirs(os.path.dirname(a.registro), exist_ok=True)
        with open(a.registro, 'a') as f:
            f.write(json.dumps(apunte, ensure_ascii=False) + '\n')
        print('anotado en %s' % a.registro)
    except Exception as e:
        print('no se pudo anotar en %s: %s' % (a.registro, e.__class__.__name__))
    return 0


if __name__ == '__main__':
    sys.exit(main())
