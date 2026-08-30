#!/usr/bin/env python3
"""AU-RA en WhatsApp.

POR QUE ESTAS PRUEBAS EXISTEN

El puente falla de tres formas y las tres se notan del lado de la persona, no
del nuestro:

  1. QUINCE MENSAJES POR UNA RESPUESTA. AU-RA contesta en trozos y va editando
     el mensaje mientras piensa. WhatsApp no deja editar. Si los trozos salen
     tal cual, cada frase es un mensaje suelto y el telefono de quien pregunto
     no para de sonar. Es el fallo mas probable y el mas vergonzoso.

  2. CONTESTARSE A SI MISMA. Si la bandeja no distingue lo entrante de lo
     nuestro, AU-RA lee su propia respuesta como un mensaje nuevo y contesta en
     bucle, para siempre, pagando cada vuelta.

  3. PERDER LO QUE LLEGO MIENTRAS PENSABA. Si la puerta fuera el «sin leer» del
     proveedor en vez de un tope nuestro, marcar leido sellaria la hora y lo que
     entro mientras el motor trabajaba quedaria detras del sello sin atender.
     Esta leccion ya esta pagada en el chat de la casa.

No se toca la red: se levanta un proveedor de mentira que anota lo que se le
pide. Una prueba que necesita WhatsApp de verdad no se corre en cada cambio, y
una prueba que no se corre no protege nada.
"""

import json
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('ZERNIO_CLAVE', 'sk_de_mentira')
os.environ.setdefault('ZERNIO_CUENTA', 'cuenta_de_mentira')

import whatsapp as wa   # noqa: E402


HILO = 'conv-1'
QUIEN = '+50761234567'


class Proveedor:
    """Un WhatsApp de mentira que anota lo que le mandan."""

    def __init__(self, mensajes=None):
        self.enviados = []
        self.leidos = []
        self.escribiendo = []
        self.mensajes = mensajes if mensajes is not None else []

    def __call__(self, metodo, ruta, cuerpo=None, timeout=25):
        if ruta.startswith('/inbox/conversations?'):
            return {'data': [{
                'id': HILO, 'participantId': QUIEN,
                'participantName': 'Ana', 'platform': 'whatsapp',
                'updatedTime': '2026-08-30T12:00:00.000Z'}]}
        if ruta.endswith('/read'):
            self.leidos.append(ruta)
            return {}
        if ruta.endswith('/typing'):
            self.escribiendo.append(ruta)
            return {}
        if '/messages' in ruta and metodo == 'GET':
            # `messages`, no `data`. Copiado de una respuesta REAL del
            # proveedor: ver la nota en `bandeja()`.
            return {'status': 'success', 'messages': self.mensajes,
                    'pagination': {'hasMore': False, 'nextCursor': None}}
        if '/messages' in ruta and metodo == 'POST':
            self.enviados.append(cuerpo.get('message'))
            return {'id': 'wamid-' + str(len(self.enviados))}
        return {}


def con_proveedor(p):
    return mock.patch.object(wa, '_pedir', p)


class UnaSolaRespuesta(unittest.TestCase):
    """El fallo numero 1: quince mensajes por una respuesta."""

    def test_los_trozos_salen_como_UN_mensaje(self):
        p = Proveedor()
        with con_proveedor(p):
            rel = wa.RelevoWhatsApp()
            rel.conversaciones()          # aprende el hilo
            # Asi habla el cerebro: abre globo, lo agranda, lo cierra.
            r = rel.enviar(QUIEN, 'Hola.', parcial=True)
            rel.editar(r['id'], 'Hola. Te cuento.', parcial=True)
            rel.editar(r['id'], 'Hola. Te cuento. Ya esta.', parcial=False)

        self.assertEqual(len(p.enviados), 1,
                         f'salieron {len(p.enviados)} mensajes por una respuesta')
        self.assertEqual(p.enviados[0], 'Hola. Te cuento. Ya esta.')

    def test_mientras_no_cierre_no_sale_nada(self):
        """Media respuesta no se manda: o esta entera o no esta."""
        p = Proveedor()
        with con_proveedor(p):
            rel = wa.RelevoWhatsApp()
            rel.conversaciones()
            r = rel.enviar(QUIEN, 'Estoy pensan', parcial=True)
            rel.editar(r['id'], 'Estoy pensando en', parcial=True)
        self.assertEqual(p.enviados, [])

    def test_un_envio_normal_sale_al_momento(self):
        p = Proveedor()
        with con_proveedor(p):
            rel = wa.RelevoWhatsApp()
            rel.conversaciones()
            rel.enviar(QUIEN, 'Buenas.')
        self.assertEqual(p.enviados, ['Buenas.'])

    def test_editar_algo_que_no_es_globo_no_duplica(self):
        """Sin esto, una edicion de un mensaje ya enviado lo manda otra vez."""
        p = Proveedor()
        with con_proveedor(p):
            rel = wa.RelevoWhatsApp()
            rel.conversaciones()
            rel.enviar(QUIEN, 'Ya salio.')
            rel.editar('wamid-1', 'Ya salio, corregido.', parcial=False)
        self.assertEqual(p.enviados, ['Ya salio.'])


