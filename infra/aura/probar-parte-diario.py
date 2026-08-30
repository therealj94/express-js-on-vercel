#!/usr/bin/env python3
"""El envio del parte, 7:30 y 19:30.

POR QUE ESTAS PRUEBAS EXISTEN

El parte se manda cuando nadie esta mirando. Las tres formas de que falle sin
que nadie se entere hasta que haga falta:

  1. SE DA POR ENVIADO SIN SALIR. `_soltar` devuelve `{}` —sin lanzar— cuando
     todavia no hay charla abierta, que es justo el caso la primera vez. Eso
     saltaria la plantilla y el parte desapareceria en silencio.

  2. LA PLANTILLA SE RECHAZA POR UN SALTO DE LINEA. A las 7:30 no hay ventana
     libre: la plantilla es el unico camino, y Meta no limpia el hueco.

  3. FALLA CALLANDO. Un parte que dejo de llegar sin avisar se confunde con
     «no hubo nada que contar» — la misma confusion que el modulo existe para
     evitar.
"""

import importlib.util
import pathlib
import sys
import unittest
from unittest import mock

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

_e = importlib.util.spec_from_file_location('parte_diario', AQUI / 'parte-diario.py')
pd = importlib.util.module_from_spec(_e)
_e.loader.exec_module(pd)


class RelevoFalso:
    def __init__(self, devuelve=None, revienta=None):
        self.devuelve, self.revienta = devuelve, revienta
        self.mandado = []

    def enviar(self, para, texto, parcial=False):
        self.mandado.append((para, texto))
        if self.revienta:
            raise self.revienta
        return self.devuelve


def _datos_falsos(pendientes=('12 premios por pagar',)):
    return {'pendientes': list(pendientes), 'rotas': [], 'lineas': ['bloque 39.949']}


class _Base(unittest.TestCase):
    def correr(self, rel, plantillas, para=('50432136457',)):
        with mock.patch.object(pd, 'PARA', list(para)), \
             mock.patch.object(pd.vistazo, 'juntar', return_value=_datos_falsos()), \
             mock.patch.object(pd.registro, 'anotar'), \
             mock.patch.object(pd.whatsapp, 'RelevoWhatsApp', return_value=rel), \
             mock.patch.object(pd.whatsapp, '_pedir', plantillas), \
             mock.patch.object(pd.time, 'sleep'):
            return pd.main()


class SeIntentaLoBaratoPrimero(_Base):

    def test_si_hay_ventana_va_por_libre_y_NO_gasta_plantilla(self):
        rel = RelevoFalso(devuelve={'id': 'wamid.1'})
        plantillas = mock.Mock()
        self.assertEqual(self.correr(rel, plantillas), 0)
        self.assertEqual(len(rel.mandado), 1)
        plantillas.assert_not_called()

    def test_el_libre_conserva_los_saltos(self):
        """Un parte de una sola linea se lee mucho peor, y por el libre no hace
        falta aplanarlo."""
        rel = RelevoFalso(devuelve={'id': 'wamid.1'})
        self.correr(rel, mock.Mock())
        self.assertIn('\n', rel.mandado[0][1])
        self.assertIn('Parte de', rel.mandado[0][1])


class ElSilencioCUENTACOMOFALLO(_Base):
    """La numero 1 de la cabecera."""

    def test_devolver_vacio_NO_es_haber_enviado(self):
        rel = RelevoFalso(devuelve={})      # sin charla abierta: `_soltar` calla
        plantillas = mock.Mock()
        self.assertEqual(self.correr(rel, plantillas), 0)
        plantillas.assert_called_once()

    def test_devolver_None_tampoco(self):
        rel = RelevoFalso(devuelve=None)
        plantillas = mock.Mock()
        self.correr(rel, plantillas)
        plantillas.assert_called_once()

    def test_y_un_id_vacio_tampoco(self):
        rel = RelevoFalso(devuelve={'id': None})
        plantillas = mock.Mock()
        self.correr(rel, plantillas)
        plantillas.assert_called_once()


class FueraDeLaVentanaVALAPLANTILLA(_Base):

    def _params(self, rel=None):
        rel = rel or RelevoFalso(revienta=RuntimeError('400 fuera de ventana'))
        plantillas = mock.Mock()
        self.correr(rel, plantillas)
        return plantillas.call_args[0][2]

    def test_manda_la_plantilla_con_los_dos_huecos(self):
        cuerpo = self._params()
        self.assertEqual(cuerpo['templateName'], 'og_parte_del_dia')
        self.assertEqual(len(cuerpo['templateParams']), 2)

    def test_EL_HUECO_NO_LLEVA_SALTOS(self):
        """Meta no lo limpia: rechaza el envío entero y no hay parte."""
        for hueco in self._params()['templateParams']:
            self.assertNotIn('\n', hueco)
            self.assertNotIn('\t', hueco)

    def test_y_el_hueco_sigue_diciendo_lo_que_hay_que_hacer(self):
        self.assertIn('12 premios por pagar', self._params()['templateParams'][1])


class SiNoSALEsedice(_Base):

    def test_los_dos_caminos_caidos_dan_codigo_distinto_de_cero(self):
        rel = RelevoFalso(revienta=RuntimeError('sin ventana'))
        plantillas = mock.Mock(side_effect=RuntimeError('plantilla rechazada'))
        self.assertEqual(self.correr(rel, plantillas), 1)

    def test_sin_destinatario_no_se_finge_que_salio(self):
        self.assertEqual(self.correr(RelevoFalso(), mock.Mock(), para=()), 1)

    def test_un_destinatario_caido_no_impide_el_de_al_lado(self):
        rel = RelevoFalso(devuelve={'id': 'x'})
        plantillas = mock.Mock()
        r = self.correr(rel, plantillas, para=('50432136457', '50499999999'))
        self.assertEqual(r, 0)
        self.assertEqual(len(rel.mandado), 2)

    def test_se_anota_ANTES_de_mandar(self):
        """Si el envío revienta a mitad, el registro ya sabe que hubo parte y
        con qué. Anotar después borraría la única huella."""
        orden = []
        rel = RelevoFalso(revienta=RuntimeError('caído'))
        with mock.patch.object(pd, 'PARA', ['50432136457']), \
             mock.patch.object(pd.vistazo, 'juntar', return_value=_datos_falsos()), \
             mock.patch.object(pd.registro, 'anotar',
                               side_effect=lambda *a, **k: orden.append('anotar')), \
             mock.patch.object(pd.whatsapp, 'RelevoWhatsApp', return_value=rel), \
             mock.patch.object(pd.whatsapp, '_pedir',
                               side_effect=lambda *a, **k: orden.append('mandar')), \
             mock.patch.object(pd.time, 'sleep'):
            pd.main()
        self.assertEqual(orden[0], 'anotar')


if __name__ == '__main__':
    unittest.main(verbosity=2)
