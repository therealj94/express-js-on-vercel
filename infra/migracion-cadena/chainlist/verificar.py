#!/usr/bin/env python3
# Comprueba un archivo de Chainlist ANTES de abrir el pull request.
#
# POR QUE EXISTE
#
# El archivo que había aquí prometía tres cosas: un RPC, un explorador y un
# grifo. El grifo --faucet-testnet.ordenglobal.org-- NO EXISTE, nunca se
# levantó. Un revisor de ethereum-lists/chains abre esa dirección, no carga, y
# el pull request se cierra. Peor: si el RPC declarado responde con OTRO chain
# id --que es exactamente lo que pasa hoy con rpc.ordenglobal-rpc.com, que
# sirve la cadena vieja 8532--, una billetera firma para 5550 contra una cadena
# que no es. Eso ya no es un pull request rechazado, es dinero mal firmado.
#
# Este archivo no opina: abre cada dirección que el JSON promete y comprueba
# que responde lo que dice. Si algo falla, sale con error y no se envía nada.
#
#   python3 verificar.py eip155-5534.json
#   python3 verificar.py eip155-5534.json eip155-5550.json
#
# Con --sin-red hace sólo las comprobaciones de forma (útil sin salida a
# internet); entonces NO alcanza para enviar.

import json, os, re, sys, urllib.request, urllib.error

LISTA = 'https://chainid.network/chains.json'
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.chains.json')

fallos = []
avisos = []


def mal(msg):
    fallos.append(msg)
    print('   FALLA  ' + msg)


def ojo(msg):
    avisos.append(msg)
    print('   aviso  ' + msg)


def bien(msg):
    print('   ok     ' + msg)


def http(url, datos=None, tiempo=20):
    pet = urllib.request.Request(url, data=datos,
                                 headers={'content-type': 'application/json',
                                          'user-agent': 'orden-global-verificar/1'})
    with urllib.request.urlopen(pet, timeout=tiempo) as r:
        return r.status, r.read()


def rpc(url, metodo):
    cuerpo = json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': metodo,
                         'params': []}).encode()
    _, b = http(url, cuerpo)
    return json.loads(b)


def catalogo():
    """La lista publicada, para no chocar con un chainId/shortName ya tomado."""
    if os.path.exists(CACHE):
        return json.load(open(CACHE))
    _, b = http(LISTA, tiempo=120)
    open(CACHE, 'wb').write(b)
    return json.loads(b)


# ---- comprobaciones de forma (no necesitan red) ---------------------------

# Las dos listas son las de Env.kt en ethereum-lists/chains. Un campo que no
# esté en ninguna de las dos revienta el CI con ShouldHaveNoExtraFields.
OBLIGATORIOS = ['name', 'chain', 'rpc', 'faucets', 'nativeCurrency', 'infoURL',
                'shortName', 'chainId', 'networkId']
OPCIONALES = ['features', 'slip44', 'ens', 'icon', 'explorers', 'title',
              'parent', 'status', 'redFlags']

# El CI valida nombres contra esta expresión: nada de acentos, comas ni dos
# puntos. "Orden Global" pasa; "Orden Global, S.A." no.
NOMBRE = re.compile(r'^[a-zA-Z0-9\-.() ]+$')


def texto(valor, que):
    """Las mismas dos reglas que checkString() en Main.kt."""
    if not str(valor).strip():
        mal('%s está en blanco' % que)
    elif str(valor) != str(valor).strip():
        mal('%s tiene espacios de sobra en los extremos: %r' % (que, valor))