class NoSeContestaASiMisma(unittest.TestCase):
    """El fallo numero 2: el bucle infinito."""

    def test_la_bandeja_distingue_lo_nuestro_de_lo_suyo(self):
        p = Proveedor(mensajes=[
            {'id': 'm1', 'direction': 'incoming', 'message': 'hola',
             'sentAt': '2026-08-30T12:00:00.000Z', 'attachments': []},
            {'id': 'm2', 'direction': 'outgoing', 'message': 'hola, soy AU-RA',
             'sentAt': '2026-08-30T12:00:05.000Z', 'attachments': []},
        ])
        with con_proveedor(p):
            rel = wa.RelevoWhatsApp()
            rel.conversaciones()
            bandeja = rel.bandeja(QUIEN)

        # `atender_charla` filtra por `de == correo`. Si lo nuestro llevara el
        # telefono, AU-RA se leeria a si misma y contestaria en bucle.
        suyos = [m for m in bandeja if m['de'] == QUIEN]
        self.assertEqual(len(suyos), 1)
        self.assertEqual(suyos[0]['texto'], 'hola')
        self.assertNotEqual(bandeja[1]['de'], QUIEN,
                            'nuestra propia respuesta figura como suya')

    def test_el_orden_es_del_mas_viejo_al_mas_nuevo(self):
        p = Proveedor(mensajes=[
            {'id': 'a', 'direction': 'incoming', 'message': 'uno',
             'sentAt': '2026-08-30T12:00:00.000Z'},
            {'id': 'b', 'direction': 'incoming', 'message': 'dos',
             'sentAt': '2026-08-30T12:00:09.000Z'},
        ])
        with con_proveedor(p):
            rel = wa.RelevoWhatsApp()
            rel.conversaciones()
            b = rel.bandeja(QUIEN)
        self.assertLess(b[0]['cuando'], b[1]['cuando'])
        self.assertGreater(b[0]['cuando'], 0, 'la fecha no se supo leer')


class TextoLargo(unittest.TestCase):
    """WhatsApp corta en 4096. AU-RA se explaya."""

    def test_una_respuesta_larga_se_parte_y_no_se_pierde(self):
        largo = ('Parrafo con bastante texto. ' * 400).strip()
        self.assertGreater(len(largo), wa.TOPE_TEXTO)
        partes = wa.trozos(largo)
        self.assertGreater(len(partes), 1)
        for t in partes:
            self.assertLessEqual(len(t), wa.TOPE_TEXTO)
        # Y no se pierde ni se inventa una palabra.
        self.assertEqual(' '.join(partes).split(), largo.split())

    def test_no_corta_palabras_por_la_mitad(self):
        texto = 'https://genesisid.online/comprobar ' * 300
        for t in wa.trozos(texto):
            self.assertFalse(t.endswith('http'), 'partio un enlace')
            self.assertNotIn('\n', t.strip('\n'))

    def test_lo_corto_va_de_una_pieza(self):
        self.assertEqual(wa.trozos('hola'), ['hola'])
        self.assertEqual(wa.trozos('  '), [])


class LoQueNoSeManda(unittest.TestCase):

    def test_un_mensaje_vacio_no_se_manda(self):
        """Meta lo rechaza, y con razon. Mejor no gastar la llamada."""
        p = Proveedor()
        with con_proveedor(p):
            rel = wa.RelevoWhatsApp()
            rel.conversaciones()
            rel.enviar(QUIEN, '')
            rel.enviar(QUIEN, '   \n  ')
        self.assertEqual(p.enviados, [])

    def test_sin_hilo_conocido_no_revienta(self):
        p = Proveedor()
        p_sin = lambda m, r, c=None, timeout=25: (            # noqa: E731
            {'data': []} if r.startswith('/inbox/conversations?') else p(m, r, c, timeout))
        with con_proveedor(p_sin):
            rel = wa.RelevoWhatsApp()
            rel.enviar('+50700000000', 'hola')      # no lanza
        self.assertEqual(p.enviados, [])


