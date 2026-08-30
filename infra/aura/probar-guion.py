#!/usr/bin/env python3
"""Los caminos guiados de AU-RA.

POR QUE ESTAS PRUEBAS EXISTEN

Un guion mal hecho hace daño de tres formas distintas, y las tres se sienten
del lado de la persona:

  1. ATRAPA. Si lo que no encaja con un botón se queda dando vueltas en el
     menú, AU-RA deja de ser una asistente y pasa a ser una central telefónica.
     La regla es dura: lo que no encaja va al motor, siempre.

  2. SE QUEDA MUDA. WhatsApp corta el título de un botón en 20 caracteres y no
     lo recorta: Meta rechaza el MENSAJE ENTERO. Un título de 21 caracteres no
     se ve feo — desaparece la conversación.

  3. SE VUELVE A CAER EN LO DE SIEMPRE. El guion existe en buena parte porque
     un texto escrito por nosotros no puede alucinar. Si alguien mete en un
     nodo una afirmación sobre licencias o sobre invertir, el guion deja de ser
     la parte segura y se convierte en el sitio donde la mentira queda fija y
     aprobada.
"""

import os
import pathlib
import re
import sys
import unittest

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import guion   # noqa: E402
import guardia  # noqa: E402


class NoAtrapaANadie(unittest.TestCase):
    """La regla que separa guiar de atrapar."""

    def test_UNA_PREGUNTA_DE_VERDAD_NO_ENCAJA_Y_VA_AL_MOTOR(self):
        for pregunta in [
            '¿cuánto cuesta mandar plata a mi mamá?',
            'no me llegó mi transferencia de ayer',
            '¿qué cocino hoy?',
            'mi mamá no puede entrar a la app',
            'cuántos ORIGEN tengo',
        ]:
            self.assertIsNone(guion.por_texto(pregunta), f'atrapó: «{pregunta}»')

    def test_estando_dentro_de_un_nodo_tampoco_atrapa(self):
        """Estar en el menú no cambia nada: lo que no es un botón, va al motor."""
        self.assertIsNone(
            guion.por_texto('pero cuánto me cobran por eso', desde='billetera'))

    def test_un_boton_TRANSCRITO_a_mano_si_lleva(self):
        """Mucha gente no toca el botón: copia el texto y lo escribe. Con
        teclados grandes y con gente mayor pasa todo el tiempo."""
        self.assertEqual(guion.por_texto('Mandar plata', desde='que-hago'), 'remesas')
        self.assertEqual(guion.por_texto('mandar plata', desde='que-hago'), 'remesas')
        self.assertEqual(guion.por_texto('MANDAR PLATA', desde='que-hago'), 'remesas')

    def test_pero_solo_los_botones_DE_ESE_nodo(self):
        """Escribir «la billetera» desde otro sitio no salta ahí por su
        cuenta: eso sería adivinar, y adivinar es como se pierde a alguien que
        estaba preguntando otra cosa."""
        self.assertIsNone(guion.por_texto('me gusta eso', desde='llaves'))


class LosAtajos(unittest.TestCase):

    def test_un_saludo_abre_las_puertas(self):
        for saludo in ['hola', 'Hola!', 'buenas', 'buenos días', 'qué tal']:
            self.assertEqual(guion.por_texto(saludo), 'inicio', saludo)

    def test_pero_un_saludo_CON_pregunta_detras_no(self):
        """«hola, cuánto cuesta» es una pregunta, no un saludo. Contestarle el
        menú es no haberla leído."""
        self.assertIsNone(guion.por_texto('hola, cuánto cuesta mandar plata'))

    def test_TODO_LO_DE_INVERTIR_VA_A_UNA_PERSONA(self):
        for dicho in ['quiero invertir', 'soy inversionista', 'cómo invierto',
                      'qué rendimiento da', 'quiero ser accionista']:
            self.assertEqual(guion.por_texto(dicho), 'inversion', dicho)


