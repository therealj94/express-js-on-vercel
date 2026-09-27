#!/usr/bin/env python3
"""Capturas de la Veta Wallet REAL con datos FICTICIOS (personaje: Lucia Ferrer).

- Extrae la web de la rama origin/claude/veta-wallet-phantom-design-7syah8
  (apps-web/veta-wallet) a una carpeta de trabajo y la sirve con un servidor
  estatico local (127.0.0.1).
- Playwright intercepta TODAS las peticiones (page.route('**/*')):
    * 127.0.0.1           -> archivos locales
    * fonts.googleapis.com / fonts.gstatic.com -> se bajan desde Python
      (con el proxy y el CA del entorno) y se cachean; el navegador nunca
      sale a la red.
    * API Veta, MyTokenPay, RPC, Ordenex, gold-api, CoinGecko, er-api,
      Genesis, cerebro.ordenscan -> JSON de mentira armado aqui.
    * cualquier otra cosa -> abort.
  Cada peticion queda en red.log (host, accion).
- Reloj falso por pantalla (page.clock) en America/Tegucigalpa.
- Salida: PNG 1080x1920 (viewport 360x640 @3x).

Uso:
    python3 capturar_veta.py [--salida DIR] [--solo A,B,...]
"""
import argparse
import base64
import json
import os
import shutil
import ssl
import subprocess
import sys
import threading
import time
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

REPO = Path('/home/user/express-js-on-vercel')
RAMA = 'origin/claude/veta-wallet-phantom-design-7syah8'
AQUI = Path(__file__).resolve().parent
TRABAJO = Path(os.environ.get('VETA_TRABAJO', '/tmp/veta-capturas-web'))
SALIDA_DEF = Path('/tmp/claude-0/-home-user/2611f717-6182-5311-8e6b-eee5393945e0/scratchpad/pantallas')
CACHE_FUENTES = TRABAJO / '_fuentes'

# ── hosts ────────────────────────────────────────────────────────────────────
API = 'https://vetawallet-1a2e38ac52b1.herokuapp.com'
MTP = 'https://mytokenpay-api-5ab43b64205a.herokuapp.com'
RPC = 'https://rpc.ordenglobal-rpc.com/'
ONX = 'https://ordenex-api-ba4b27b8b51a.herokuapp.com'
HOSTS_FUENTES = {'fonts.googleapis.com', 'fonts.gstatic.com'}
HOSTS_MOCK = {
    'vetawallet-1a2e38ac52b1.herokuapp.com', 'mytokenpay-api-5ab43b64205a.herokuapp.com',
    'rpc.ordenglobal-rpc.com', 'ordenex-api-ba4b27b8b51a.herokuapp.com',
    'api.gold-api.com', 'api.coingecko.com', 'open.er-api.com',
    'genesis-id.onrender.com', 'cerebro.ordenscan.com',
}

# ── el personaje (todo ficticio) ─────────────────────────────────────────────
TZ = 'America/El_Salvador'           # UTC-6, sin horario de verano
DIA = '2026-09-27'
MIA = '0x7e3b5a1c9d2f4e6a8b0c1d2e3f4a5b6c7d8e9f01'
SOFIA = '0x5fa0c3e19b7d24a6e8c01f3b5d7e9a2c4b6d8f10'
FLORISTERIA = '0x3c9e7a51d0b2f4e6a8c0d2e4f6a8b0c2d4e6f812'
COMEDOR = '0x9a1b2c3d4e5f60718293a4b5c6d7e8f901a2b3c4'
TEXTILES = '0x2d4f6a8c0e1b3d5f7a9c1e3b5d7f9a1c3e5b7d93'
NOMBRE = 'Lucía Ferrer'
CORREO = 'lucia.ferrer@correo.example'
ORIGEN_SALDO = 612.40
ONDK_SALDO = 250
PRECIO_ORIGEN = 2.50
ORO = PRECIO_ORIGEN * 31.1035 * 55          # la formula de cadena.js a la inversa
# El Salvador: la moneda local ES el dolar. Los campos de MyTokenPay se
# siguen llamando *Hnl* en la API; aqui llevan dolares (tasa local 1:1).
HNL_POR_USD = 1.0
HNL_POR_ORIGEN = round(PRECIO_ORIGEN * HNL_POR_USD, 4)   # 2.50
CONTRATO_ONDK = '0xfb83eea4b384a4b18e5a1eba7a4bb4c0b7ca19c1'


