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


class MotorFalso(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        if apagado['si']:
            self.send_error(503)
            return
        cuerpo = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        visto['peticiones'].append(cuerpo)
        # si la pregunta pide LENTO, el motor piensa 2.5s: es la ventana para
        # meter un segundo mensaje mientras genera, que era el hueco grave
        if 'LENTO' in json.dumps(cuerpo):
            time.sleep(2.5)
        r = json.dumps({'message': {'role': 'assistant',
                                    'content': 'RESPUESTA-DEL-MOTOR sobre lo preguntado.'}}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(r)


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
        ok(not visto['peticiones'], 'la entrevista NO gasto motor: es codigo, no modelo')

        print('\nLa charla libre, contra el motor\n')
        post(BASE, '/enviar', {**ana, 'para': 'aura@prueba.local',
                               'texto': '¿Qué es ORIGEN?'})
        ms = espera_mensajes(ana, 5)
        ok(len(ms) >= 5 and 'RESPUESTA-DEL-MOTOR' in ms[4].get('texto', ''),
           'la respuesta del motor llega al chat')
        ok(len(visto['peticiones']) == 1, 'un mensaje, una llamada al motor')
        if visto['peticiones']:
            sistema = visto['peticiones'][0]['messages'][0]['content']
            ok('AU-RA' in sistema and 'LO QUE SABES DE LA CASA' in sistema,
               'viajo el prompt de la casa y las fichas')
            ok('ORIGEN' in sistema and 'gramin' in sistema,
               'y la ficha que viajo es la de ORIGEN, con su contenido')
            usuario = visto['peticiones'][0]['messages'][-1]['content']
            ok('contadora' in usuario and 'UNAH' in usuario,
               'el perfil viaja en el turno de usuario, no en el sistema')
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
        ms = espera_mensajes(ana, 6)
        ok(len(visto['peticiones']) == 2, 'segunda pregunta, segunda llamada')
        if len(visto['peticiones']) == 2:
            a1 = visto['peticiones'][0]['messages'][0]['content']
            a2 = visto['peticiones'][1]['messages'][0]['content']
            ok(a1 == a2, 'el mensaje de sistema es IDENTICO byte por byte',
               'si cambia, Ollama no lo cachea y cada pregunta paga la lectura entera')
            ok(visto['peticiones'][1].get('keep_alive') == '30m',
               'el modelo se queda cargado entre preguntas')

        print('\nZoe, desde fuera\n')
        code, _ = post(BASE, '/enviar', {**zoe, 'para': 'aura@prueba.local',
                                         'texto': 'hola?'})
        ok(code == 403, 'sin amistad aceptada, el relevo mismo la frena (403)')

        print('\nEl motor se cae, y el asistente no finge\n')
        apagado['si'] = True
        post(BASE, '/enviar', {**ana, 'para': 'aura@prueba.local',
                               'texto': '¿Y la cadena qué es?'})
        ms = espera_mensajes(ana, 7)
        ok(len(ms) >= 7 and 'motor' in ms[6].get('texto', '').lower(),
           'dice que el motor esta apagado en vez de inventar')
        apagado['si'] = False

        print('\nEl hueco del panel: un mensaje mientras el motor piensa\n')
        antes = len(visto['peticiones'])
        post(BASE, '/enviar', {**ana, 'para': 'aura@prueba.local',
                               'texto': 'Contame de AUKA LENTO'})
        time.sleep(1.0)   # el motor sigue pensando: este cae en plena generacion
        post(BASE, '/enviar', {**ana, 'para': 'aura@prueba.local',
                               'texto': '¿y AGKA?'})
        ms = espera_mensajes(ana, 9, seg=30)
        ok(len(ms) >= 9, 'las DOS preguntas reciben respuesta, ninguna se traga',
           f'llegaron {len(ms)-7} de 2')
        ok(len(visto['peticiones']) - antes == 2,
           'dos preguntas, dos llamadas al motor')

        print('\nEl otro hueco: perfil perdido, sin avalancha\n')
        asistente.terminate(); asistente.wait()
        (datos / 'perfiles.json').unlink()
        antes = len(visto['peticiones'])
        asistente2 = subprocess.Popen(
            [sys.executable, str(AQUI / 'asistente.py')],
            env={**os.environ, 'AURA_RELEVO': BASE, 'AURA_CORREO': 'aura@prueba.local',
                 'AURA_DATOS': str(datos), 'AURA_MOTOR': f'http://127.0.0.1:{p_motor}',
                 'AURA_MODELO': 'llama3.2', 'AURA_PASO': '0.4',
                 'HTTP_PROXY': '', 'HTTPS_PROXY': '', 'http_proxy': '', 'https_proxy': ''},
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        globals()['asistente'] = asistente2
        time.sleep(3)
        ok(len(visto['peticiones']) == antes,
           'al arrancar sin memoria NO recontesta el historial (cero motor)')
        post(BASE, '/enviar', {**ana, 'para': 'aura@prueba.local',
                               'texto': 'hola de nuevo'})
        ms = espera_mensajes(ana, 10, seg=20)
        ok(len(ms) >= 10 and 'conocerte' in ms[9].get('texto', ''),
           'con la memoria perdida se vuelve a presentar, no adivina')
        ok(len(visto['peticiones']) == antes,
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
