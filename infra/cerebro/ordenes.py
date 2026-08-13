#!/usr/bin/env python3
# El canal de ordenes del cerebro. Escucha SOLO en 127.0.0.1; a internet sale
# por Caddy, detras de la misma contrasena que el resto del tablero.
#
# LO QUE PUEDE HACER, Y NADA MAS
#
#   GET  /bots        leer el resultado de la ultima carrera de los bots
#   POST /bots/ahora  lanzar una carrera de los bots de prueba
#
# La lista es CERRADA y esta escrita como constantes: no hay ninguna ruta que
# acepte un nombre de comando, un argumento, ni una ruta de archivo. No se
# construye ningun comando con texto que venga de fuera, y no se usa el shell.
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

import json, os, subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer

ULTIMO = '/var/log/ogb-bots/ultimo.json'
BOTS = ['/usr/bin/python3', '/usr/local/bin/ogb-bots.py']   # fijo, sin shell
PUERTO = 8790


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

    def do_POST(self):
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
