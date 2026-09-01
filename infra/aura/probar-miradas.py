#!/usr/bin/env python3
"""Cada tramo ve LO SUYO, y lo que no se puede ver se dice.

POR QUE ESTAS PRUEBAS EXISTEN

Un parte con cosas que no son tuyas no se lee a medias: se deja de leer entero.
Y entonces el dia que SI traiga algo tuyo, tampoco lo vas a ver. Por eso lo
primero que se comprueba aqui es que a legal no le llegue el disco.

Lo segundo importa mas y se ve menos: que «todo en orden» no signifique nunca
«no lo estoy mirando». Contabilidad hoy ve la billetera de la campaña y NADA de
los costos de la nube. Si eso no sale escrito en su parte, quien lleva las
cuentas cree que las cuentas estan miradas — y esa es la forma mas cara de
estar tranquilo.
"""

import pathlib
import sys
import unittest
from unittest import mock

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import escalafon   # noqa: E402
import miradas     # noqa: E402
import vistazo     # noqa: E402


def _fuente(marca):
    return lambda *a, **k: ([f'línea de {marca}'], [f'pendiente de {marca}'])


class _Base(unittest.TestCase):
    def setUp(self):
        self.parches = [
            mock.patch.object(vistazo, '_cadena', _fuente('cadena')),
            mock.patch.object(vistazo, '_disco', _fuente('disco')),
            mock.patch.object(vistazo, '_reinicios', _fuente('reinicios')),
            mock.patch.object(vistazo, '_genesis', _fuente('genesis')),
            mock.patch.object(vistazo, '_whatsapp', _fuente('meta')),
            mock.patch.object(vistazo, '_correo', _fuente('correo')),
            mock.patch.object(vistazo, '_billetera', _fuente('billetera')),
        ]
        for p in self.parches:
            p.start()
        self.registro = mock.Mock()
        self.registro.resumen.return_value = {
            'por_evento': {'respuesta': 12, 'guardia': 2, 'idioma': 7,
                           'equipo': 3, 'juego': 5, 'pago': 4},
            'mediana_ms': 27000}
        self.premio = mock.Mock()
        self.premio.resumen.return_value = {'por_pagar': 1, 'quedan': 200,
                                            'tope': 205}
        self.premio.BILLETERA_PREMIOS = '0xabc'

    def tearDown(self):
        for p in self.parches:
            p.stop()

    def mirar(self, tramo, **k):
        d = miradas.para(tramo, registro=self.registro, premio=self.premio, **k)
        return '\n'.join(d['pendientes'] + d['rotas'] + d['lineas'])


class CADAUNOVELOSUYO(_Base):

    def test_a_legal_no_le_llega_el_disco_ni_la_cadena(self):
        t = self.mirar('legal')
        for ajeno in ['disco', 'cadena', 'reinicios', 'billetera']:
            self.assertNotIn(ajeno, t, f'legal está viendo «{ajeno}»')
        self.assertIn('genesis', t)
        self.assertIn('meta', t)

    def test_a_tecnologia_le_llega_la_maquina_y_no_los_premios(self):
        t = self.mirar('tecnologico')
        for suyo in ['cadena', 'disco', 'reinicios']:
            self.assertIn(suyo, t, f'tecnología no ve «{suyo}»')
        self.assertNotIn('premio', t)
        self.assertNotIn('billetera', t)

    def test_a_mercadeo_le_llega_la_gente_y_no_la_maquina(self):
        t = self.mirar('mercadeo')
        self.assertIn('eligieron idioma', t)
        self.assertIn('hablar con el equipo', t)
        self.assertIn('jugaron', t)
        for ajeno in ['disco', 'cadena', 'genesis']:
            self.assertNotIn(ajeno, t, f'mercadeo está viendo «{ajeno}»')

    def test_a_contabilidad_le_llega_el_dinero_y_nada_mas(self):
        t = self.mirar('contable')
        self.assertIn('billetera', t)
        self.assertIn('premio', t)
        for ajeno in ['disco', 'cadena', 'meta', 'correo']:
            self.assertNotIn(ajeno, t, f'contabilidad está viendo «{ajeno}»')

    def test_al_admin_le_llega_TODO(self):
        t = self.mirar('admin')
        for suyo in ['genesis', 'cadena', 'meta', 'correo', 'reinicios',
                     'disco', 'billetera', 'premio']:
            self.assertIn(suyo, t, f'el admin no ve «{suyo}»')

    def test_un_tramo_que_no_existe_cae_en_el_del_admin(self):
        """Falla ABIERTO en lo que se MIRA —enseñar de más a un jefe no hace
        daño— y eso no contradice al escalafón, que falla cerrado en quién
        entra. Quien llega aquí ya pasó por la puerta."""
        self.assertIn('cadena', self.mirar('inventado'))


