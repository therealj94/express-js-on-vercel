#!/usr/bin/env python3
# El canal de ordenes del cerebro. Escucha SOLO en 127.0.0.1; a internet sale
# por Caddy, detras de la misma contrasena que el resto del tablero.
#
# LO QUE PUEDE HACER, Y NADA MAS
#
#   GET  /bots        leer el resultado de la ultima carrera de los bots
#   POST /bots/ahora  lanzar una carrera de los bots de prueba
#   POST /hablar      conversar: la pregunta va a Claude con el estado vivo
#
# La lista es CERRADA y esta escrita como constantes: no hay ninguna ruta que
# acepte un nombre de comando, un argumento, ni una ruta de archivo. No se
# construye ningun comando con texto que venga de fuera, y no se usa el shell.
#
# /hablar TAMPOCO es una puerta abierta: no deja elegir modelo, ni system
# prompt, ni parametros. Solo acepta una pregunta, el idioma y el estado que
# la propia pagina ya muestra. El resto lo pone este archivo.
#
# POR QUE ES TAN CORTA
#
# Una consola remota sobre produccion, colgada de una pagina web, es
# exactamente el peor agujero que puede tener este sistema -- y seria el
# primero que marcaria el Cerrajero. Desde aqui NO se despliega, NO se mueven
# fondos, NO se reinicia un nodo y NO se cambia una variable de configuracion.
# Lo unico que se puede disparar es una prueba en la red de PRUEBAS, que ya
# corre sola cada tres horas: adelantarla no cambia nada que no fuera a pasar.
#
# Si algun dia hace falta una accion mas, se anade aqui, a mano, una constante
# mas -- nunca un parametro.

import json, os, subprocess, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, HTTPServer

ULTIMO = '/var/log/ogb-bots/ultimo.json'
BOTS = ['/usr/bin/python3', '/usr/local/bin/ogb-bots.py']   # fijo, sin shell
PUERTO = 8790

# La llave vive SOLO aqui, de root y solo de root. No esta en el repositorio,
# ni en S3, ni llega nunca al navegador: la pagina pregunta a este servicio y
# es este servicio el que habla con Anthropic.
LLAVE = '/etc/cerebro/anthropic.key'
MODELO = 'claude-sonnet-5'
TOPE_SALIDA = 500          # respuestas para escuchar, no para leer
TOPE_PREGUNTA = 600        # caracteres
TOPE_HISTORIAL = 6         # turnos

# Quien es y como contesta. Va aqui y no en la pagina: asi el navegador no
# puede cambiarle el caracter ni sacarle de su papel.
CARACTER = """Eres JARVIS, el asistente del nucleo de control de Orden Global.
Hablas con Jose, el fundador. Le tratas de "sir" en ingles y de "Jose" en
castellano.

COMO HABLAS
- Te van a ESCUCHAR, no leer: frases cortas, una idea por frase, sin listas,
  sin markdown, sin emojis, sin simbolos. Nada de %, $, 0x... ni siglas
  sueltas. Los numeros grandes, en palabras.
- Contestas SIEMPRE en el idioma que se te indique, aunque la pregunta venga
  en el otro y aunque los datos esten en castellano.
- Sereno y directo. Nunca servil. Si algo va mal, lo dices sin adornarlo.
- Tres o cuatro frases normalmente. Si te piden detalle, mas.

LO QUE NO HACES
- No te inventas ni un numero. Si un dato no esta en el estado que se te pasa,
  dices que no lo tienes. Es un sistema con dinero real dentro.
- No propones desplegar, mover fondos, reiniciar nodos ni cambiar
  configuracion: no puedes hacerlo y no debes sugerir que puedes.
- No repites el estado entero: contestas LO QUE se pregunta.

LO QUE TIENES QUE SABER SIEMPRE
- La cadena 8532 esta CONGELADA y tiene que seguirlo: el genesis de la 5550
  salio de su estado cerrado. Una sola transaccion alli obliga a rehacer la
  migracion entera.
- Arrancar la 5550 ES el corte, y eso se hace con Jose delante.
- La comision no esta configurada en produccion, asi que cobra cero. Y la
  direccion a la que pagaria NO es la billetera unica: nadie ha demostrado
  tener su llave. No se enciende hasta decidir eso.
- El ORIGEN vale el gramo de oro en dolares dividido entre cincuenta y cinco.
"""


