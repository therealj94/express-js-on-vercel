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


class LoQueSECOLOEL30AGO(unittest.TestCase):
    """A las 04:28 AU-RA le dijo a una persona real que Orden Global «se ha
    registrado y opera bajo el marco legal de varios países», y le describió la
    regulación de Brasil, Argentina, Chile y Colombia. Todo inventado.

    El guardia de entonces solo cazaba la frase de la SEC: esto es el mismo
    invento con otras palabras y pasaba entero."""

    def test_corta_TODO_lo_que_dijo_de_verdad(self):
        for t in [
            'Orden Global se ha registrado y opera bajo el marco legal de varios países.',
            'Actualmente, Orden Global opera en varios países de América Latina y Europa.',
            'En Brasil la regulación es bastante permisiva, pero en Argentina y Chile '
            'la situación es más restrictiva.',
            'La empresa opera en un marco legal que permite tokens no regulados (no valores).',
            'Es importante estar al tanto de las leyes locales y posibles cambios.',
            'Orden Global opera en un espacio legal complejo.',
        ]:
            self.assertTrue(g.toca_lo_legal(t), f'PASÓ: {t[:60]}')

    def test_y_sigue_cortando_lo_de_antes(self):
        for t in ['Orden Global se constituyó bajo la Regulación A de la SEC.',
                  'Estamos regulados por la CNBS.',
                  'Tenemos licencia bancaria vigente.']:
            self.assertTrue(g.toca_lo_legal(t), t)

    def test_ORIGEN_no_es_un_valor_TAMPOCO_se_dice(self):
        """La ficha lo dice entero: ni siquiera para NEGAR. Decir «no es un
        valor» es una afirmación jurídica igual que decir que sí lo es."""
        self.assertTrue(g.toca_lo_legal('ORIGEN no es un valor.'))


class NOSELLEVAPORDELANTELONORMAL(unittest.TestCase):
    """Un guardia que corta de más deja a AU-RA muda y se termina apagando.
    Estas son frases del día a día que TIENEN que pasar."""

    def test_la_respuesta_aprobada_pasa(self):
        self.assertFalse(g.toca_lo_legal(
            'Eso lo contesta una persona, no yo. Escribile a info@ordenglobal.org.'))

    def test_lo_de_todos_los_dias_pasa(self):
        for t in [
            'Lo que ahorrás hoy, en un año compra menos. No es por lo que ganás.',
            'Te regalo 1 ORIGEN por aprender a usar tu plata. Son tres preguntas.',
            'Tu Veta Wallet la abrís en dos minutos y las llaves quedan solo con vos.',
            'Mandar plata con ORIGEN te cuesta bastante menos que una remesa.',
            'ORIGEN se respalda con oro: cada uno equivale a una fracción de onza.',
            'Con Genesis ID verificás tu identidad una vez y te sirve en todo el ecosistema.',
        ]:
            self.assertFalse(g.toca_lo_legal(t), f'CORTÓ de más: {t[:60]}')

    def test_registrado_en_su_sentido_normal_pasa(self):
        """«quedó registrado tu reclamo» no es una afirmación jurídica."""
        self.assertFalse(g.toca_lo_legal(
            'Ya quedó registrado tu reclamo, te aviso cuando lo revisemos.'))



# ── EL PRECIO, COPIADO DE LA CHARLA DE JOSE DEL 1-SEP ───────────────────────
#
# Pregunto en ingles, el modelo contesto «$1.18» mientras la billetera decia
# 2.56, y al corregirlo doblo la apuesta. Estas son las frases tal cual.
PREGUNTO = 'Whats the price of one origen to USD ?'
CONTESTO = ('Claro, para calcular el precio de 1 ORIGEN en USD, podés usar el '
            'precio actual del oro. Actualmente, el precio de 1 ORIGEN es '
            'aproximadamente $1.18 USD.')
INSISTIO = 'Pero en mi veta wallet sale 2.56 USD 1 origen'
DOBLO = ('El precio en tu billetera puede estar ajustado por factores como '
         'tasas de cambio. Según el precio actual del oro, 1 ORIGEN debería '
         'ser aproximadamente $1.18 USD.')


class PrecioInventado(unittest.TestCase):
    def test_la_cifra_del_modelo_no_sale(self):
        self.assertTrue(g.precio_inventado(PREGUNTO, CONTESTO))

    def test_tampoco_cuando_dobla_la_apuesta(self):
        self.assertTrue(g.precio_inventado(INSISTIO, DOBLO))

    def test_en_espanol_tambien(self):
        self.assertTrue(g.precio_inventado('cuanto vale un origen en dolares',
                                           'Un ORIGEN vale unos 1.20 dólares.'))
        self.assertTrue(g.precio_inventado('precio de ORIGEN?', 'Está a $ 2.10.'))

    def test_una_respuesta_sin_cifra_pasa(self):
        # Si el modelo no pone numero no hay nada que tirar: la frase del
        # precio real la agrega quien llama, no el guardia.
        self.assertFalse(g.precio_inventado(
            PREGUNTO, 'Sale del precio del oro, dividido entre 55.'))

    def test_una_cifra_que_no_es_de_precio_pasa(self):
        # «cuanto tengo» con un saldo no es una pregunta de precio.
        self.assertFalse(g.precio_inventado('cuanto tengo en la billetera',
                                            'Tenés 20.99 ORIGEN.'))
        self.assertFalse(g.precio_inventado('hola', 'Mandaste $5 ayer.'))

if __name__ == '__main__':
    unittest.main(verbosity=2)
