#!/usr/bin/env python3
"""AU-RA dentro de PULSE2CHAT: el asistente que atiende por el chat.

══ QUE ES ════════════════════════════════════════════════════════════════════

Una ficha mas del chat. Se llama AU-RA, tiene su gid, y las personas del
grupo de prueba le escriben como a cualquier contacto: solicitud de amistad,
la acepta, y conversan. Por dentro, cada pregunta viaja al motor (Ollama, en
esta misma maquina) con el prompt de la casa, las fichas del saber y lo que
la persona conto de si misma al empezar.

No hay app nueva que instalar ni pantalla nueva que aprender: el chat que ya
existe ES la interfaz. Los grupos, las notificaciones y la identidad ya
estaban construidos; el asistente solo se sienta a la mesa.

══ EL CIFRADO, DICHO SIN RODEOS ══════════════════════════════════════════════

El chat es cifrado de punta a punta ENTRE PERSONAS, y eso no se toca. Este
asistente funciona porque nunca publica llaves de aparato: el cliente, al ver
que el destinatario no tiene llaves (`cerrarPara` devuelve null si `aparatos`
esta vacio, chat.js:257), manda el texto en claro para el. O sea:

  · persona ↔ persona   sigue cerrado de punta a punta, como siempre
  · persona ↔ AU-RA     viaja por TLS y lo lee este proceso en el servidor

Eso es un intercambio, no un truco, y el asistente lo dice en su primer
mensaje. La gente decide sabiendo.

══ LO QUE NO HACE, A PROPOSITO ═══════════════════════════════════════════════

  · No mueve dinero, no firma, no toca cuentas. Es conversacion.
  · No entra a grupos: solo charlas directas. Un asistente metido en un grupo
    leeria todo lo que ahi se diga, y eso no se hace sin pensarlo mas.
  · No responde a quien no este en la lista de prueba. La solicitud queda
    pendiente, sin rechazo: si mañana se agrega a la persona, se acepta.
  · Si el motor esta caido, LO DICE. No finge una respuesta.

══ CONFIGURACION (variables de entorno) ══════════════════════════════════════

  AURA_RELEVO    https://cerebro.ordenscan.com/mensajes  (sin barra final)
  AURA_CORREO    aura@ordenglobal.org
  AURA_DATOS     /srv/aura   — llave.txt, perfiles.json, probadores.txt,
                               PROMPT-AURA.md, saber.json
  AURA_MOTOR     http://127.0.0.1:11434
  AURA_MODELO    llama3.2
  AURA_PASO      segundos entre vueltas (4)

En el primer arranque, si no hay llave.txt, se da de alta solo en el relevo y
guarda la llave con permisos 600. La llave NUNCA va al repositorio.
"""
import json
import os
import pathlib
import re
import stat
import sys
import time
import unicodedata
import urllib.error
import urllib.request

RELEVO = os.environ.get('AURA_RELEVO', 'https://cerebro.ordenscan.com/mensajes').rstrip('/')
CORREO = os.environ.get('AURA_CORREO', 'aura@ordenglobal.org').lower()
DATOS = pathlib.Path(os.environ.get('AURA_DATOS', '/srv/aura'))
MOTOR = os.environ.get('AURA_MOTOR', 'http://127.0.0.1:11434').rstrip('/')
MODELO = os.environ.get('AURA_MODELO', 'llama3.2')
PASO = float(os.environ.get('AURA_PASO', '4'))

# La maquina es un t2.large sin GPU: una respuesta puede tardar medio minuto.
# El timeout corto tipico (10s) mataria respuestas perfectamente sanas.
TIMEOUT_MOTOR = int(os.environ.get('AURA_TIMEOUT', '90'))

# Techo de preguntas por persona por dia. No es tacañeria: sin techo, una
# sola persona con un bucle deja al motor ocupado para los otros catorce.
TECHO_DIA = int(os.environ.get('AURA_TECHO', '60'))

# Cuantos turnos de memoria lleva cada charla al motor. Mas historial empuja
# las fichas fuera de la ventana del modelo, y sin fichas el modelo inventa.
MEMORIA = 8


def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


