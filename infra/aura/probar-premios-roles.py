#!/usr/bin/env python3
"""«Quería saber a quién se le envió 1 ORIGEN, no se me notificó y pregunté y
no supo contestar.» — José, 1-sep.

Tenía razón en las dos mitades, y eran dos fallos distintos:

  1 · EL PAGADOR SOLO LE ESCRIBÍA AL QUE GANÓ. Al que menos falta le hace,
      porque además lo ve en su saldo. Un premio es plata de la casa saliendo
      sola, sin que nadie firme nada — eso está bien, para eso la billetera se
      fondea con lo justo, pero saliendo EN SILENCIO no.

  2 · NO HABÍA DE DÓNDE SACARLO. `premio.resumen()` cuenta —cuántos
      reclamados, cuántos pagados, cuántos quedan— y nunca dice a quién. No es
      que AU-RA no entendiera la pregunta: el dato no estaba a mano en ninguna
      parte. Un contador de premios que no puede nombrar a quien se le pagó es
      un contador, no un registro.

Y de paso, lo otro que pidió: ver el rol de cada uno.
"""

import json
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import catalogo    # noqa: E402
import escalafon   # noqa: E402
import mayordomo   # noqa: E402
import premio      # noqa: E402

EQUIPO = ('José=50432136457:admin, Medardo=50498782176:admin, '
          'Nicole=50433467760:mercadeo, Leo=50494716808:tecnologico')


class _Con:
    def __init__(self, crudo=EQUIPO):
        self.crudo = crudo

    def __enter__(self):
        escalafon.recargar(self.crudo)
        return self

    def __exit__(self, *_):
        escalafon.recargar()
        return False


def _con_premios(reclamos):
    d = pathlib.Path(tempfile.mkdtemp())
    premio.preparar(d)
    (d / 'premios.json').write_text(json.dumps({'reclamos': reclamos}))
    return d


class AHORASESABEAQUIENSELEPAGO(unittest.TestCase):
    def test_sale_el_NOMBRE_no_solo_un_numero(self):
        _con_premios([{'quien': '50498782176', 'direccion': '0x' + 'a' * 40,
                       'pagado': True, 'tx': '0xdeadbeef', 'cuando': 1788207054}])
        with _Con():
            ok, t = mayordomo.MANOS['premios'](None)
        self.assertTrue(ok)
        self.assertIn('Medardo', t)
        self.assertIn('0xdeadbeef', t)
        self.assertIn('pagado', t)

    def test_a_quien_no_esta_en_el_escalafon_se_le_ven_4_cifras(self):
        """Son teléfonos de gente. El número entero no hace falta para saber a
        quién se le pagó — es la misma regla del espejo."""
        _con_premios([{'quien': '50488887777', 'direccion': '0x' + 'b' * 40,
                       'pagado': True, 'tx': '0x1', 'cuando': 1}])
        with _Con():
            _ok, t = mayordomo.MANOS['premios'](None)
        self.assertIn('7777', t)
        self.assertNotIn('50488887777', t)

    def test_se_distingue_lo_pagado_de_lo_pendiente(self):
        _con_premios([
            {'quien': 'a', 'direccion': '0x1', 'pagado': True, 'tx': '0x9', 'cuando': 2},
            {'quien': 'b', 'direccion': '0x2', 'pagado': False, 'tx': None, 'cuando': 1}])
        with _Con():
            _ok, t = mayordomo.MANOS['premios'](None)
        self.assertIn('✅ pagado', t)
        self.assertIn('⏳ sin pagar', t)

    def test_el_mas_nuevo_primero(self):
        _con_premios([
            {'quien': 'viejo', 'direccion': '0x1', 'pagado': True, 'cuando': 1},
            {'quien': 'nuevo', 'direccion': '0x2', 'pagado': True, 'cuando': 99}])
        with _Con():
            _ok, t = mayordomo.MANOS['premios'](None)
        self.assertLess(t.index('uevo'), t.index('iejo'))

    def test_sin_premios_lo_dice_y_no_revienta(self):
        _con_premios([])
        with _Con():
            ok, t = mayordomo.MANOS['premios'](None)
        self.assertTrue(ok)
        self.assertIn('Todavía no', t)

    def test_un_archivo_ILEGIBLE_se_dice_no_se_inventa_una_lista(self):
        d = pathlib.Path(tempfile.mkdtemp())
        premio.preparar(d)
        (d / 'premios.json').write_text('{roto')
        ok, t = mayordomo.MANOS['premios'](None)
        self.assertFalse(ok)
        self.assertIn('No pude leer', t)

    def test_solo_lo_ven_quienes_responden_por_ese_dinero(self):
        self.assertEqual(catalogo.ENCARGOS['premios']['quien'],
                         ('admin', 'contable'))

    def test_es_de_MIRAR_no_mueve_un_centavo(self):
        self.assertEqual(catalogo.ENCARGOS['premios']['riesgo'], 'mira')
        self.assertFalse(catalogo.necesita_permiso('premios'))