class LosBotonesCabenEnWhatsApp(unittest.TestCase):

    def test_ningun_titulo_pasa_de_veinte_caracteres(self):
        """Meta rechaza el mensaje ENTERO, no recorta el título. Un carácter de
        más deja la conversación muda."""
        for nombre, n in guion.NODOS.items():
            for titulo, _ in (n.get('botones') or []):
                self.assertLessEqual(
                    len(titulo), guion.TOPE_BOTON,
                    f'«{titulo}» en el nodo «{nombre}» tiene {len(titulo)}')

    def test_nunca_mas_de_tres(self):
        for nombre, n in guion.NODOS.items():
            self.assertLessEqual(len(n.get('botones') or []), 3, nombre)

    def test_todos_los_botones_llevan_a_un_nodo_QUE_EXISTE(self):
        """Un botón que apunta a la nada deja a la persona tocando sin que pase
        nada — y sin ninguna señal de que algo se rompió."""
        for nombre, n in guion.NODOS.items():
            for titulo, destino in (n.get('botones') or []):
                self.assertIn(destino, guion.NODOS,
                              f'«{titulo}» ({nombre}) lleva a «{destino}», que no existe')

    def test_se_puede_llegar_a_todos_los_nodos(self):
        """Un nodo al que no llega ningún botón ni ningún atajo es texto muerto:
        se mantiene, se revisa, y nadie lo lee nunca."""
        alcanzables = {'inicio'}
        for n in guion.NODOS.values():
            for _, d in (n.get('botones') or []):
                alcanzables.add(d)
        for _, d in guion.ATAJOS:
            alcanzables.add(d)
        huerfanos = set(guion.NODOS) - alcanzables
        self.assertEqual(huerfanos, set(), f'no se llega a: {huerfanos}')


class ElGuionNoPuedeDECIRLoQueElGuardiaCORTA(unittest.TestCase):
    """La prueba que cierra el círculo del día.

    El guion existe en buena parte porque un texto escrito por nosotros no
    puede alucinar. Si alguien mete en un nodo una afirmación sobre licencias o
    sobre invertir, el guion deja de ser la parte segura y se convierte en el
    sitio donde la mentira queda fija, escrita y repetida a todo el mundo.
    """

    def test_NINGUN_NODO_DICE_ALGO_QUE_EL_GUARDIA_CORTARIA(self):
        for nombre, n in guion.NODOS.items():
            _, motivo = guardia.revisar(n['texto'])
            self.assertIsNone(
                motivo, f'el nodo «{nombre}» dice algo que el guardia corta ({motivo})')

    def test_ni_los_titulos_de_los_botones(self):
        for nombre, n in guion.NODOS.items():
            for titulo, _ in (n.get('botones') or []):
                self.assertIsNone(guardia.revisar(titulo)[1], f'{nombre}: «{titulo}»')

    def test_el_camino_del_inversionista_NO_le_cuenta_la_oportunidad(self):
        """Orden Global no tiene ninguna licencia emitida. Un camino automático
        que le hable de invertir a alguien es exactamente donde ocurre una
        tergiversación de valores."""
        t = guion.NODOS['inversion']['texto'].lower()
        self.assertIn('info@ordenglobal.org', t)
        for prohibido in ['rendimiento', 'ganancia', 'rentabilidad', 'oportunidad',
                          'te conviene', 'seguro que', 'garantiza']:
            self.assertNotIn(prohibido, t, f'el camino de inversión dice «{prohibido}»')

    def test_ni_uno_solo_promete_nada_del_dinero_de_nadie(self):
        for nombre, n in guion.NODOS.items():
            t = n['texto'].lower()
            for prohibido in ['garantiza', 'sin riesgo', 'seguro que vas a',
                              'te vas a hacer', 'rentabilidad']:
                self.assertNotIn(prohibido, t, f'{nombre}: «{prohibido}»')


class ComoSuena(unittest.TestCase):
    """«Que no se sienta robot» es un requisito, así que se comprueba."""

    def test_ningun_boton_es_una_categoria_de_empresa(self):
        """«Productos», «Servicios», «FAQ» son cómo piensa la empresa, no cómo
        habla la persona."""
        feos = {'productos', 'servicios', 'faq', 'soporte', 'menu', 'opciones',
                'informacion', 'more info', 'salir'}
        for nombre, n in guion.NODOS.items():
            for titulo, _ in (n.get('botones') or []):
                self.assertNotIn(guion._llano(titulo), feos,
                                 f'«{titulo}» en {nombre} suena a central telefónica')

    def test_no_hay_numeros_de_menu(self):
        """«1) Billetera 2) Identidad» es exactamente lo que no se quería."""
        for nombre, n in guion.NODOS.items():
            self.assertIsNone(re.match(r'^\s*\d[\).]', n['texto']), nombre)
            for titulo, _ in (n.get('botones') or []):
                self.assertIsNone(re.match(r'^\s*\d[\).]?\s', titulo), titulo)

    def test_los_textos_se_leen_de_pie_y_con_una_mano(self):
        """Lo que no entra en pocas líneas no se lee en un teléfono."""
        for nombre, n in guion.NODOS.items():
            self.assertLessEqual(len(n['texto']), 480,
                                 f'el nodo «{nombre}» tiene {len(n["texto"])} caracteres')

    def test_habla_de_vos_como_toda_la_casa(self):
        junto = ' '.join(n['texto'] for n in guion.NODOS.values()).lower()
        self.assertNotIn(' tú ', junto)
        self.assertNotIn('puedes', junto)
        self.assertIn('podés', junto)