class LaVentanaDeLas24Horas(unittest.TestCase):
    """Fuera de ella Meta rechaza el texto libre. Que se lea con su nombre."""

    def test_una_charla_de_ayer_se_detecta(self):
        import time
        viejo = int(time.time() * 1000) - 30 * 3600 * 1000
        self.assertTrue(wa.fuera_de_ventana([{'de': QUIEN, 'cuando': viejo}]))

    def test_una_charla_de_recien_no(self):
        import time
        self.assertFalse(wa.fuera_de_ventana(
            [{'de': QUIEN, 'cuando': int(time.time() * 1000) - 60000}]))

    def test_solo_cuenta_lo_que_escribio_LA_PERSONA(self):
        """Nuestras respuestas no reabren la ventana. Si contaran, AU-RA
        creeria que puede escribir cuando Meta ya no la deja."""
        import time
        ahora = int(time.time() * 1000)
        bandeja = [{'de': QUIEN, 'cuando': ahora - 30 * 3600 * 1000},
                   {'de': 'aura', 'cuando': ahora - 1000}]
        self.assertTrue(wa.fuera_de_ventana(bandeja))


class Encendido(unittest.TestCase):

    def test_sin_clave_esto_no_existe(self):
        """Y no es un fallo: es una boca que no esta puesta."""
        with mock.patch.object(wa, 'CLAVE', ''):
            self.assertFalse(wa.encendido())
        with mock.patch.object(wa, 'CUENTA', ''):
            self.assertFalse(wa.encendido())
        self.assertTrue(wa.encendido())


class Cortesias(unittest.TestCase):

    def test_el_escribiendo_llega(self):
        """Con respuestas de medio minuto, esto es la diferencia entre
        «esta pensando» y «este numero no contesta»."""
        p = Proveedor()
        with con_proveedor(p):
            rel = wa.RelevoWhatsApp()
            rel.conversaciones()
            rel.escribiendo(QUIEN)
        self.assertEqual(len(p.escribiendo), 1)

    def test_si_el_proveedor_falla_las_cortesias_no_tumban_nada(self):
        def rompe(metodo, ruta, cuerpo=None, timeout=25):
            if ruta.startswith('/inbox/conversations?'):
                return {'data': [{'id': HILO, 'participantId': QUIEN,
                                  'updatedTime': '2026-08-30T12:00:00.000Z'}]}
            raise OSError('proveedor caido')
        with con_proveedor(rompe):
            rel = wa.RelevoWhatsApp()
            rel.conversaciones()
            rel.escribiendo(QUIEN)   # no lanza
            rel.leido(QUIEN)         # no lanza

    def test_lo_que_no_aplica_devuelve_vacio(self):
        """En WhatsApp no hay amistad que aceptar: cualquiera puede escribir."""
        rel = wa.RelevoWhatsApp()
        self.assertEqual(rel.solicitudes(), [])
        self.assertEqual(rel.ficha(QUIEN), {})
        self.assertEqual(rel.huella('x'), {})


class NotasDeVoz(unittest.TestCase):

    def test_un_audio_se_marca_como_voz(self):
        """AU-RA ya sabe transcribir; lo que hace falta es que le llegue
        etiquetado, porque el cerebro decide por el `tipo`."""
        p = Proveedor(mensajes=[{
            'id': 'v1', 'direction': 'incoming', 'message': '',
            'sentAt': '2026-08-30T12:00:00.000Z',
            'attachments': [{'type': 'audio/ogg'}]}])
        with con_proveedor(p):
            rel = wa.RelevoWhatsApp()
            rel.conversaciones()
            self.assertEqual(rel.bandeja(QUIEN)[0]['tipo'], 'voz')

    def test_una_foto_no_es_voz(self):
        p = Proveedor(mensajes=[{
            'id': 'f1', 'direction': 'incoming', 'message': '',
            'sentAt': '2026-08-30T12:00:00.000Z',
            'attachments': [{'type': 'image/jpeg'}]}])
        with con_proveedor(p):
            rel = wa.RelevoWhatsApp()
            rel.conversaciones()
            self.assertEqual(rel.bandeja(QUIEN)[0]['tipo'], 'texto')


class MismoTratoQueElRelevo(unittest.TestCase):
    """Si los dos no responden a lo mismo, el cerebro revienta en produccion
    con un AttributeError y no aqui."""

    def test_implementa_todo_lo_que_el_cerebro_llama(self):
        usados = ['enviar', 'escribiendo', 'editar', 'solicitudes', 'leido',
                  'huella', 'ficha', 'conversaciones', 'bandeja', 'aceptar']
        rel = wa.RelevoWhatsApp()
        faltan = [m for m in usados if not callable(getattr(rel, m, None))]
        self.assertEqual(faltan, [], f'le falta: {faltan}')



