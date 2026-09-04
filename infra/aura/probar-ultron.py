#!/usr/bin/env python3
"""El puente de AU-RA hacia ULTRON.

Lo que se comprueba es lo que no puede pasar (ver `ultron.py`): que a un
numero de la junta le conteste ULTRON y no AU-RA; que a los demas ULTRON
ni los vea dos veces en diez minutos; que sin secreto el puente no exista;
y que un ULTRON caido NO deje a nadie sin respuesta. Sin red: se levanta un
ULTRON de mentira que anota lo que se le pide.
"""

import json
import os
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

JUNTA = {'50499990001'}
PEDIDOS = []
MODO = {'caido': False}


class UltronFalso(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        n = int(self.headers.get('Content-Length') or 0)
        cuerpo = json.loads(self.rfile.read(n) or b'{}')
        PEDIDOS.append({'ruta': self.path, 'secreto': self.headers.get('x-ultron-secreto'), **cuerpo})
        if MODO['caido']:
            self.send_response(500); self.end_headers(); self.wfile.write(b'{}'); return
        if self.headers.get('x-ultron-secreto') != 'secreto-de-prueba':
            self.send_response(401); self.end_headers(); self.wfile.write(b'{}'); return
        if cuerpo.get('de') not in JUNTA:
            self.send_response(403); self.end_headers(); self.wfile.write(b'{"codigo":"NO_ES_JUNTA"}'); return
        self.send_response(200)
        self.send_header('Content-Type', 'application/json'); self.end_headers()
        self.wfile.write(json.dumps({'respuesta': 'ULTRON: la casa está bien, José. ORIGEN a $2.57.'}).encode())


sv = HTTPServer(('127.0.0.1', 0), UltronFalso)
threading.Thread(target=sv.serve_forever, daemon=True).start()
os.environ['ULTRON_URL'] = f'http://127.0.0.1:{sv.server_port}/'
os.environ['ULTRON_SECRETO_AURA'] = 'secreto-de-prueba'
os.environ.setdefault('ZERNIO_CLAVE', 'sk_de_mentira')
os.environ.setdefault('ZERNIO_CUENTA', 'cuenta_de_mentira')

import ultron   # noqa: E402


class Puente(unittest.TestCase):
    def setUp(self):
        PEDIDOS.clear(); ultron.olvidar_negativos(); MODO['caido'] = False

    def test_encendido_solo_con_url_y_secreto(self):
        self.assertTrue(ultron.encendido())
        self.assertEqual(ultron.URL, os.environ['ULTRON_URL'].rstrip('/'), 'la barra final se quita')

    def test_a_la_junta_le_contesta_ultron(self):
        r = ultron.atender('+504 9999-0001', '¿Cómo está la casa?')
        self.assertIn('ULTRON', r)
        self.assertEqual(PEDIDOS[-1]['de'], '50499990001', 'el numero va solo con digitos')
        self.assertEqual(PEDIDOS[-1]['ruta'], '/whatsapp/entrada')
        self.assertEqual(PEDIDOS[-1]['secreto'], 'secreto-de-prueba')

    def test_a_los_demas_none_y_no_se_vuelve_a_preguntar(self):
        self.assertIsNone(ultron.atender('50488880002', 'hola'))
        self.assertIsNone(ultron.atender('50488880002', 'hola otra vez'))
        self.assertEqual(len(PEDIDOS), 1, 'un numero que no es de la junta se pregunta UNA vez')

    def test_secreto_malo_es_como_no_ser_de_la_junta(self):
        viejo = ultron.SECRETO
        ultron.SECRETO = 'otro'
        try:
            self.assertIsNone(ultron.atender('50499990001', 'hola'))
        finally:
            ultron.SECRETO = viejo

    def test_ultron_caido_lanza_para_que_se_reintente(self):
        MODO['caido'] = True
        with self.assertRaises(Exception):
            ultron.atender('50499990001', 'hola')
        # y no lo apunta como «no es de la junta»: cuando vuelva, contesta
        MODO['caido'] = False
        self.assertIn('ULTRON', ultron.atender('50499990001', 'hola'))

    def test_vacio_no_pregunta(self):
        self.assertIsNone(ultron.atender('', 'hola'))
        self.assertEqual(PEDIDOS, [])


class EnAsistente(unittest.TestCase):
    """Que `atender_charla` de verdad desvíe: con un relevo de WhatsApp de
    mentira y una junta de un numero, el cerebro de AU-RA no se toca."""

    def test_atender_charla_desvia_a_ultron(self):
        import asistente
        import whatsapp as wa
        enviados, pensados = [], []

        class RelevoWA(wa.RelevoWhatsApp):
            def __init__(self):
                pass
            def bandeja(self, de):
                return [{'id': '1', 'de': de, 'texto': 'qué necesita ojos', 'cuando': 5}]
            def escribiendo(self, para):
                pass
            def enviar(self, para, texto, parcial=False):
                enviados.append((para, texto))
            def leido(self, de):
                pass

        viejo_atender, viejo_guardar = asistente.atender, asistente.guardar_perfiles
        asistente.atender = lambda *a, **k: pensados.append(a)
        asistente.guardar_perfiles = lambda *a, **k: None
        try:
            perfiles = {}
            asistente.atender_charla(RelevoWA(), {}, perfiles, '50499990001')
            self.assertEqual(len(enviados), 1, 'salio UNA respuesta por la boca de AU-RA')
            self.assertIn('ULTRON', enviados[0][1])
            self.assertEqual(pensados, [], 'y el cerebro de AU-RA NO se llamo')
            # el que no es de la junta va al cerebro de siempre
            asistente.atender_charla(RelevoWA(), {}, perfiles, '50488880009')
            self.assertEqual(len(pensados), 1)
        finally:
            asistente.atender, asistente.guardar_perfiles = viejo_atender, viejo_guardar


if __name__ == '__main__':
    unittest.main(verbosity=1)