# ── hablar con el relevo ─────────────────────────────────────────────────────

def _post(ruta, cuerpo, timeout=20):
    req = urllib.request.Request(
        RELEVO + ruta, method='POST',
        data=json.dumps(cuerpo).encode(),
        headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read() or b'{}')


class Relevo:
    """El asistente como cliente del chat: mismas rutas que usa la app."""

    def __init__(self, correo, llave):
        self.correo, self.llave = correo, llave

    def _f(self, extra):
        return {'correo': self.correo, 'llave': self.llave, **extra}

    def solicitudes(self):
        d = _post('/amistad/lista', self._f({}))
        return d.get('recibidas', [])

    def aceptar(self, de):
        return _post('/amistad/responder', self._f({'de': de, 'aceptar': True}))

    def conversaciones(self):
        return _post('/conversaciones', self._f({})).get('conversaciones', [])

    def bandeja(self, desde):
        return _post('/bandeja', self._f({'desde': desde})).get('mensajes', [])

    def leido(self, de):
        return _post('/leido', self._f({'de': de}))

    def escribiendo(self, para):
        # El «esta escribiendo…» de siempre. Con respuestas que tardan medio
        # minuto, este aviso es la diferencia entre «esta pensando» y «murio».
        try:
            _post('/escribiendo', self._f({'para': para}), timeout=6)
        except Exception:
            pass

    def enviar(self, para, texto):
        return _post('/enviar', self._f({'para': para, 'texto': texto}))


# ── el alta, una sola vez ────────────────────────────────────────────────────

def llave_del_asistente():
    """Lee la llave guardada, o da de alta la cuenta si es la primera vez."""
    DATOS.mkdir(parents=True, exist_ok=True)
    f = DATOS / 'llave.txt'
    if f.exists():
        return f.read_text().strip()
    d = _post('/alta', {'correo': CORREO, 'nombre': 'AU-RA', 'gid': 'AURA'})
    llave = d.get('llave')
    if not llave:
        raise SystemExit(f'el relevo no dio llave: {d}')
    f.write_text(llave)
    f.chmod(stat.S_IRUSR | stat.S_IWUSR)   # 600: la llave es la identidad
    log('cuenta creada en el relevo:', CORREO)
    return llave


# ── quien puede hablarle ─────────────────────────────────────────────────────

def probadores():
    """La lista de prueba. Un correo por linea; # comenta. Se relee en cada
    vuelta a proposito: agregar a alguien es editar el archivo, sin reiniciar."""
    f = DATOS / 'probadores.txt'
    if not f.exists():
        return set()
    lineas = f.read_text().splitlines()
    return {l.strip().lower() for l in lineas
            if l.strip() and not l.strip().startswith('#')}


# ── la memoria del asistente ─────────────────────────────────────────────────

def cargar_perfiles():
    f = DATOS / 'perfiles.json'
    if f.exists():
        try:
            return json.loads(f.read_text())
        except Exception:
            # Un JSON roto no puede tumbar el servicio; se aparta y se empieza
            # de nuevo. Perder perfiles es malo; quedarse mudo es peor.
            f.rename(DATOS / f'perfiles.roto.{int(time.time())}.json')
    return {}


def guardar_perfiles(p):
    f = DATOS / 'perfiles.json'
    tmp = DATOS / 'perfiles.tmp'
    tmp.write_text(json.dumps(p, ensure_ascii=False, indent=1))
    tmp.replace(f)   # atomico: nunca queda medio archivo


# ── la entrevista de entrada ─────────────────────────────────────────────────
#
# Las preguntas de conocer a la persona NO las hace el modelo: las hace este
# codigo, en orden fijo. Un modelo al que se le pide «preguntale cosas» un dia
# pregunta de mas, otro dia no pregunta, y otro dia pregunta algo indebido.
# La entrevista es la primera impresion del producto: va escrita, no improvisada.

SALUDO = (
    "Hola, soy AU-RA, la inteligencia de Orden Global. Estás en el grupo de "
    "prueba, así que bienvenido dos veces.\n\n"
    "Una cosa primero, porque acá se dice todo: esta conversación conmigo la "
    "procesa nuestro servidor para poder contestarte. Tus chats con otras "
    "personas siguen cifrados de punta a punta y ahí no entra nadie — yo "
    "tampoco.\n\n"
    "Para ayudarte mejor me gustaría conocerte un poco. ¿A qué te dedicás?")

