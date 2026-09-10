#!/usr/bin/env python3
"""El vigía del parte.

POR QUE ESTAS PRUEBAS EXISTEN

Un vigía tiene dos formas de ser inútil, y las dos se ven igual de bien desde
fuera:

  1. NO AVISA CUANDO PASA. Es para lo único que existe. Si el parte lleva
     veinte horas sin salir y el vigía calla, no estamos peor que sin vigía:
     estamos peor, porque alguien confía en él.

  2. AVISA CUANDO NO PASA. Un vigía que se queja sin motivo se termina
     ignorando, y a partir de ahí ya no vigila nada.

Y el error propio: si el vigía se traga SU PROPIO fallo, deja de vigilar en
silencio — que es exactamente lo que vino a evitar.
"""

import pathlib
import sys
import time
import unittest
from unittest import mock

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import vigia   # noqa: E402


def _hace(horas):
    from datetime import datetime, timedelta, timezone
    return (datetime.now(timezone.utc) - timedelta(hours=horas)).isoformat()


class MiraSIELMENSAJELLEGO(unittest.TestCase):
    """No si la máquina está viva: si el mensaje llegó. Un vigía que comprueba
    «el proceso corre» habría dado verde toda la noche con `Restart=always`
    reiniciando cada media hora."""

    def _con(self, mensajes, numero='50432136457'):
        charlas = {'data': [{'participantId': numero, 'id': 'h1'}]}
        return lambda ruta: charlas if '/messages' not in ruta else {'messages': mensajes}

    def test_un_parte_reciente_es_silencio(self):
        with mock.patch.object(vigia, 'PARA', ['50432136457']), \
             mock.patch.object(vigia, '_pedir', self._con([
                 {'direction': 'outgoing', 'message': 'Parte de domingo 19:30',
                  'sentAt': _hace(2)}])):
            r = vigia.handler()
        self.assertTrue(r['ok'])

    def test_un_parte_VIEJO_avisa(self):
        avisos = []
        with mock.patch.object(vigia, 'PARA', ['50432136457']), \
             mock.patch.object(vigia, '_pedir', self._con([
                 {'direction': 'outgoing', 'message': 'Parte de sábado 7:30',
                  'sentAt': _hace(20)}])), \
             mock.patch.object(vigia, '_avisar_whatsapp',
                               side_effect=lambda n, t: avisos.append(t)):
            r = vigia.handler()
        self.assertFalse(r['ok'])
        self.assertIn('20 horas', avisos[0])

    def test_NINGUN_parte_nunca_tambien_avisa(self):
        """Charla abierta pero jamás salió un parte: eso no es «todavía no
        toca», es que nunca funcionó."""
        avisos = []
        with mock.patch.object(vigia, 'PARA', ['50432136457']), \
             mock.patch.object(vigia, '_pedir', self._con([
                 {'direction': 'incoming', 'message': 'hola', 'sentAt': _hace(1)}])), \
             mock.patch.object(vigia, '_avisar_whatsapp',
                               side_effect=lambda n, t: avisos.append(t)):
            r = vigia.handler()
        self.assertFalse(r['ok'])
        self.assertIn('NINGÚN parte', avisos[0])

    def test_un_mensaje_cualquiera_NO_cuenta_como_parte(self):
        """AU-RA contesta a gente todo el día. Si cualquier saliente contara,
        el vigía daría verde con el parte muerto hace una semana."""
        with mock.patch.object(vigia, 'PARA', ['50432136457']), \
             mock.patch.object(vigia, '_pedir', self._con([
                 {'direction': 'outgoing', 'message': '¡Claro! Te cuento...',
                  'sentAt': _hace(1)},
                 {'direction': 'outgoing', 'message': 'Parte de lunes 7:30',
                  'sentAt': _hace(30)}])), \
             mock.patch.object(vigia, '_avisar_whatsapp'):
            self.assertFalse(vigia.handler()['ok'])

    def test_sin_charla_abierta_avisa_en_vez_de_callarse(self):
        with mock.patch.object(vigia, 'PARA', ['50432136457']), \
             mock.patch.object(vigia, '_pedir', lambda r: {'data': []}), \
             mock.patch.object(vigia, '_avisar_whatsapp'), \
             mock.patch.object(vigia, '_avisar_correo'):
            self.assertFalse(vigia.handler()['ok'])


