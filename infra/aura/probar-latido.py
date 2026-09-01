#!/usr/bin/env python3
"""Que alguien se entere de que AU-RA se quedó muda.

EL INCIDENTE

1-sep: CUATRO HORAS Y MEDIA sin contestarle a nadie, con `systemctl status`
diciendo «active (running)» todo el rato. Un `UnboundLocalError` reventaba cada
mensaje, el bucle seguía girando, y nadie se enteró hasta que José escribió
«escribí al whatsapp hola y ni me contestó».

Systemd vigila que el proceso EXISTA. Nadie vigilaba que CONTESTARA.

LO QUE SE PRUEBA

Sobre todo, que un latido a secas NO habría cazado ese incidente — el bucle
giraba perfectamente. Por eso hay dos comprobaciones y no una.
"""

import json
import pathlib
import sys
import tempfile
import time
import unittest

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import latido   # noqa: E402


class _Carpeta:
    def __enter__(self):
        self.d = tempfile.mkdtemp()
        return self.d

    def __exit__(self, *_):
        return False


class ELBUCLECOLGADO(unittest.TestCase):
    """La primera manera de quedarse muda: deja de dar vueltas."""

    def test_un_latido_fresco_no_avisa(self):
        with _Carpeta() as d:
            latido.latir(d)
            self.assertEqual(latido.revisar(d), (None, None))

    def test_un_latido_VIEJO_avisa(self):
        with _Carpeta() as d:
            latido.latir(d)
            motivo, texto = latido.revisar(d, ahora=time.time() + latido.CALLADA + 10)
            self.assertEqual(motivo, 'colgada')
            self.assertIn('minutos', texto)

    def test_sin_latido_tambien_avisa(self):
        with _Carpeta() as d:
            self.assertEqual(latido.revisar(d)[0], 'sin-latido')

    def test_un_archivo_ROTO_no_se_lee_como_sano(self):
        """Un JSON a medias devolviendo «todo bien» sería el peor de los dos
        mundos: la vigilancia puesta y sin vigilar nada."""
        with _Carpeta() as d:
            pathlib.Path(d, latido.NOMBRE).write_text('{esto no es json')
            self.assertEqual(latido.revisar(d)[0], 'sin-latido')

    def test_el_margen_es_HOLGADO_a_proposito(self):
        """Una respuesta del motor se lleva medio minuto, y varias en fila más.
        Un vigilante que grita por cada vuelta lenta se convierte en ruido, y a
        uno ruidoso se le deja de hacer caso — que es la única manera de que
        falle de verdad."""
        self.assertGreaterEqual(latido.CALLADA, 120)


class ELBUCLEQUEGIRAYFALLA(unittest.TestCase):
    """La segunda, y es LA DEL 1-SEP. Un latido a secas no la caza."""

    def test_con_el_latido_FRESCO_pero_saltando_mensajes_AVISA(self):
        with _Carpeta() as d:
            latido.latir(d, saltados=3)
            motivo, texto = latido.revisar(d)
            self.assertEqual(motivo, 'saltando',
                             'el bucle giraba y nadie recibía nada: es el '
                             'incidente que originó este archivo')
            self.assertIn('3', texto)

    def test_UNO_SOLO_ya_avisa(self):
        """Un mensaje saltado es una persona que escribió y no recibió nada.
        No hay un número de personas ignoradas que esté bien."""
        self.assertEqual(latido.SALTADOS_QUE_AVISAN, 1)
        with _Carpeta() as d:
            latido.latir(d, saltados=1)
            self.assertEqual(latido.revisar(d)[0], 'saltando')

    def test_cero_saltados_no_avisa(self):
        with _Carpeta() as d:
            latido.latir(d, saltados=0, contestados=40)
            self.assertEqual(latido.revisar(d), (None, None))

    def test_lo_COLGADO_manda_sobre_lo_que_SALTA(self):
        """Si está colgada, los saltados son consecuencia. Se avisa de la
        causa, no del síntoma."""
        with _Carpeta() as d:
            latido.latir(d, saltados=5)
            motivo, _t = latido.revisar(d, ahora=time.time() + latido.CALLADA + 10)
            self.assertEqual(motivo, 'colgada')


