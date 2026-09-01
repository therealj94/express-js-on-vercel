#!/usr/bin/env python3
"""El precio de ORIGEN. Que sea EL DE VERDAD, o que no lo diga.

LA CAPTURA DEL 1-SEP

    persona: Whats the price of one origen to USD ?
    AU-RA:   Actualmente, el precio del gramo de oro es aproximadamente $65
             (este es un valor estimado, por favor verifica el precio actual).
             1 gramo de oro = $65
             1 ORIGEN = $65 / 55 ≈ $1.18
    persona: Pero en mi veta wallet sale 2.56 USD 1 origen

El gramo estaba a 140,74 y el ORIGEN a 2,56. Un 54% de error EN UN DATO DE
DINERO, sacado de la memoria del modelo y presentado con la cuenta escrita
paso a paso — que es exactamente lo que hace que una respuesta parezca
comprobada. Un «no sé» no habría hecho ningún daño.

LO QUE SE VIGILA

  1. Que la fórmula sea LA MISMA que la de la billetera. Si se separan, vuelve
     a haber alguien diciendo «pero en mi wallet sale otra cosa».
  2. Que cuando no se sabe, NO se invente ni se sirva un precio viejo.
  3. Que la pregunta ni siquiera llegue al modelo: tiene una respuesta exacta.
"""

import pathlib
import sys
import unittest
from unittest import mock

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import guion    # noqa: E402
import precio   # noqa: E402


# Las dos pruebas que comparan con la billetera solo pueden correr donde está
# el repositorio: en el nodo se despliega `infra/aura` a secas y `cadena.js` no
# viaja. Ahí no se saltan por comodidad —son las que impiden que las dos
# fórmulas se separen— sino porque el archivo con el que comparar no existe.
CADENA_JS = (AQUI / '../../apps-web/veta-wallet/cadena.js').resolve()
HAY_BILLETERA = CADENA_JS.exists()


def _limpio():
    precio._guardado.update({'cuando': 0, 'onza': None, 'de': None})


class LAMISMACUENTAQUELABILLETERA(unittest.TestCase):
    """Un dato tiene UNA fuente. Si se separan, la queja vuelve."""

    @unittest.skipUnless(HAY_BILLETERA, 'cadena.js no está en el nodo')
    def test_las_constantes_son_las_de_cadena_js(self):
        js = CADENA_JS.read_text()
        self.assertIn('OZ_GRAMOS = 31.1035', js)
        self.assertIn('oro / OZ_GRAMOS / 55', js)
        self.assertEqual(precio.OZ_GRAMOS, 31.1035)
        self.assertEqual(precio.GRAMIN, 55)

    def test_la_cuenta_da_lo_que_dice_la_billetera(self):
        """Con el oro del 1-sep, tiene que salir el 2,56 que la persona veía."""
        _limpio()
        with mock.patch.object(precio, 'onza', lambda *a, **k: 4377.48):
            origen, gramo, onza = precio.ahora()
        self.assertAlmostEqual(gramo, 140.74, places=1)
        self.assertAlmostEqual(origen, 2.56, places=2)
        self.assertEqual(onza, 4377.48)

    def test_y_NO_da_el_1_18_que_dijo_el_modelo(self):
        with mock.patch.object(precio, 'onza', lambda *a, **k: 4377.48):
            origen, _g, _o = precio.ahora()
        self.assertGreater(origen, 2.0,
                           'volvió a salir el número inventado del 1-sep')

    def test_usa_las_mismas_fuentes_y_en_el_mismo_orden(self):
        # La mitad de arriba corre en las dos máquinas: que este archivo apunte
        # a las fuentes buenas no depende de tener la billetera al lado.
        self.assertIn('pax-gold', precio.COINGECKO)
        self.assertIn('gold-api', precio.GOLD_API)
        if not HAY_BILLETERA:
            return
        js = CADENA_JS.read_text()
        self.assertIn('pax-gold', js)
        self.assertIn('gold-api', js)


class SINODATOSNOHAYNUMERO(unittest.TestCase):
    """Lo más importante del archivo."""

    def test_si_las_dos_fuentes_fallan_devuelve_None(self):
        _limpio()
        with mock.patch.object(precio, '_traer', lambda *a, **k: None):
            self.assertIsNone(precio.onza())
            self.assertEqual(precio.ahora(), (None, None, None))

    def test_y_entonces_NO_hay_frase_con_numero(self):
        _limpio()
        with mock.patch.object(precio, '_traer', lambda *a, **k: None):
            self.assertIsNone(precio.como_se_dice('es'))
            self.assertIsNone(precio.como_se_dice('en'))

    def test_NO_se_sirve_un_precio_VIEJO_como_si_fuera_de_ahora(self):
        """Un precio de hace horas presentado como el de ahora es la misma
        clase de error: parece un dato y no lo es."""
        _limpio()
        with mock.patch.object(precio, '_traer', lambda *a, **k: 4000.0):
            self.assertTrue(precio.onza(ahora=1000))
        with mock.patch.object(precio, '_traer', lambda *a, **k: None):
            self.assertIsNone(precio.onza(ahora=1000 + precio.VALE + 1),
                              'sirvió un precio caducado')

    def test_lo_que_se_dice_cuando_no_se_sabe_no_lleva_cifra(self):
        for idi in ('es', 'en'):
            t = precio.NO_SE_SABE[idi]
            self.assertNotRegex(t, r'\d+[.,]\d')
            self.assertTrue(t.strip())

    def test_un_precio_de_cero_o_negativo_no_vale(self):
        _limpio()
        for malo in [0, -1, -4000]:
            _limpio()
            with mock.patch.object(precio.urllib.request, 'urlopen',
                                   mock.Mock(side_effect=OSError('no'))):
                self.assertIsNone(precio.onza())
            del malo


