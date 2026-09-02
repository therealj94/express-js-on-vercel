#!/usr/bin/env python3
"""Preguntar sin saberse el menú.

── LO QUE PASABA ────────────────────────────────────────────────────────────

Todo lo que un admin puede pedirle a AU-RA vivía detrás de un menú, y el menú
detrás de una palabra que hay que saber: «encargos». Quien no se la sabe
escribe lo que escribiría cualquiera. José, el 1-sep:

    «quería saber a quién se le envió 1 ORIGEN, no se me notificó y pregunté
     y no supo contestar»

Y no era que no entendiera: esa frase no abría ninguna puerta, así que caía en
el motor —que no tiene ese dato— y contestaba lo que podía. El dato estaba a un
toque de distancia.

── LO QUE NO PUEDE PASAR AL ARREGLARLO ──────────────────────────────────────

Adivinar por una frase es cómodo y por eso es peligroso. Tres líneas que estas
pruebas cuidan, porque son las que convierten una comodidad en un incidente:

  1. NADA QUE NO SEA MIRAR. «Reiniciá el nodo» no puede salir de una frase
     aunque se entienda perfectamente: eso se pide en el menú y lo firma otro
     admin. Un servicio reiniciado por una conversación es un servicio que se
     cayó porque alguien escribió mal.

  2. NADA FUERA DEL TRAMO. La lista de premios lleva teléfonos y billeteras de
     gente real. Quien lleva mercadeo ve su parte; no ve a quién se le pagó.

  3. NADA POR CASUALIDAD. «¿Quién ganó el mundial?» no puede abrir la lista de
     premios, y «gasté mucho» no puede preguntarle a los nodos por el gas. Una
     puerta que se abre sola con la conversación de todos los días es peor que
     no tenerla: enseña datos que nadie pidió.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import catalogo   # noqa: E402
import puerta     # noqa: E402


class LaPreguntaDeJose(unittest.TestCase):
    def test_tal_cual_la_escribio(self):
        for dicho in ('¿a quién se le mandó el premio?',
                      'a quien se le envio 1 ORIGEN?',
                      '¿a quién se le pagó?',
                      'quién ganó el premio',
                      '¿cuántos premios quedan sin pagar?',
                      '¿hay premios por pagar?'):
            self.assertEqual(puerta.adivina(dicho, ['admin']), 'premios',
                             'no abrió con: ' + dicho)

    def test_y_las_otras_de_mirar(self):
        casos = [('dame el parte', ['mercadeo'], 'parte'),
                 ('¿cómo va la cadena?', ['tecnologico'], 'cadena'),
                 ('¿cuánto queda en la billetera de premios?',
                  ['contable'], 'saldos'),
                 ('quién es quién en el equipo', ['admin'], 'roles'),
                 ('¿qué papeles vencen?', ['legal'], 'papeles'),
                 ('¿cuánta gente nueva llegó?', ['mercadeo'], 'gente')]
        for dicho, tramos, clave in casos:
            self.assertEqual(puerta.adivina(dicho, tramos), clave, dicho)


class NoSeAdivinaLoQueToca(unittest.TestCase):
    def test_reiniciar_y_desplegar_no_salen_de_una_frase(self):
        for dicho in ('reiniciá el nodo', 'poné al día el nodo',
                      'reiniciar el servicio de mensajes',
                      'desplegá lo último por favor'):
            self.assertIsNone(puerta.adivina(dicho, ['admin']), dicho)

    def test_ningun_encargo_que_no_sea_mira_lleva_palabras(self):
        """La regla, comprobada en la lista y no solo en el código.

        Que hoy `adivina` filtre por riesgo no impide que mañana alguien le
        ponga palabras a «reiniciar» pensando que es una comodidad. Aquí se
        ve enseguida.
        """
        for clave, ficha in catalogo.ENCARGOS.items():
            if ficha.get('palabras'):
                self.assertEqual(ficha['riesgo'], 'mira',
                                 f'«{clave}» se puede adivinar y no es de mirar')
                self.assertEqual(ficha['pide'], [],
                                 f'«{clave}» pide datos: no se adivina')


class NoSeAdivinaFueraDeTramo(unittest.TestCase):
    def test_mercadeo_no_ve_a_quien_se_le_pago(self):
        self.assertIsNone(
            puerta.adivina('¿a quién se le mandó el premio?', ['mercadeo']))

    def test_sin_escalafon_no_hay_nada(self):
        for tramos in ([], None, ()):
            self.assertIsNone(puerta.adivina('¿cómo va la cadena?', tramos))

    def test_contable_si_ve_los_premios(self):
        self.assertEqual(
            puerta.adivina('¿a quién se le pagó?', ['contable']), 'premios')


class NoSeAbreSola(unittest.TestCase):
    def test_conversacion_de_todos_los_dias(self):
        for dicho in ('gracias, muy amable', 'el premio estuvo bueno',
                      'buenas, ¿todo bien?', 'dale, hablamos mañana',
                      'gasté mucho ayer, ¿te acordás?'):
            self.assertIsNone(puerta.adivina(dicho, ['admin']), dicho)

    def test_el_mundial_no_es_un_premio(self):
        """El que más caro sale: «quién ganó» solo no dice de qué se habla, y
        la lista lleva teléfonos y billeteras de gente real."""
        self.assertIsNone(puerta.adivina('¿quién ganó el mundial?', ['admin']))
        self.assertIsNone(
            puerta.adivina('¿a quién se le mandó el correo de ayer?', ['admin']))

    def test_una_afirmacion_no_pide_nada(self):
        self.assertIsNone(
            puerta.adivina('ya vi los premios, todo bien', ['admin']))

    def test_si_dos_encajan_no_se_elige_ninguno(self):
        """Enseñarle a alguien lo que no pidió es peor que seguir de largo."""
        guardadas = catalogo.ENCARGOS['roles'].get('palabras')
        catalogo.ENCARGOS['roles']['palabras'] = ('los premios',)
        try:
            self.assertIsNone(puerta.adivina('¿y los premios?', ['admin']))
        finally:
            catalogo.ENCARGOS['roles']['palabras'] = guardadas


if __name__ == '__main__':
    unittest.main(verbosity=2)