class Ordenes(BaseHTTPRequestHandler):
    server_version = 'cerebro'

    def responder(self, codigo, cuerpo):
        datos = json.dumps(cuerpo, ensure_ascii=False).encode()
        self.send_response(codigo)
        self.send_header('content-type', 'application/json; charset=utf-8')
        self.send_header('cache-control', 'no-store')
        self.send_header('content-length', str(len(datos)))
        self.end_headers()
        self.wfile.write(datos)

    def do_GET(self):
        if self.path.rstrip('/') == '/bots':
            if not os.path.exists(ULTIMO):
                return self.responder(200, {'estado': 'sin-datos',
                                            'detalle': 'Todavia no ha corrido ninguna vez.'})
            try:
                return self.responder(200, json.load(open(ULTIMO)))
            except Exception as e:
                return self.responder(500, {'estado': 'falla', 'detalle': str(e)[:200]})
        self.responder(404, {'error': 'no existe'})

    def cuerpo(self):
        n = int(self.headers.get('content-length') or 0)
        if n <= 0 or n > 200000:
            return {}
        try:
            return json.loads(self.rfile.read(n))
        except Exception:
            return {}

    def hablar(self, pet):
        if not os.path.exists(LLAVE):
            return self.responder(503, {'error': 'sin-llave',
                                        'detalle': 'No hay llave de Anthropic puesta.'})
        pregunta = str(pet.get('pregunta') or '').strip()[:TOPE_PREGUNTA]
        if not pregunta:
            return self.responder(400, {'error': 'sin-pregunta'})
        idioma = 'en' if pet.get('idioma') == 'en' else 'es'

        # El estado lo manda la propia pagina: es lo que ya tiene en pantalla.
        # Se recorta para no pagar por contexto que no aporta.
        estado = json.dumps(pet.get('estado') or {}, ensure_ascii=False)[:14000]

        mensajes = []
        for turno in (pet.get('historial') or [])[-TOPE_HISTORIAL:]:
            papel = 'assistant' if turno.get('rol') == 'jarvis' else 'user'
            texto = str(turno.get('texto') or '')[:800]
            if texto:
                mensajes.append({'role': papel, 'content': texto})
        mensajes.append({'role': 'user', 'content': pregunta})

        sistema = (CARACTER
                   + '\nCONTESTA EN: ' + ('ingles' if idioma == 'en' else 'castellano')
                   + '\n\nESTADO DEL ECOSISTEMA AHORA MISMO (json):\n' + estado)

        datos = json.dumps({'model': MODELO, 'max_tokens': TOPE_SALIDA,
                            'system': sistema, 'messages': mensajes}).encode()
        req = urllib.request.Request(
            'https://api.anthropic.com/v1/messages', data=datos,
            headers={'x-api-key': open(LLAVE).read().strip(),
                     'anthropic-version': '2023-06-01',
                     'content-type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=45) as r:
                d = json.loads(r.read())
            texto = ''.join(b.get('text', '') for b in d.get('content', []))
            return self.responder(200, {'respuesta': texto.strip(),
                                        'modelo': d.get('model'),
                                        'tokens': d.get('usage', {})})
        except urllib.error.HTTPError as e:
            try:
                err = json.loads(e.read()).get('error', {})
            except Exception:
                err = {}
            # El caso mas probable al principio: la cuenta sin saldo. Se dice
            # tal cual para que la pagina pueda volver a su cerebro de reglas.
            return self.responder(502, {'error': err.get('type') or ('http-' + str(e.code)),
                                        'detalle': (err.get('message') or '')[:200]})
        except Exception as e:
            return self.responder(502, {'error': 'sin-respuesta', 'detalle': str(e)[:200]})

    def do_POST(self):
        if self.path.rstrip('/') == '/hablar':
            return self.hablar(self.cuerpo())
        if self.path.rstrip('/') == '/bots/ahora':
            try:
                r = subprocess.run(BOTS, capture_output=True, text=True, timeout=180)
                linea = (r.stdout or '').strip().split('\n')[-1]
                try:
                    return self.responder(200, json.loads(linea))
                except Exception:
                    return self.responder(200, {'estado': 'falla',
                                                'detalle': (r.stderr or linea)[:300]})
            except subprocess.TimeoutExpired:
                return self.responder(504, {'estado': 'falla',
                                            'detalle': 'La carrera paso de tres minutos.'})
            except Exception as e:
                return self.responder(500, {'estado': 'falla', 'detalle': str(e)[:200]})
        self.responder(404, {'error': 'no existe'})

    def log_message(self, *a):
        pass          # systemd ya lleva el registro


if __name__ == '__main__':
    HTTPServer(('127.0.0.1', PUERTO), Ordenes).serve_forever()