def forma(ruta, c):
    esperado = 'eip155-%s.json' % c.get('chainId')
    if os.path.basename(ruta) != esperado:
        mal('el archivo debe llamarse %s y se llama %s'
            % (esperado, os.path.basename(ruta)))
    for k in OBLIGATORIOS:
        if k not in c:
            mal('falta el campo obligatorio %r' % k)
    sobran = set(c.keys()) - set(OBLIGATORIOS) - set(OPCIONALES)
    if sobran:
        mal('campos que el CI no admite: %s. Sólo valen %s'
            % (', '.join(sorted(sobran)), ', '.join(OBLIGATORIOS + OPCIONALES)))
    if c.get('chainId') != c.get('networkId'):
        mal('chainId %s y networkId %s no coinciden'
            % (c.get('chainId'), c.get('networkId')))

    if not NOMBRE.fullmatch(str(c.get('name', ''))):
        mal('name %r: el CI sólo admite letras, números, guión, punto, '
            'paréntesis y espacio' % c.get('name'))
    texto(c.get('name', ''), 'name')

    m = c.get('nativeCurrency') or {}
    for k in ('name', 'symbol', 'decimals'):
        if k not in m:
            mal('nativeCurrency sin %r' % k)
    if set(m.keys()) - {'name', 'symbol', 'decimals'}:
        mal('nativeCurrency sólo admite name, symbol y decimals; sobra %s'
            % ', '.join(sorted(set(m.keys()) - {'name', 'symbol', 'decimals'})))
    # ESTA es la que se escapó el 13-ago: el símbolo era "tORIGEN", de siete
    # caracteres, y el CI de Chainlist rechaza siete o más
    # (NativeCurrencySymbolMustHaveLessThan7Chars). El pull request habría
    # muerto en el CI tras semanas de cola, porque el propio bot del
    # repositorio avisa de que sólo miran los que tienen el CI en verde.
    sim = str(m.get('symbol', ''))
    if len(sim) >= 7:
        mal('nativeCurrency.symbol %r tiene %d caracteres: el CI exige MENOS '
            'de 7. La convención en testnets es reusar el símbolo de la red '
            'principal (Sepolia usa ETH, no tETH).' % (sim, len(sim)))
    texto(sim, 'nativeCurrency.symbol')
    if not NOMBRE.fullmatch(str(m.get('name', ''))):
        mal('nativeCurrency.name %r no pasa la expresión del CI' % m.get('name'))
    if not isinstance(m.get('decimals'), int) or isinstance(m.get('decimals'), bool):
        mal('nativeCurrency.decimals tiene que ser un entero, y es %r'
            % m.get('decimals'))
    elif m.get('decimals') != 18:
        ojo('nativeCurrency.decimals = %r (lo normal es 18)' % m.get('decimals'))

    if not re.fullmatch(r'[a-zA-Z0-9\-]{1,20}', str(c.get('shortName', ''))):
        mal('shortName %r: sólo letras, números y guiones, hasta 20'
            % c.get('shortName'))
    for u in c.get('rpc', []):
        if not u.startswith(('https://', 'wss://')):
            mal('RPC %s: tiene que ser https:// o wss://' % u)
        if u.endswith('/'):
            mal('RPC %s: sobra la barra final' % u)
    for e in c.get('explorers', []):
        if not e.get('name'):
            mal('un explorador va sin name, y el CI lo exige')
        if e.get('standard') not in ('EIP3091', 'none'):
            mal('explorador %r declara standard %r: el CI sólo admite EIP3091 '
                'o none' % (e.get('name'), e.get('standard')))
        u = str(e.get('url', ''))
        if not u.startswith(('https://', 'http://')):
            mal('explorador %r: la url tiene que empezar por http:// o https://' % u)
        if u.endswith('/'):
            mal('explorador %s: sobra la barra final' % u)
        texto(u, 'url del explorador')
    incubando = c.get('status') == 'incubating'
    if not c.get('explorers'):
        if incubando:
            ojo('sin explorador: correcto mientras la cadena no exista')
        else:
            ojo('sin explorador declarado: la cadena aparece pero no se puede mirar')
    if not c.get('rpc'):
        if incubando:
            # No es un descuido: es la unica forma honesta de reservar un
            # chainId antes de que la cadena exista. En la lista publicada hay
            # 163 cadenas sin RPC y 99 en estado incubating, varias con las dos
            # cosas a la vez. Declarar un RPC que no responde --o peor, que
            # responde OTRA cadena-- es lo que no se puede hacer.
            ojo('sin RPC y en estado incubating: se reserva el chainId, nada mas')
        else:
            mal('sin RPC y sin declararse incubating: nadie puede usar la cadena')


# ---- comprobaciones contra la realidad ------------------------------------

VECES = 6      # cuántas veces se pregunta la altura al mismo nombre
DESFASE = 60   # bloques de diferencia que se toleran entre respuestas


def alturas(u):
    """Pregunta la altura varias veces al MISMO nombre.

    Detrás de un solo nombre puede haber un balanceador con varios nodos. Si
    uno de ellos no está sincronizado, una de cada N respuestas viene de él: la
    billetera ve saldo cero y un nonce viejo, y firma una transacción que
    reemplaza otra. Preguntar una sola vez no lo ve --de hecho no lo vio: el
    12-ago este mismo script contestó bloque 0 en una llamada y 13.488 en la
    siguiente, por el mismo nombre.
    """
    vistas = []
    for _ in range(VECES):
        try:
            vistas.append(int(rpc(u, 'eth_blockNumber')['result'], 16))
        except Exception as e:
            mal('%s dejó de contestar eth_blockNumber a mitad: %s' % (u, e))
            return
    if 0 in vistas:
        mal('%s contestó bloque 0 en %d de %d llamadas: detrás de ese nombre '
            'hay un nodo SIN SINCRONIZAR. Sacarlo del balanceador antes de '
            'publicarlo.' % (u, vistas.count(0), VECES))
        return
    if max(vistas) - min(vistas) > DESFASE:
        mal('%s contesta alturas que se llevan %d bloques (%d..%d): hay un nodo '
            'atrasado detrás del mismo nombre.'
            % (u, max(vistas) - min(vistas), min(vistas), max(vistas)))
        return
    bien('   punta: bloque %d, estable en %d llamadas' % (max(vistas), VECES))