PREGUNTAS = [
    ('trabajo', None),   # la hace el saludo
    ('estudios', "Buenísimo. ¿Y qué estudiaste, o dónde se formó tu experiencia?"),
    ('interes', "Última y te dejo tranquilo: ¿qué te gustaría lograr con "
                "Orden Global — ahorrar, pagar, entender la cadena, otra cosa?"),
]

CIERRE = (
    "Gracias — con eso ya te conozco. Preguntame lo que quieras del "
    "ecosistema: ORIGEN, la cadena, tu Genesis ID, la tarjeta, lo que venga. "
    "Y si algo no lo sé, te lo digo derecho.")

FUERA_DE_LISTA = None   # a quien no esta en la lista no se le contesta nada

MOTOR_CAIDO = (
    "Ahora mismo no puedo pensar: mi motor está apagado. Ya avisé a la casa — "
    "probá de nuevo en un rato.")

TECHO_MSG = (
    "Por hoy llegamos al tope de preguntas que puedo atender por persona — "
    "estamos en prueba y el motor es uno solo. Mañana seguimos.")


# ── el motor ─────────────────────────────────────────────────────────────────

def _sin_tildes(s):
    return ''.join(c for c in unicodedata.normalize('NFD', str(s).lower())
                   if unicodedata.category(c) != 'Mn')


def cargar_saber():
    d = json.loads((DATOS / 'saber.json').read_text())
    fichas = d if isinstance(d, list) else d.get('fichas', [])
    return [f for f in fichas if f.get('publico') is not False]


def cargar_prompt():
    md = (DATOS / 'PROMPT-AURA.md').read_text()
    i = md.index('```')
    j = md.index('```', i + 3)
    return md[i + 3:j].strip()


def fichas_para(saber, dicho):
    """Las fichas que tocan la pregunta; si ninguna engancha, TODAS.
    Dejar al modelo sin fichas es dejarlo inventando."""
    d = _sin_tildes(dicho)
    tocadas = [f for f in saber
               if any(_sin_tildes(p) in d for p in f.get('palabras', []))
               or _sin_tildes(f.get('tema', '')) in d]
    elegidas = tocadas or saber
    return '\n'.join(f"— {f['tema']}: {f.get('es', '')}" for f in elegidas)


def preguntar_motor(prompt, fichas, perfil, historial, dicho):
    quien = ''
    if perfil.get('trabajo'):
        quien = ("\n\nQUIEN TE HABLA (lo conto al presentarse; usalo para "
                 "adaptar ejemplos y tono, nunca lo repitas entero):\n"
                 f"- se dedica a: {perfil.get('trabajo','')[:200]}\n"
                 f"- se formo en: {perfil.get('estudios','')[:200]}\n"
                 f"- busca: {perfil.get('interes','')[:200]}")
    sistema = prompt + quien + '\n\nFICHAS:\n' + fichas
    mensajes = ([{'role': 'system', 'content': sistema}]
                + historial[-MEMORIA:]
                + [{'role': 'user', 'content': str(dicho)[:1000]}])
    cuerpo = json.dumps({
        'model': MODELO, 'messages': mensajes, 'stream': False,
        'options': {'temperature': 0.3, 'num_predict': 260},
    }).encode()
    req = urllib.request.Request(
        MOTOR + '/api/chat', data=cuerpo, method='POST',
        headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=TIMEOUT_MOTOR) as r:
        j = json.loads(r.read())
    texto = (j.get('message') or {}).get('content', '').strip()
    if len(texto) > 900:
        corte = texto.rfind('.', 0, 900)
        texto = texto[:corte + 1 if corte > 200 else 900].strip()
    return texto


# ── una vuelta del asistente ─────────────────────────────────────────────────

def hoy():
    return time.strftime('%Y-%m-%d')


