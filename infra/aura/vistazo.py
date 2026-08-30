# El parte: un vistazo a todo, dos veces al día y cuando se pida.
#
# ── QUE ES Y QUE NO ES ──────────────────────────────────────────────────────
#
# NO es el parte de `infra/equipo/parte.py`. Aquel lo escriben los agentes y va
# al cerebro, para el equipo. Este lo arma AU-RA sola y va al telefono de Jose,
# para que sepa que paso sin abrir nada.
#
# La pregunta que contesta es una: «¿hay algo que necesite que YO haga?». Todo
# lo demas es relleno, y el relleno en un parte diario es como se deja de leer
# un parte diario.
#
# ── LA REGLA QUE SOSTIENE TODO ESTO ─────────────────────────────────────────
#
# UNA FUENTE QUE FALLA SE DICE, NO SE OMITE.
#
# Es la leccion mas cara del 30-ago. Un parte que se calla la fuente rota se ve
# igual de bien que uno completo, y entonces «todo en orden» significa dos cosas
# distintas —«mire y esta bien» y «no pude mirar»— que es exactamente como una
# mentira de la SEC estuvo horas saliendo sin que nadie se enterara.
#
# Cada fuente va en su propio `try` y, si falla, aparece en el parte diciendo
# que no se pudo mirar.
#
# ── QUE SE LEE DEL CORREO, Y QUE NO ─────────────────────────────────────────
#
# Remitente, asunto y fecha. NO el cuerpo. Para saber si algo necesita
# respuesta basta con quien escribe y de que; bajar el contenido de los correos
# de una empresa a un servidor de GPU es mas dato en riesgo por cada linea de
# parte, y no hace falta ni una.
#
# Y el buzon es `bot@ordenglobal.org`, que recibe COPIAS. Nunca las credenciales
# del buzon real de nadie: asi el bot no puede escribir en nombre de Jose ni
# borrarle nada, y lo peor que puede filtrarse son copias.

import imaplib
import json
import os
import shutil
import ssl
import subprocess
import time
import urllib.request
from email.header import decode_header, make_header

# ── De donde se mira ────────────────────────────────────────────────────────
GENESIS = os.environ.get('AURA_GENESIS_SALUD',
                         'https://genesis-id.onrender.com/healthz')
RPC = os.environ.get('AURA_RPC', 'https://rpc.ordenglobal-rpc.com/')
ZERNIO = os.environ.get('ZERNIO_BASE', 'https://zernio.com/api/v1')

# El buzon de copias. Sin esto, la parte del correo simplemente no sale — y lo
# dice, no se la calla.
CORREO_SERVIDOR = (os.environ.get('AURA_CORREO_IMAP') or '').strip()
CORREO_USUARIO = (os.environ.get('AURA_CORREO_USUARIO') or '').strip()
CORREO_CLAVE = (os.environ.get('AURA_CORREO_CLAVE') or '').strip()

# Quien puede pedir el parte escribiendo «actualizar». Numeros o correos,
# separados por coma. Vacio = NADIE, que es lo correcto: el parte lleva cuentas
# internas y no es para cualquiera que adivine la palabra.
JEFES = {x.strip().lower() for x in
         (os.environ.get('AURA_PARTE_PARA') or '').split(',') if x.strip()}


def puede_pedirlo(quien):
    return bool(JEFES) and str(quien).strip().lower() in JEFES


def _http(url, cabeceras=None, timeout=25):
    req = urllib.request.Request(url, headers=cabeceras or {})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read() or b'{}')


# ── Las fuentes ─────────────────────────────────────────────────────────────
#
# Cada una devuelve `(lineas, pendientes)` o levanta. Lo que levanta lo recoge
# `juntar` y lo convierte en una linea que DICE que no se pudo mirar.

def _genesis():
    d = _http(GENESIS)
    c = d.get('comprobaciones') or {}
    lineas, pend = [], []
    cola = c.get('esperandoDecision')
    if cola:
        pend.append(f'{cola} identidad(es) esperando que alguien las mire')
    if c.get('enganchesFallidos'):
        pend.append(f'{c["enganchesFallidos"]} aviso(s) a apps sin entregar')
    wa = c.get('whatsapp') or {}
    if wa.get('fallidos'):
        pend.append(f'{wa["fallidos"]} aviso(s) por WhatsApp sin entregar')
    if c.get('bitacoraFirmada') is False:
        lineas.append('bitácora sin firmar (falta la clave)')
    a = c.get('bitacoraAncla')
    if a and not a.get('publicada'):
        lineas.append('el ancla se calcula pero no llega a la cadena')
    lineas.insert(0, f'Genesis ID {d.get("version", {}).get("commit", "?")[:7]}')
    return lineas, pend


