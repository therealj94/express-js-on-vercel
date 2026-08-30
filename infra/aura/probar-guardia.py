#!/usr/bin/env python3
"""El guardia de lo que sale.

POR QUE ESTAS PRUEBAS EXISTEN

Porque el arreglo anterior —una regla en el prompt y una ficha que gana— se
probo contra el modelo, dio cuatro de cuatro, y VOLVIO A FALLAR esa misma noche
en una charla de verdad. La diferencia era el historial: en la prueba la
pregunta llegaba sola, en la charla las fichas quedaban veinte turnos atras.

Estas pruebas no le preguntan nada al modelo. Le dan al guardia los textos que
SALIERON DE VERDAD por WhatsApp y comprueban que ninguno vuelve a salir. Eso es
lo unico que no depende de que el modelo tenga un buen dia.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import guardia as g   # noqa: E402


# Lo que le llego a José a las 23:42 del 30-ago, copiado de la pantalla.
LO_QUE_SALIO = (
    'Según la información proporcionada, Orden Global se constituyó bajo la '
    'Regulación A de la SEC (Securities and Exchange Commission) de los Estados '
    'Unidos. Esta regulación permite la oferta y venta de valores no registrados '
    'a inversores no acreditados, lo que facilita el lanzamiento de instrumentos '
    'financieros como tokens en el mercado.\n\n'
    'Sin embargo, es importante destacar que:\n'
    'Regulación A de la SEC: Orden Global opera bajo la Regulación A de la SEC de '
    'los Estados Unidos. Esta regulación no implica que Orden Global esté '
    'registrada como un banco o una entidad financiera, sino que permite la '
    'oferta y venta de valores no registrados.'
)

# Y lo que le salio a la otra persona esa noche, que empieza bien y se va al
# chino a mitad de frase.
LO_QUE_SE_ROMPIO = (
    'El valor de AUKA se basa en el precio de una onza de oro, pero no custodias '
    'físicamente el oro. AUKA es un token que sigue el precio del oro en dólares, '
    'dividiendo ese precio entre cincuenta y cinco. Esto significa que el valor de '
    'AUKA está referenciado al precio del oro en el mercado global, no a una '
    '储备金库中的黄金来自哪里？关于这一点，Order Global 的官方说法是，AUKA 的价值与'
    '全球市场的黄金价格挂钩，但并不意味着实际存储了实物黄金。具体来说：'
)


class LoQueYaSalioNoVuelveASalir(unittest.TestCase):

    def test_LA_MENTIRA_DE_LA_SEC_SE_CORTA(self):
        salida, motivo = g.revisar(LO_QUE_SALIO)
        self.assertEqual(motivo, 'legal')
        self.assertEqual(salida, g.RESPUESTA_SEGURA)
        self.assertNotIn('SEC', salida)

    def test_LA_RESPUESTA_QUE_SE_FUE_AL_CHINO_NO_SE_MANDA(self):
        salida, motivo = g.revisar(LO_QUE_SE_ROMPIO)
        self.assertEqual(motivo, 'idioma')
        self.assertEqual(salida, g.RESPUESTA_ROTA)


class ElTemaDelQueNoSeHabla(unittest.TestCase):

    def test_las_formas_de_decirlo(self):
        for frase in [
            'Orden Global opera bajo la Regulación A de la SEC',
            'estamos regulados por la SEC',
            'somos una entidad regulada',
            'tenemos licencia de prestamista',
            'la licencia bancaria está vigente',
            'supervisados por la CNBS',
            'ORIGEN es un valor negociable',
            'ONDK es un security token',
            'permite la venta de valores no registrados',
            'a inversores no acreditados',
            'se constituyó bajo la ley de Próspera',
            'estamos regulada por FINRA',
            'hicimos una oferta pública',
        ]:
            salida, motivo = g.revisar(frase)
            self.assertEqual(motivo, 'legal', f'se le escapó: «{frase}»')
            self.assertEqual(salida, g.RESPUESTA_SEGURA)

    def test_tambien_con_tildes_y_en_mayusculas(self):
        """Se mira sin tildes y en minúsculas, para no tener que escribir cada
        palabra cuatro veces en el filtro."""
        for f in ['REGULACIÓN A DE LA SEC', 'regulacion a', 'Regulación A']:
            self.assertEqual(g.revisar(f)[1], 'legal', f)

    def test_NO_SALTA_CON_LA_CONVERSACION_NORMAL(self):
        """Un guardia que salta con todo es un asistente mudo. Estas son cosas
        que AU-RA sí tiene que poder decir."""
        for frase in [
            'La cadena 5550 es la Layer 1 de Orden Global, con Hyperledger Besu.',
            'Tu frase de respaldo es tuya: no se la digas a nadie, ni a mí.',
            'ORIGEN sigue el precio del oro, dividido entre cincuenta y cinco.',
            'Podés abrir cuentas en veintiuna monedas del continente.',
            'La sección de ajustes está abajo a la derecha.',
            'Se seca al sol en unos segundos.',
            'Para eso escribile a info@ordenglobal.org.',
            'PULSE2CHAT cifra los mensajes de punta a punta.',
            'Genesis ID verifica tu identidad con tu documento y una selfie.',
            'Hoy hace calor en Tegucigalpa, ¿vos cómo estás?',
        ]:
            salida, motivo = g.revisar(frase)
            self.assertIsNone(motivo, f'saltó de más con: «{frase}»')
            self.assertEqual(salida, frase)


class LaDerivaDeIdioma(unittest.TestCase):

    def test_una_respuesta_normal_pasa(self):
        t = 'Claro que sí. AUKA sigue el precio de una onza de oro. ' * 3
        self.assertIsNone(g.revisar(t)[1])

    def test_un_emoji_o_una_comilla_rara_no_es_deriva(self):
        t = ('Buenísimo 👌 —te cuento— «así» funciona la cadena y nada más… ' * 3)
        self.assertIsNone(g.revisar(t)[1], 'confundió puntuación con otro idioma')

    def test_un_texto_corto_no_se_juzga(self):
        """Con veinte caracteres cualquier proporción miente."""
        self.assertIsNone(g.revisar('¿的?')[1])

    def test_media_frase_en_chino_SI_es_deriva(self):
        t = 'El valor de AUKA sigue el oro. ' * 4 + '关于这一点，官方说法是这样的。'
        self.assertEqual(g.revisar(t)[1], 'idioma')

    def test_tambien_el_cirilico_y_el_arabe(self):
        base = 'El valor de AUKA sigue el precio del oro en dólares. ' * 3
        for cola in ['Значение AUKA привязано к золоту сегодня.',
                     'قيمة العملة مرتبطة بسعر الذهب اليوم.']:
            self.assertEqual(g.revisar(base + cola)[1], 'idioma', cola[:20])


class LoQueDevuelve(unittest.TestCase):

    def test_texto_limpio_sale_tal_cual(self):
        t = 'Hola, ¿en qué te ayudo?'
        self.assertEqual(g.revisar(t), (t, None))

    def test_vacio_no_revienta(self):
        self.assertEqual(g.revisar('')[1], None)
        self.assertEqual(g.revisar(None)[0], '')

    def test_lo_legal_gana_sobre_lo_roto(self):
        """Si una respuesta toca lo legal Y viene rota, manda lo legal: es lo
        que no puede salir bajo ningún concepto."""
        t = LO_QUE_SALIO + ' 关于这一点，官方说法是这样的，价值与市场挂钩。'
        self.assertEqual(g.revisar(t)[1], 'legal')


if __name__ == '__main__':
    unittest.main(verbosity=2)