class YAHORATAMBIENAVISA(unittest.TestCase):
    """El pagador le escribía SOLO al que ganó."""

    def _pagar(self, falla_el_recibo=False):
        import pagador
        mandados = []

        class Rel:
            def enviar(self, para, texto):
                if falla_el_recibo and para == '50498782176':
                    raise OSError('WhatsApp caído')
                mandados.append((para, texto))

        with _Con():
            pagador._avisar(Rel(), '50498782176', '0x' + 'c' * 40, '0xtx123')
        return mandados

    def test_les_llega_a_los_dos_admin(self):
        para = [p for p, _t in self._pagar()]
        self.assertIn('50432136457', para)
        self.assertIn('50498782176', para)

    def test_el_aviso_dice_QUIEN_y_CUANTO_y_la_transaccion(self):
        t = dict(self._pagar())['50432136457']
        self.assertIn('Medardo', t)
        self.assertIn('1 ORIGEN', t)
        self.assertIn('0xtx123', t)

    def test_SI_FALLA_EL_RECIBO_los_admin_SE_ENTERAN_IGUAL(self):
        """La primera versión metió el aviso a los admin dentro del `try` del
        recibo, y eso lo dejaba peor que antes: si le falla el mensaje al que
        ganó, tampoco se enteraban los admin — que es exactamente el caso en
        que más falta hace saber que salió plata."""
        para = [p for p, _t in self._pagar(falla_el_recibo=True)]
        self.assertIn('50432136457', para)

    def test_y_no_lleva_la_direccion_entera(self):
        t = dict(self._pagar())['50432136457']
        self.assertNotIn('c' * 40, t)
        self.assertIn('…', t)


class QUIENESQUIEN(unittest.TestCase):
    """«Poder ver el rol de cada uno.»"""

    def test_estan_todos_con_su_tramo(self):
        with _Con():
            ok, t = mayordomo.MANOS['roles'](None)
        self.assertTrue(ok)
        for quien in ('José', 'Medardo', 'Nicole', 'Leo'):
            self.assertIn(quien, t, quien)
        self.assertIn('mercadeo', t)
        self.assertIn('tecnología', t)

    def test_dice_QUE_PUEDE_PEDIR_cada_uno_no_solo_su_etiqueta(self):
        """Un rol sin lo que habilita es una palabra. Lo útil es qué puede
        pedirme cada quien, y eso sale del catálogo, no de una tabla aparte."""
        with _Con():
            _ok, t = mayordomo.MANOS['roles'](None)
        self.assertIn('puede:', t)
        self.assertIn('desplegar', t)      # lo de Leo

    def test_se_ve_QUIEN_FIRMA(self):
        with _Con():
            _ok, t = mayordomo.MANOS['roles'](None)
        self.assertIn('⭐', t)

    def test_una_persona_con_dos_buzones_sale_UNA_vez(self):
        with _Con('José=50432136457/j@x.org:admin, Medardo=50498782176:admin'):
            _ok, t = mayordomo.MANOS['roles'](None)
        self.assertEqual(t.count('José'), 1)

    def test_sale_del_ESCALAFON_no_de_una_segunda_lista(self):
        """Una segunda lista de roles sería una lista que se queda vieja, y ya
        vimos cómo acaba eso: `AURA_PARTE_PARA` llevaba semanas vacía y por eso
        la ficha del traspaso no le llegaba a nadie."""
        fuente = (AQUI / 'mayordomo.py').read_text()
        i = fuente.index('def _roles')
        cuerpo = fuente[i:fuente.index('def _premios')]
        self.assertIn('escalafon.personas()', cuerpo)

    def test_con_el_escalafon_vacio_lo_dice(self):
        with _Con(''):
            ok, t = mayordomo.MANOS['roles'](None)
        self.assertFalse(ok)
        self.assertIn('vacío', t)

    def test_solo_lo_ve_un_admin(self):
        self.assertEqual(catalogo.ENCARGOS['roles']['quien'], ('admin',))


if __name__ == '__main__':
    unittest.main(verbosity=2)
