#!/usr/bin/env python3
"""La tercera puerta: el nodo sale al buzón, recoge y contesta.

Lo que se vigila aquí es que la puerta nueva se comporte como las otras dos —
que un fallo suyo no tumbe nada— y que no cuente hacia fuera lo que pasa dentro.
"""

import pathlib
import sys
import unittest
from unittest import mock

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import portal      # noqa: E402
import recadero    # noqa: E402


def _recado(n=1, sesion=None):
    return {'ticket': f't{n}', 'sesion': sesion, 'texto': f'hola {n}',
            'toco': None}


class _Buzon:
    """Un buzón de mentira: guarda lo que se le deja y sirve lo que se le puso."""

    def __init__(self, recados=None, revienta_al_contestar=False):
        self.recados = list(recados or [])
        self.contestado = []
        self.revienta = revienta_al_contestar

    def __call__(self, ruta, datos=None):
        if ruta == '/cola':
            r, self.recados = self.recados, []
            return {'recados': r}
        if ruta == '/contesta':
            if self.revienta:
                raise OSError('el buzón no está')
            self.contestado.append(datos)
            return {'ok': True}
        raise AssertionError('ruta que no existe: ' + ruta)


class _Encendido:
    """Enciende la puerta sin poner una llave de verdad en ningún lado."""

    def __enter__(self):
        self._d, self._l = recadero.DONDE, recadero.LLAVE
        recadero.DONDE, recadero.LLAVE = 'https://buzon.prueba', 'x' * 32
        return self

    def __exit__(self, *_):
        recadero.DONDE, recadero.LLAVE = self._d, self._l
        return False


class SINBUZONNOEXISTELAPUERTA(unittest.TestCase):
    def test_sin_configurar_no_esta_encendida(self):
        with mock.patch.object(recadero, 'DONDE', ''), \
             mock.patch.object(recadero, 'LLAVE', ''):
            self.assertFalse(recadero.encendido())

    def test_con_una_sola_de_las_dos_tampoco(self):
        """Media configuración es peor que ninguna: parece puesta y no lo está."""
        with mock.patch.object(recadero, 'DONDE', 'https://x'), \
             mock.patch.object(recadero, 'LLAVE', ''):
            self.assertFalse(recadero.encendido())
        with mock.patch.object(recadero, 'DONDE', ''), \
             mock.patch.object(recadero, 'LLAVE', 'y'):
            self.assertFalse(recadero.encendido())

    def test_apagada_no_va_a_la_red_ni_una_vez(self):
        with mock.patch.object(recadero, 'DONDE', ''), \
             mock.patch.object(recadero, '_pedir',
                               mock.Mock(side_effect=AssertionError('fue'))):
            self.assertEqual(recadero.vuelta('sis', {}), 0)


class ELCAMINOENTERO(unittest.TestCase):
    def test_recoge_contesta_y_devuelve_la_sesion(self):
        bz = _Buzon([_recado(1)])
        with _Encendido(), mock.patch.object(recadero, '_pedir', bz), \
             mock.patch.object(portal, 'hablar',
                               lambda *a, **k: ({'texto': 'buenas',
                                                 'botones': []}, 'web:' + 'a' * 22)):
            self.assertEqual(recadero.vuelta('sis', {}), 1)
        self.assertEqual(bz.contestado[0]['ticket'], 't1')
        self.assertEqual(bz.contestado[0]['texto'], 'buenas')
        self.assertEqual(bz.contestado[0]['sesion'], 'web:' + 'a' * 22)

    def test_el_buzon_vacio_no_hace_nada(self):
        bz = _Buzon([])
        with _Encendido(), mock.patch.object(recadero, '_pedir', bz):
            self.assertEqual(recadero.vuelta('sis', {}), 0)
        self.assertEqual(bz.contestado, [])

    def test_no_se_traga_mas_de_POR_VUELTA(self):
        bz = _Buzon([_recado(n) for n in range(50)])
        with _Encendido(), mock.patch.object(recadero, '_pedir', bz), \
             mock.patch.object(portal, 'hablar',
                               lambda *a, **k: ({'texto': 'x', 'botones': []}, 's')):
            self.assertEqual(recadero.vuelta('sis', {}), recadero.POR_VUELTA)