def iso(hhmm, seg=0):
    return f'{DIA}T{hhmm}:{seg:02d}-06:00'


def epoch(hhmm, seg=0):
    from datetime import datetime
    return int(datetime.fromisoformat(iso(hhmm, seg)).timestamp())


def hx(n):
    return '0x' + format(n, 'x')


def wei(x):
    return hx(int(round(x * 10**6)) * 10**12)


def hsh(sem):
    return '0x' + (sem * 64)[:64]


HASH = {
    'sofia': '0x8b1e4d27a09c3f5e6b7a8d9c0e1f2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b',
    'flor': '0xa4c61e09b3d57f28e9a0b1c2d3e4f5061728394a5b6c7d8e9f0a1b2c3d4e5f60',
    'comedor': '0x5e7f9a1b3c5d7e9f0a2b4c6d8e0f1a3b5c7d9e1f2a4b6c8d0e2f4a6b8c0d2e4f',
    'textiles': '0xc3f1a8e2d4b6907a5c3e1f9d7b5a3c1e9f7d5b3a1c9e7f5d3b1a9c7e5f3d1b09',
}

MONTO_FLOR_HNL = 18.00          # USD
MONTO_COMEDOR_TOTAL_HNL = 62.00 # USD
MONTO_COMEDOR_PARTE_HNL = 15.50 # USD
o = lambda hnl: round(hnl / HNL_POR_ORIGEN, 4)
MONTO_TEXTILES = 120.0

TRANSFERENCIAS = [   # lo que devuelve /chains/getChainsForId/5550 -> allTransfers
    {'hash': HASH['sofia'], 'from': MIA, 'to': SOFIA, 'amount': '80', 'symbol': 'ORIGEN',
     'timestamp': epoch('06:41', 12)},
    {'hash': HASH['flor'], 'from': MIA, 'to': FLORISTERIA, 'amount': str(o(MONTO_FLOR_HNL)),
     'symbol': 'ORIGEN', 'timestamp': epoch('10:17', 30)},
    {'hash': HASH['comedor'], 'from': MIA, 'to': COMEDOR, 'amount': str(o(MONTO_COMEDOR_PARTE_HNL)),
     'symbol': 'ORIGEN', 'timestamp': epoch('13:58', 20)},
    {'hash': HASH['textiles'], 'from': MIA, 'to': TEXTILES, 'amount': str(MONTO_TEXTILES),
     'symbol': 'ORIGEN', 'timestamp': epoch('15:42', 5)},
]

MOVS_TARJETA = [
    {'id': 'ctx-0927-1', 'merchant': 'Boleto aéreo', 'type': 'TRANSACTION_CLEARED',
     'amount': 186.00, 'origenAmount': 74.40, 'date': iso('06:43', 8), 'currency': 'USD'},
    {'id': 'ctx-0924-1', 'merchant': 'Suscripción de música', 'type': 'TRANSACTION_CLEARED',
     'amount': 4.99, 'origenAmount': 2.00, 'date': '2026-09-24T20:12:00-06:00', 'currency': 'USD'},
    {'id': 'ctx-0921-1', 'merchant': 'Librería en línea', 'type': 'TRANSACTION_CLEARED',
     'amount': 18.50, 'origenAmount': 7.40, 'date': '2026-09-21T11:05:00-06:00', 'currency': 'USD'},
]


def cobro_flor(estado='abierto', mia=False):
    parte = {'id': 'pf-1', 'indice': 0, 'montoOrigen': o(MONTO_FLOR_HNL), 'montoHnl': MONTO_FLOR_HNL,
             'estado': 'pagada' if estado == 'pagado' else ('reservada' if mia else 'libre'),
             'pagadorNombre': 'Lucía' if (mia or estado == 'pagado') else None}
    return {'codigo': 'FLR-4K7', 'estado': estado, 'montoHnl': MONTO_FLOR_HNL,
            'montoOrigen': o(MONTO_FLOR_HNL), 'tasaHnlPorOrigen': HNL_POR_ORIGEN,
            'concepto': 'Arreglo floral · entrega a domicilio',
            'negocio': {'nombre': 'Floristería El Girasol', 'direccion': FLORISTERIA, 'verificado': True},
            'partes': [parte]}


