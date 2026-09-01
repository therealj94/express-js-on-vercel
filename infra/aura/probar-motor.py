#!/usr/bin/env python3
"""Que el modelo QUEPA en la tarjeta, y que se note el dia que no.

POR QUE ESTE ARCHIVO EXISTE

1-sep. Midiendo tarjetas para decidir una nueva, aparecio esto en el registro
de ollama del nodo:

    load_tensors: offloaded 45/49 layers to GPU

Cuatro de las cuarenta y nueve capas del modelo corrian en el PROCESADOR. La
voz ocupa 4,6 GB de los 15 de la tarjeta, el modelo ya no cabia, y cada palabra
que AU-RA escribia cruzaba al procesador y volvia. Cuatro veces.

Estuvo asi DIAS y nadie lo vio. No habia como verlo: el servicio decia
«active», el modelo contestaba, y las respuestas eran buenas. Solo era siete
veces mas lento — y «lento» se le echa a la maquina, no a un fallo.

Esa es la averia peor de todas: la que no rompe nada, no levanta ninguna
excepcion, y sale carisima. Este archivo la caza de dos formas:

  1. LA CUENTA, antes de arrancar. `VENTANA` x `HILOS` es memoria que ollama
     reserva SI O SI. Si esa cuenta no cabe junto al modelo y a la voz, la
     configuracion esta mal ANTES de encender nada — y se sabe aqui, no en
     produccion tres dias despues.

  2. EL AVISO, corriendo. `vistazo._motor` lee el registro de ollama y lo
     pone en el parte de tecnologia y en el de administracion.
"""

import os
import pathlib
import re
import sys
import unittest
from unittest import mock

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import miradas    # noqa: E402
import vistazo    # noqa: E402

# Medido en el nodo el 1-sep, no estimado.
MODELO_MIB = 9036          # qwen2.5:14b Q4_K_M cargado
VOZ_MIB = 4692             # Chatterbox + Whisper. El PICO es igual al reposo.
RESERVA_MIB = 600          # margen del sistema

# qwen2.5-14B: 48 capas, 8 cabezas KV, 128 de ancho, f16 = 2 bytes por valor.
MIB_POR_FICHA = 2 * 48 * 8 * 128 * 2 / 1024 ** 2

TARJETAS = {'T4': 15360, 'A10G': 23028, 'L4': 23034}

# LA TARJETA QUE HAY EN EL NODO. Se cambia aquí el día que se cambia el
# hardware, y hasta entonces esta prueba es la que dice si la configuración
# del código cabe en la máquina de verdad.
#
# El 1-sep esta constante decía T4 y la prueba salía ROJA con la
# configuración que estaba en producción — porque no cabía. Esa es la razón
# de que el archivo exista: la cuenta se hace antes de encender, no tres días
# después mirando por qué todo va lento.
TARJETA_DEL_NODO = os.environ.get('AURA_TARJETA', 'A10G')


def cabe(tarjeta, ventana, hilos, con_voz=True):
    """Cuántos MiB sobran con esa configuración. Negativo = no cabe."""
    kv = hilos * ventana * MIB_POR_FICHA
    return TARJETAS[tarjeta] - (MODELO_MIB + kv + (VOZ_MIB if con_voz else 0)
                                + RESERVA_MIB)


def _del_fuente(nombre, archivo='asistente.py'):
    """El valor de una constante de módulo, leído del fuente."""
    t = (AQUI / archivo).read_text(encoding='utf8')
    m = re.search(rf'^{nombre} = (?:int\(os\.environ\.get\([^,]+, )?'
                  rf"'?(\d+)'?", t, re.M)
    assert m, f'no se encontró {nombre} en {archivo}'
    return int(m.group(1))


class LACUENTASEHACEANTESDEENCENDER(unittest.TestCase):
    """`VENTANA` × `HILOS` es memoria que ollama reserva sí o sí."""

    def test_lo_que_esta_configurado_CABE_en_la_tarjeta_del_nodo(self):
        v, h = _del_fuente('VENTANA'), _del_fuente('HILOS')
        libre = cabe(TARJETA_DEL_NODO, v, h)
        self.assertGreater(
            libre, 0,
            f'con ventana {v} y {h} hilos NO cabe en la {TARJETA_DEL_NODO}: '
            f'faltan {-libre:.0f} MiB. Ollama no avisa — tira capas al '
            'procesador y todo se vuelve siete veces más lento sin un error.')

    def test_y_queda_margen_de_sobra_no_al_filo(self):
        """Caber por veinte megas es no caber la semana que viene."""
        v, h = _del_fuente('VENTANA'), _del_fuente('HILOS')
        self.assertGreater(cabe(TARJETA_DEL_NODO, v, h), 1000,
                           'cabe pero sin margen: cualquier cosa que crezca '
                           'en la tarjeta tira capas al procesador')

    def test_la_tarjeta_del_nodo_es_una_que_conocemos(self):
        self.assertIn(TARJETA_DEL_NODO, TARJETAS)

    def test_la_cuenta_reconoce_el_fallo_que_de_verdad_paso(self):
        """La T4 con la voz y 8192×3: eso es lo que había el 1-sep, y no
        cabía. Si esta prueba dijera que sí, no estaría midiendo nada."""
        self.assertLess(cabe('T4', 8192, 3), 0,
                        'la cuenta no reconoce la configuración que falló')

    def test_sin_la_voz_la_misma_tarjeta_SI_aguanta(self):
        """Que la culpa era de compartir, no del modelo."""
        self.assertGreater(cabe('T4', 8192, 3, con_voz=False), 0)

    def test_la_A10G_aguanta_mas_ventana_que_la_T4(self):
        self.assertGreater(cabe('A10G', 12288, 3), 0)
        self.assertLess(cabe('T4', 12288, 3), 0)

    def test_pero_ni_la_A10G_aguanta_cualquier_cosa(self):
        """Una tarjeta más grande no perdona una configuración mal puesta —
        lo comprobé rompiendo la L4 con seis hilos en la propia medición."""
        self.assertLess(cabe('A10G', 16384, 6), 0)


