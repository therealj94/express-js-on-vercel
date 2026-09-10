#!/usr/bin/env python3
"""Una pregunta en medio del embudo NO es el dato.

── LO QUE PASABA ────────────────────────────────────────────────────────────

El guion pregunta el nombre y el oficio antes de contar nada, y la regla era
«lo que escribe en un nodo que espera un dato, es el dato». Bien para «Ana».
Mal para «cuanto vale un origen en dolares?»: eso se guardaba como el nombre o
el oficio, la pregunta quedaba sin contestar, y la persona recibia el
siguiente paso del formulario. Se vio el 2-sep probando el buzon de la web de
punta a punta: turno 4, pregunta del precio, respuesta «¿que te trajo hasta
aca?».

Ahora, si lo que llega parece una pregunta Y lleva a un nodo del guion (el
precio, las llaves, que es un gramin...), se contesta ESO primero y se vuelve a
pedir el dato despues. El dato no se consume. Un nombre no lleva signo de
pregunta; una pregunta si.

Se corre con el relevo falso de la web (`portal.Recado`), que junta lo que
AU-RA manda, y con el precio del oro fijado para no depender de la red.
"""
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import asistente   # noqa: E402
import guion       # noqa: E402
import portal      # noqa: E402
import precio      # noqa: E402


def _charla(p, dicho):
    rec = portal.Recado()
    with mock.patch.object(precio, 'onza', lambda ahora=None: 4400.0):
        asistente.atender(rec, 'sistema de prueba', p, 'web:PRUEBAxxxxxxxxxxxxxxx', dicho, {})
    return rec


class PreguntaEnElEmbudo(unittest.TestCase):
    def test_la_pregunta_del_precio_se_contesta_y_se_vuelve_a_pedir_el_nombre(self):
        p = {'idioma': 'es', 'nodo': 'nombre', 'saludado': True, 'historial': []}
        rec = _charla(p, 'cuanto vale un origen en dolares?')
        junto = '\n'.join(rec.textos)
        self.assertIn('ORIGEN', junto, junto)
        self.assertIn('$', junto, 'tiene que traer la cifra de precio.py: ' + junto)
        self.assertNotIn('nombre', p, 'la pregunta se guardo como nombre: %r' % p.get('nombre'))
        # y el nombre se vuelve a pedir, para que el embudo no se pierda
        self.assertEqual(p.get('nodo'), 'nombre')
        self.assertTrue(any('llam' in t.lower() for t in rec.textos),
                        'no volvio a pedir el nombre: ' + junto)

    def test_un_nombre_de_verdad_sigue_siendo_el_nombre(self):
        p = {'idioma': 'es', 'nodo': 'nombre', 'saludado': True, 'historial': []}
        _charla(p, 'Ana')
        self.assertEqual(p.get('nombre'), 'Ana')
        self.assertEqual(p.get('nodo'), 'oficio')

    def test_en_el_oficio_tambien(self):
        p = {'idioma': 'es', 'nodo': 'oficio', 'nombre': 'Ana', 'saludado': True, 'historial': []}
        # Esta no tiene nodo en el guion: la contesta el motor (aqui no hay
        # motor, asi que sale la frase de «motor caido» — lo que importa es
        # que el oficio NO se consume y el embudo sigue esperandolo).
        rec = _charla(p, '¿y si pierdo el celular, pierdo mi plata?')
        self.assertNotIn('oficio', p, 'la pregunta se guardo como oficio: %r' % p.get('oficio'))
        self.assertEqual(p.get('nodo'), 'oficio')
        self.assertTrue(rec.textos, 'no contesto nada')

    def test_un_oficio_escrito_sigue_entrando(self):
        p = {'idioma': 'es', 'nodo': 'oficio', 'nombre': 'Ana', 'saludado': True, 'historial': []}
        _charla(p, 'taxista de noche')
        self.assertEqual(p.get('oficio'), 'taxista de noche')


if __name__ == '__main__':
    unittest.main(verbosity=2)