def cobro_comedor(estado='abierto', mia=False):
    otros = ['Ana', 'Marcos', 'Rebeca']
    partes = []
    for i in range(4):
        if i < 3:
            partes.append({'id': f'pc-{i+1}', 'indice': i, 'montoOrigen': o(MONTO_COMEDOR_PARTE_HNL),
                           'montoHnl': MONTO_COMEDOR_PARTE_HNL, 'estado': 'pagada', 'pagadorNombre': otros[i]})
        else:
            partes.append({'id': 'pc-4', 'indice': 3, 'montoOrigen': o(MONTO_COMEDOR_PARTE_HNL),
                           'montoHnl': MONTO_COMEDOR_PARTE_HNL,
                           'estado': 'pagada' if estado == 'pagado' else ('reservada' if mia else 'libre'),
                           'pagadorNombre': 'Lucía' if (mia or estado == 'pagado') else None})
    return {'codigo': 'TRE-8M3', 'estado': estado, 'montoHnl': MONTO_COMEDOR_TOTAL_HNL,
            'montoOrigen': o(MONTO_COMEDOR_TOTAL_HNL), 'tasaHnlPorOrigen': HNL_POR_ORIGEN,
            'concepto': 'Almuerzo · mesa 6 · dividida entre 4',
            'negocio': {'nombre': 'Comedor Doña Tere', 'direccion': COMEDOR, 'verificado': True},
            'partes': partes}


COBROS = {'FLR-4K7': cobro_flor, 'TRE-8M3': cobro_comedor}


def token_falso():
    carga = {'userId': 'demo-lucia', 'address': MIA, 'role': 'user', 'verify': True,
             'email': CORREO, 'exp': 2100000000}
    b = base64.urlsafe_b64encode(json.dumps(carga).encode()).decode().rstrip('=')
    return f'demo.{b}.firma'