class LOQUENOSEPUEDEVERSEDICE(_Base):

    def test_contabilidad_avisa_que_no_mira_los_costos_de_la_nube(self):
        d = miradas.para('contable', registro=self.registro, premio=self.premio)
        self.assertTrue(any('costos de la nube' in r for r in d['rotas']),
                        'contabilidad dice «todo en orden» sin mirar los costos')

    def test_legal_avisa_que_los_vencimientos_no_estan_cargados(self):
        d = miradas.para('legal', registro=self.registro)
        self.assertTrue(any('vencimientos' in r for r in d['rotas']))

    def test_mercadeo_avisa_que_no_sabe_de_donde_llega_la_gente(self):
        d = miradas.para('mercadeo', registro=self.registro, premio=self.premio)
        self.assertTrue(any('de dónde llega' in r for r in d['rotas']))

    def test_lo_ciego_sale_en_el_texto_no_solo_en_los_datos(self):
        d = miradas.para('contable', registro=self.registro, premio=self.premio)
        self.assertIn('costos de la nube', miradas.texto('contable', d))

    def test_cada_tramo_tiene_su_entrada_en_CIEGO_aunque_este_vacia(self):
        """Un tramo que falta de la lista no es «no le falta nada»: es que
        nadie se hizo la pregunta."""
        for tramo in miradas.TRAMOS:
            self.assertIn(tramo, miradas.CIEGO, tramo)


class UNAFUENTECAIDANOTUMBAELPARTE(_Base):

    def test_lo_que_revienta_se_dice_y_lo_demas_sigue(self):
        def explota():
            raise RuntimeError('sin red')
        with mock.patch.object(vistazo, '_cadena', explota):
            d = miradas.para('tecnologico', registro=self.registro)
        self.assertTrue(any('la cadena no se pudo mirar' in r for r in d['rotas']))
        self.assertIn('línea de disco', d['lineas'])

    def test_un_registro_roto_no_se_come_el_resto(self):
        self.registro.resumen.side_effect = RuntimeError('archivo corrupto')
        d = miradas.para('tecnologico', registro=self.registro)
        self.assertTrue(any('registro no se pudo leer' in r for r in d['rotas']))
        self.assertIn('línea de cadena', d['lineas'])

    def test_sin_registro_ni_premio_igual_sale_el_parte(self):
        d = miradas.para('admin')
        self.assertTrue(d['lineas'] or d['pendientes'])


class LOQUEESPERAFIRMAVAARRIBAYSOLOALADMIN(_Base):

    def _encargos(self, cuantos):
        e = mock.Mock()
        e.esperando.return_value = [{'id': f'E-{1000 + i}'} for i in range(cuantos)]
        return e

    def test_el_admin_ve_arriba_lo_que_espera_su_firma(self):
        d = miradas.para('admin', registro=self.registro,
                         encargos=self._encargos(3))
        self.assertIn('esperando tu firma', d['pendientes'][0],
                      'lo que espera firma no está primero: es lo que se pierde')
        self.assertIn('E-1000', d['pendientes'][0])

    def test_los_demas_tramos_NO_ven_los_encargos_de_nadie(self):
        for tramo in ['legal', 'tecnologico', 'mercadeo', 'contable']:
            d = miradas.para(tramo, registro=self.registro, premio=self.premio,
                             encargos=self._encargos(3))
            self.assertFalse(any('firma' in x for x in d['pendientes']),
                             f'{tramo} está viendo encargos que no le tocan')

    def test_si_no_hay_ninguno_no_dice_nada(self):
        d = miradas.para('admin', registro=self.registro,
                         encargos=self._encargos(0))
        self.assertFalse(any('esperando tu firma' in x for x in d['pendientes']))

    def test_un_libro_roto_se_dice_y_no_tumba_el_parte(self):
        e = mock.Mock()
        e.esperando.side_effect = RuntimeError('json roto')
        d = miradas.para('admin', registro=self.registro, encargos=e)
        self.assertTrue(any('encargos no se pudieron leer' in r for r in d['rotas']))