class LOQUELEEELAPERSONA(unittest.TestCase):
    def test_lleva_el_numero_y_DE_DONDE_SALE(self):
        """Un número sin su origen es otra cifra que hay que creerse. Con la
        cuenta escrita, cualquiera la rehace — la misma idea que «la fórmula
        es pública, la podés rehacer vos con una calculadora»."""
        with mock.patch.object(precio, 'onza', lambda *a, **k: 4377.48):
            for idi in ('es', 'en'):
                t = precio.como_se_dice(idi)
                self.assertIn('2.56', t)
                self.assertIn('140.74', t)
                self.assertIn('55', t)

    def test_dice_que_la_billetera_lee_LO_MISMO(self):
        """Es la respuesta a «pero en mi veta wallet sale otra cosa», dada
        antes de que la persona tenga que preguntarlo."""
        with mock.patch.object(precio, 'onza', lambda *a, **k: 4377.48):
            self.assertIn('Veta Wallet', precio.como_se_dice('es'))
            self.assertIn('Veta Wallet', precio.como_se_dice('en'))

    def test_no_promete_nada_ni_invita_a_comprar(self):
        with mock.patch.object(precio, 'onza', lambda *a, **k: 4377.48):
            for idi in ('es', 'en'):
                t = precio.como_se_dice(idi).lower()
                for prohibida in ['va a subir', 'buena inversión', 'inversion',
                                  'comprá', 'compra ahora', 'ganancia',
                                  'will rise', 'good investment', 'buy now',
                                  'respaldad', 'backed', 'garantiz']:
                    self.assertNotIn(prohibida, t, prohibida)


class NILLEGAALMODELO(unittest.TestCase):
    """Una pregunta con UNA respuesta exacta no pasa por algo que improvisa."""

    def test_las_frases_de_la_captura_van_al_nodo_del_precio(self):
        for f in ['Whats the price of one origen to USD ?',
                  "What's the price of one origen to USD?",
                  'cuanto vale un origen en dolares',
                  '¿cuánto cuesta un ORIGEN?',
                  'price of one origen',
                  'Pero en mi veta wallet sale 2.56 USD 1 origen']:
            self.assertEqual(guion.por_texto(f), 'precio', f)

    def test_el_nodo_existe_y_el_hueco_se_rellena(self):
        n = guion.nodo('precio', 'es', precio='SALE ESTO')
        self.assertEqual(n['texto'], 'SALE ESTO')
        self.assertTrue(n['botones'])

    def test_sin_precio_el_hueco_no_queda_crudo(self):
        """Un «{precio}» en pantalla es peor que no contestar."""
        n = guion.nodo('precio', 'en')
        self.assertNotIn('{precio}', n['texto'])

    def test_el_guion_NO_importa_precio(self):
        """`guion.py` es una tabla de textos: tiene que poder leerse y probarse
        sin red. Quien sale a internet es `precio.py`, y el dato le llega ya
        escrito."""
        fuente = (AQUI / 'guion.py').read_text()
        self.assertNotIn('import precio', fuente)
        self.assertNotIn('urllib', fuente)

    def test_preguntar_por_el_precio_NO_lleva_a_inversion(self):
        """«¿cuánto vale?» es una pregunta de información. Contestarla con el
        camino del inversionista es leerle una intención que no dijo."""
        self.assertEqual(guion.por_texto('cuanto vale un origen'), 'precio')


class ELIDIOMADELACAPTURA(unittest.TestCase):
    """El otro fallo de la misma pantalla: escribió en inglés y le contestó en
    español, después de haberle contestado en inglés el mensaje anterior."""

    def test_la_frase_exacta_se_lee_como_ingles(self):
        self.assertEqual(
            guion.en_que_habla('Whats the price of one origen to USD ?'), 'en')

    def test_whats_sin_apostrofo_cuenta_igual(self):
        """En el teléfono casi nadie pone el apóstrofo. Era la forma que de
        verdad se escribe y la única que faltaba."""
        for f in ['whats this', "what's this", 'hows it going', 'im here']:
            self.assertEqual(guion.en_que_habla(f), 'en', f)

    def test_NUESTRO_NOMBRE_DE_PRODUCTO_no_dice_el_idioma(self):
        """«wallet» estuvo media hora en la lista de palabras inglesas y era un
        error: nuestro producto se llama Veta Wallet, así que una frase en
        español entera contaba dos palabras inglesas. Un nombre de marca no
        dice en qué idioma habla nadie, y «USD» tampoco."""
        self.assertEqual(
            guion.en_que_habla('Pero en mi veta wallet sale 2.56 USD 1 origen'),
            'es')
        self.assertEqual(guion.en_que_habla('quiero abrir mi veta wallet'), 'es')

    def test_y_en_ingles_de_verdad_sigue_siendo_ingles(self):
        self.assertEqual(guion.en_que_habla('open my wallet please'), 'en')

    def test_lo_ambiguo_sigue_sin_decidir(self):
        for f in ['ok', 'the', 'me no', '123', 'Maria']:
            self.assertIsNone(guion.en_que_habla(f), f)


if __name__ == '__main__':
    unittest.main(verbosity=2)
