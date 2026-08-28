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
        TROZOS = ['Ana, me alegra que hayas preguntado eso. ',
                  'RESPUESTA-DEL-MOTOR primera parte de lo preguntado. ',
                  'Y ESTA ES LA SEGUNDA parte del asunto.']
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
        ok('dedic' in s, 'y arranca la entrevista: a que te dedicas')

        print('\nLa entrevista, en orden y sin improvisar\n')
        post(BASE, '/enviar', {**ana, 'para': 'aura@prueba.local',
                               'texto': 'Soy contadora en una ferretería'})
        ms = espera_mensajes(ana, 2)
        ok(len(ms) >= 2 and 'estudiaste' in ms[1].get('texto', ''),
           'primera respuesta guardada; pregunta por los estudios')
        post(BASE, '/enviar', {**ana, 'para': 'aura@prueba.local',
                               'texto': 'Contaduría pública en la UNAH'})
        ms = espera_mensajes(ana, 3)
        ok(len(ms) >= 3 and 'lograr' in ms[2].get('texto', ''),
           'segunda guardada; pregunta qué busca')
        post(BASE, '/enviar', {**ana, 'para': 'aura@prueba.local',
                               'texto': 'Quiero ahorrar en oro'})
        ms = espera_mensajes(ana, 4)
        ok(len(ms) >= 4 and 'te conozco' in ms[3].get('texto', ''),
           'cierra la entrevista y abre la charla libre')
        ok(not de_usuario(), 'la entrevista NO gasto motor: es codigo, no modelo')

        print('\nLa charla libre, contra el motor\n')
        post(BASE, '/enviar', {**ana, 'para': 'aura@prueba.local',
                               'texto': '¿Qué es ORIGEN?'})
        ms = espera_mensajes(ana, 5)
        ok(len(ms) >= 5 and 'RESPUESTA-DEL-MOTOR' in ms[4].get('texto', ''),
           'la respuesta del motor llega al chat')
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
        resto = [m for m in ms[4:] if (m.get('texto') or '').strip()]
        ok(len(resto) == 1,
           'y llega en UNA sola: nadie que conversa contesta en seis mensajes',
           f'llegaron {len(resto)}: '
           f'{[(m.get("texto") or "")[:34] for m in resto]}')
        ok('SEGUNDA' in ms[4].get('texto', ''),
           'con la respuesta completa adentro, no cortada')
        ok('me alegra' in ms[4].get('texto', ''),
           'la cortesía de apertura no viaja sola: va pegada a la respuesta')
        # Sobre CPU el techo era 110 y protegia a la persona: a 6 tokens por
        # segundo, cada palabra de mas era espera de verdad. Sobre GPU son 40
        # tok/s y ese mismo techo empezo a CORTAR la respuesta a media frase
        # — se vio en el nodo el 28-ago. Lo que se comprueba ya no es un
        # numero fijo sino la propiedad: alcanza para una respuesta entera.
        ok(de_usuario()[0]['options'].get('num_predict', 0) >= 150,
           'el techo de palabras alcanza para terminar la frase',
           f"num_predict = {de_usuario()[0]['options'].get('num_predict')}")
        # La ventana. Sin esta linea ollama usa 4096, la peticion con memoria
        # llega a 3814, rebalsa al escribir y RELEE los 3814 desde cero: 170
        # segundos de espera antes de la primera letra. Se mide en el numero,
        # no en el humor: si alguien saca el num_ctx, esto se pone rojo.
        # El freno de las listas. El prompt se lo pide en tres lugares y el
        # modelo las escribe igual; esto las corta en seco. Si alguien saca
        # estas marcas, AU-RA vuelve a maquetar en vez de conversar.
        paren = de_usuario()[0]['options'].get('stop') or []
        ok(any('1.' in x for x in paren) and any('**' in x for x in paren),
           'la generación se corta apenas empieza una lista o un título',
           f'stop = {paren}')

        ctx = de_usuario()[0]['options'].get('num_ctx')
        ok(ctx is not None and ctx >= 6144,
           'la ventana da lugar al historial: sin eso se relee todo cada vez',
           f'num_ctx = {ctx} (con 4096 la peticion de 3814 rebalsa)')
        mem = de_usuario()[0]['messages']
        largo = sum(len(m.get('content', '')) for m in mem)
        ok(largo / 3.6 < ctx * 0.75,
           'y la peticion entera entra holgada en esa ventana',
           f'~{largo/3.6:.0f} tokens contra una ventana de {ctx}')
        ok(len(de_usuario()) == 1, 'un mensaje, una llamada al motor')
        if de_usuario():
            sistema = de_usuario()[0]['messages'][0]['content']
            ok('AU-RA' in sistema and 'LO QUE SABES DE LA CASA' in sistema,
               'viajo el prompt de la casa y las fichas')
            ok('ORIGEN' in sistema and 'gramin' in sistema,
               'y la ficha que viajo es la de ORIGEN, con su contenido')
            usuario = de_usuario()[0]['messages'][-1]['content']
            ok('contadora' in usuario and 'UNAH' in usuario,
               'el perfil viaja en el turno de usuario, no en el sistema')
            ok('se llama Ana' in usuario,
               'y el nombre de la ficha del chat viaja tambien')
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
        fin = time.time() + 25
        while time.time() < fin and len(de_usuario()) < 2:
            time.sleep(0.3)
        ok(len(de_usuario()) == 2, 'segunda pregunta, segunda llamada')
        if len(de_usuario()) == 2:
            a1 = de_usuario()[0]['messages'][0]['content']
            a2 = de_usuario()[1]['messages'][0]['content']
            ok(a1 == a2, 'el mensaje de sistema es IDENTICO byte por byte',
               'si cambia, Ollama no lo cachea y cada pregunta paga la lectura entera')
            ok(de_usuario()[1].get('keep_alive') == '30m',
               'el modelo se queda cargado entre preguntas')

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
                               'texto': 'MAQUETA: explicame todo con ventajas'})
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
        nuevos = bandeja_de(ana)[n_ms:]
        ok(any('RESPUESTA-DEL-MOTOR' in (m.get('texto') or '') for m in nuevos),
           'y la persona termina recibiendo una respuesta de verdad')
        ok(not any('motor está apagado' in (m.get('texto') or '') for m in nuevos),
           'nunca dice «mi motor está apagado»: es mentira y habla de las tripas',
           str([(m.get('texto') or '')[:50] for m in nuevos]))

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