class ELPARTEAVISASILASCAPASSESALEN(unittest.TestCase):
    """La avería que no levanta ninguna excepción tiene que salir escrita."""

    def _con_registro(self, texto, vram='9036, 23028'):
        def correr(orden, **k):
            s = mock.Mock()
            s.stdout = vram if orden[0] == 'nvidia-smi' else texto
            return s
        return mock.patch('subprocess.run', side_effect=correr)

    def test_capas_afuera_sale_como_PENDIENTE_no_como_dato(self):
        with self._con_registro('load_tensors: offloaded 45/49 layers to GPU'), \
             mock.patch.object(vistazo, '_http', return_value={'models': []}):
            lineas, pend = vistazo._motor()
        junto = ' '.join(pend)
        self.assertIn('NO cabe', junto)
        self.assertIn('4 de 49', junto)
        self.assertIn('procesador', junto)

    def test_y_dice_que_eso_lo_hace_mas_lento(self):
        """Sin esa frase, «45 de 49 capas» no le dice nada a nadie."""
        with self._con_registro('offloaded 45/49 layers to GPU'), \
             mock.patch.object(vistazo, '_http', return_value={'models': []}):
            _l, pend = vistazo._motor()
        self.assertIn('lento', ' '.join(pend))

    def test_con_todas_las_capas_adentro_es_solo_un_dato(self):
        with self._con_registro('offloaded 49/49 layers to GPU'), \
             mock.patch.object(vistazo, '_http', return_value={'models': []}):
            lineas, pend = vistazo._motor()
        self.assertFalse([p for p in pend if 'capas' in p])
        self.assertIn('modelo entero en la tarjeta', ' '.join(lineas))

    def test_se_queda_con_la_ULTIMA_carga_no_con_la_primera(self):
        """El registro guarda todas las cargas. Mirar la primera diría que
        está roto un día después de haberlo arreglado."""
        historia = ('offloaded 45/49 layers to GPU\n'
                    'offloaded 45/49 layers to GPU\n'
                    'offloaded 49/49 layers to GPU')
        with self._con_registro(historia), \
             mock.patch.object(vistazo, '_http', return_value={'models': []}):
            _l, pend = vistazo._motor()
        self.assertFalse([p for p in pend if 'capas' in p])

    def test_la_tarjeta_sin_margen_tambien_avisa(self):
        """Sin margen, el próximo arranque tira capas — y ahí ya es tarde."""
        with self._con_registro('offloaded 49/49 layers to GPU',
                                vram='22900, 23028'), \
             mock.patch.object(vistazo, '_http', return_value={'models': []}):
            _l, pend = vistazo._motor()
        self.assertIn('al límite', ' '.join(pend))

    def test_si_no_se_puede_MIRAR_tambien_se_dice(self):
        """La regla de la casa: una fuente que falla se dice, no se omite."""
        with mock.patch('subprocess.run', side_effect=OSError('sin journalctl')), \
             mock.patch.object(vistazo, '_http', side_effect=OSError('sin motor')):
            _l, pend = vistazo._motor()
        self.assertTrue(any('no se pudo comprobar' in p for p in pend), pend)

    def test_el_motor_frio_se_dice_sin_alarmar(self):
        """Frío no es roto: es que el primero del día va a esperar."""
        with self._con_registro('offloaded 49/49 layers to GPU'), \
             mock.patch.object(vistazo, '_http', return_value={'models': []}):
            lineas, pend = vistazo._motor()
        self.assertIn('frío', ' '.join(lineas))
        self.assertFalse([p for p in pend if 'frío' in p])


class LLEGAAQUIENLETOCA(unittest.TestCase):

    def test_tecnologia_lo_ve(self):
        self.assertIn(vistazo._motor,
                      [fn for _n, fn in _fuentes_de('tecnologico')])

    def test_el_admin_tambien(self):
        self.assertIn(vistazo._motor, [fn for _n, fn in _fuentes_de('admin')])

    def test_y_los_demas_NO(self):
        """A quien lleva lo legal, «45 de 49 capas» no le dice nada."""
        for tramo in ('legal', 'mercadeo', 'contable'):
            self.assertNotIn(vistazo._motor,
                             [fn for _n, fn in _fuentes_de(tramo)], tramo)


def _fuentes_de(tramo):
    """Las fuentes que corre `miradas.para` para ese tramo, sin correrlas."""
    vistas = []
    original = miradas._mirar
    def espia(fuentes):
        vistas.extend(fuentes)
        return [], [], []
    with mock.patch.object(miradas, '_mirar', espia):
        miradas.para(tramo)
    return vistas


if __name__ == '__main__':
    unittest.main(verbosity=2)
