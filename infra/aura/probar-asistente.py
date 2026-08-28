#!/usr/bin/env python3
"""El asistente entero, de punta a punta, sin tocar produccion.

Se levanta el RELEVO DE VERDAD (infra/mensajes/servidor.py) en un puerto
libre, un motor de mentira que hace de Ollama, y el asistente en medio. Una
persona de la lista le manda solicitud, conversa, contesta la entrevista y
pregunta por ORIGEN; una de fuera intenta lo mismo. Se comprueba lo que la
persona VE, no lo que el codigo dice que hace.

El motor de mentira ademas ESPIA lo que le llega: la prueba verifica que el
prompt de la casa y las fichas de verdad viajaron en la peticion, y que el
perfil de la entrevista se uso. Un asistente que contesta sin fichas contesta
inventando, y eso no se ve desde fuera — por eso se mira por dentro.
"""
import json
import os
import pathlib
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

AQUI = pathlib.Path(__file__).parent
RAIZ = AQUI.parent.parent

# El asistente se importa TAMBIEN como modulo, aparte del proceso de verdad
# que se levanta mas abajo. Es para poder probar en seco las piezas puras —
# el limpiador de la salida, sobre todo— sin montar media conversacion para
# comprobar una expresion regular. Importarlo no arranca nada: el archivo
# tiene su guarda de __main__.
sys.path.insert(0, str(AQUI))
import asistente as aura  # noqa: E402

fallos = 0


def ok(cond, que, detalle=''):
    global fallos
    print(f"  {'ok   ' if cond else 'FALLA'} {que}" + (f"\n           {detalle}" if detalle and not cond else ''))
    if not cond:
        fallos += 1


def puerto_libre():
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    p = s.getsockname()[1]
    s.close()
    return p