class ELPARTELLEVASUNOMBRE(_Base):

    def test_cada_tramo_dice_de_quien_es_el_parte(self):
        for tramo in miradas.TRAMOS:
            d = miradas.para(tramo, registro=self.registro, premio=self.premio)
            self.assertTrue(miradas.texto(tramo, d).startswith(miradas.TITULOS[tramo]),
                            tramo)

    def test_los_tramos_de_las_miradas_existen_en_el_escalafon(self):
        for tramo in miradas.TRAMOS:
            self.assertIn(tramo, escalafon.TRAMOS, tramo)


class VARIOSSOMBREROSUNSOLOPARTE(_Base):
    """Melany lleva legal, contabilidad y mercadeo. Quiere UN parte con las
    tres cosas — no tres partes, ni el mismo aviso escrito tres veces."""

    def test_ve_lo_de_sus_tres_tramos(self):
        t = self.mirar(['legal', 'contable', 'mercadeo'])
        self.assertIn('genesis', t, 'le falta lo legal')
        self.assertIn('billetera', t, 'le falta lo contable')
        self.assertIn('eligieron idioma', t, 'le falta lo de mercadeo')

    def test_y_NO_lo_que_no_es_de_ninguno(self):
        t = self.mirar(['legal', 'contable', 'mercadeo'])
        for ajeno in ['disco', 'cadena', 'reinicios']:
            self.assertNotIn(ajeno, t, f'está viendo «{ajeno}»')

    def test_nada_sale_dos_veces(self):
        """Contabilidad y mercadeo miran los dos los premios. Si se pega una
        mirada detrás de otra, «quedan 200 de 205» sale dos veces y el parte
        deja de leerse como un parte."""
        d = miradas.para(['contable', 'mercadeo'], registro=self.registro,
                         premio=self.premio)
        for k in ('pendientes', 'lineas', 'rotas'):
            self.assertEqual(len(d[k]), len(set(d[k])), f'{k} repetido: {d[k]}')

    def test_los_puntos_ciegos_de_los_tres_salen_una_vez_cada_uno(self):
        d = miradas.para(['legal', 'contable', 'mercadeo'],
                         registro=self.registro, premio=self.premio)
        rotas = ' '.join(d['rotas'])
        for falta in ['vencimientos', 'costos de la nube', 'de dónde llega']:
            self.assertEqual(rotas.count(falta), 1, f'«{falta}»: {d["rotas"]}')

    def test_con_varios_el_titulo_no_miente_diciendo_que_es_de_uno(self):
        d = miradas.para(['legal', 'contable'], registro=self.registro,
                         premio=self.premio)
        titulo = miradas.texto(['legal', 'contable'], d).split('·')[0]
        self.assertNotIn('legal', titulo.lower())
        self.assertIn('Tu parte', titulo)

    def test_con_uno_solo_sigue_diciendo_de_quien_es(self):
        d = miradas.para(['contable'], registro=self.registro, premio=self.premio)
        self.assertTrue(miradas.texto(['contable'], d).startswith('Parte contable'))

    def test_una_lista_vacia_no_revienta(self):
        d = miradas.para([], registro=self.registro, premio=self.premio)
        self.assertTrue(d['lineas'] or d['pendientes'] or d['rotas'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