def _cadena():
    cuerpo = json.dumps({'jsonrpc': '2.0', 'method': 'eth_blockNumber',
                         'params': [], 'id': 1}).encode()
    req = urllib.request.Request(RPC, data=cuerpo,
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=20) as r:
        alto = int(json.loads(r.read())['result'], 16)
    return [f'cadena en el bloque {alto:,}'.replace(',', '.')], []


def _whatsapp(clave, cuenta):
    if not (clave and cuenta):
        return [], []
    cab = {'Authorization': 'Bearer ' + clave}
    info = _http(f'{ZERNIO}/whatsapp/number-info?accountId={cuenta}', cab)
    ps = _http(f'{ZERNIO}/whatsapp/templates?accountId={cuenta}', cab)

    lineas, pend = [], []
    tel = info.get('phone') or {}
    waba = info.get('waba') or {}
    if waba.get('business_verification_status') != 'verified':
        pend.append('la verificación de negocio de Meta sigue sin enviar')
    if tel.get('health_status', {}).get('can_send_message') != 'AVAILABLE':
        lineas.append(f'WhatsApp limitado a {tel.get("messaging_limit_tier", "?")}')

    plantillas = ps.get('templates') or []
    rech = [t['name'] for t in plantillas if t.get('status') == 'REJECTED']
    pends = [t['name'] for t in plantillas if t.get('status') == 'PENDING']
    if rech:
        pend.append(f'{len(rech)} plantilla(s) rechazada(s) por Meta')
    if pends:
        lineas.append(f'{len(pends)} plantilla(s) en revisión')
    return lineas, pend


# Cuantos reinicios en 24h dejan de ser normales. Uno o dos es un despliegue;
# ocho es algo que se esta cayendo solo y `Restart=always` lo esta tapando.
TOPE_REINICIOS = int(os.environ.get('AURA_TOPE_REINICIOS', '4'))


def _reinicios():
    """Cuantas veces se levanto AU-RA en el ultimo dia.

    POR QUE ESTO IMPORTA: la unidad tiene `Restart=always`, asi que un fallo
    que la tumba cada media hora se ve exactamente igual que un servicio sano
    —«active (running)»— y nadie se entera. Al mirar el journal habia 47
    arranques y nadie lo sabia.

    Si no hay `journalctl` esto no es una averia, es una maquina distinta: se
    calla, igual que el correo sin credenciales. Lo que SI se dice es que
    estando el mandato, falle.
    """
    if not shutil.which('journalctl'):
        return [], []
    s = subprocess.run(['journalctl', '-u', 'aura', '--since', '-24h', '--no-pager'],
                       capture_output=True, text=True, timeout=30)
    if s.returncode != 0:
        raise OSError((s.stderr or 'journalctl fallo').strip()[:80])
    n = s.stdout.count('AU-RA de pie')
    if n > TOPE_REINICIOS:
        return [], [f'AU-RA se reinició {n} veces en 24h (algo la está tumbando)']
    return ([f'{n} reinicio(s) en 24h'] if n else []), []


def _correo():
    """Remitente, asunto y fecha. NUNCA el cuerpo. Ver la cabecera."""
    if not (CORREO_SERVIDOR and CORREO_USUARIO and CORREO_CLAVE):
        return [], []
    m = imaplib.IMAP4_SSL(CORREO_SERVIDOR, ssl_context=ssl.create_default_context())
    try:
        m.login(CORREO_USUARIO, CORREO_CLAVE)
        # SOLO LECTURA. Sin esto, mirar el correo lo marcaria como leido — y el
        # parte cambiaria el buzon que viene a mirar.
        m.select('INBOX', readonly=True)
        ok, datos = m.search(None, 'UNSEEN')
        ids = datos[0].split() if ok == 'OK' else []
        lineas, pend = [], []
        if not ids:
            return ['correo al día'], []
        pend.append(f'{len(ids)} correo(s) sin leer')
        for i in ids[-4:]:
            ok, d = m.fetch(i, '(BODY.PEEK[HEADER.FIELDS (FROM SUBJECT)])')
            if ok != 'OK' or not d or not d[0]:
                continue
            crudo = d[0][1].decode('utf8', 'replace')
            de = asunto = ''
            for linea in crudo.splitlines():
                if linea.lower().startswith('from:'):
                    de = linea[5:].strip()
                elif linea.lower().startswith('subject:'):
                    asunto = linea[8:].strip()
            try:
                asunto = str(make_header(decode_header(asunto)))
                de = str(make_header(decode_header(de)))
            except Exception:
                pass
            # Solo el nombre o la parte antes de la arroba: el parte se lee en
            # un telefono y una direccion entera se come la linea.
            corto = de.split('<')[0].strip().strip('"') or de
            lineas.append(f'· {corto[:24]}: {asunto[:44]}')
        return lineas, pend
    finally:
        try:
            m.logout()
        except Exception:
            pass


