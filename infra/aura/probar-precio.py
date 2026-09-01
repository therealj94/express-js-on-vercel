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


class TODASLASMONEDAS(unittest.TestCase):
    """«Ocupo sepa todos los precios tokens también sepa su precio y se mueven».

    Mirándolo de verdad, la respuesta honesta tiene TRES grupos, y la
    diferencia entre ellos importa más que las cifras:

      · ORIGEN, AUKA, AGKA — siguen un metal y se mueven solas.
      · ONDK — precio DECLARADO por la Junta. Entre actas NO se mueve.
      · IBS, HARV — no tienen precio de ninguna clase.

    Confundir «declarado» con «de mercado» es el malentendido caro de esta
    casa, y es justo lo que AU-RA tiene que saber explicar.
    """

    def _tablas(self):
        with mock.patch.object(precio, 'onza', lambda *a, **k: 4374.26), \
             mock.patch.object(precio, 'onza_plata', lambda *a, **k: 64.70):
            return {i: precio.tabla(i) for i in ('es', 'en')}

    def test_estan_LAS_SEIS_publicas(self):
        """También las que no tienen precio: una lista que solo muestra las que
        llevan número da a entender que las otras no existen, y quien tenga
        HARV en su billetera merece saber por qué no ve una cifra."""
        for t in self._tablas().values():
            for m in ['ORIGEN', 'AUKA', 'AGKA', 'ONDK', 'IBS', 'Harvi']:
                self.assertIn(m, t, m)

    def test_las_tres_del_metal_llevan_su_numero(self):
        for t in self._tablas().values():
            self.assertIn('2.56', t)        # ORIGEN
            self.assertIn('4,374', t)       # AUKA, la onza de oro
            self.assertIn('64.70', t)       # AGKA, la onza de plata

    def test_y_se_dice_que_SE_MUEVEN_y_que_pueden_BAJAR(self):
        """Lo que pidió José. Y «pueden bajar» no es un añadido pesimista: una
        moneda que solo se cuenta cuando sube es una promesa disfrazada."""
        es, en = self._tablas()['es'], self._tablas()['en']
        self.assertIn('se mueven', es)
        self.assertIn('bajar', es)
        self.assertIn('move on their own', en)
        self.assertIn('go down', en)

    def test_ONDK_NO_LLEVA_LA_CIFRA(self):
        """La regla de la casa, con prueba propia en `probar-guion.py`: se
        nombra sin precio, sin apreciación, sin recompra y sin invitación.
        Decir la cifra es empezar a venderlo."""
        for t in self._tablas().values():
            self.assertNotIn('2.15', t, 'sacó el precio declarado de ONDK')
            self.assertNotIn('2,15', t)

    def test_pero_SI_se_dice_QUE_ES_y_DONDE_mirarlo(self):
        """No dar la cifra no es esconderla: el libro es público y está a un
        clic. Lo que no pasa es que se la ofrezcamos nosotros."""
        for t in self._tablas().values():
            self.assertIn('ONDK', t)
            self.assertIn(precio.LIBRO_ONDK, t)

    def test_y_que_ONDK_NO_SE_MUEVE_que_es_lo_contrario_de_las_otras(self):
        es, en = self._tablas()['es'], self._tablas()['en']
        self.assertIn('no se mueve', es)
        self.assertIn('not* move', en)
        self.assertIn('no un precio de mercado', es)
        self.assertIn('not a market price', en)

    def test_IBS_y_HARV_se_dicen_SIN_PRECIO_no_se_esconden(self):
        es, en = self._tablas()['es'], self._tablas()['en']
        self.assertIn('sin precio', es)
        self.assertIn('No cotizan', es)
        self.assertIn('no price', en)

    def test_ninguna_tabla_invita_a_comprar(self):
        for t in self._tablas().values():
            b = t.lower()
            for f in ['comprá', 'compra ahora', 'oportunidad', 'va a subir',
                      'buena inversión', 'buy now', 'good investment',
                      'opportunity', 'will rise', 'garantiz', 'respaldad',
                      'backed', 'guaranteed']:
                self.assertNotIn(f, b, f)

    def test_sin_oro_NO_se_ensena_media_tabla(self):
        """Media tabla con huecos parece un fallo y encima da pie a que alguien
        use la mitad que sí salió."""
        with mock.patch.object(precio, 'onza', lambda *a, **k: None), \
             mock.patch.object(precio, 'onza_plata', lambda *a, **k: None):
            for i in ('es', 'en'):
                self.assertEqual(precio.tabla(i), precio.NO_SE_SABE[i])

    def test_si_falta_SOLO_la_plata_lo_demas_sigue_saliendo(self):
        """Que se caiga una fuente de plata no puede dejar sin precio al ORIGEN,
        que es por el que pregunta todo el mundo."""
        with mock.patch.object(precio, 'onza', lambda *a, **k: 4374.26), \
             mock.patch.object(precio, 'onza_plata', lambda *a, **k: None):
            t = precio.tabla('es')
        self.assertIn('2.56', t)
        self.assertIn('—', t, 'la plata sin dato tiene que verse como un guion')

    def test_todos_devuelve_las_seis_y_dice_cual_se_mueve(self):
        with mock.patch.object(precio, 'onza', lambda *a, **k: 4374.26), \
             mock.patch.object(precio, 'onza_plata', lambda *a, **k: 64.70):
            d = precio.todos()
        self.assertEqual(set(d), {'ORIGEN', 'AUKA', 'AGKA', 'ONDK', 'IBS', 'HARV'})
        for m in ('ORIGEN', 'AUKA', 'AGKA'):
            self.assertTrue(d[m]['se_mueve'], m)
            self.assertTrue(d[m]['usd'], m)
        for m in ('ONDK', 'IBS', 'HARV'):
            self.assertFalse(d[m]['se_mueve'], m)
            self.assertIsNone(d[m]['usd'], m)

    def test_preguntar_por_todas_lleva_al_nodo_de_todas(self):
        for f in ['precios de todos los tokens', 'que monedas tienen',
                  'lista de precios', 'all the prices',
                  'what tokens do you have']:
            self.assertEqual(guion.por_texto(f), 'monedas', f)

    def test_pero_preguntar_por_UNA_sigue_dando_UNA(self):
        """Quien dice «cuánto vale un origen» quiere un número, no una lista
        de seis."""
        self.assertEqual(guion.por_texto('cuanto vale un origen'), 'precio')
        self.assertEqual(guion.por_texto('Whats the price of one origen to USD ?'),
                         'precio')


if __name__ == '__main__':
    unittest.main(verbosity=2)