# ── el "backend" de mentira ──────────────────────────────────────────────────
class Mocks:
    def __init__(self):
        self.estado_cobro = {}   # codigo -> {'estado':..., 'mia':bool}
        self.recibos = 0

    def veta(self, ruta, metodo, cuerpo):
        p = ruta.split('?')[0]
        if p.startswith('/chains/getChainsForId/'):
            return 200, {'chainId': 5550, 'price': None, 'allTransfers': self.transfers}
        if p == '/genesis/estado':
            return 200, {'identidad': {'estado': 'verificada', 'gid': 'GID-HN-DEMO-0001',
                                       'nombreLegal': NOMBRE, 'documentoAceptable': True,
                                       'faltanDatos': [], 'actualizadaEn': '2026-08-20T10:00:00-06:00'}}
        if p == '/genesis/vincular':
            return 200, {'ok': True}
        if p == '/genesis/sso/token':
            return 200, {'token': 'pase-demo-genesis'}
        if p == '/wallet/deposits':
            return 200, {'items': []}
        if p == '/cards/my-card':
            # sin limites: el emisor no siempre los manda, y asi el boleto
            # entra en la misma pantalla que el plastico
            return 200, {'status': 'ACTIVE', 'last4': '2871', 'availableOrigen': 138.60}
        if p == '/cards/transactions':
            return 200, {'items': MOVS_TARJETA, 'total': len(MOVS_TARJETA)}
        if p.startswith('/cards/transactions/'):
            mid = p.rsplit('/', 1)[1]
            m = next((x for x in MOVS_TARJETA if x['id'] == mid), MOVS_TARJETA[0])
            return 200, m
        if p == '/cards/emision':
            return 200, {'abierta': True, 'precioUsd': 5, 'precioOrigen': 2}
        if p in ('/transaction/send', '/transaction/sendToken'):
            dest = (cuerpo or {}).get('recipientAddress', '').lower()
            h = {SOFIA: HASH['sofia'], FLORISTERIA: HASH['flor'], COMEDOR: HASH['comedor'],
                 TEXTILES: HASH['textiles']}.get(dest, hsh('e'))
            self.ultimo_hash = h
            return 200, {'hash': h, 'from': MIA, 'to': dest, 'amount': (cuerpo or {}).get('amount'),
                         'chain_id': '5550', 'coin': 'ORIGEN', 'status': 'pending', 'comision': '0.0084'}
        if p == '/auth/logout':
            return 200, {'ok': True}
        return 200, {}

    transfers = []

    def mtp(self, ruta, metodo, cuerpo):
        p = ruta.split('?')[0]
        if p == '/api/auth/sso':
            return 200, {'token': 'mtp-demo', 'user': {'email': CORREO, 'name': NOMBRE}}
        if p == '/api/companies':
            return 200, {'companies': []}
        if p in ('/api/categories', '/api/countries'):
            return 200, []
        if p == '/api/companies/mine':
            return 404, {'error': 'sin comercio'}
        if p.startswith('/api/cobros/codigo/'):
            partes = p[len('/api/cobros/codigo/'):].split('/')
            cod = partes[0]
            accion = partes[1] if len(partes) > 1 else None
            if cod not in COBROS:
                return 404, {'error': 'No existe ese cobro'}
            st = self.estado_cobro.setdefault(cod, {'estado': 'abierto', 'mia': False})
            if accion == 'reservar':
                st['mia'] = True
            elif accion == 'liberar':
                st['mia'] = False
            elif accion == 'pagar':
                st['estado'] = 'pagado'
            return 200, {'cobro': COBROS[cod](st['estado'], st['mia'])}
        return 200, {}

    def rpc(self, cuerpo):
        m = (cuerpo or {}).get('method')
        prm = (cuerpo or {}).get('params') or []
        i = (cuerpo or {}).get('id', 1)
        r = None
        if m == 'eth_getBalance':
            r = wei(ORIGEN_SALDO)
        elif m == 'eth_call':
            to = str((prm[0] or {}).get('to', '')).lower()
            r = '0x' + format(ONDK_SALDO * 10**18, '064x') if to == CONTRATO_ONDK else '0x' + '0' * 64
        elif m == 'eth_getTransactionReceipt':
            self.recibos += 1
            h = prm[0] if prm else hsh('e')
            r = {'transactionHash': h, 'blockNumber': hx(2841577 + self.recibos), 'blockHash': hsh('1'),
                 'status': '0x1', 'gasUsed': '0x5208', 'cumulativeGasUsed': '0x5208',
                 'from': MIA, 'logs': []}
        elif m == 'eth_gasPrice':
            r = '0x5d21dba000'
        elif m == 'eth_blockNumber':
            r = hx(2841600)
        elif m == 'eth_chainId':
            r = hx(5550)
        else:
            r = '0x0'
        return 200, {'jsonrpc': '2.0', 'id': i, 'result': r}

    def otro(self, host, ruta):
        p = ruta.split('?')[0]
        if host == 'api.gold-api.com':
            if p.endswith('/XAU'):
                return 200, {'name': 'Gold', 'price': round(ORO, 4), 'symbol': 'XAU'}
            return 200, {'name': 'Silver', 'price': 38.20, 'symbol': 'XAG'}
        if host == 'api.coingecko.com':
            if '/simple/price' in p:
                return 200, {'pax-gold': {'usd': ORO, 'usd_24h_change': 0.42},
                             'kinesis-silver': {'usd': 38.2, 'usd_24h_change': -0.18}}
            return 200, {'prices': []}
        if host == 'open.er-api.com':
            return 200, {'result': 'success', 'base_code': 'USD', 'time_last_update_unix': epoch('00:05'),
                         'rates': {'USD': 1, 'HNL': 26.30, 'GTQ': 7.72, 'MXN': 18.6, 'EUR': 0.91,
                                   'NIO': 36.8, 'CRC': 512.0, 'COP': 4020.0, 'SVC': 8.75}}
        if host == 'ordenex-api-ba4b27b8b51a.herokuapp.com':
            if p.startswith('/precio-declarado/'):
                return 200, {'simbolo': 'ONDK', 'moneda': 'USD',
                             'vigente': {'precio': 1.00, 'acta': 'JD-2026-08-16',
                                         'fecha': '2026-08-15T12:00:00Z', 'firmante': 'Secretaría de la Junta'}}
            return 404, {'error': 'no'}
        if host == 'genesis-id.onrender.com':
            return 200, {'ok': True}
        if host == 'cerebro.ordenscan.com':
            return 503, {'error': 'relevo apagado en la demo'}
        return 404, {}