class LaListaQueCasiLoMataEnSilencio(unittest.TestCase):
    """La lista de WhatsApp es SUYA, no la de correos.

    Aplicar `probadores.txt` —que tiene correos— a un numero de telefono no es
    «cerrado a unos pocos»: es cerrado a todo el mundo, para siempre, y sin que
    nada lo diga. Este fichero de pruebas existe en buena parte por esto.
    """

    def _cargar_asistente(self, carpeta):
        """Carga solo la funcion, sin arrancar el asistente entero."""
        import pathlib
        fuente = pathlib.Path(__file__).with_name('asistente.py').read_text(
            encoding='utf8')
        i = fuente.index('def probadores_whatsapp()')
        j = fuente.index('def vuelta_whatsapp(')
        ambito = {'DATOS': carpeta}
        exec(compile(fuente[i:j], 'asistente', 'exec'), ambito)
        return ambito['probadores_whatsapp']

    def test_sin_archivo_atiende_a_todos(self):
        import pathlib, tempfile
        with tempfile.TemporaryDirectory() as d:
            f = self._cargar_asistente(pathlib.Path(d))
            self.assertIsNone(f(), 'sin lista tiene que estar abierta')

    def test_un_archivo_de_solo_comentarios_tambien_esta_abierto(self):
        import pathlib, tempfile
        with tempfile.TemporaryDirectory() as d:
            (pathlib.Path(d) / 'probadores-whatsapp.txt').write_text(
                '# nadie todavia\n\n', encoding='utf8')
            f = self._cargar_asistente(pathlib.Path(d))
            self.assertIsNone(f())

    def test_NO_lee_la_lista_de_correos(self):
        """El fallo que se estaba a punto de cometer: si leyera
        `probadores.txt`, ningun telefono estaria dentro y AU-RA quedaria muda
        en WhatsApp sin una sola señal."""
        import pathlib, tempfile
        with tempfile.TemporaryDirectory() as d:
            (pathlib.Path(d) / 'probadores.txt').write_text(
                'alguien@ejemplo.invalid\n', encoding='utf8')
            f = self._cargar_asistente(pathlib.Path(d))
            self.assertIsNone(f(), 'se coló la lista de correos: AU-RA quedaría muda')

    def test_con_numeros_cierra_de_verdad(self):
        import pathlib, tempfile
        with tempfile.TemporaryDirectory() as d:
            (pathlib.Path(d) / 'probadores-whatsapp.txt').write_text(
                '# los de casa\n+50761234567\n', encoding='utf8')
            f = self._cargar_asistente(pathlib.Path(d))
            self.assertEqual(f(), {'+50761234567'})


class ElPrimerHolaNoSePuedeTRAGAR(unittest.TestCase):
    """La regresion que costo la primera prueba de verdad.

    El «Hola» llego al proveedor a las 02:59:38 y AU-RA no contesto nunca. El
    motivo: al ver por primera vez a alguien se le ponia el tope EN EL PRESENTE
    —copiado del chat de la casa, donde es correcto porque el perfil nace al
    aceptar la amistad, antes de cualquier mensaje—. En WhatsApp la primera vez
    que vemos a alguien es POR su mensaje, asi que ese tope quedaba por encima y
    lo enterraba.
    """

    def test_el_tope_de_un_contacto_nuevo_NO_es_ahora(self):
        import time
        ahora = int(time.time() * 1000)
        tope = wa.tope_de_contacto_nuevo(ahora)
        self.assertLess(tope, ahora, 'el tope arranca en el presente: se traga el primer mensaje')

    def test_un_mensaje_recien_llegado_queda_POR_ENCIMA_del_tope(self):
        """Es la condicion exacta que decide si se atiende o se descarta."""
        import time
        ahora = int(time.time() * 1000)
        recien = ahora - 5_000            # llego hace cinco segundos
        self.assertGreater(recien, wa.tope_de_contacto_nuevo(ahora),
                           'un mensaje de hace cinco segundos se descartaria')

    def test_pero_un_archivo_viejo_NO_se_recontesta(self):
        """La otra mitad: el tope existe para no contestar 200 mensajes de la
        semana pasada a medio minuto cada uno."""
        import time
        ahora = int(time.time() * 1000)
        de_hace_tres_dias = ahora - 3 * 24 * 3600 * 1000
        self.assertLess(de_hace_tres_dias, wa.tope_de_contacto_nuevo(ahora))

    def test_el_corte_es_la_ventana_en_que_SE_PUEDE_contestar(self):
        """No es un numero elegido a dedo: fuera de 24 h Meta rechaza el texto
        libre, asi que el tope es justo lo mas viejo que se puede responder."""
        import time
        ahora = int(time.time() * 1000)
        self.assertEqual(ahora - wa.tope_de_contacto_nuevo(ahora), wa.VENTANA_MS)

if __name__ == '__main__':
    unittest.main(verbosity=2)
