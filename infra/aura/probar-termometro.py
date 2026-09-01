#!/usr/bin/env python3
"""Si AU-RA tuvo un buen día o uno malo.

LO QUE FALTABA DE VERDAD, QUE NO ERA MEDIR

Dije que no se medía nada y era falso: `respuesta.ms` está anotado desde antes,
`registro.resumen(24)` lo lee, y el parte ya decía «Ns la respuesta típica».

Lo que ninguno de esos números contesta es la única pregunta que importa: ¿le
sirvió a la persona? Todo lo medido es MECÁNICA —cuántas respuestas, cuánto
tardaron, cuántas cortó el guardia— y la mecánica puede ir perfecta mientras la
gente se va sin decir nada.
"""

import pathlib
import sys
import time
import unittest

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import termometro   # noqa: E402

AHORA = 1_800_000_000


def _p(visto_hace=7200, dias=1, nodo=None):
    return {'visto': AHORA - visto_hace,
            'dias_vistos': [f'2026-09-0{n + 1}' for n in range(dias)],
            'nodo': nodo}


class VOLVERESLAUNICANOTAQUENOSEFINGE(unittest.TestCase):
    """Nadie vuelve a hablar con algo que no le sirvió. Ni encuestas ni
    botones: quien vuelve al día siguiente ya lo dijo."""

    def test_cuenta_a_quien_se_le_vio_en_DOS_dias(self):
        v, tot, idx = termometro.volvieron(
            {'a': _p(dias=2), 'b': _p(dias=1)}, AHORA)
        self.assertEqual((v, tot), (1, 2))
        self.assertAlmostEqual(idx, 0.5)

    def test_un_dia_solo_NO_es_haber_vuelto(self):
        v, _t, _i = termometro.volvieron({'a': _p(dias=1)}, AHORA)
        self.assertEqual(v, 0)

    def test_sin_nadie_no_revienta_ni_inventa_un_indice(self):
        """Cero de cero no es 0%: es que no hubo. Un 0% ahí se leería como una
        semana catastrófica cuando fue una semana vacía."""
        self.assertEqual(termometro.volvieron({}, AHORA), (0, 0, None))

    def test_los_de_hace_mucho_no_cuentan(self):
        viejo = {'a': _p(visto_hace=40 * 86400, dias=3)}
        self.assertEqual(termometro.volvieron(viejo, AHORA)[1], 0)

    def test_un_perfil_a_medias_no_rompe_la_cuenta(self):
        gente = {'a': _p(dias=2), 'b': {}, 'c': None, 'd': 'basura'}
        self.assertEqual(termometro.volvieron(gente, AHORA)[1], 1)


class UNCEROQUESIGNIFICATODAVIANOSE(unittest.TestCase):
    """`dias_vistos` empieza a llenarse desde que existe. La primera semana
    NADIE puede tener dos días, así que el índice daría 0% — y un 0% de gente
    que vuelve se lee como una catástrofe cuando lo único que pasa es que el
    dato todavía no existe.

    Es la misma regla del precio: un número que no se sabe no se rellena con
    algo que parece un número."""

    def test_cero_vueltas_NO_se_escribe_como_cero_por_ciento(self):
        """«0%» se lee como un veredicto medido, y con cero vueltas no hay
        nada medido: puede ser que nadie vuelva, o que el dato sea más joven
        que un día. Las dos cosas se escribirían igual y significan lo
        contrario."""
        for gente in ({'a': {'visto': AHORA - 7200}},
                      {'a': _p(dias=1), 'b': _p(dias=1)}):
            linea = termometro.texto(gente, ahora=AHORA)[0]
            self.assertNotIn('0%', linea)
            self.assertIn('ninguna volvió todavía', linea)

    def test_con_historia_SI_da_el_indice(self):
        gente = {'a': _p(dias=2), 'b': _p(dias=1)}
        self.assertIn('50%', termometro.texto(gente, ahora=AHORA)[0])

    def test_pero_el_HECHO_si_se_dice_y_es_cierto_siempre(self):
        """«Ninguna volvió todavía» es verdad tanto si nadie vuelve como si el
        dato es nuevo. Y el día que vuelva una, el renglón cambia solo."""
        gente = {'a': _p(dias=1), 'b': _p(dias=1)}
        self.assertIn('2 personas', termometro.texto(gente, ahora=AHORA)[0])

    def test_sin_nadie_es_otra_cosa_distinta(self):
        self.assertIn('nadie escribió', termometro.texto({}, ahora=AHORA)[0])


class DONDESEQUEDARON(unittest.TestCase):
    """El sitio exacto por donde se escapan. Con esto, «mejorar el embudo»
    deja de ser una opinión contra otra."""

    def test_cuenta_por_nodo_el_peor_primero(self):
        gente = {'a': _p(nodo='comision'), 'b': _p(nodo='comision'),
                 'c': _p(nodo='ahorro')}
        self.assertEqual(termometro.donde_se_quedaron(gente, AHORA),
                         [('comision', 2), ('ahorro', 1)])

    def test_QUIEN_ESTA_HABLANDO_AHORA_no_se_quedo_ahi(self):
        """Está en medio de la conversación. Contarlo como fuga haría que el
        nodo más usado pareciera siempre el peor."""
        gente = {'a': _p(visto_hace=60, nodo='inicio')}
        self.assertEqual(termometro.donde_se_quedaron(gente, AHORA), [])

    def test_sin_nodo_no_se_cuenta_en_ningun_lado(self):
        self.assertEqual(termometro.donde_se_quedaron({'a': _p()}, AHORA), [])


