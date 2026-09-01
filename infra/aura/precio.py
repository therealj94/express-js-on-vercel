# El precio de ORIGEN. El de verdad, de la misma fuente que la billetera.
#
# ── POR QUE ESTE ARCHIVO EXISTE ─────────────────────────────────────────────
#
# 1-sep, captura de Jose. Alguien pregunta cuanto vale un ORIGEN en dolares y
# AU-RA contesta:
#
#     «Actualmente, el precio del gramo de oro es aproximadamente $65 (este es
#      un valor estimado, por favor verifica el precio actual). Entonces:
#      1 gramo de oro = $65
#      1 ORIGEN = $65 / 55 ≈ $1.18»
#
# El gramo de oro estaba a 140,74. El ORIGEN, a 2,56 — lo que decia la
# billetera de la persona en ese mismo momento, y por eso contesto «pero en mi
# veta wallet sale 2.56».
#
# AU-RA se equivoco en un 54% EN UN DATO DE DINERO. Y lo peor no es el numero:
# es que hizo la cuenta delante de la persona, paso por paso, que es justo lo
# que hace que una respuesta parezca comprobada. Un «no sé» no habria hecho
# ningun dano; una aritmetica prolija sobre un dato inventado, si.
#
# El «por favor verifica el precio actual» tampoco salva nada. Quien pregunta
# el precio no va a verificarlo: para eso pregunto.
#
# ── DE DONDE SALE, Y POR QUE DE AHI Y NO DE OTRO LADO ───────────────────────
#
# De la MISMA fuente y con la MISMA cuenta que `apps-web/veta-wallet/cadena.js`:
#
#     ORIGEN = precio_de_la_onza_de_oro / 31,1035 / 55
#
# Primero CoinGecko (pax-gold), y si no contesta, gold-api. El mismo orden que
# la billetera. Esto no es un detalle de implementacion: si AU-RA usara otra
# fuente, los dos numeros se irian separando de a poquito y volveriamos a
# tener a alguien diciendo «pero en mi billetera sale otra cosa» — que es
# exactamente la queja que origino este archivo.
#
# Un dato tiene UNA fuente. Si algun dia la billetera cambia de sitio, este
# archivo cambia con ella.
#
# ── LO QUE ESTE ARCHIVO NO HACE ─────────────────────────────────────────────
#
# No adivina. Si las dos fuentes fallan devuelve `None`, y quien llama tiene
# que decir que ahora mismo no lo sabe. Un precio viejo o estimado es
# precisamente lo que se esta arreglando aqui: mejor no dar el dato que darlo
# mal, porque el que lo da mal se usa.

import json
import threading
import time
import urllib.request

# La cuenta, escrita una sola vez. Son las mismas constantes de `cadena.js`.
OZ_GRAMOS = 31.1035
GRAMIN = 55                # un ORIGEN es 1/55 de un gramo de oro

COINGECKO = ('https://api.coingecko.com/api/v3/simple/price'
             '?ids=pax-gold&vs_currencies=usd')
GOLD_API = 'https://api.gold-api.com/price/XAU'

ESPERA = 8                 # segundos que se aguanta a cada fuente
VALE = 300                 # 5 minutos: el oro no se mueve tanto en ese rato

_candado = threading.Lock()
_guardado = {'cuando': 0, 'onza': None, 'de': None}


def _traer(url, sacar):
    try:
        p = urllib.request.Request(url, headers={'User-Agent': 'orden-global/1'})
        with urllib.request.urlopen(p, timeout=ESPERA) as r:
            v = float(sacar(json.loads(r.read())))
            return v if v > 0 else None
    except Exception:
        return None


def onza(ahora=None):
    """El precio de la onza de oro en dolares, o `None`.

    Se guarda cinco minutos. Sin eso, cada persona que pregunte el precio saca
    una llamada a internet y las fuentes gratuitas nos cortan justo cuando mas
    gente esta preguntando.
    """
    ahora = ahora if ahora is not None else time.time()
    with _candado:
        if _guardado['onza'] and ahora - _guardado['cuando'] < VALE:
            return _guardado['onza']
    v = _traer(COINGECKO, lambda d: d['pax-gold']['usd'])
    de = 'coingecko'
    if v is None:
        v = _traer(GOLD_API, lambda d: d['price'])
        de = 'gold-api'
    if v is None:
        # NO se devuelve lo viejo. Un precio de hace horas presentado como el
        # de ahora es la misma clase de error que se esta arreglando: parece
        # un dato y no lo es.
        return None
    with _candado:
        _guardado.update({'cuando': ahora, 'onza': v, 'de': de})
    return v


def ahora():
    """`(origen_usd, gramo_usd, onza_usd)` o `(None, None, None)`.

    Los tres salen del mismo dato: quien los ensene junta no puede dar dos
    cifras que no cuadren entre si.
    """
    o = onza()
    if not o:
        return None, None, None
    return o / OZ_GRAMOS / GRAMIN, o / OZ_GRAMOS, o


def como_se_dice(idioma='es'):
    """La frase que se le da a la persona. `None` si no se sabe el precio.

    Lleva de donde sale y con que cuenta, porque un numero sin su origen es
    otra cifra que hay que creerse. Con la cuenta escrita, cualquiera la
    rehace: es la misma idea que «la formula es publica, la podes rehacer vos
    con una calculadora».
    """
    origen, gramo, _o = ahora()
    if origen is None:
        return None
    if idioma == 'en':
        return (f'One ORIGEN is *${origen:,.2f}* right now.\n\n'
                f'It comes out of the gold price, live: a gram of gold is '
                f'${gramo:,.2f}, and one ORIGEN is a *gramin* — that gram '
                f'divided by {GRAMIN}.\n\n'
                f'Your Veta Wallet reads the same source, so it shows the '
                f'same number. It moves when gold moves.')
    return (f'Un ORIGEN está en *${origen:,.2f}* ahora mismo.\n\n'
            f'Sale del precio del oro, en vivo: el gramo de oro está a '
            f'${gramo:,.2f}, y un ORIGEN es un *gramin* — ese gramo dividido '
            f'entre {GRAMIN}.\n\n'
            f'Tu Veta Wallet lee la misma fuente, así que muestra el mismo '
            f'número. Se mueve cuando se mueve el oro.')


NO_SE_SABE = {
    'es': ('Ahora mismo no puedo leer el precio del oro, y prefiero no darte '
           'un número inventado — es tu plata.\n\n'
           'Miralo en tu Veta Wallet, que lo trae en vivo.'),
    'en': ('I cannot read the gold price right now, and I would rather not '
           'give you a made-up number — it is your money.\n\n'
           'Check your Veta Wallet, it reads it live.'),
}
