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
# La plata, para AGKA. Las mismas dos casas y en el mismo orden que el oro.
COINGECKO_PLATA = ('https://api.coingecko.com/api/v3/simple/price'
                   '?ids=kinesis-silver&vs_currencies=usd')
GOLD_API_PLATA = 'https://api.gold-api.com/price/XAG'

ESPERA = 8                 # segundos que se aguanta a cada fuente
VALE = 300                 # 5 minutos: el oro no se mueve tanto en ese rato

_candado = threading.Lock()
_guardado = {'cuando': 0, 'onza': None, 'de': None}
_plata = {'cuando': 0, 'valor': None}


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


# ── TODAS LAS MONEDAS DE LA CASA ────────────────────────────────────────────
#
# Jose: «ocupo sepa todos los precios tokens tambien sepa su precio y se
# mueven». Mirandolo de verdad, la respuesta honesta tiene TRES grupos, y la
# diferencia entre ellos es mas importante que las cifras:
#
#   · ORIGEN, AUKA, AGKA — siguen un METAL. Se mueven solos, cada minuto,
#     porque se mueve el metal. Nadie los fija.
#   · ONDK — precio DECLARADO por la Junta en un acta firmada. Entre acta y
#     acta NO SE MUEVE: se queda plano en la ultima cifra firmada. Es lo
#     contrario de los de arriba.
#   · IBS, HARV — no tienen precio. Ni de mercado ni declarado.
#
# Confundir «declarado» con «de mercado» es el malentendido caro de toda esta
# casa, y es el que hace falta que AU-RA sepa explicar. Un precio declarado es
# el hecho verificable de que la Junta, tal dia, en tal acta, resolvio publicar
# tal cifra. No es lo que el mercado va a pagar.
#
# ── POR QUE ONDK NO LLEVA LA CIFRA ─────────────────────────────────────────
#
# ONDK es un valor negociable y la regla de la casa —con prueba que la vigila
# en `probar-guion.py`— es que se nombra SIN precio, sin apreciacion, sin
# recompra y sin invitacion a comprar. Se puede decir QUE ES y DONDE MIRARLO;
# decir la cifra es empezar a venderlo, y eso no lo hace un asistente que
# habla con desconocidos.
#
# El libro es publico y esta a un clic. Quien quiera el numero lo tiene; lo que
# no va a pasar es que se lo ofrezcamos nosotros.

LIBRO_ONDK = ('https://ordenex-api-ba4b27b8b51a.herokuapp.com'
              '/precio-declarado/ONDK')

SIGUEN_METAL = ('ORIGEN', 'AUKA', 'AGKA')
DECLARADOS = ('ONDK',)
SIN_PRECIO = ('IBS', 'HARV')


def onza_plata(ahora=None):
    """La onza de plata, o `None`. AGKA la sigue, como AUKA sigue el oro."""
    ahora = ahora if ahora is not None else time.time()
    with _candado:
        if _plata['valor'] and ahora - _plata['cuando'] < VALE:
            return _plata['valor']
    v = _traer(COINGECKO_PLATA, lambda d: d['kinesis-silver']['usd'])
    if v is None:
        v = _traer(GOLD_API_PLATA, lambda d: d['price'])
    if v is None:
        return None
    with _candado:
        _plata.update({'cuando': ahora, 'valor': v})
    return v


def todos():
    """Lo que se sabe de cada moneda publica. Nunca lanza.

    `None` en `usd` no es un fallo: para IBS y HARV es la verdad, y para ONDK
    es a proposito.
    """
    oro = onza()
    plata = onza_plata()
    return {
        'ORIGEN': {'usd': (oro / OZ_GRAMOS / GRAMIN) if oro else None,
                   'sigue': 'oro', 'se_mueve': True},
        'AUKA': {'usd': oro, 'sigue': 'oro', 'se_mueve': True},
        'AGKA': {'usd': plata, 'sigue': 'plata', 'se_mueve': True},
        'ONDK': {'usd': None, 'sigue': 'acta', 'se_mueve': False},
        'IBS': {'usd': None, 'sigue': None, 'se_mueve': False},
        'HARV': {'usd': None, 'sigue': None, 'se_mueve': False},
    }


def _n(v):
    return f'${v:,.2f}' if v else '—'


def tabla(idioma='es'):
    """Las monedas de la casa, con lo que se sabe de cada una.

    Se ensenan TAMBIEN las que no tienen precio. Una lista que solo muestra las
    que tienen numero da a entender que las otras no existen, y quien tenga
    HARV en su billetera merece saber por que no ve una cifra al lado.
    """
    t = todos()
    oro = t['AUKA']['usd']
    if idioma == 'en':
        if not oro:
            return NO_SE_SABE['en']
        return (
            '*What the house coins are worth*\n\n'
            f'• *ORIGEN* — {_n(t["ORIGEN"]["usd"])} · a gramin: a gram of gold '
            f'split {GRAMIN} ways\n'
            f'• *AUKA* — {_n(t["AUKA"]["usd"])} · one ounce of gold\n'
            f'• *AGKA* — {_n(t["AGKA"]["usd"])} · one ounce of silver\n\n'
            'Those three *move on their own*, every minute, because the metal '
            'moves. Nobody sets them — and they can go down as well as up.\n\n'
            '• *ONDK* — a price the Board sets by signed resolution. Between '
            'resolutions it does *not* move. It is a different thing, not a '
            'market price, and the book is public: '
            f'{LIBRO_ONDK}\n'
            '• *IBS Energy* and *Harvi* — no price yet. They do not trade.\n\n'
            'Your Veta Wallet reads the same sources, so it shows the same '
            'numbers.')
    if not oro:
        return NO_SE_SABE['es']
    return (
        '*Lo que valen las monedas de la casa*\n\n'
        f'• *ORIGEN* — {_n(t["ORIGEN"]["usd"])} · un gramin: un gramo de oro '
        f'partido entre {GRAMIN}\n'
        f'• *AUKA* — {_n(t["AUKA"]["usd"])} · una onza de oro\n'
        f'• *AGKA* — {_n(t["AGKA"]["usd"])} · una onza de plata\n\n'
        'Esas tres *se mueven solas*, cada minuto, porque se mueve el metal. '
        'Nadie las fija — y pueden bajar igual que suben.\n\n'
        '• *ONDK* — lleva un precio que la Junta fija por resolución firmada. '
        'Entre una resolución y otra *no se mueve*. Es otra cosa, no un precio '
        f'de mercado, y el libro es público: {LIBRO_ONDK}\n'
        '• *IBS Energy* y *Harvi* — todavía sin precio. No cotizan.\n\n'
        'Tu Veta Wallet lee las mismas fuentes, así que muestra los mismos '
        'números.')