class LATIRNOPUEDEROMPERELBUCLE(unittest.TestCase):
    """Lo que protege al bucle no puede ser lo que lo tumbe."""

    def test_una_carpeta_que_no_existe_no_lanza(self):
        latido.latir('/no/existe/de/ninguna/manera')     # sin lanzar

    def test_latir_no_decide_nada(self):
        """Si esta función pensara, sería código que puede fallar dentro del
        bucle que intenta proteger. Escribe y ya."""
        fuente = (AQUI / 'latido.py').read_text()
        cuerpo = fuente[fuente.index('def latir('):fuente.index('def leer(')]
        for pensar in ['revisar', 'enviar', 'if ahora', 'requests', 'urllib']:
            self.assertNotIn(pensar, cuerpo, pensar)

    def test_el_archivo_se_escribe_DE_UNA_PIEZA(self):
        """A medio escribir, el vigilante leería basura y diría «sin latido»
        justo cuando todo está bien."""
        self.assertIn('os.replace', (AQUI / 'latido.py').read_text())


class ELVIGILANTEVIVEAFUERA(unittest.TestCase):
    """Un vigilante que vive dentro de lo vigilado se muere con ello."""

    def test_NO_es_un_hilo_del_asistente(self):
        fuente = (AQUI / 'asistente.py').read_text()
        self.assertNotIn('latido.revisar', fuente,
                         'el asistente se está vigilando a sí mismo')
        self.assertIn('latido.latir', fuente)

    def test_el_asistente_late_AL_FINAL_de_la_vuelta(self):
        """Arriba latiría igual aunque las tres puertas estuvieran
        reventando."""
        fuente = (AQUI / 'asistente.py').read_text()
        i = fuente.index('latido.latir(DATOS')
        j = fuente.index('time.sleep(PASO)', i - 900)
        self.assertLess(i, j, 'late antes de haber hecho el trabajo')

    def test_el_vigilante_solo_avisa_a_ADMIN(self):
        fuente = (AQUI / 'vigilante.py').read_text()
        self.assertIn('escalafon.admins()', fuente)

    def test_y_no_cuenta_QUE_se_rompio_por_dentro(self):
        """Va a los admin, sí, pero por WhatsApp — que es un chat como
        cualquiera. Nada de trazas ni de nombres de archivo."""
        fuente = (AQUI / 'latido.py').read_text()
        for f in ['Traceback', 'UnboundLocalError', 'asistente.py',
                  '127.0.0.1', 'ollama']:
            i = fuente.find("return 'colgada'")
            self.assertNotIn(f, fuente[i:i + 600], f)


class NOLLENARLEELTELEFONOANADIE(unittest.TestCase):
    def test_hay_freno_y_es_de_al_menos_media_hora(self):
        """Si algo se rompe de verdad se rompe seguido. Llenarles el teléfono
        con lo mismo termina en que silencian el chat — justo el chat por el
        que va a llegar el aviso bueno."""
        self.assertGreaterEqual(latido.FRENO, 1800)

    def test_el_vigilante_recuerda_cuando_aviso(self):
        fuente = (AQUI / 'vigilante.py').read_text()
        self.assertIn('latido.FRENO', fuente)
        self.assertIn('_apuntar', fuente)

    def test_y_lo_guarda_con_permisos(self):
        self.assertIn('chmod(0o600)', (AQUI / 'vigilante.py').read_text())


class LOQUEELASISTENTECUENTA(unittest.TestCase):
    def test_los_saltados_se_cuentan_en_una_ventana_movil(self):
        import asistente
        asistente.SALTADOS[:] = []
        ahora = time.time()
        asistente.SALTADOS.extend([ahora - 10, ahora - 20])
        self.assertEqual(asistente.saltados_recientes(ahora), 2)

    def test_y_los_viejos_se_caen_solos(self):
        """Si no, un salto de anteayer estaría avisando para siempre."""
        import asistente
        asistente.SALTADOS[:] = []
        ahora = time.time()
        asistente.SALTADOS.append(ahora - asistente.VENTANA_SALTADOS - 60)
        self.assertEqual(asistente.saltados_recientes(ahora), 0)