def juntar(registro=None, premio=None, clave_wa='', cuenta_wa=''):
    """Mira todo. Nunca levanta: lo que falla se dice.

    `registro` y `premio` son los modulos, y entran por parametro para que esto
    se pueda probar sin ellos y para no cargar medio asistente al importar.
    """
    lineas, pendientes, rotas = [], [], []

    def mirar(nombre, fn):
        try:
            ls, ps = fn()
            lineas.extend(ls)
            pendientes.extend(ps)
        except Exception as e:
            # SE DICE. Ver la cabecera: callarla haria que «todo en orden»
            # signifique tambien «no pude mirar».
            rotas.append(f'{nombre} no se pudo mirar ({type(e).__name__})')

    mirar('Genesis ID', _genesis)
    mirar('la cadena', _cadena)
    mirar('WhatsApp', lambda: _whatsapp(clave_wa, cuenta_wa))
    mirar('el correo', _correo)
    mirar('los reinicios', _reinicios)

    if registro is not None:
        try:
            r = registro.resumen(24)
            ev = r.get('por_evento') or {}
            if ev.get('guardia'):
                pendientes.append(f'el guardia cortó {ev["guardia"]} respuesta(s)')
            if ev.get('respuesta'):
                med = r.get('mediana_ms')
                lineas.append(f'{ev["respuesta"]} respuestas'
                              + (f', {med / 1000:.0f}s la típica' if med else ''))
        except Exception as e:
            rotas.append(f'el registro no se pudo leer ({type(e).__name__})')

    if premio is not None:
        try:
            p = premio.resumen()
            if p.get('por_pagar'):
                pendientes.append(f'{p["por_pagar"]} premio(s) por pagar')
            if p.get('quedan') is not None:
                lineas.append(f'quedan {p["quedan"]} de {p["tope"]} premios')
        except Exception as e:
            rotas.append(f'los premios no se pudieron leer ({type(e).__name__})')

    return {'pendientes': pendientes, 'lineas': lineas, 'rotas': rotas}


# El hueco de una plantilla de WhatsApp admite algo mas de mil caracteres. Se
# deja margen: pasarse no recorta el mensaje, lo RECHAZA entero.
TOPE = 950


def texto(datos):
    """El parte, para que quepa en un hueco de plantilla y se lea de pie.

    El orden no es estetico: primero lo que NECESITA A UNA PERSONA, despues lo
    que se rompio, y al final lo que solo hay que saber. Si algo se corta por
    largo, que sea lo ultimo.
    """
    partes = []
    if datos['pendientes']:
        partes.append('NECESITA VOS:\n' + '\n'.join('• ' + p for p in datos['pendientes']))
    if datos['rotas']:
        partes.append('NO SE PUDO MIRAR:\n' + '\n'.join('• ' + r for r in datos['rotas']))
    if datos['lineas']:
        partes.append('\n'.join(datos['lineas']))
    if not partes:
        return 'Todo en orden, y todo se pudo mirar.'
    t = '\n\n'.join(partes)
    return t if len(t) <= TOPE else t[:TOPE - 1].rsplit('\n', 1)[0] + '\n…'


# El hueco de una plantilla NO admite saltos de linea, ni tabuladores, ni cuatro
# espacios seguidos. Meta no los limpia: rechaza el envio entero. Como el parte
# de las 7:30 casi siempre cae fuera de la ventana de 24h —y entonces solo se
# puede mandar por plantilla— esto no es un detalle: es la diferencia entre que
# el parte llegue o no llegue.
_TOPE_HUECO = 900


def para_plantilla(datos):
    """El mismo parte, en una sola linea, para el hueco de la plantilla.

    Los saltos se vuelven separadores visibles en vez de desaparecer: sin esto
    «premios por pagar» y «cadena en el bloque 39.949» quedarian pegados y el
    parte se leeria como una frase sola.
    """
    trozos = []
    for etiqueta, cuales in (('NECESITA VOS', datos['pendientes']),
                             ('NO SE PUDO MIRAR', datos['rotas']),
                             ('', datos['lineas'])):
        if not cuales:
            continue
        junto = ' · '.join(' '.join(str(c).split()) for c in cuales)
        trozos.append(f'{etiqueta}: {junto}' if etiqueta else junto)
    t = ' — '.join(trozos) or 'Todo en orden, y todo se pudo mirar.'
    # Por si alguna linea traia un salto propio de una fuente externa (un asunto
    # de correo, por ejemplo): aqui ya no puede quedar ninguno.
    t = ' '.join(t.split())
    return t if len(t) <= _TOPE_HUECO else t[:_TOPE_HUECO - 1].rsplit(' ', 1)[0] + '…'


def cuando():
    """«jueves 7:30», para el primer hueco de la plantilla."""
    dias = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
    t = time.localtime()
    return f'{dias[t.tm_wday]} {t.tm_hour}:{t.tm_min:02d}'
