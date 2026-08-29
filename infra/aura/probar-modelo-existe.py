#!/usr/bin/env python3
"""Que AU-RA avise si el modelo que tiene configurado no esta en el motor.

POR QUE ESTA PRUEBA EXISTE

En asistente.py:

    MODELO_RAPIDA = os.environ.get('AURA_MODELO', 'llama3.2')

En la maquina de produccion el motor tiene UN solo modelo, qwen2.5:7b. El
default, llama3.2, no esta y nunca estuvo. La variable si esta puesta en el
servicio, asi que hoy funciona — pero el dia que se pierda (un fichero de
servicio reescrito, un `systemctl edit` que se coma el Environment, una maquina
nueva montada sin ella) AU-RA se levanta igual, dice «AU-RA de pie» en el
registro, y contesta un error a cada persona que le escriba. Sin que el
registro ni /salud digan por que.

Un default que no puede funcionar es peor que no tener default.

La comprobacion tampoco pone el nombre bueno a mano —eso solo mueve el
problema de sitio— sino que le pregunta al motor. Asi atrapa ademas el caso de
que alguien borre el modelo, o de que el motor arranque antes de terminar de
descargarlo.
"""
import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

mal = 0


def ok(nombre, cierto, detalle=''):
    global mal
    if cierto:
        print(f'  ok    {nombre}' + (f'  · {detalle}' if detalle else ''))
    else:
        mal += 1
        print(f'  FALLA {nombre}' + (f'\n          {detalle}' if detalle else ''))


def motor_de_mentira(modelos):
    """Un ollama que solo sabe contestar /api/tags."""
    class Mano(BaseHTTPRequestHandler):
        def do_GET(self):
            cuerpo = json.dumps({'models': [{'name': m} for m in modelos]}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(cuerpo)))
            self.end_headers()
            self.wfile.write(cuerpo)

        def log_message(self, *a):
            pass

    s = HTTPServer(('127.0.0.1', 0), Mano)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s, f'http://127.0.0.1:{s.server_address[1]}'


def correr(modelo, modelos_del_motor):
    """Arranca el aviso con ese modelo y ese motor, y devuelve lo que registro."""
    srv, url = motor_de_mentira(modelos_del_motor)
    try:
        import importlib
        import os
        os.environ['AURA_MODELO'] = modelo
        os.environ['AURA_MOTOR'] = url
        # El relevo no se toca: solo se quiere `_avisar_del_modelo`.
        os.environ.setdefault('AURA_RELEVO', 'http://127.0.0.1:1')
        import asistente
        importlib.reload(asistente)

        dicho = []
        asistente.log = lambda *a: dicho.append(' '.join(str(x) for x in a))
        asistente._avisar_del_modelo()
        return '\n'.join(dicho)
    finally:
        srv.shutdown()


print('\n── el modelo configurado SI esta ────────────────────────────')
salida = correr('qwen2.5:7b', ['qwen2.5:7b', 'gemma2:9b'])
ok('no se queja de nada', 'AVISO' not in salida, salida or '(sin salida)')

print('\n── se pide sin la etiqueta de tamaño ────────────────────────')
salida = correr('qwen2.5', ['qwen2.5:7b'])
ok('«qwen2.5» cuadra con «qwen2.5:7b», que es el mismo modelo',
   'AVISO' not in salida, salida or '(sin salida)')

print('\n── el default que no puede funcionar ────────────────────────')
salida = correr('llama3.2', ['qwen2.5:7b'])
ok('avisa, y no se queda callado', 'AVISO' in salida)
ok('dice CUAL falta', 'llama3.2' in salida, salida)
ok('y dice QUE hay, que es lo que deja arreglarlo', 'qwen2.5:7b' in salida, salida)
ok('y dice que toda respuesta va a fallar, no solo que «falta algo»',
   'fallar' in salida.lower(), salida)

print('\n── el motor caido ───────────────────────────────────────────')
import os
import importlib
os.environ['AURA_MODELO'] = 'qwen2.5:7b'
os.environ['AURA_MOTOR'] = 'http://127.0.0.1:1'
import asistente
importlib.reload(asistente)
dicho = []
asistente.log = lambda *a: dicho.append(' '.join(str(x) for x in a))
try:
    asistente._avisar_del_modelo()
    reventó = False
except Exception:
    reventó = True
ok('no revienta el arranque si el motor no contesta', not reventó)
ok('pero lo dice', 'AVISO' in '\n'.join(dicho), '\n'.join(dicho) or '(sin salida)')

print(f'\n{mal} en rojo\n' if mal else '\nEl modelo se comprueba de verdad\n')
sys.exit(1 if mal else 0)