class LAFICHADELTRASPASOLEQUELLEGABAANADIE(unittest.TestCase):
    """Existía, estaba bien escrita, y era un no-op silencioso.

    `_derivar_al_equipo` recorría `vistazo.JEFES`, que sale de la variable
    `AURA_PARTE_PARA`. Esa variable ESTÁ VACÍA en el nodo. Cero iteraciones:
    la ficha de quien estaba por escribirle a José no le llegó nunca a nadie.

    Peor que no tenerla, porque parecía hecho.
    """

    def _mandar(self, lista_escalafon, jefes):
        import asistente
        import escalafon
        import vistazo
        from unittest import mock
        recibido = []

        class Rel:
            def enviar(self, para, texto):
                recibido.append((para, texto))

        escalafon.recargar(lista_escalafon)
        try:
            with mock.patch.object(vistazo, 'JEFES', jefes):
                asistente._derivar_al_equipo(
                    Rel(), {'nombre': 'Ana', 'pais': 'honduras',
                            'motivo': 'quiere invertir'}, '50499999999')
        finally:
            escalafon.recargar()
        return recibido

    def test_AHORA_SI_LLEGA_a_los_admin_del_escalafon(self):
        r = self._mandar('50432136457:admin, 50498782176:admin', set())
        self.assertEqual(len(r), 2, 'la ficha no llegó a los dos admin')
        self.assertIn('Ana', r[0][1])

    def test_con_AURA_PARTE_PARA_vacia_igual_llega(self):
        """Es el caso exacto del nodo: la variable vacía dejaba la ficha en
        cero personas."""
        r = self._mandar('50432136457:admin', set())
        self.assertTrue(r, 'volvió a no llegarle a nadie')

    def test_una_persona_con_dos_buzones_recibe_UNA_ficha(self):
        r = self._mandar('50432136457/j@x.org:admin', set())
        self.assertEqual(len(r), 1)

    def test_lo_que_le_llega_sirve_para_atender_sin_preguntar(self):
        """Sin esto le llega un «hola» de un número desconocido y tiene que
        empezar preguntando lo que la persona ya contó."""
        _para, texto = self._mandar('50432136457:admin', set())[0]
        for dato in ['Ana', '50499999999', 'Honduras', 'quiere invertir']:
            self.assertIn(dato, texto, dato)

    def test_si_no_hay_NADIE_se_deja_dicho_en_el_registro(self):
        """Que nadie la reciba no puede volver a pasar en silencio: es una
        persona interesada que se pierde."""
        import asistente
        fuente = (AQUI / 'asistente.py').read_text()
        i = fuente.index('def _derivar_al_equipo')
        cuerpo = fuente[i:i + 2200]
        self.assertIn('NADIE recibe la ficha', cuerpo)
        del asistente

    def test_manda_el_ESCALAFON_no_una_segunda_lista(self):
        """Dos listas para la misma pregunta es como una de las dos se queda
        vieja sin que nadie lo note. Ésta se quedó vieja del todo.

        Se mira el CÓDIGO, saltando el docstring: ahí se explica el fallo y se
        nombra la lista vieja, así que buscar en el texto entero encontraba
        `vistazo.JEFES` en la explicación y daba por malo el arreglo. Una
        prueba que lee código fuente tiene que leer el código."""
        fuente = (AQUI / 'asistente.py').read_text()
        i = fuente.index('def _derivar_al_equipo')
        cuerpo = fuente[i:i + 2600]
        # el docstring va entre las dos primeras comillas triples
        a = cuerpo.index('"""')
        b = cuerpo.index('"""', a + 3) + 3
        codigo = cuerpo[b:]
        self.assertLess(codigo.index('escalafon.admins()'),
                        codigo.index('vistazo.JEFES'),
                        'sigue mandando la lista vieja')


if __name__ == '__main__':
    unittest.main(verbosity=2)