class NOSETRAGASUPROPIOFALLO(unittest.TestCase):
    """Si el vigía no puede mirar y se calla, deja de vigilar en silencio."""

    def test_si_no_puede_consultar_AVISA_igual(self):
        avisos = []
        with mock.patch.object(vigia, 'PARA', ['50432136457']), \
             mock.patch.object(vigia, '_pedir', side_effect=OSError('red caída')), \
             mock.patch.object(vigia, '_avisar_whatsapp',
                               side_effect=lambda n, t: avisos.append(t)), \
             mock.patch.object(vigia, '_avisar_correo'):
            r = vigia.handler()
        self.assertFalse(r['ok'])
        self.assertIn('no pude comprobarlo', avisos[0])


class DOSCAMINOSPARAAVISAR(unittest.TestCase):
    """Avisar por WhatsApp de que WhatsApp falló es un chiste."""

    def _viejo(self, ruta):
        if '/messages' in ruta:
            return {'messages': [{'direction': 'outgoing',
                                  'message': 'Parte de sábado 7:30',
                                  'sentAt': _hace(30)}]}
        return {'data': [{'participantId': '50432136457', 'id': 'h1'}]}

    def test_si_whatsapp_sale_NO_manda_correo_encima(self):
        correos = []
        with mock.patch.object(vigia, 'PARA', ['50432136457']), \
             mock.patch.object(vigia, '_pedir', self._viejo), \
             mock.patch.object(vigia, '_avisar_whatsapp'), \
             mock.patch.object(vigia, '_avisar_correo',
                               side_effect=lambda a, t: correos.append(t)):
            r = vigia.handler()
        self.assertEqual(correos, [])
        self.assertEqual(r['avisado_por'], ['whatsapp'])

    def test_si_whatsapp_FALLA_se_va_por_correo(self):
        correos = []
        with mock.patch.object(vigia, 'PARA', ['50432136457']), \
             mock.patch.object(vigia, '_pedir', self._viejo), \
             mock.patch.object(vigia, '_avisar_whatsapp',
                               side_effect=RuntimeError('502')), \
             mock.patch.object(vigia, '_avisar_correo',
                               side_effect=lambda a, t: correos.append(t)):
            r = vigia.handler()
        self.assertEqual(r['avisado_por'], ['correo'])
        self.assertIn('no se pudo avisar por WhatsApp', correos[0])

    def test_si_fallan_los_dos_lo_dice_en_vez_de_devolver_ok(self):
        with mock.patch.object(vigia, 'PARA', ['50432136457']), \
             mock.patch.object(vigia, '_pedir', self._viejo), \
             mock.patch.object(vigia, '_avisar_whatsapp', side_effect=RuntimeError('x')), \
             mock.patch.object(vigia, '_avisar_correo', side_effect=RuntimeError('y')):
            r = vigia.handler()
        self.assertFalse(r['ok'])
        self.assertEqual(r['avisado_por'], [])
        self.assertEqual(len(r['fallos']), 2)


class NoSeQuejaSinMotivo(unittest.TestCase):
    """Un vigía ruidoso se termina ignorando, y ahí ya no vigila nada."""

    def test_trece_horas_todavia_no_es_alarma(self):
        """Los partes van cada 12h: 13 es un retraso normal, no una avería."""
        with mock.patch.object(vigia, 'PARA', ['50432136457']), \
             mock.patch.object(vigia, '_pedir', lambda r:
                 {'messages': [{'direction': 'outgoing', 'message': 'Parte de x',
                                'sentAt': _hace(13)}]} if '/messages' in r
                 else {'data': [{'participantId': '50432136457', 'id': 'h1'}]}):
            self.assertTrue(vigia.handler()['ok'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