class ELHUECODECONOCIMIENTO(unittest.TestCase):
    class _Reg:
        def __init__(self, ev):
            self.ev = ev

        def resumen(self, _h=24):
            return {'por_evento': self.ev}

    def test_la_fraccion_que_no_supo_el_guion(self):
        m, t, parte = termometro.cuanto_no_supo(
            self._Reg({'respuesta': 3, 'guion': 7}))
        self.assertEqual((m, t), (3, 10))
        self.assertAlmostEqual(parte, 0.3)

    def test_sin_nada_no_inventa_un_porcentaje(self):
        self.assertEqual(termometro.cuanto_no_supo(self._Reg({})), (0, 0, None))

    def test_sin_registro_tampoco(self):
        self.assertEqual(termometro.cuanto_no_supo(None), (0, 0, None))


class LASPREGUNTASNOSEGUARDAN(unittest.TestCase):
    """El registro dice con todas sus letras que el texto de una respuesta
    normal no viaja ahí — si viajara, esto sería una transcripción de todas las
    conversaciones para siempre, justo lo que el plazo de treinta días evita.

    Así que se dice CUÁNTAS no supo el guión, no CUÁLES. Para decidir alcanza
    con el tamaño del hueco, y unas palabras guardadas ya no se desguardan.
    """

    def test_el_termometro_no_lee_ni_escribe_texto_de_nadie(self):
        """Se mira el CÓDIGO con el analizador, no el texto del archivo.

        La primera versión buscaba palabras en el fuente entero y saltaba
        porque «historial» aparecía en un comentario. Es la segunda vez en un
        día que escribo una prueba que lee comentarios y cree estar leyendo
        código; la diferencia es que ésta vigila una regla de privacidad, y una
        que salta por un comentario se «arregla» borrando el comentario.
        """
        import ast
        arbol = ast.parse((AQUI / 'termometro.py').read_text())
        prohibidas = {'dicho', 'pregunta', 'historial', 'texto_dicho'}
        for n in ast.walk(arbol):
            if isinstance(n, ast.Constant) and isinstance(n.value, str):
                self.assertNotIn(n.value, prohibidas,
                                 f'lee un campo de texto de la persona: {n.value}')
            if isinstance(n, ast.Attribute):
                self.assertNotEqual(n.attr, 'anotar',
                                    'el termómetro escribe en el registro')

    def test_lo_que_devuelve_son_cuentas_y_nodos_no_frases(self):
        gente = {'a': _p(dias=2, nodo='comision')}
        for linea in termometro.texto(gente):
            self.assertLess(len(linea), 90, linea)


class ELPARTELOENSENA(unittest.TestCase):
    """En el parte y no en un panel: un número que hay que ir a buscar es un
    número que nadie mira."""

    def test_sale_en_el_parte_de_mercadeo_y_de_admin(self):
        import miradas
        gente = {'a': _p(dias=2, nodo='comision'), 'b': _p(dias=1)}
        for tramo in ('mercadeo', 'admin'):
            d = miradas.para(tramo, perfiles=gente)
            junto = ' '.join(d['lineas'])
            self.assertIn('volvieron', junto, tramo)

    def test_pero_NO_en_el_tecnologico(self):
        """A quien cuida el motor no le sirve saber cuánta gente volvió, y una
        línea de más es una línea que se aprende a saltar — el día que
        saltándola se salte una que importa, el parte dejó de servir."""
        import miradas
        d = miradas.para('tecnologico', perfiles={'a': _p(dias=2)})
        self.assertNotIn('volvieron', ' '.join(d['lineas']))

    def test_sin_perfiles_el_parte_sale_igual(self):
        import miradas
        d = miradas.para('admin')
        self.assertIsInstance(d['lineas'], list)

    def test_un_termometro_ROTO_no_tumba_el_parte(self):
        """El parte lleva cosas más importantes que ésta."""
        self.assertEqual(termometro.texto('esto no es un diccionario'), [])


class LOSPERFILESSONLOSMISMOS(unittest.TestCase):
    def test_el_asistente_NO_guarda_una_copia(self):
        """Con una copia, la gente que llegara después no aparecería nunca y el
        termómetro daría números de la hora del arranque — un número viejo
        presentado como el de ahora es la misma clase de mentira que el precio
        inventado."""
        fuente = (AQUI / 'asistente.py').read_text()
        self.assertIn('perfiles = PERFILES_VIVOS', fuente)

    def test_los_dias_vistos_se_apuntan_EN_UN_SOLO_SITIO(self):
        """Hay ocho `p['visto'] = ...` repartidos. Uno olvidado sería una
        persona que volvió y no cuenta, con el número mal sin que nadie lo
        note."""
        fuente = (AQUI / 'asistente.py').read_text()
        self.assertEqual(fuente.count("p['dias_vistos'] = "), 1)

    def test_y_se_guardan_pocos_y_como_FECHAS(self):
        """Cuenta si volvió, no a qué hora entra. Guardar menos de lo que hace
        falta es la manera barata de no tener que cuidarlo después."""
        fuente = (AQUI / 'asistente.py').read_text()
        self.assertIn('[-4:]', fuente[fuente.index("p['dias_vistos'] = "):][:60])


if __name__ == '__main__':
    unittest.main(verbosity=2)
