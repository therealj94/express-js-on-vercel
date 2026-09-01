#!/usr/bin/env python3
"""Lo que AU-RA le dice a cada uno el primer dia.

POR QUE ESTAS PRUEBAS EXISTEN

Este mensaje se manda una vez por persona y despues cada vez que alguien
escriba «ayuda». Es lo unico que va a leer entero el equipo, y de el sale la
idea que cada quien se hace de que es AU-RA. Si dice de mas, va a decepcionar
la primera semana; si dice de menos, nadie la usa.

Tres cosas se vigilan aqui, y ninguna es de estilo:

  · QUE LAS PALABRAS EXACTAS ESTEN. «Escribí ENCARGOS» es una instruccion;
    «podés consultarme» no es nada.

  · QUE NO PROMETA LO QUE NO PUEDE. Sobre todo: que la lista que enseña sea
    la del catalogo de VERDAD para SU tramo. Prometerle a mercadeo algo de
    tecnologia es que lo pida el lunes y le digan que no.

  · QUE DIGA LO QUE NO VE. Es lo que menos se escribe y lo que mas vale: sin
    eso, «todo en orden» se lee como «todo esta vigilado».

Y una de forma que en WhatsApp no es forma: el formato. Markdown no se
convierte — sale con los simbolos a la vista, y un mensaje de bienvenida lleno
de asteriscos sueltos es lo primero que hace que algo parezca a medio hacer.
"""

import pathlib
import re
import sys
import unittest

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import catalogo       # noqa: E402
import escalafon      # noqa: E402
import miradas        # noqa: E402
import presentacion   # noqa: E402

LISTA = ('Jose=50432136457/j.ordonez@ordenglobal.org:admin,'
         'Medardo=50498782176:admin,'
         'Nicole=50433467760:mercadeo,'
         'Melany=50499080571:legal+contable+mercadeo,'
         'Carlos=50494716808:tecnologico,'
         'Mayra=50498916184:contable+legal,'
         'solocorreo@ordenglobal.org:legal')


class _Base(unittest.TestCase):
    def setUp(self):
        escalafon.recargar(LISTA)

    def tearDown(self):
        escalafon.recargar('')


class LEHABLAAALGUIENNOAUNNUMERO(_Base):

    def test_lo_saluda_por_su_nombre(self):
        self.assertTrue(presentacion.para('50433467760').startswith('Hola Nicole'))

    def test_y_sin_nombre_saluda_igual_sin_dejar_un_hueco(self):
        t = presentacion.para('solocorreo@ordenglobal.org')
        self.assertTrue(t.startswith('Hola 👋'), t[:30])
        self.assertNotIn('Hola  ', t)

    def test_a_quien_no_esta_en_la_lista_no_le_dice_nada(self):
        self.assertIsNone(presentacion.para('50499999999'))


class DICELASPALABRASEXACTAS(_Base):

    def test_dice_QUE_escribir_no_que_puede_consultar(self):
        for quien in ['50433467760', '50494716808', '50498916184']:
            t = presentacion.para(quien)
            self.assertIn('ENCARGOS', t, quien)
            self.assertIn('AYUDA', t, quien)

    def test_y_esas_palabras_ABREN_de_verdad(self):
        """Una instrucción que no funciona es peor que ninguna."""
        import puerta
        self.assertTrue(puerta.le_abre('encargos'))
        self.assertTrue(presentacion.le_abre('ayuda'))

    def test_dice_a_que_hora_llega_el_parte(self):
        self.assertIn('7:30', presentacion.para('50433467760'))
        self.assertIn('19:30', presentacion.para('50433467760'))


class NOPROMETELOQUENOPUEDE(_Base):

    def test_la_lista_que_enseña_es_la_de_SU_tramo(self):
        """Prometerle a mercadeo algo de tecnología es que lo pida el lunes y
        le digan que no."""
        t = presentacion.para('50433467760')          # Nicole, mercadeo
        suyos = {f['titulo'] for _k, f in catalogo.para(('mercadeo',))}
        ajenos = {f['titulo'] for k, f in catalogo.ENCARGOS.items()
                  if not catalogo.puede('mercadeo', k)}
        for x in suyos:
            self.assertIn(x, t, f'no le ofrece lo suyo: {x}')
        for x in ajenos:
            self.assertNotIn(x, t, f'le ofrece algo que no es suyo: {x}')

    def test_a_quien_lleva_tres_tramos_le_enseña_los_tres(self):
        t = presentacion.para('50499080571')          # Melany
        for x in ['Papeles y plazos', 'Saldos de la campaña',
                  'Cómo viene la gente']:
            self.assertIn(x, t, x)

    def test_y_le_dice_lo_que_AURA_hace_por_cada_uno_de_sus_tres(self):
        """Decirle solo lo de legal le esconde dos tercios."""
        t = presentacion.para('50499080571')
        for tramo in ('legal', 'contable', 'mercadeo'):
            self.assertIn(presentacion.LOQUELEHAGO[tramo], t, tramo)

    def test_separa_lo_que_sale_solo_de_lo_que_necesita_firma(self):
        t = presentacion.para('50494716808')          # Carlos, tecnología
        self.assertIn('salen al momento', t)
        self.assertIn('firmar un admin', t)
        self.assertLess(t.index('salen al momento'), t.index('firmar un admin'))

    def test_y_explica_POR_QUE_hace_falta_la_firma(self):
        """Un límite que se descubre chocándose se lee como un fallo. Dicho
        antes, es una regla."""
        t = presentacion.para('50494716808')
        self.assertIn('nadie ejecuta nada solo', t)
        self.assertIn('José tampoco', t)

    def test_a_quien_no_tiene_nada_que_firmar_no_le_habla_de_firmas(self):
        escalafon.recargar('Ana=50411112222:operacion')
        t = presentacion.para('50411112222')
        suyos = [k for k, _f in catalogo.para(('operacion',))]
        if not any(catalogo.necesita_permiso(k) for k in suyos):
            self.assertNotIn('firmar un admin', t)