class ElCanalSinBotones(unittest.TestCase):
    """El chat de la casa no tiene botones. Un guion que solo funciona en
    WhatsApp serían dos productos manteniéndose por separado."""

    def test_las_opciones_salen_como_texto(self):
        t = guion.como_texto('que-hago')
        self.assertIn('Mandar plata', t)
        self.assertIn('·', t, 'las opciones tienen que verse como opciones')

    def test_un_nodo_sin_botones_sale_tal_cual(self):
        self.assertEqual(guion.como_texto('persona'), guion.NODOS['persona']['texto'])

    def test_un_nodo_que_no_existe_no_revienta(self):
        self.assertIsNone(guion.como_texto('inventado'))


class ElToque(unittest.TestCase):

    def test_un_boton_conocido_lleva_a_su_nodo(self):
        self.assertEqual(guion.por_toque('billetera'), 'billetera')

    def test_UN_BOTON_DE_OTRA_EPOCA_NO_LLEVA_A_NINGUN_LADO(self):
        """Alguien toca un botón de un menú viejo que quedó en su historial. Si
        eso llevara a la nada y reventara, la conversación se rompe por un
        mensaje de hace un mes."""
        self.assertIsNone(guion.por_toque('un-nodo-que-ya-no-existe'))
        self.assertIsNone(guion.por_toque(None))
        self.assertIsNone(guion.por_toque(''))


class ElAsistenteLoUsaANTESDelMotor(unittest.TestCase):
    """De nada sirve el guion si `atender` lo consulta después de gastar la
    GPU. La mitad del punto era no gastarla."""

    def test_el_guion_se_consulta_antes_de_preguntar_al_motor(self):
        fuente = (AQUI / 'asistente.py').read_text(encoding='utf8')
        i = fuente.index('def atender(rel, sistema, p, de, dicho, mensaje=None):')
        cuerpo = fuente[i:fuente.index('\ndef ', i + 10)]
        pos_guion = cuerpo.index('guion.por_texto')
        pos_motor = cuerpo.index('preguntar_motor')
        self.assertLess(pos_guion, pos_motor,
                        'se llama al motor antes de mirar el guion')

    def test_y_se_marca_por_donde_va_la_persona(self):
        fuente = (AQUI / 'asistente.py').read_text(encoding='utf8')
        self.assertIn("p['nodo'] = destino", fuente,
                      'sin recordar el nodo, escribir el título de un botón no funciona')



class UnaPreguntaSINSignoSigueSiendoUnaPregunta(unittest.TestCase):
    """En WhatsApp casi nadie pone «¿». Si el guion se fía del signo, atrapa a
    todo el mundo — y lo hizo: «cuántos ORIGEN tengo» caía en el nodo de ORIGEN
    en vez de ir a mirar el saldo de esa persona."""

    def test_preguntas_cortas_y_sin_signo_van_al_motor(self):
        for p in ['cuántos ORIGEN tengo', 'qué es AUKA', 'cómo cobro',
                  'cuánto cuesta', 'dónde bajo la app', 'tengo un problema',
                  'necesito ayuda con remesas', 'puedo cobrar con QR']:
            self.assertIsNone(guion.por_texto(p), f'atrapó: «{p}»')

    def test_pero_el_tema_a_secas_si_abre_su_puerta(self):
        """Quien escribe «remesas» está nombrando de qué quiere hablar."""
        self.assertEqual(guion.por_texto('remesas'), 'remesas')
        self.assertEqual(guion.por_texto('mi negocio'), 'negocio')
        self.assertEqual(guion.por_texto('genesis id'), 'genesis')
        self.assertEqual(guion.por_texto('AUKA'), 'monedas')

    def test_una_frase_larga_nunca_es_un_tema(self):
        self.assertIsNone(
            guion.por_texto('quisiera ver lo de las remesas para mi familia'))

if __name__ == '__main__':
    unittest.main(verbosity=2)