def atender(rel, saber, prompt, perfiles, msg, lista):
    """Atiende UN mensaje. Cualquier fallo aqui no tumba la vuelta."""
    de = msg['de']
    dicho = (msg.get('texto') or '').strip()
    if not dicho:
        # Un adjunto, o un mensaje cifrado que no podemos abrir (alguien con
        # cliente viejo). No se adivina: se dice.
        rel.enviar(de, 'Por ahora solo entiendo texto. ¿Me lo escribís?')
        return

    p = perfiles.setdefault(de, {'historial': [], 'dia': hoy(), 'usadas': 0})

    # el techo del dia
    if p.get('dia') != hoy():
        p['dia'], p['usadas'] = hoy(), 0
    if p['usadas'] >= TECHO_DIA:
        rel.enviar(de, TECHO_MSG)
        return
    p['usadas'] += 1

    # la entrevista, en orden y sin improvisar
    for i, (campo, pregunta) in enumerate(PREGUNTAS):
        if campo not in p:
            p[campo] = dicho[:400]
            if i + 1 < len(PREGUNTAS):
                rel.enviar(de, PREGUNTAS[i + 1][1])
            else:
                rel.enviar(de, CIERRE)
            return

    # conversacion libre, contra el motor
    rel.escribiendo(de)
    try:
        r = preguntar_motor(prompt, fichas_para(saber, dicho),
                            p, p['historial'], dicho)
    except Exception as e:
        log('motor caido:', type(e).__name__, str(e)[:120])
        rel.enviar(de, MOTOR_CAIDO)
        p['usadas'] -= 1   # una pregunta sin respuesta no gasta el cupo
        return
    if not r:
        rel.enviar(de, MOTOR_CAIDO)
        p['usadas'] -= 1
        return
    p['historial'] = (p['historial'] + [
        {'role': 'user', 'content': dicho[:600]},
        {'role': 'assistant', 'content': r[:600]},
    ])[-MEMORIA:]
    rel.enviar(de, r)


def vuelta(rel, saber, prompt, perfiles):
    lista = probadores()

    # 1 · amistades: se acepta SOLO a la lista. El resto queda pendiente sin
    #     rechazo — agregar a alguien mañana es editar probadores.txt.
    for s in rel.solicitudes():
        c = (s.get('correo') or '').lower()
        if c in lista:
            rel.aceptar(c)
            log('amistad aceptada:', c)
            rel.enviar(c, SALUDO)
            perfiles.setdefault(c, {'historial': [], 'dia': hoy(),
                                    'usadas': 0, 'saludado': True})

    # 2 · mensajes nuevos
    for conv in rel.conversaciones():
        c = (conv.get('correo') or '').lower()
        if c == CORREO or not conv.get('sinLeer'):
            continue
        if c not in lista:
            continue          # ni respuesta ni acuse: silencio educado
        if str(conv.get('correo', '')).startswith('g:'):
            continue          # grupos no, a proposito (ver cabecera)
        visto = perfiles.get(c, {}).get('visto', 0)
        nuevos = [m for m in rel.bandeja(c)
                  if m.get('de') == c and m.get('cuando', 0) > visto]
        if not nuevos:
            rel.leido(c)
            continue
        for m in nuevos:
            try:
                atender(rel, saber, prompt, perfiles, m, lista)
            except Exception as e:
                log('fallo atendiendo a', c, type(e).__name__, str(e)[:120])
            perfiles.setdefault(c, {'historial': [], 'dia': hoy(),
                                    'usadas': 0})['visto'] = m.get('cuando', 0)
        rel.leido(c)


def main():
    llave = llave_del_asistente()
    rel = Relevo(CORREO, llave)
    saber = cargar_saber()
    prompt = cargar_prompt()
    perfiles = cargar_perfiles()
    log(f'AU-RA de pie · {len(saber)} fichas · modelo {MODELO} · '
        f'{len(probadores())} probadores')
    while True:
        try:
            vuelta(rel, saber, prompt, perfiles)
            guardar_perfiles(perfiles)
        except Exception as e:
            # el relevo caido o la red rota no tumban el servicio: se espera
            log('vuelta fallida:', type(e).__name__, str(e)[:140])
            time.sleep(10)
        time.sleep(PASO)


if __name__ == '__main__':
    main()