class DICELOQUENOVE(_Base):
    """Lo que menos se escribe y lo que más vale."""

    def test_contabilidad_sabe_que_no_se_miran_los_costos(self):
        self.assertIn('costos de la nube', presentacion.para('50498916184'))

    def test_mercadeo_sabe_que_no_se_mide_de_donde_llega_la_gente(self):
        self.assertIn('de dónde llega', presentacion.para('50433467760'))

    def test_quien_lleva_varios_tramos_ve_los_puntos_ciegos_de_todos(self):
        t = presentacion.para('50499080571')
        for falta in ['vencimientos', 'costos de la nube', 'de dónde llega']:
            self.assertIn(falta, t, falta)

    def test_y_cada_uno_UNA_vez(self):
        t = presentacion.para('50498916184')          # Mayra: contable + legal
        self.assertEqual(t.count('costos de la nube'), 1)

    def test_lo_ciego_sale_de_MIRADAS_no_de_una_copia_pegada(self):
        """Dos listas de lo mismo es una lista que se queda vieja."""
        fuente = (AQUI / 'presentacion.py').read_text(encoding='utf8')
        self.assertIn('miradas.CIEGO', fuente)

    def test_explica_por_que_lo_dice(self):
        t = presentacion.para('50433467760')
        self.assertIn('todo en orden', t.lower())


class ESCRITOCOMOLOENTIENDEWHATSAPP(_Base):
    """Markdown no se convierte: sale con los símbolos a la vista."""

    def test_ni_un_asterisco_doble_ni_una_comilla_invertida(self):
        for quien in ['50432136457', '50433467760', '50499080571',
                      '50494716808', '50498916184']:
            t = presentacion.para(quien)
            self.assertNotIn('**', t, quien)
            self.assertNotIn('`', t, quien)
            self.assertNotIn('##', t, quien)

    def test_las_negritas_estan_balanceadas(self):
        """Un asterisco suelto deja media frase en negrita hasta el final."""
        for quien in ['50432136457', '50499080571', '50494716808']:
            t = presentacion.para(quien)
            self.assertEqual(t.count('*') % 2, 0,
                             f'{quien}: asterisco suelto')

    def test_cabe_en_un_mensaje_de_WhatsApp(self):
        for quien in ['50432136457', '50499080571']:
            self.assertLess(len(presentacion.para(quien)), 4000, quien)

    def test_y_no_es_tan_corto_que_no_diga_nada(self):
        self.assertGreater(len(presentacion.para('50433467760')), 700)

    def test_lo_primero_que_se_ve_es_lo_que_puede_hacer_hoy(self):
        """Nada de «me complace presentarme»."""
        t = presentacion.para('50433467760')
        cabeza = '\n'.join(t.split('\n')[:6]).lower()
        self.assertIn('lo tuyo es', cabeza)
        for relleno in ['me complace', 'es un placer', 'estoy emocionad']:
            self.assertNotIn(relleno, t.lower())


class SEMANDAAQUIENSEPUEDE(_Base):

    def test_uno_por_persona_con_telefono(self):
        todos = presentacion.para_todos()
        self.assertEqual(len(todos), 6, [n for _d, _t, n in todos])
        self.assertEqual(len({d for d, _t, _n in todos}), 6,
                         'le mandaría dos veces a alguien')

    def test_a_quien_solo_tiene_correo_no_se_le_manda_por_aqui(self):
        self.assertNotIn('solocorreo@ordenglobal.org',
                         [d for d, _t, _n in presentacion.para_todos()])

    def test_cada_uno_recibe_EL_SUYO(self):
        for donde, texto, nombre in presentacion.para_todos():
            if nombre:
                self.assertIn(f'Hola {nombre}', texto)

    def test_sin_escalafon_no_se_manda_nada(self):
        escalafon.recargar('')
        self.assertEqual(presentacion.para_todos(), [])


if __name__ == '__main__':
    unittest.main(verbosity=2)