def realidad(c):
    idc = c['chainId']
    if c.get('status') == 'incubating' and not c.get('rpc') and not c.get('explorers'):
        bien('incubating sin extremos: no hay nada que probar contra la realidad')
        try:
            s, _ = http(c['infoURL'], tiempo=25)
            bien('infoURL %s responde %d' % (c['infoURL'], s))
        except Exception as e:
            mal('infoURL %s no abre: %s' % (c['infoURL'], e))
        return

    for u in c.get('rpc', []):
        if u.startswith('wss://'):
            ojo('%s: websocket, este script no lo prueba' % u)
            continue
        try:
            r = rpc(u, 'eth_chainId')
        except Exception as e:
            mal('%s no responde: %s' % (u, e))
            continue
        try:
            visto = int(r['result'], 16)
        except Exception:
            mal('%s contesta algo que no es un chainId: %r' % (u, r))
            continue
        if visto != idc:
            mal('%s SIRVE LA CADENA %d, no la %d. Publicar esto hace que una '
                'billetera firme para %d contra %d.' % (u, visto, idc, idc, visto))
        else:
            bien('%s responde chainId %d' % (u, idc))
            alturas(u)

    for u in c.get('faucets', []):
        try:
            s, _ = http(u.split('${')[0], tiempo=25)
            bien('grifo %s responde %d' % (u, s))
        except Exception as e:
            mal('grifo %s no abre: %s. Un grifo que no existe hunde el pull '
                'request; si no hay grifo, la lista va vacía.' % (u, e))

    try:
        s, _ = http(c['infoURL'], tiempo=25)
        bien('infoURL %s responde %d' % (c['infoURL'], s))
    except Exception as e:
        mal('infoURL %s no abre: %s' % (c['infoURL'], e))

    # EIP-3091: /tx/<hash>, /address/<dir>, /block/<n> tienen que existir.
    CERO = '0x' + '0' * 64
    DIR = '0x0000000000000000000000000000000000000000'
    for e in c.get('explorers', []):
        base = e['url']
        for ruta in ('/tx/' + CERO, '/address/' + DIR, '/block/1'):
            try:
                s, _ = http(base + ruta, tiempo=25)
                if s >= 400:
                    mal('%s%s responde %d (EIP-3091 pide que exista)' % (base, ruta, s))
                else:
                    bien('%s%s responde %d' % (base, ruta, s))
            except Exception as ex:
                mal('%s%s no abre: %s' % (base, ruta, ex))


def choques(c):
    try:
        pub = catalogo()
    except Exception as e:
        ojo('no se pudo bajar la lista publicada (%s): no se comprobaron choques' % e)
        return
    for otra in pub:
        if otra.get('chainId') == c['chainId']:
            mal('el chainId %d YA ESTA TOMADO por %r' % (c['chainId'], otra.get('name')))
        if str(otra.get('shortName', '')).lower() == str(c['shortName']).lower():
            mal('el shortName %r ya lo usa %r' % (c['shortName'], otra.get('name')))
        if str(otra.get('name', '')).lower() == str(c['name']).lower():
            mal('el name %r ya lo usa la cadena %s' % (c['name'], otra.get('chainId')))
    bien('chainId %d, shortName %r y name %r están libres en la lista publicada'
         % (c['chainId'], c['shortName'], c['name']))


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    sin_red = '--sin-red' in sys.argv
    if not args:
        print('uso: verificar.py eip155-XXXX.json [...] [--sin-red]', file=sys.stderr)
        sys.exit(2)

    for ruta in args:
        print('\n=== %s' % ruta)
        c = json.load(open(ruta))
        forma(ruta, c)
        if not sin_red:
            choques(c)
            realidad(c)

    print('\n%d fallas · %d avisos' % (len(fallos), len(avisos)))
    if fallos:
        print('NO ENVIAR. Cada falla de arriba es un motivo por el que el pull '
              'request se cierra, o algo peor.')
        sys.exit(1)
    if sin_red:
        print('Sólo se comprobó la forma. Antes de enviar, correr sin --sin-red.')
        sys.exit(0)
    print('Listo para enviar a ethereum-lists/chains.')


if __name__ == '__main__':
    main()