def post(base, ruta, cuerpo):
    req = urllib.request.Request(base + ruta, method='POST',
                                 data=json.dumps(cuerpo).encode(),
                                 headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


# ── el motor de mentira ──────────────────────────────────────────────────────

visto = {'peticiones': []}
apagado = {'si': False}


def de_usuario():
    """Las llamadas al motor que NACEN DE ALGUIEN, sin la del templado.

    Al arrancar, el servicio hace una pregunta de mentira para que la primera
    persona no pague el arranque en frio. Esa llamada es real y tiene que
    contarse en ningun lado: mezclada con las demas desplazaba todos los
    indices y rompio siete comprobaciones de golpe. Se reconoce porque su
    turno de usuario es exactamente «hola», sin el prefijo de contexto que
    lleva cualquier pregunta de una persona."""
    return [p for p in visto['peticiones']
            if (p['messages'][-1]['content'] or '').strip() != 'hola']


class MotorFalso(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        if apagado['si']:
            self.send_error(503)
            return
        cuerpo = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        visto['peticiones'].append(cuerpo)

        # EL FRENO DE LISTAS QUE CORTA A CERO. Pasó en el nodo: el modelo
        # empezó maquetando en la primera línea, el `stop` cortó ahí mismo y
        # no quedó nada — y el asistente contestó «mi motor está apagado»,
        # que era mentira. Este motor de mentira reproduce eso: con el freno
        # puesto devuelve vacío, sin el freno contesta.
        # Se mira SOLO el turno de ahora, no la conversación entera: la
        # palabra queda en el historial y, mirando todo, el motor de mentira
        # devolvía vacío en cada pregunta posterior de esa persona.
        ahora = (cuerpo['messages'][-1]['content'] or '')
        if 'MAQUETA' in ahora and cuerpo.get('options', {}).get('stop'):
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'message': {'content': ''}}).encode())
            return
        # si la pregunta pide LENTO, el motor piensa 2.5s: es la ventana para
        # meter un segundo mensaje mientras genera, que era el hueco grave
        if 'LENTO' in json.dumps(cuerpo):
            time.sleep(2.5)

        # DOS frases, y el motor las suelta de a trozos como hace Ollama de
        # verdad. Sin esto la prueba pasaba sin medir el streaming: el motor
        # falso contestaba de un tiron y el codigo nuevo se comportaba como el
        # viejo.
        # La coletilla numerada NO es un capricho. Un motor de mentira que
        # contesta SIEMPRE lo mismo hace saltar el guardia de repetición en
        # cada turno, y entonces la prueba mide el guardia en vez de medir lo
        # que quería medir. Un motor real varía; este también.
        # Para probar el guardia hay una pregunta aparte, más abajo.
        # ...y la variación va AL PRINCIPIO, no al final: el guardia compara
        # el arranque, que es donde vive la repetición. Una coletilla al final
        # deja dos respuestas casi idénticas y el guardia salta igual.
        # Contestar SOBRE la pregunta es además lo que hace un motor de verdad.
        pregunta = ahora.split(']')[-1].strip()[:44] or 'nada'
        # El armazon TAMBIEN cambia con la pregunta, no solo el hueco: dos
        # respuestas que comparten setenta caracteres de molde se parecen
        # aunque el relleno sea distinto, y entonces la prueba mide el
        # guardia de repeticion en vez de lo que venia a medir.
        # suma de codigos y no hash(): hash() de una cadena cambia en cada
        # proceso de Python, y una prueba que cambia sola es peor que no
        # tenerla — un dia pasa, otro dia falla, y nadie confia en ella.
        marco = sum(map(ord, pregunta)) % 3
        armazon = [
            (f'Ana, sobre {pregunta} te cuento. ',
             f'RESPUESTA-DEL-MOTOR primera parte de {pregunta}. ',
             'Y ESTA ES LA SEGUNDA parte del asunto.'),
            (f'Mirá, {pregunta} funciona asi, me alegra que preguntes. ',
             f'RESPUESTA-DEL-MOTOR el detalle de {pregunta} sin vueltas. ',
             'Y ESTA ES LA SEGUNDA cosa que importa aca.'),
            (f'Ana, me alegra que hayas preguntado eso de {pregunta}. ',
             f'RESPUESTA-DEL-MOTOR lo central de {pregunta} en una linea. ',
             'Y ESTA ES LA SEGUNDA mitad, la que cierra.'),
        ][marco]
        TROZOS = list(armazon)
        if not cuerpo.get('stream'):
            r = json.dumps({'message': {'role': 'assistant',
                                        'content': ''.join(TROZOS)}}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(r)
            return
        self.send_response(200)
        self.send_header('Content-Type', 'application/x-ndjson')
        self.end_headers()
        for i, t in enumerate(TROZOS):
            for pedazo in [t[:len(t)//2], t[len(t)//2:]]:
                self.wfile.write((json.dumps(
                    {'message': {'role': 'assistant', 'content': pedazo}, 'done': False}) + '\n').encode())
                self.wfile.flush()
                time.sleep(0.05)
        self.wfile.write((json.dumps({'message': {'content': ''}, 'done': True}) + '\n').encode())
        self.wfile.flush()


def main():
    carpeta = pathlib.Path(tempfile.mkdtemp(prefix='aura-prueba-'))
    p_relevo, p_motor = puerto_libre(), puerto_libre()

    # el relevo de verdad
    relevo = subprocess.Popen(
        [sys.executable, str(RAIZ / 'infra' / 'mensajes' / 'servidor.py')],
        env={**os.environ, 'MENSAJES_DATOS': str(carpeta / 'datos.json'),
             'MENSAJES_PUERTO': str(p_relevo),
             'HTTP_PROXY': '', 'HTTPS_PROXY': '', 'http_proxy': '', 'https_proxy': ''},
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # el motor de mentira
    motor = ThreadingHTTPServer(('127.0.0.1', p_motor), MotorFalso)
    threading.Thread(target=motor.serve_forever, daemon=True).start()
    time.sleep(1.2)

    BASE = f'http://127.0.0.1:{p_relevo}'

    # la casa del asistente
    datos = carpeta / 'aura'
    datos.mkdir()
    shutil.copy(AQUI / 'PROMPT-AURA.md', datos / 'PROMPT-AURA.md')
    shutil.copy(RAIZ / 'infra' / 'cerebro' / 'conocimiento' / 'saber.json',
                datos / 'saber.json')
    (datos / 'probadores.txt').write_text('# lista de prueba\nana@prueba.local\n')

    # el asistente, como proceso de verdad
    asistente = subprocess.Popen(
        [sys.executable, str(AQUI / 'asistente.py')],
        env={**os.environ, 'AURA_RELEVO': BASE, 'AURA_CORREO': 'aura@prueba.local',
             'AURA_DATOS': str(datos), 'AURA_MOTOR': f'http://127.0.0.1:{p_motor}',
             'AURA_MODELO': 'llama3.2', 'AURA_PASO': '0.4',
             'AURA_RAFAGA': '9999',   # ver arriba: la suite no conversa, dispara
             'HTTP_PROXY': '', 'HTTPS_PROXY': '', 'http_proxy': '', 'https_proxy': ''},
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    time.sleep(2)

    try:
        # dos personas: Ana (en la lista) y Zoe (fuera)
        _, a = post(BASE, '/alta', {'correo': 'ana@prueba.local', 'nombre': 'Ana'})
        _, z = post(BASE, '/alta', {'correo': 'zoe@prueba.local', 'nombre': 'Zoe'})
        ana = {'correo': 'ana@prueba.local', 'llave': a['llave']}
        zoe = {'correo': 'zoe@prueba.local', 'llave': z['llave']}

        def bandeja_de(quien):
            _, d = post(BASE, '/bandeja', {**quien, 'desde': 'aura@prueba.local'})
            return [m for m in d.get('mensajes', []) if m['de'] == 'aura@prueba.local']

        def espera_texto(quien, aguja, seg=25):
            """Espera a que llegue UN mensaje que contenga `aguja`. Buscar es
            mas robusto que contar: con el streaming, una respuesta puede
            llegar en uno o en varios mensajes, y una prueba atada a indices
            se rompe cada vez que eso cambia."""
            fin = time.time() + seg
            while time.time() < fin:
                _, d = post(BASE, '/bandeja', {**quien, 'desde': 'aura@prueba.local'})
                ms = [m for m in d.get('mensajes', []) if m['de'] == 'aura@prueba.local']
                if any(aguja.lower() in (m.get('texto') or '').lower() for m in ms):
                    return ms
                time.sleep(0.4)
            return ms

        def espera_mensajes(quien, cuantos, seg=14):
            fin = time.time() + seg
            while time.time() < fin:
                _, d = post(BASE, '/bandeja', {**quien, 'desde': 'aura@prueba.local'})
                ms = [m for m in d.get('mensajes', []) if m['de'] == 'aura@prueba.local']
                if len(ms) >= cuantos:
                    return ms
                time.sleep(0.4)
            return ms

        print('\nLa puerta: amistad y lista de prueba\n')
        post(BASE, '/amistad/pedir', {**ana, 'para': 'aura@prueba.local'})
        post(BASE, '/amistad/pedir', {**zoe, 'para': 'aura@prueba.local'})
        time.sleep(3)
        _, am = post(BASE, '/amistad/lista', ana)
        ok(any(x.get('correo') == 'aura@prueba.local' for x in am.get('amigos', [])),
           'a Ana (en la lista) la acepta sola')
        _, zm = post(BASE, '/amistad/lista', zoe)
        ok(not any(x.get('correo') == 'aura@prueba.local' for x in zm.get('amigos', [])),
           'a Zoe (fuera de la lista) NO la acepta — queda pendiente')

        saludos = espera_mensajes(ana, 1)
        ok(len(saludos) >= 1, 'Ana recibe el saludo sin escribir nada')
        s = saludos[0].get('texto', '')
        ok('servidor' in s and 'punta a punta' in s,
           'el saludo dice la verdad del cifrado, sin letra chica')
        ok('dedic' in s, 'y el saludo invita a contar en qué anda')

        print('\nUNA PREGUNTA SE CONTESTA — no se cambia por otra pregunta\n')
        # Aquí había un formulario de tres preguntas que se tragaba los tres
        # primeros mensajes fueran lo que fueran. Medido con una cuenta nueva
        # en producción: «¿Qué es ORIGEN?» recibía «¿qué te gustaría lograr?».
        # Alguien hace una pregunta de verdad, recibe otra pregunta, y su duda
        # queda sin contestar.
        post(BASE, '/enviar', {**ana, 'para': 'aura@prueba.local',
                               'texto': 'Soy contadora en una ferretería'})
        ms = espera_mensajes(ana, 2)
        ok(len(ms) >= 2, 'lo que cuenta recibe respuesta')
        post(BASE, '/enviar', {**ana, 'para': 'aura@prueba.local',
                               'texto': '¿Qué es ORIGEN?'})
        ms = espera_mensajes(ana, 4)
        _suyas = [m.get('texto', '') for m in ms if m.get('de') == 'aura@prueba.local']
        ok(_suyas and 'RESPUESTA-DEL-MOTOR' in _suyas[-1],
           'y una PREGUNTA va al modelo, no al formulario',
           f'contestó: {_suyas[-1][:90]!r} — el formulario se la tragaba')
        ok('lograr' not in (_suyas[-1] or ''),
           'no te devuelve una pregunta en vez de tu respuesta',
           'recibir «¿qué querés lograr?» cuando preguntaste qué es ORIGEN es '
           'la forma más rápida de que alguien no vuelva')

        print('\nLa charla libre, contra el motor\n')
        # Se cuenta desde ANTES de esta pregunta: sin el formulario, los
        # mensajes anteriores también fueron al motor y tienen su respuesta.
        # Contar todas las del hilo mediría la conversación entera en vez de
        # esta pregunta.
        _antes = len([m for m in bandeja_de(ana)
                      if m.get('de') == 'aura@prueba.local'
                      and 'RESPUESTA-DEL-MOTOR' in (m.get('texto') or '')])
        _llamadasAntes = len(de_usuario())
        post(BASE, '/enviar', {**ana, 'para': 'aura@prueba.local',
                               # Una pregunta DISTINTA de la anterior: dos casi
                               # iguales disparan el guardián de eco —que
                               # repregunta— y entonces esto contaría DOS
                               # llamadas al motor por una sola pregunta.
                               'texto': '¿Cuánto cuesta cobrar con MyTokenPay?'})
        ms = espera_mensajes(ana, 5)
        # Por el ÚLTIMO mensaje suyo y no por el índice 4: el índice contaba
        # con los cuatro mensajes del formulario de bienvenida, que ya no
        # existe. Una prueba atada a una posición se rompe cada vez que cambia
        # el flujo, y lo que quiere comprobar no es dónde está la respuesta
        # sino que la respuesta esté.
        _suyas = [m.get('texto', '') for m in ms if m.get('de') == 'aura@prueba.local']
        ok(_suyas and 'RESPUESTA-DEL-MOTOR' in _suyas[-1],
           'la respuesta del motor llega al chat',
           f'la última suya fue: {(_suyas or [""])[-1][:80]!r}')
        # UNA RESPUESTA, UNA BURBUJA.
        #
        # Antes esta prueba exigia lo contrario —que llegara «EN DOS», la
        # primera frase sin esperar al resto— y estaba bien exigirlo: sobre
        # CPU una respuesta tardaba noventa segundos y adelantar la primera
        # frase era la diferencia entre esperar y creer que se colgo.
        #
        # Sobre la GPU la respuesta entera tarda seis segundos. Ese reparto
        # dejo de proteger a nadie y paso a estorbar: cuatro, cinco, seis
        # globos seguidos por una sola pregunta. La queja fue textual — «no
        # hay conversación fluida». Nadie que conversa contesta seis veces.
        # Se cuentan las respuestas del motor, no las posiciones: la marca
        # RESPUESTA-DEL-MOTOR distingue lo que dijo el modelo de los saludos y
        # avisos que escribe la casa, que no se reparten en globos.
        _delMotor = [x for x in _suyas if 'RESPUESTA-DEL-MOTOR' in x][_antes:]
        ok(len(_delMotor) == 1,
           'y llega en UNA sola: nadie que conversa contesta en seis mensajes',
           f'llegaron {len(_delMotor)}: {[x[:34] for x in _delMotor]}')
        ok(_delMotor and 'SEGUNDA' in _delMotor[-1],
           'con la respuesta completa adentro, no cortada')
        # LA PROPIEDAD, no una frase. Antes esto buscaba «me alegra», que es
        # una de las tres aperturas que usa el motor de mentira según la
        # pregunta: con otra pregunta, la prueba fallaba sin que nada
        # estuviera mal. Lo que importa es que ninguna burbuja sea SOLO
        # cortesía — eso hace esperar por nada.
        _soloCortesia = [x for x in _suyas[-3:]
                         if len(x) < 120 and aura._es_cortesia(x)]
        ok(not _soloCortesia,
           'la cortesía de apertura no viaja sola: va pegada a la respuesta',
           f'llegó una burbuja que solo saluda: {_soloCortesia}')
        # Sobre CPU el techo era 110 y protegia a la persona: a 6 tokens por
        # segundo, cada palabra de mas era espera de verdad. Sobre GPU son 40
        # tok/s y ese mismo techo empezo a CORTAR la respuesta a media frase
        # — se vio en el nodo el 28-ago. Lo que se comprueba ya no es un
        # numero fijo sino la propiedad: alcanza para una respuesta entera.
        ok(de_usuario()[-1]['options'].get('num_predict', 0) >= 120,
           'el techo de palabras alcanza para terminar la frase',
           f"num_predict = {de_usuario()[-1]['options'].get('num_predict')}")
        # La ventana. Sin esta linea ollama usa 4096, la peticion con memoria
        # llega a 3814, rebalsa al escribir y RELEE los 3814 desde cero: 170
        # segundos de espera antes de la primera letra. Se mide en el numero,
        # no en el humor: si alguien saca el num_ctx, esto se pone rojo.
        # El freno de las listas. El prompt se lo pide en tres lugares y el
        # modelo las escribe igual; esto las corta en seco. Si alguien saca
        # estas marcas, AU-RA vuelve a maquetar en vez de conversar.
        paren = de_usuario()[-1]['options'].get('stop') or []
        ok(any('1.' in x for x in paren) and any('**' in x for x in paren),
           'la generación se corta apenas empieza una lista o un título',
           f'stop = {paren}')

        ctx = de_usuario()[-1]['options'].get('num_ctx')
        ok(ctx is not None and ctx >= 6144,
           'la ventana da lugar al historial: sin eso se relee todo cada vez',
           f'num_ctx = {ctx} (con 4096 la peticion de 3814 rebalsa)')
        mem = de_usuario()[-1]['messages']
        largo = sum(len(m.get('content', '')) for m in mem)
        ok(largo / 3.6 < ctx * 0.75,
           'y la peticion entera entra holgada en esa ventana',
           f'~{largo/3.6:.0f} tokens contra una ventana de {ctx}')
        # Una pregunta, UNA llamada. Se mide el delta y no el total: sin el
        # formulario de bienvenida, los mensajes de antes también fueron al
        # motor y tienen su llamada.
        ok(len(de_usuario()) == _llamadasAntes + 1,
           'un mensaje, una llamada al motor',
           f'{len(de_usuario()) - _llamadasAntes} llamadas para una pregunta')
        if de_usuario():
            sistema = de_usuario()[-1]['messages'][0]['content']
            ok('AU-RA' in sistema and 'LO QUE SABES DE LA CASA' in sistema,
               'viajo el prompt de la casa y las fichas')
            ok('ORIGEN' in sistema and 'gramin' in sistema,
               'y la ficha que viajo es la de ORIGEN, con su contenido')
            usuario = de_usuario()[-1]['messages'][-1]['content']
            # Solo el oficio: el formulario que exigía estudios e intereses
            # antes de contestar nada se fue. Lo que la persona cuente se
            # guarda; lo que no cuente, no se le saca.
            ok('contadora' in usuario,
               'el perfil viaja en el turno de usuario, no en el sistema')
            ok('se llama Ana' in usuario,
               'y el nombre de la ficha del chat viaja tambien',
               f'el turno decía: {usuario[:110]!r}')
            ok('contadora' not in sistema,
               'y el sistema NO lo lleva: por eso se puede cachear')
            # normalizado: el prompt esta formateado para leerse y una regla
            # puede quedar partida en dos renglones. Ya me paso una vez.
            plano = ' '.join(sistema.split())
            ok('frase de respaldo' in plano,
               'las reglas duras van en cada peticion, no solo en el papel')

        print('\nEl sistema no cambia entre preguntas (por eso se cachea)\n')
        post(BASE, '/enviar', {**ana, 'para': 'aura@prueba.local',
                               'texto': '¿Y qué podés hacer vos?'})
        # se espera a la LLAMADA, no a un numero de mensajes: con streaming una
        # respuesta puede llegar en uno o en varios
        _hasta = len(de_usuario()) + 1
        fin = time.time() + 25
        while time.time() < fin and len(de_usuario()) < _hasta:
            time.sleep(0.3)
        ok(len(de_usuario()) == _hasta, 'segunda pregunta, segunda llamada',
           f'llamadas: {len(de_usuario())}, se esperaban {_hasta}')
        if len(de_usuario()) >= 2:
            a1 = de_usuario()[-2]['messages'][0]['content']
            a2 = de_usuario()[-1]['messages'][0]['content']
            ok(a1 == a2, 'el mensaje de sistema es IDENTICO byte por byte',
               'si cambia, Ollama no lo cachea y cada pregunta paga la lectura entera')
            # Ya no son 30 minutos: con eso, cualquier hueco —el almuerzo,
            # la noche— sacaba el modelo de la VRAM y el primero de la mañana
            # pagaba los 237 segundos del arranque en frío, medidos en el
            # nodo. La máquina es dedicada: soltar la memoria no compra nada.
            ok(de_usuario()[1].get('keep_alive') in ('24h', '-1'),
               'el modelo NO se suelta entre sesiones, no solo entre preguntas',
               f"keep_alive = {de_usuario()[1].get('keep_alive')}")

        print('\nLos dos modos de pensar\n')
        post(BASE, '/enviar', {**ana, 'para': 'aura@prueba.local',
                               'texto': 'modo pensador'})
        ms = espera_texto(ana, 'modo pensador')
        ok(any('modo pensador' in (m.get('texto') or '').lower() for m in ms),
           'cambiar de modo contesta al instante')
        antes_m = len(de_usuario())
        post(BASE, '/enviar', {**ana, 'para': 'aura@prueba.local',
                               'texto': '¿Qué es AUKA?'})
        fin = time.time() + 25
        while time.time() < fin and len(de_usuario()) == antes_m:
            time.sleep(0.3)
        ok(len(de_usuario()) == antes_m + 1
           and de_usuario()[-1].get('model') == 'llama3.1:8b',
           'en modo pensador pregunta al modelo grande')
        post(BASE, '/enviar', {**ana, 'para': 'aura@prueba.local',
                               'texto': 'modo rápido'})
        ms = espera_texto(ana, 'modo rápido')
        antes_r = len(de_usuario())
        post(BASE, '/enviar', {**ana, 'para': 'aura@prueba.local',
                               'texto': '¿Y AGKA?'})
        fin = time.time() + 25
        while time.time() < fin and len(de_usuario()) == antes_r:
            time.sleep(0.3)
        ok(de_usuario()[-1].get('model') == 'llama3.2',
           'y al volver al rapido, vuelve al modelo chico')
        ok(not any('modo' in m['content'].lower()
                   for pet in de_usuario() for m in pet['messages']
                   if m['role'] == 'user' and 'modo pensador' == m['content'].strip().lower()),
           'los cambios de modo no gastan motor: son de la casa')

        print('\nLo que el modelo pone y no debería\n')
        # Todos estos salieron DE VERDAD del nodo el 28-ago. El prompt ya
        # prohibe las tres cosas; el modelo las hace igual. Por eso se limpia
        # a la salida y por eso se comprueba acá.
        lim = aura.limpiar
        ok(lim('Hola Tere,\n\nAUKA sigue el precio del oro y no lo custodiás vos.')
           .startswith('AUKA'),
           'el «Hola Fulana,» de cada turno se va: nadie saluda ocho veces')
        ok('Gracias por confiar' not in
           lim('Hola Tere,\n\n¡Gracias por confiar en AU-RA!\nEl Genesis ID es tu '
               'identidad dentro del ecosistema y te sirve para entrar a todo.'),
           'y el agradecimiento tampoco: hablar de sí misma en tercera persona '
           'rompe el personaje')
        m = lim('1. **Identidad Unificada**: es tu identidad única en el sistema.\n'
                '2. **Acceso**: entrás a todo sin repetir papeles nunca más.')
        ok('*' not in m and not m.startswith('1.'),
           'el markdown se va: esto es un chat, y la voz LEE los asteriscos', m[:60])
        ok('fichas' not in lim('Según las fichas, ORIGEN sigue al oro de cerca.').lower(),
           'y la fuga vieja de «según las fichas» sigue tapada')
        bueno = 'El oro no sube por capricho: es el mismo metal de siempre.'
        ok(lim(bueno) == bueno, 'una respuesta limpia no se toca')
        # La red de seguridad. Esta comprobación existe porque la primera
        # versión del limpiador dejó «Hola, ¿en qué te ayudo?» en «?».
        corto = lim('Hola, ¿en qué te ayudo?')
        ok(len(corto) > 5 and 'ayudo' in corto,
           'el limpiador NUNCA se come la respuesta: prefiere dejar la mugre',
           f'quedó {corto!r}')

        # Estas cuatro salieron del nodo el 28-ago en TODAS las respuestas.
        pre = lim('Me alegra que tengas una tienda de abarrotes y estés buscando '
                  'proteger tus ahorros. AUKA sigue el precio de una onza de oro '
                  'y no tenés que guardarlo vos en ningún lado.')
        ok(pre.startswith('AUKA'),
           'no le repite a la persona su propia vida: eso se lo contó ella',
           pre[:70])
        eco = lim('**¿Qué es AUKA?**\n\nAUKA es un token que sigue el precio del oro '
                  'de cerca y no lo custodiás vos.')
        ok(eco.startswith('AUKA'),
           'ni le devuelve la pregunta como título: la hizo ella hace un segundo',
           eco[:70])
        fin = lim('Ordenex todavía no abrió al público, pero viene pronto y vas a '
                  'poder comprar y vender ahí. ¿Te gustaría saber más sobre esto?')
        ok(not fin.rstrip().endswith('?'),
           'y no cierra como operadora: si hay algo más, lo van a preguntar',
           fin[-60:])
        vamos = lim('Vamos a explicarte lo que es el Genesis ID y sus ventajas. '
                    'Es tu identidad única dentro del ecosistema de Orden Global.')
        ok(vamos.startswith('Es tu identidad'),
           'ni anuncia que va a explicar: explica')
        ok(lim('¡Hola Tere!\n\nMe alegra que tengas una tienda de abarrotes.') == '',
           'un trozo que es relleno de punta a punta se tira entero, no se manda')

        # Esta salió a producción: la red de seguridad medía contra el texto
        # CRUDO, así que al quitar un título largo el resto quedaba corto, la
        # red creía que se había comido la respuesta y devolvía el crudo CON
        # los asteriscos. La red restaurando justo lo que hay que sacar.
        md = lim('### ¿Cómo te puede ayudar Ordenex?\n\n'
                 '1. **Protección de Ahorros**: cuidás tu plata del bajón.')
        ok('*' not in md and '#' not in md,
           'el markdown se va SIEMPRE, aunque la red de seguridad se dispare',
           f'quedó {md!r}')

        # LO QUE NO SE PUEDE PERDER NUNCA. Una versión del limpiador se comió
        # «pero no puedo predecir el precio» — una negativa de seguridad. Un
        # preámbulo que sobra es una molestia; una advertencia borrada es un
        # problema de verdad. Donde hay un «pero», ahí empieza lo que se dijo.
        for t, aguja in [
            ('Entiendo que te preocupe, pero el oro no garantiza nada.', 'garantiza'),
            ('Eso es una pregunta interesante, pero no puedo predecir el precio.', 'predecir'),
            ('Me alegra que preguntes, pero nadie te va a pedir tu clave jamás.', 'clave'),
            ('Entiendo tu apuro, sin embargo no puedo mover tu plata yo.', 'no puedo mover'),
        ]:
            ok(aguja in lim(t),
               f'jamás se come una advertencia: «…{aguja}…» sobrevive',
               f'quedó {lim(t)!r}')

        print('\nCuando el freno de listas corta a cero\n')
        # Se espera el HECHO (que el motor reciba las llamadas), no un texto:
        # el motor de mentira contesta siempre lo mismo, así que buscar su
        # texto encuentra el de una prueba anterior y mide antes de tiempo.
        antes_q = len(de_usuario())
        n_ms = len([m for m in bandeja_de(ana)])
        post(BASE, '/enviar', {**ana, 'para': 'aura@prueba.local',
                               # De la casa a proposito: el freno de listas
                               # solo corre para lo del ecosistema. Para una
                               # pregunta de la vida —un curriculum, una
                               # receta— la estructura ES la respuesta y el
                               # freno se apaga, asi que con una pregunta
                               # cualquiera esto no mediria el freno sino su
                               # ausencia.
                               'texto': 'MAQUETA: explicame el Genesis ID '
                                        'con todas sus ventajas'})
        fin = time.time() + 30
        while time.time() < fin and len(de_usuario()) < antes_q + 2:
            time.sleep(0.3)
        time.sleep(1.5)          # que termine de mandar antes de contar
        pedidas = len(de_usuario()) - antes_q
        ok(pedidas == 2,
           'si el freno cortó la respuesta a cero, se repregunta — UNA vez',
           f'llamadas al motor: {pedidas} (una lista fea es mejor que nada, '
           f'pero repreguntar en bucle es peor que las dos cosas)')
        ok(pedidas >= 2 and de_usuario()[antes_q]['options'].get('stop')
           and not de_usuario()[antes_q + 1]['options'].get('stop'),
           'la primera va CON el freno y la repregunta SIN él')

        # Y EL FRENO NO CORRE PARA LO QUE NO ES DE LA CASA. Con él puesto,
        # «¿Cómo hago un currículum?» devolvía «puede parecer abrumador, pero
        # con organización lo podés hacer muy bien» — cortado justo antes del
        # primer paso y sin dar uno solo. Medido contra el nodo el 28-ago.
        antes_v = len(de_usuario())
        post(BASE, '/enviar', {**ana, 'para': 'aura@prueba.local',
                               'texto': '¿Cómo hago un currículum?'})
        fin = time.time() + 25
        while time.time() < fin and len(de_usuario()) <= antes_v:
            time.sleep(0.3)
        ok(len(de_usuario()) > antes_v
           and not de_usuario()[antes_v]['options'].get('stop'),
           'y para una pregunta de la vida el freno no se pone',
           'los pasos de un currículum SON la respuesta; cortarlos la vacía')
        nuevos = bandeja_de(ana)[n_ms:]
        ok(any('RESPUESTA-DEL-MOTOR' in (m.get('texto') or '') for m in nuevos),
           'y la persona termina recibiendo una respuesta de verdad')
        ok(not any('motor está apagado' in (m.get('texto') or '') for m in nuevos),
           'nunca dice «mi motor está apagado»: es mentira y habla de las tripas',
           str([(m.get('texto') or '')[:50] for m in nuevos]))

        print('\nUn saludo se contesta saludando\n')
        # En la captura de producción, a un «Hola» contestó «Veta Wallet y
        # MyTokenPay pueden ayudarte a lograr eso.» — un fragmento sin cabeza.
        # El modelo no tiene nada que contestarle a un saludo, así que recita
        # el perfil o suelta un pedazo de otra respuesta.
        antes_s = len(de_usuario())
        post(BASE, '/enviar', {**ana, 'para': 'aura@prueba.local', 'texto': 'Hola'})
        ms = espera_texto(ana, 'andás', 12)
        ok(any('andás' in (m.get('texto') or '') for m in ms),
           'a un «Hola» se contesta saludando, no con un pedazo de otra cosa')
        ok(len(de_usuario()) == antes_s,
           'y NO gasta motor: es la frase más común de todas y sale al instante')
        post(BASE, '/enviar', {**ana, 'para': 'aura@prueba.local', 'texto': 'buenas'})
        ms = espera_texto(ana, 'Acá estoy', 12)
        ok(any('Acá estoy' in (m.get('texto') or '') for m in ms),
           'el segundo saludo es OTRA frase: repetir la misma delata la máquina')
        # ...pero un saludo CON pregunta adentro sí va al modelo
        antes_s = len(de_usuario())
        post(BASE, '/enviar', {**ana, 'para': 'aura@prueba.local',
                               'texto': 'hola, ¿qué es AUKA?'})
        fin = time.time() + 25
        while time.time() < fin and len(de_usuario()) == antes_s:
            time.sleep(0.3)
        ok(len(de_usuario()) > antes_s,
           'y «hola, ¿qué es AUKA?» sí va al modelo: ahí hay una pregunta')

        print('\nNunca media palabra\n')
        rec = aura._recortar
        ok(rec('El oro protege tus ahorros. Y además no dis') ==
           'El oro protege tus ahorros.',
           'una frase cortada a mitad de palabra se recorta a la anterior')
        ok(rec('AUKA sigue el precio del oro.') == 'AUKA sigue el precio del oro.',
           'y una frase completa no se toca')
        ok(rec('¿Querés que te lo explique?') == '¿Querés que te lo explique?',
           'una pregunta también cierra bien')
        corto = 'Se cortó todo menos esto que sigue y sigue sin cerrar nunca'
        ok(rec(corto) == corto,
           'si retroceder dejaría un pedazo diminuto, mejor la frase coja')

        # ── CUANDO EL MOTOR AVISA QUE SE QUEDÓ SIN TECHO ──────────────────
        #
        # Adivinar por el último carácter fallaba justo en el caso peor: una
        # frase larga cortada a mitad de palabra no deja ninguna pista, solo
        # termina. Ollama lo dice —done_reason='length'— y con esa certeza el
        # recorte deja de ser una apuesta.
        #
        # El caso de abajo salió del hilo REAL de producción: 17 de 119
        # respuestas terminaban así.
        real = ('AUKA te permite proteger tus ahorros en un activo que '
                'mantiene su valor a largo plazo, similar al')
        ok(rec(real) == real,
           'sin el aviso, una frase larga cortada pasa entera (lo que pasaba)',
           'no es que esté bien: es que sin el dato no hay forma de saberlo')
        ok(rec(real, True) == 'AUKA te permite proteger tus ahorros en un '
                              'activo que mantiene su valor a largo plazo.'
           or rec(real, True).endswith('.') or rec(real, True).endswith('…'),
           'CON el aviso se retrocede a la frase completa',
           f'quedó: {rec(real, True)!r}')
        sinpunto = ('Para crear un currículum que destaque tu experiencia '
                    'seguí estos pasos y vas a ver que no es tan difícil como')
        r2 = rec(sinpunto, True)
        ok(r2.endswith('…') and not r2.endswith('como…'.replace('como', 'com')),
           'y si no hay ningún punto al que volver, cierra en palabra entera',
           f'quedó: {r2!r}')
        ok(' ' not in r2[-2:] and not r2[:-1].endswith(' '),
           'sin dejar un espacio colgando antes de los puntos suspensivos',
           f'quedó: {r2!r}')

        print('\nLa guarda protegía el texto de sí misma\n')
        # `limpiar` deshace el recorte si en lo borrado se fue una palabra de
        # seguridad o una cifra. Deducía lo borrado como «los primeros N
        # caracteres», y eso vale para un preámbulo y NO para un cierre, que
        # se quita del final: leía el principio del texto que SE QUEDA.
        #
        # Resultado: cualquier aviso de estafa que terminara con «¿hay algo
        # más?» conservaba la coletilla, porque la guarda creía que estaba
        # borrando el aviso.
        lim = aura.limpiar
        ok(lim('Es una estafa: no le contestes. ¿Hay algo más en lo que pueda ayudarte?')
           == 'Es una estafa: no le contestes.',
           'el cierre hueco se va aunque la respuesta hable de una estafa')
        ok(lim('Tenés 1.234,56 ORIGEN. ¿Necesitás algo más?') == 'Tenés 1.234,56 ORIGEN.',
           'y aunque lleve una cifra')
        ok('estafa' in lim('Entiendo tu duda: ese correo que te pidió la frase de '
                           'respaldo es una estafa. No le contestes.'),
           'y la guarda SIGUE protegiendo lo que tiene que proteger',
           'quitar un preámbulo nunca puede llevarse el aviso con él')
        ok(lim('El cielo es azul por la atmósfera. ¿Te interesa saber más sobre los colores?')
           == 'El cielo es azul por la atmósfera.',
           'y «¿te interesa saber más?» también se va',
           'salió en producción cerrando una respuesta sobre el cielo')

        print('\nAbierta a todos, y con freno de ráfaga\n')
        # ABIERTA. La lista de probadores dejaba en SILENCIO a quien no
        # estuviera en ella: ni respuesta ni un «todavía no». Vacía o ausente
        # ahora significa abierta — lo que protege el motor es cuánto pedís,
        # no quién sos.
        import tempfile as _tmp, pathlib as _pl
        _carp = _pl.Path(_tmp.mkdtemp())
        _viejo = aura.DATOS
        try:
            aura.DATOS = _carp
            ok(aura.probadores() is None,
               'sin archivo de lista, AU-RA contesta a todo el mundo',
               'un producto que se entrega no puede dejar a nadie en silencio')
            (_carp / 'probadores.txt').write_text('# solo comentarios\n\n')
            ok(aura.probadores() is None,
               'y un archivo vacío también es «abierta»',
               'si no, borrar los nombres cerraría la puerta sin querer')
            (_carp / 'probadores.txt').write_text('alguien@ejemplo.com\n')
            ok(aura.probadores() == {'alguien@ejemplo.com'},
               'y con nombres dentro, se puede volver a cerrar en una línea')
        finally:
            aura.DATOS = _viejo

        # Y NADIE MÁS LLAMA A probadores() esperando un conjunto. Cambiarla
        # para que devuelva None dejó un `len(probadores())` en la línea de
        # arranque: el servicio moría al levantar, en bucle de reinicio, con
        # AU-RA muda para todos. Un `grep` habría bastado y no lo hice.
        import re as _re2
        _src = _pl.Path(aura.__file__).read_text()
        _malos = [l.strip() for l in _src.splitlines()
                  if 'probadores()' in l and _re2.search(r'len\(\s*probadores\(\)', l)]
        ok(not _malos,
           'nadie usa probadores() como si siempre fuera un conjunto',
           f'devuelve None cuando está abierta: {_malos}')

        # EL FRENO DE RÁFAGA. Seis en un minuto es más de lo que nadie
        # conversa; el séptimo espera. No castiga: pide un momento.
        _paso = [aura.hay_rafaga('rafaga@prueba') for _ in range(aura.RAFAGA)]
        ok(not any(_paso),
           f'las primeras {aura.RAFAGA} preguntas del minuto pasan sin freno',
           f'frenó en la {_paso.index(True) + 1 if True in _paso else 0}ª')
        ok(aura.hay_rafaga('rafaga@prueba'),
           'y la siguiente pide un momento',
           'con un solo motor, una ráfaga deja a los demás esperando detrás')
        ok(not aura.hay_rafaga('otro@prueba'),
           'el freno es POR PERSONA: la ráfaga de uno no frena a nadie más',
           'un freno global convertiría a un abusón en una caída para todos')

        print('\nLo de la casa y lo de la vida se distinguen\n')
        # No es un clasificador de temas —eso no se puede— sino una lista de
        # NUESTRAS palabras, que sí se puede enumerar. Decide dos cosas: si
        # viaja la línea del oficio de la persona, y si viaja el aviso de que
        # esto no es del ecosistema.
        #
        # Existe porque el prompt solo no alcanzaba. Medido contra el nodo,
        # con el hilo limpio: «Me siento solo estos días» contestaba hablando
        # de proteger los ahorros en ORIGEN y de abrir una billetera, con el
        # párrafo del prompt que lo prohíbe en mayúsculas y todo.
        casa = aura._de_la_casa
        for q in ['¿Qué es ORIGEN?', '¿Cuánto tengo de saldo?',
                  'quiero cobrar con el QR', '¿la comisión de MyTokenPay?',
                  'mi Genesis ID', '¿cuándo abre Ordenex?']:
            ok(casa(q), f'es de la casa: «{q}»')
        for q in ['Me siento solo estos días', '¿Cómo hago un currículum?',
                  '¿Qué cocino con arroz y huevo?', '¿Por qué el cielo es azul?',
                  'mi hija empieza la escuela mañana']:
            ok(not casa(q), f'es de la vida: «{q}»')
        # Y lo delicado NO se afloja aunque no nombre la casa: «me conviene
        # invertir» no dice ORIGEN y sigue siendo terreno con reglas.
        for q in ['¿me conviene invertir?', '¿pago impuestos por esto?',
                  'creo que me estafaron', 'dame tus doce palabras']:
            ok(casa(q), f'y lo delicado sigue con sus reglas: «{q}»')

        print('\nUna promesa que cierra en punto también es una promesa\n')
        pr = aura._promete_y_no_cumple
        ok(pr('Vamos a ayudarte a crear un currículum que destaque tu experiencia.'),
           'el caso real: anuncia los pasos y no da ninguno',
           'salió de producción — el freno de listas cortó justo después, y la '
           'regla vieja no lo veía porque termina en punto')
        ok(pr('Aquí te dejo algunos pensamientos.'), 'y el de «aquí te dejo»')
        ok(pr('Para armar un currículum, seguí estos pasos:'),
           'y el que ni siquiera cierra')
        ok(not pr('AUKA sigue el precio del oro.'),
           'una respuesta corta que CONTESTA no es una promesa')
        # El que rompió las pruebas la primera vez: el anuncio va al PRINCIPIO
        # y detrás viene lo prometido. Eso cumple, y confundirlo hacía
        # repreguntarle al motor de gusto en cada turno.
        ok(not pr('Ana, sobre el saldo te cuento. Funciona así y asá. Y esto cierra.'),
           'un anuncio con la respuesta detrás cumple, y no se repregunta')
        largo = ('Te explico: un currículum lleva tus datos arriba, después la '
                 'experiencia de lo más nuevo a lo más viejo, y al final los '
                 'estudios. Una hoja alcanza, porque nadie lee la segunda.')
        ok(not pr(largo), 'y una larga que explica de verdad, también')

        print('\nEl eco se mide por el ARRANQUE, no por el total\n')
        rep = aura._es_repetida
        h = lambda t: [{'role': 'assistant', 'content': t}]
        # El caso REAL de producción: «¿Qué es AUKA?» y «¿Y el Genesis ID?»
        # compartían los primeros CIENTO OCHO caracteres exactos y daban 82%
        # de parecido global — por debajo del umbral, y sin embargo cualquiera
        # que lo lee ve el copiado. La medida global no atrapa esta forma.
        A = ('AUKA es un token que sigue el precio del oro, lo que significa que '
             'su valor se mantiene estable a largo plazo. Esto es útil para '
             'proteger tus ahorros, como los que ganás en tu tienda.')
        B = ('AUKA es un token que sigue el precio del oro, lo que significa que '
             'su valor se mantiene estable a largo plazo. Sirve contra la '
             'devaluación de tu moneda local.')
        C = ('El Genesis ID es tu identidad única en el ecosistema. Con eso '
             'entrás a todo sin repetir papeles en cada lugar.')
        ok(rep(B, h(A)), 'dos respuestas con el mismo arranque exacto son un eco')
        ok(rep(A, h(A)), 'y la copia palabra por palabra, obviamente')
        ok(not rep(C, h(A)), 'pero dos respuestas de temas distintos no lo son')
        ok(not rep('Sí, ya abrió.', h(A)),
           'y una respuesta corta nunca dispara: no hay eco en tres palabras')

        print('\nEl eco: cuando se copia a sí misma\n')
        # Pasó en producción, con captura: dos preguntas distintas y la MISMA
        # respuesta palabra por palabra. El modelo ve su propia respuesta en
        # el historial y la repite, sobre todo si la pregunta es vaga. Ahí ya
        # no es una conversación, es un eco.
        post(BASE, '/enviar', {**ana, 'para': 'aura@prueba.local',
                               'texto': 'ECO uno'})
        time.sleep(6)
        antes_e = len(de_usuario())
        post(BASE, '/enviar', {**ana, 'para': 'aura@prueba.local',
                               'texto': 'ECO dos'})
        fin = time.time() + 30
        while time.time() < fin and len(de_usuario()) < antes_e + 2:
            time.sleep(0.3)
        pedidas = len(de_usuario()) - antes_e
        ok(pedidas == 2,
           'si iba a contestar lo mismo que antes, se vuelve a preguntar',
           f'llamadas: {pedidas}')
        ok(pedidas >= 2 and de_usuario()[antes_e + 1]['options'].get('temperature', 0)
           > de_usuario()[antes_e]['options'].get('temperature', 1),
           'y con más temperatura: repetir con las MISMAS palabras era el problema')
        ok(pedidas >= 2 and 'ya se lo dijiste'
           in de_usuario()[antes_e + 1]['messages'][-1]['content'],
           'y avisándole que eso ya lo dijo, no a ciegas')

        print('\nEl limpiador no puede borrar lo que importa\n')
        # Todos estos los encontró una revisión crítica, reproducidos contra
        # el módulo. El peor, de lejos, es el primero: el limpiador de ESTILO
        # se comía un aviso de ESTAFA. Cuando el estilo y el contenido chocan,
        # gana el contenido — siempre.
        NO_SE_TOCA = [
            ('Entiendo tu duda: ese correo que te pidió la frase de respaldo '
             'es una estafa. No le contestes.', 'estafa',
             'un aviso de estafa NO se borra por quitar un preámbulo'),
            ('Te explico: ORIGEN es la moneda de la cadena y sirve para pagar.',
             'ORIGEN es la moneda',
             'una respuesta correcta entera no puede quedar en blanco'),
            ('Vamos a ver cómo funciona tu Genesis ID y para qué te sirve.',
             'Genesis ID',
             'un anuncio va ANTES de algo: si no queda nada, era la respuesta'),
            ('Puedo dejarte preparado el envío. ¿Querés que lo haga?', '¿Querés',
             'una oferta con su pregunta no se convierte en afirmación'),
            ('Te quedan 1.234,56 ORIGEN según la cadena.', '1.234,56',
             'y una cifra nunca se pierde en un recorte de estilo'),
        ]
        for t, aguja, que in NO_SE_TOCA:
            ok(aguja in lim(t), que, f'quedó {lim(t)!r}')
        # y la cortesía pura SÍ se va entera, que era el punto original
        ok(lim('¡Hola Tere!\n\nMe alegra que tengas una tienda.') == '',
           'pero la cortesía de punta a punta sigue yéndose entera')

        print('\nHabla de vos, que es lo que la hace sonar de acá\n')
        # «contestó súper robótico… no como debía una persona humana». La
        # respuesta que lo provocó decía «¿Y tú cómo estás?». El prompt pide
        # voseo desde el primer día y el modelo contesta «tú» igual: es lo
        # que hace uno entrenado sobre todo con español de España y México.
        # Para un oído centroamericano, ese «tú» es lo PRIMERO que delata a
        # una máquina.
        vos = aura.vosear
        PARES = [
            ('¿Y tú cómo estás?', 'vos', 'el «tú» que disparó la queja'),
            ('Tú puedes guardar lo que quieres.', 'podés', 'puedes → podés'),
            ('Si necesitas ayuda, dime.', 'decime', 'y los imperativos también'),
            ('Esto es para ti.', 'para vos', '«para ti» no lo dice nadie acá'),
            ('Cuéntame en qué trabajas.', 'trabajás', 'y los verbos de todos los días'),
        ]
        for t, aguja, que in PARES:
            ok(aguja in vos(t), que, f'«{t}» → «{vos(t)}»')
        # y lo que YA es igual en las dos formas no se toca: tocarlo sería
        # inventar palabras que nadie dice
        # LA TRAMPA DEL «TU» SIN TILDE, que encontró esta misma prueba:
        # `tú` es el pronombre, `tu` es el posesivo, y en voseo el posesivo
        # NO cambia. Cambiando los dos salía «Es vos identidad».
        for igual in ['Es tu identidad única.', 'Entrá con tu Genesis ID.',
                      'Tu billetera tiene saldo.', 'Ya ves que el oro no baja.',
                      'Vas a poder cobrar.', 'Estás verificado.',
                      'Me das el número y listo.']:
            ok(vos(igual) == igual, f'«{igual}» se queda igual, y está bien',
               f'lo cambió a «{vos(igual)}»')

        print('\n«Hablame de AUKA» es una PREGUNTA, no una orden de voz\n')
        # Antes bastaba con que la frase midiera menos de 40 y llevara «habla»
        # adentro. Y «hablame de AUKA», «hablame del oro», «hablame de la
        # tarjeta» son la forma MÁS natural de preguntar en español latino:
        # la persona preguntaba algo y AU-RA le encendía las notas de voz.
        antes_h = len(de_usuario())
        post(BASE, '/enviar', {**ana, 'para': 'aura@prueba.local',
                               'texto': 'hablame de AUKA'})
        fin = time.time() + 25
        while time.time() < fin and len(de_usuario()) == antes_h:
            time.sleep(0.3)
        ok(len(de_usuario()) > antes_h,
           '«hablame de AUKA» va al modelo, no enciende la voz',
           'es la forma más natural de preguntar y se la estaba tragando el '
           'detector de comandos')

        print('\nLa voz: se pide, no se impone\n')
        # Que venga APAGADA importa: una nota de voz en cada respuesta es un
        # regalo para quien la quiere y una molestia para quien no. Si esto se
        # pone en rojo, alguien encendio la voz para todo el mundo sin pedirla.
        _, _b = post(BASE, '/bandeja', {**ana, 'desde': 'aura@prueba.local'})
        ok(not any(m.get('tipo') == 'voz' for m in _b.get('mensajes', [])),
           'hasta acá NADIE mandó una nota de voz: la voz viene apagada')

        antes_v = len(de_usuario())
        post(BASE, '/enviar', {**ana, 'para': 'aura@prueba.local',
                               'texto': 'hablame con voz sobria'})
        ms = espera_texto(ana, 'sobria')
        ok(any('sobria' in (m.get('texto') or '').lower() for m in ms),
           'encender la voz contesta al instante y con el registro pedido')
        ok(len(de_usuario()) == antes_v,
           'y encender la voz NO gasta motor: es de la casa, como los modos',
           'no hay nada que pensar en «con voz»')

        # CON VOZ, EL TECHO ES UN TECHO DE EMERGENCIA — y esto CAMBIÓ.
        #
        # Estaba en 70 y la razón era buena: la voz era un ARCHIVO, había que
        # esperar a que se grabara entera, y una respuesta larga eran cuarenta
        # segundos de pelotita quieta. Pedir menos palabras era pedir menos
        # espera.
        #
        # Esa razón ya no existe. La voz sale en vivo y el primer sonido llega
        # a los 2,8s dure lo que dure (infra/aura/voz.py). Lo único que hacía
        # el techo de 70 era CORTAR: en el hilo real de producción, 17 de 119
        # respuestas terminaban a media palabra.
        #
        # Así que se mira lo que hoy importa: que exista un techo —una
        # respuesta hablada sin límite sigue siendo un discurso— y que sea lo
        # bastante alto para que no sea él quien decide dónde termina la
        # frase. Quien decide es el prompt, que pide tres frases en cuatro
        # sitios distintos.
        antes_c = len(de_usuario())
        post(BASE, '/enviar', {**ana, 'para': 'aura@prueba.local',
                               'texto': '¿Qué es ORIGEN otra vez?'})
        fin = time.time() + 25
        while time.time() < fin and len(de_usuario()) == antes_c:
            time.sleep(0.3)
        conVoz = de_usuario()[-1]['options'].get('num_predict', 999)
        ok(80 < conVoz <= 220,
           'con la voz encendida hay techo, y no tan bajo que corte la frase',
           f'num_predict = {conVoz} — por debajo de 80 corta a media palabra; '
           f'por encima de 220 deja de ser una contestación y es un discurso')

        antes_v = len(de_usuario())
        post(BASE, '/enviar', {**ana, 'para': 'aura@prueba.local',
                               'texto': 'sin voz'})
        ms = espera_texto(ana, 'notas de voz')
        ok(any('dejo de mandarte' in (m.get('texto') or '').lower() for m in ms),
           'y apagarla también, con una sola palabra')
        ok(len(de_usuario()) == antes_v, 'apagarla tampoco gasta motor')

        print('\nZoe, desde fuera\n')
        code, _ = post(BASE, '/enviar', {**zoe, 'para': 'aura@prueba.local',
                                         'texto': 'hola?'})
        ok(code == 403, 'sin amistad aceptada, el relevo mismo la frena (403)')

        print('\nEl motor se cae, y el asistente no finge\n')
        apagado['si'] = True
        post(BASE, '/enviar', {**ana, 'para': 'aura@prueba.local',
                               'texto': '¿Y la cadena qué es?'})
        ms = espera_texto(ana, 'motor')
        ok(any('motor' in (m.get('texto') or '').lower() for m in ms),
           'dice que el motor esta apagado en vez de inventar')
        apagado['si'] = False

        print('\nEl hueco del panel: un mensaje mientras el motor piensa\n')
        antes = len(de_usuario())
        post(BASE, '/enviar', {**ana, 'para': 'aura@prueba.local',
                               'texto': 'Contame de AUKA LENTO'})
        time.sleep(1.0)   # el motor sigue pensando: este cae en plena generacion
        post(BASE, '/enviar', {**ana, 'para': 'aura@prueba.local',
                               'texto': '¿y AGKA?'})
        fin = time.time() + 35
        while time.time() < fin and len(de_usuario()) - antes < 2:
            time.sleep(0.4)
        ok(len(de_usuario()) - antes == 2,
           'las DOS preguntas llegan al motor: ninguna se traga',
           f'llegaron {len(de_usuario()) - antes} de 2')

        print('\nEl otro hueco: perfil perdido, sin avalancha\n')
        asistente.terminate(); asistente.wait()
        (datos / 'perfiles.json').unlink()
        antes = len(de_usuario())
        asistente2 = subprocess.Popen(
            [sys.executable, str(AQUI / 'asistente.py')],
            env={**os.environ, 'AURA_RELEVO': BASE, 'AURA_CORREO': 'aura@prueba.local',
                 'AURA_DATOS': str(datos), 'AURA_MOTOR': f'http://127.0.0.1:{p_motor}',
                 'AURA_MODELO': 'llama3.2', 'AURA_PASO': '0.4',
             'AURA_RAFAGA': '9999',   # ver arriba: la suite no conversa, dispara
                 # La suite dispara decenas de preguntas seguidas —eso es una
                 # prueba, no una conversación— y chocaría el freno de ráfaga,
                 # que existe para el caso contrario. Se le abre la ventana:
                 # el freno tiene su propia comprobación, aparte.
                 'AURA_RAFAGA': '9999',
                 'HTTP_PROXY': '', 'HTTPS_PROXY': '', 'http_proxy': '', 'https_proxy': ''},
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        globals()['asistente'] = asistente2
        time.sleep(3)
        ok(len(de_usuario()) == antes,
           'al arrancar sin memoria NO recontesta el historial (cero motor)')
        ok(len(visto['peticiones']) > len(de_usuario()),
           'y el arranque TEMPLA el motor: la primera persona no paga el frio')
        post(BASE, '/enviar', {**ana, 'para': 'aura@prueba.local',
                               'texto': 'hola de nuevo'})
        ms = espera_texto(ana, 'conocerte', seg=20)
        ok(any('conocerte' in (m.get('texto') or '') for m in ms),
           'con la memoria perdida se vuelve a presentar, no adivina')
        ok(len(de_usuario()) == antes,
           'y sigue sin gastar motor: saludar es codigo')

    finally:
        try:
            asistente.terminate()
        except Exception:
            pass
        relevo.terminate()
        motor.shutdown()
        try:
            print('\n-- registro del asistente --')
            print('\n'.join(asistente.stdout.read().splitlines()[-8:]))
        except Exception:
            pass
        shutil.rmtree(carpeta, ignore_errors=True)

    print(f"\n{fallos} comprobación(es) fallaron\n" if fallos else "\nTodo en verde\n")
    sys.exit(1 if fallos else 0)


if __name__ == '__main__':
    main()