# ── servidor estatico ────────────────────────────────────────────────────────
def preparar_web():
    web = TRABAJO / 'apps-web' / 'veta-wallet'
    if not (web / 'app.js').exists():
        TRABAJO.mkdir(parents=True, exist_ok=True)
        arch = subprocess.run(['git', '-C', str(REPO), 'archive', RAMA, 'apps-web/veta-wallet'],
                              check=True, capture_output=True).stdout
        subprocess.run(['tar', '-x', '-C', str(TRABAJO)], input=arch, check=True)
    return web


class Silencioso(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def servir(raiz):
    srv = ThreadingHTTPServer(('127.0.0.1', 0), partial(Silencioso, directory=str(raiz)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f'http://127.0.0.1:{srv.server_address[1]}'


def bajar_fuente(url):
    """Las fuentes de Google se bajan DESDE PYTHON, con el proxy y el CA del
    entorno, y se cachean. El navegador no sale a la red nunca."""
    CACHE_FUENTES.mkdir(parents=True, exist_ok=True)
    clave = base64.urlsafe_b64encode(url.encode()).decode()[:200]
    f = CACHE_FUENTES / clave
    meta = f.with_suffix('.tipo')
    if f.exists() and meta.exists():
        return f.read_bytes(), meta.read_text()
    ctx = ssl.create_default_context(cafile=os.environ.get('SSL_CERT_FILE') or '/root/.ccr/ca-bundle.crt')
    prox = os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')
    handlers = [urllib.request.HTTPSHandler(context=ctx)]
    if prox:
        handlers.append(urllib.request.ProxyHandler({'https': prox, 'http': prox}))
    op = urllib.request.build_opener(*handlers)
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'})
    with op.open(req, timeout=30) as r:
        d, tipo = r.read(), r.headers.get('Content-Type', 'application/octet-stream')
    f.write_bytes(d)
    meta.write_text(tipo)
    return d, tipo


CSS_LIMPIEZA = """
/* fuera lo que flota encima del contenido en una captura */
#aura-orbe, .aura-orbe, #aura, .aura-flota, #air-mano, .air-mano, #airtouch, .air-boton,
#at-boton, #pantalla-llena, #aura-panel,
#ofrecer-avisos, .instalar-cinta, #instalar, .sorteo-cinta { display: none !important; }
"""

# UNICO ajuste de maquetacion (no de datos): en index.html la clase `.comp`
# la usan dos cosas — el comprobante de envio (#env-comprobante, con .bloque) y
# la pagina publica #comprobar (linea ~3892: padding:110px 20px 60px). La
# segunda regla gana y el recibo sale con un hueco de 110px arriba. Aqui se le
# devuelve al recibo el relleno de cualquier .bloque. Es un choque de nombres
# de la web, no un dato; ver LEEME.md.
CSS_COMPROBANTE = """
#env-comprobante.comp { padding: clamp(20px,3vw,26px) !important; margin-top: 22px !important;
                        max-width: none !important; }
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--salida', default=str(SALIDA_DEF))
    ap.add_argument('--solo', default='')
    ap.add_argument('--depurar', action='store_true')
    args = ap.parse_args()
    salida = Path(args.salida)
    salida.mkdir(parents=True, exist_ok=True)
    solo = set(filter(None, args.solo.split(',')))

    web = preparar_web()
    srv, base = servir(TRABAJO)
    sitio = f'{base}/apps-web/veta-wallet/index.html'
    log = []   # (pantalla, host, accion, metodo, ruta)

    with sync_playwright() as pw:
        exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
        nav = pw.chromium.launch(executable_path=exe if os.path.exists(exe) else None, args=['--no-sandbox'])

        def pagina(nombre, hora, mocks):
            ctx = nav.new_context(viewport={'width': 360, 'height': 640}, device_scale_factor=3,
                                  locale='es-SV', timezone_id=TZ, service_workers='block',
                                  is_mobile=True, has_touch=True)
            pg = ctx.new_page()
            pg.clock.install(time=iso(hora))

            def ruta(route):
                req = route.request
                u = urlparse(req.url)
                host = u.hostname or ''
                path = u.path + (('?' + u.query) if u.query else '')
                if req.url.startswith(base):
                    log.append((nombre, host, 'local', req.method, u.path))
                    return route.continue_()
                if host in HOSTS_FUENTES:
                    try:
                        d, tipo = bajar_fuente(req.url)
                        log.append((nombre, host, 'fuente(python)', req.method, u.path))
                        return route.fulfill(status=200, body=d, headers={
                            'Content-Type': tipo, 'Access-Control-Allow-Origin': '*'})
                    except Exception as e:
                        log.append((nombre, host, f'fuente-fallo:{e}', req.method, u.path))
                        return route.abort()
                if host in HOSTS_MOCK:
                    cuerpo = None
                    try:
                        cuerpo = json.loads(req.post_data) if req.post_data else None
                    except Exception:
                        cuerpo = None
                    if req.method == 'OPTIONS':
                        st, js = 204, None
                    elif req.url.startswith(API):
                        st, js = mocks.veta(path, req.method, cuerpo)
                    elif req.url.startswith(MTP):
                        st, js = mocks.mtp(path, req.method, cuerpo)
                    elif host == 'rpc.ordenglobal-rpc.com':
                        st, js = mocks.rpc(cuerpo)
                    else:
                        st, js = mocks.otro(host, path)
                    log.append((nombre, host, f'mock {st}', req.method, u.path))
                    return route.fulfill(status=st, content_type='application/json',
                                         headers={'Access-Control-Allow-Origin': '*',
                                                  'Access-Control-Allow-Headers': '*',
                                                  'Access-Control-Allow-Methods': '*'},
                                         body='' if js is None else json.dumps(js))
                log.append((nombre, host, 'ABORTADA', req.method, u.path))
                return route.abort()

            pg.route('**/*', ruta)
            ctx.route('**/*', ruta)   # tambien lo que no sale de la pagina principal
            errores = []
            pg.on('pageerror', lambda e: errores.append(str(e)))
            sesion = {'token': token_falso(), 'refresco': 'refresco-demo', 'correo': CORREO,
                      'nombre': NOMBRE, 'direccion': MIA}
            pg.add_init_script(f"""
              try {{
                localStorage.setItem('veta.sesion', {json.dumps(json.dumps(sesion))});
                localStorage.setItem('veta.idioma', 'es');
                localStorage.setItem('veta.bienvenida.v1', '1');
                localStorage.setItem('veta.aura.presentada.' + {json.dumps(CORREO)}, '1');
                localStorage.setItem('og.avisos.ofrecido', String(Date.now()));
                localStorage.setItem('veta.airtouch.tuto', '1');
                localStorage.setItem('veta.aura.micro.ofrecido', '1');
                localStorage.setItem('veta.contactos', JSON.stringify([
                  {{nombre: 'Sofía', dir: '{SOFIA}'}},
                  {{nombre: 'Textiles del Valle', dir: '{TEXTILES}'}},
                  {{nombre: 'Floristería El Girasol', dir: '{FLORISTERIA}'}}
                ]));
              }} catch (e) {{}}
            """)
            # MyTokenPay en la web REAL solo sabe lempiras: `mtpHnl()` escribe
            # 'L ' fijo en el codigo. Para El Salvador (dolar) se reescribe en
            # pantalla todo «L 12.34» como «$12.34». Es texto, no datos: ver LEEME.
            pg.add_init_script(r"""
              (() => {
                const RX = /(^|[^A-Za-z\u00C0-\u024F])L\s(\d[\d,]*\.\d{2})/g;
                const pasar = (raiz) => {
                  const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
                  let n; while ((n = w.nextNode())) {
                    if (RX.test(n.nodeValue)) { RX.lastIndex = 0; n.nodeValue = n.nodeValue.replace(RX, '$1$$$2'); }
                    RX.lastIndex = 0;
                  }
                };
                const arrancar = () => {
                  pasar(document.body);
                  new MutationObserver(ms => ms.forEach(m => {
                    m.addedNodes.forEach(x => x.nodeType === 3 ? pasar(x.parentNode || document.body) : x.nodeType === 1 && pasar(x));
                    if (m.type === 'characterData' && m.target.parentNode) pasar(m.target.parentNode);
                  })).observe(document.body, { childList: true, subtree: true, characterData: true });
                };
                if (document.body) arrancar(); else document.addEventListener('DOMContentLoaded', arrancar);
              })();
            """)
            pg.goto(sitio, wait_until='domcontentloaded')
            pg.add_style_tag(content=CSS_LIMPIEZA)
            pg.wait_for_timeout(3500)
            return ctx, pg, errores

        def foto(pg, nombre, css_extra='', scroll=None, arriba=None):
            if css_extra:
                pg.add_style_tag(content=css_extra)
            pg.add_style_tag(content=CSS_LIMPIEZA)
            if arriba:
                pg.evaluate("""(s) => { const el = document.querySelector(s);
                    if (el) { el.scrollIntoView({block: 'start'}); window.scrollBy(0, -12); } }""", arriba)
            elif scroll is not None:
                pg.evaluate(f'window.scrollTo(0, {scroll})')
            pg.wait_for_timeout(700)
            vis = pg.evaluate("""() => document.body.innerText""")
            import re as _re
            malos = _re.findall(r'(?:^|[^A-Za-zÀ-ɏ])L\s?\d|[Ll]empira|HNL', vis)
            if malos:
                print('  !! texto en lempiras visible:', malos[:5])
            destino = salida / f'{nombre}.png'
            pg.screenshot(path=str(destino))
            print('  ->', destino)

        def vista(pg, v, dato=None):
            pg.evaluate('([v, d]) => VETA.vista(v, d)', [v, dato])
            pg.wait_for_timeout(900)

        pantallas = {}

        def pantalla(clave):
            def reg(f):
                pantallas[clave] = f
                return f
            return reg

        # A · el envio a Sofia, confirmado en cadena --------------------------
        @pantalla('A')
        def _a():
            m = Mocks()
            ctx, pg, err = pagina('A', '06:40', m)
            pg.clock.set_system_time(iso('06:41', 5))
            vista(pg, 'enviar')
            pg.select_option('.env-contactos', SOFIA)
            pg.fill('#env-monto', '80')
            pg.fill('#env-clave', 'demo-demo')
            pg.click('#env-btn'); pg.wait_for_timeout(500)
            pg.click('#env-btn'); pg.wait_for_timeout(2500)
            pg.wait_for_selector('#env-comprobante[data-estado="confirmada"]', timeout=15000)
            pg.wait_for_timeout(3600)   # que se vaya la tostada
            foto(pg, 'A_enviar', css_extra=CSS_COMPROBANTE, scroll=0)
            ctx.close(); return err

        # B · la tarjeta Visa virtual con el boleto -----------------------------
        @pantalla('B')
        def _b():
            m = Mocks()
            ctx, pg, err = pagina('B', '06:45', m)
            vista(pg, 'tarjeta')
            pg.wait_for_selector('.tar-mov', timeout=15000)
            # el plastico y, debajo, el boleto recien comprado
            foto(pg, 'B_tarjeta', arriba='.tar-escena')
            foto(pg, 'B_tarjeta_arriba', scroll=0)
            ctx.close(); return err

        def pagar_cobro(pg, codigo, parte_id):
            vista(pg, 'paycobro')
            pg.fill('#mtp-cod', codigo)
            pg.click('form[onsubmit*="payLeerCodigo"] button[type=submit]')
            pg.wait_for_timeout(1200)
            pg.evaluate('(id) => VETA.payTomar(id)', parte_id)
            pg.wait_for_timeout(1200)

        # C · Floristeria El Girasol, pagada ------------------------------------
        @pantalla('C')
        def _c():
            m = Mocks()
            ctx, pg, err = pagina('C', '10:16', m)
            pg.clock.set_system_time(iso('10:17', 10))
            pagar_cobro(pg, 'FLR4K7', 'pf-1')
            foto(pg, 'C_pagar_revision', arriba='.mtp-partes')
            pg.fill('#mtp-clave', 'demo-demo')
            pg.click('#mtp-pagar-btn'); pg.wait_for_timeout(1500)
            foto(pg, 'C_pagar', scroll=0)
            ctx.close(); return err

        # E · Comedor Dona Tere, cuenta dividida --------------------------------
        @pantalla('E')
        def _e():
            m = Mocks()
            ctx, pg, err = pagina('E', '13:57', m)
            pg.clock.set_system_time(iso('13:58', 4))
            pagar_cobro(pg, 'TRE8M3', 'pc-4')
            foto(pg, 'E_dividir', arriba='.mtp-partes')
            foto(pg, 'E_dividir_arriba', scroll=0)
            pg.fill('#mtp-clave', 'demo-demo')
            pg.click('#mtp-pagar-btn'); pg.wait_for_timeout(1500)
            foto(pg, 'E_dividir_pagado', scroll=0)
            ctx.close(); return err

        # G · comprobante a Textiles del Valle ----------------------------------
        @pantalla('G')
        def _g():
            m = Mocks()
            ctx, pg, err = pagina('G', '15:41', m)
            pg.clock.set_system_time(iso('15:42', 5))
            vista(pg, 'enviar')
            pg.select_option('.env-contactos', TEXTILES)
            pg.fill('#env-monto', str(int(MONTO_TEXTILES)))
            pg.fill('#env-clave', 'demo-demo')
            pg.click('#env-btn'); pg.wait_for_timeout(500)
            pg.click('#env-btn'); pg.wait_for_timeout(2500)
            pg.wait_for_selector('#env-comprobante[data-estado="confirmada"]', timeout=15000)
            pg.wait_for_timeout(3600)
            foto(pg, 'G_comprobante', css_extra=CSS_COMPROBANTE, arriba='#env-comprobante')
            ctx.close(); return err

        # H · la actividad del dia ----------------------------------------------
        @pantalla('H')
        def _h():
            m = Mocks()
            Mocks.transfers = TRANSFERENCIAS
            ctx, pg, err = pagina('H', '15:46', m)
            vista(pg, 'actividad')
            foto(pg, 'H_actividad', scroll=0)
            Mocks.transfers = []
            ctx.close(); return err

        # J · la ficha de ONDK, sin precio ni valor -----------------------------
        @pantalla('J')
        def _j():
            m = Mocks()
            ctx, pg, err = pagina('J', '16:10', m)
            vista(pg, 'token', 'ONDK')
            pg.wait_for_timeout(800)
            css = """
              .ficha-cifra > div:nth-child(2) { display: none !important; }
              .ficha-precio > span:first-child { display: none !important; }
              .ficha-precio + p.pie.sin-precio { display: none !important; }
              .grf-marco { display: none !important; }
            """
            foto(pg, 'J_ondk', css_extra=css, arriba='.ficha-cab')
            txt = pg.evaluate("() => document.querySelector('#app').innerText")
            vis = pg.evaluate("""() => [...document.querySelectorAll('#app *')]
                .filter(e => e.offsetParent !== null && e.children.length === 0)
                .map(e => e.textContent.trim()).filter(Boolean).join(' | ')""")
            if '$' in vis or 'declarado' in vis.lower():
                print('  !! J: sigue visible algo de precio:', [s for s in vis.split(' | ') if '$' in s or 'eclarado' in s])
            ctx.close(); return err

        for clave, f in pantallas.items():
            if solo and clave not in solo:
                continue
            print(f'[{clave}]')
            err = f()
            for e in err:
                print('  pageerror:', e[:200])

        nav.close()
    srv.shutdown()

    # el registro de red: la prueba de que nada salio
    with open(salida / 'red.log', 'w') as fh:
        for fila in log:
            fh.write('\t'.join(fila) + '\n')
    resumen = {}
    for _, host, acc, _, _ in log:
        k = (host, acc.split(' ')[0] if acc.startswith('mock') else acc)
        resumen[k] = resumen.get(k, 0) + 1
    print('\nRED (host, accion) -> n')
    for (h, a), n in sorted(resumen.items()):
        print(f'  {h:45s} {a:18s} {n}')
    salidas = [h for (h, a) in resumen if a not in ('local', 'mock', 'ABORTADA', 'fuente(python)')]
    print('continue() hacia fuera de 127.0.0.1:', 'NINGUNO' if not any(
        a == 'local' and h != '127.0.0.1' for (h, a) in resumen) else 'HAY')


if __name__ == '__main__':
    main()