class UNRECADOROTONODEJACOLGADOANADIE(unittest.TestCase):
    """Es la diferencia entre «se trabó» y los tres puntitos para siempre."""

    def test_si_revienta_SE_CONTESTA_IGUAL(self):
        bz = _Buzon([_recado(1)])
        with _Encendido(), mock.patch.object(recadero, '_pedir', bz), \
             mock.patch.object(portal, 'hablar',
                               mock.Mock(side_effect=ValueError('lo que sea'))):
            recadero.vuelta('sis', {}, registrar=lambda *a: None)
        self.assertEqual(len(bz.contestado), 1,
                         'la persona se quedó mirando los tres puntitos')
        self.assertTrue(bz.contestado[0]['texto'].strip())

    def test_y_NO_se_le_cuenta_QUE_fallo(self):
        """AU-RA no habla de la infraestructura ni de sus averías, y menos con
        un desconocido. «Se me trabó» es todo lo que le toca saber."""
        bz = _Buzon([_recado(1)])
        with _Encendido(), mock.patch.object(recadero, '_pedir', bz), \
             mock.patch.object(portal, 'hablar',
                               mock.Mock(side_effect=RuntimeError(
                                   'ollama 127.0.0.1:11434 sin memoria'))):
            recadero.vuelta('sis', {}, registrar=lambda *a: None)
        dicho = bz.contestado[0]['texto'].lower()
        for filtracion in ['ollama', '127.0.0.1', '11434', 'memoria',
                           'runtimeerror', 'traceback']:
            self.assertNotIn(filtracion, dicho, filtracion)

    def test_y_le_deja_por_donde_seguir(self):
        bz = _Buzon([_recado(1)])
        with _Encendido(), mock.patch.object(recadero, '_pedir', bz), \
             mock.patch.object(portal, 'hablar',
                               mock.Mock(side_effect=ValueError('x'))):
            recadero.vuelta('sis', {}, registrar=lambda *a: None)
        self.assertIn('50432136457', bz.contestado[0]['texto'])

    def test_uno_roto_no_deja_sin_contestar_a_LOS_DEMAS(self):
        bz = _Buzon([_recado(n) for n in range(4)])
        malos = {'t2'}

        def hablar(_sis, _pf, _ses, texto, **_k):
            if texto.endswith('2'):
                raise ValueError('este no')
            return {'texto': 'ok', 'botones': []}, 's'

        with _Encendido(), mock.patch.object(recadero, '_pedir', bz), \
             mock.patch.object(portal, 'hablar', hablar):
            recadero.vuelta('sis', {}, registrar=lambda *a: None)
        self.assertEqual(len(bz.contestado), 4,
                         'un recado roto se llevó por delante a los otros')
        del malos

    def test_si_el_buzon_no_recibe_la_respuesta_no_se_tumba_la_vuelta(self):
        bz = _Buzon([_recado(1)], revienta_al_contestar=True)
        with _Encendido(), mock.patch.object(recadero, '_pedir', bz), \
             mock.patch.object(portal, 'hablar',
                               lambda *a, **k: ({'texto': 'x', 'botones': []}, 's')):
            recadero.vuelta('sis', {}, registrar=lambda *a: None)   # sin lanzar


class ELNODOSALENADIEENTRA(unittest.TestCase):
    def test_todo_lo_que_hace_es_SALIR(self):
        """Si esto algún día se cambia por «que el buzón nos llame», se pierde
        la única propiedad que hace segura a esta máquina: que no acepta una
        sola entrada de internet, y ahí dentro vive la llave de los pagos."""
        fuente = (AQUI / 'recadero.py').read_text()
        for servidor in ['listen(', 'bind(', 'HTTPServer', 'socketserver',
                         'Flask', 'app.route']:
            self.assertNotIn(servidor, fuente, servidor)

    def test_la_llave_NO_esta_escrita_en_el_codigo(self):
        fuente = (AQUI / 'recadero.py').read_text()
        self.assertIn("os.environ.get('AURA_BUZON_LLAVE')", fuente)

    def test_la_llave_viaja_como_Bearer(self):
        """El buzón exige el prefijo y no acepta la llave suelta."""
        visto = {}

        class _Falso:
            def __init__(self, req, **_k):
                visto['cab'] = req.headers

            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

            def read(self):
                return b'{}'

        with _Encendido(), mock.patch.object(recadero.urllib.request,
                                             'urlopen', _Falso):
            recadero._pedir('/cola')
        cab = {k.lower(): v for k, v in visto['cab'].items()}
        self.assertTrue(cab['authorization'].startswith('Bearer '))


if __name__ == '__main__':
    unittest.main(verbosity=2)
