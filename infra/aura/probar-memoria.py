#!/usr/bin/env python3
"""Lo que AU-RA contesta tiene que quedarle en la memoria. TODO lo que contesta.

POR QUE ESTE ARCHIVO EXISTE

1-sep, 02:19. Captura de una conversacion de verdad, en ingles:

    persona: What is the fee?
    AU-RA:   The network fee is 0.001 ORIGEN, paid in ORIGEN even if you
             send another coin. It is tiny because the chain is ours...
    persona: In dollars how much is It
    AU-RA:   It looks like there might be a bit of confusion. Could you
             please clarify what you're asking about in dollars?

La pregunta era perfectamente clara —«y eso en dolares cuanto es»— y AU-RA
contesto como si nunca hubiera dicho nada. Desde el lado de la persona no hay
excusa posible: se lo acababa de decir ella misma.

LA CAUSA

Esa primera respuesta salio del GUION, no del motor. Y lo que sale del guion
no entraba en `p['historial']`. Para el motor, la conversacion empezaba en
«In dollars how much is It», sin ningun «it» al que referirse.

LO QUE LO HACE PEOR

Cuanto MEJOR es el guion, peor se pone. Cada respuesta buena que da el guion
—sin gastar GPU, sin poder alucinar— es un hueco de memoria que paga la
pregunta siguiente. O sea que la parte segura del sistema estaba dejando
ciega a la otra.

Y no se ve en ninguna prueba de las de antes: el guion contesta bien, el
motor contesta bien, y lo que falla es el HUECO entre los dos.
"""

import pathlib
import sys
import unittest
from unittest import mock

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import asistente as aura   # noqa: E402
import guion               # noqa: E402


class _Relevo:
    def __init__(self):
        self.dicho = []

    def enviar(self, para, texto, parcial=False):
        self.dicho.append(texto)

    def con_botones(self, para, texto, botones):
        self.dicho.append(texto)

    def con_lista(self, para, texto, boton, filas):
        self.dicho.append(texto)

    def escribiendo(self, para):
        pass

    def ficha(self, de):
        return {}


def _perfil(**k):
    p = {'idioma': 'es', 'saludado': True, 'nombre': 'Ana', 'pais': 'honduras',
         'historial': [], 'dia': aura.hoy(), 'usadas': 0, 'nodo': None}
    p.update(k)
    return p


class LOQUECONTESTAELGUIONSEACUERDA(unittest.TestCase):
    """El hueco entre las dos mitades del sistema."""

    def _hablar(self, dicho, p=None):
        rel = _Relevo()
        p = p if p is not None else _perfil()
        aura.atender(rel, 'sistema de prueba', p, 'ana@x.com', dicho, {})
        return rel, p

    def test_una_respuesta_del_guion_queda_en_la_memoria(self):
        rel, p = self._hablar('hola')
        self.assertTrue(rel.dicho, 'no contestó nada')
        self.assertTrue(p['historial'], 'contestó y no se acordó de haberlo dicho')
        self.assertEqual(p['historial'][-1]['role'], 'assistant')

    def test_y_lo_que_queda_es_LO_QUE_LA_PERSONA_LEYO(self):
        """No el nombre del nodo: es lo único a lo que puede referirse
        después con un «eso» o un «it»."""
        rel, p = self._hablar('hola')
        self.assertEqual(p['historial'][-1]['content'][:80],
                         rel.dicho[0][:80])

    def test_tambien_queda_lo_que_PREGUNTO_la_persona(self):
        _rel, p = self._hablar('hola')
        self.assertEqual(p['historial'][0]['role'], 'user')
        self.assertEqual(p['historial'][0]['content'], 'hola')

    def test_EL_CASO_DE_LA_CAPTURA_dos_preguntas_seguidas(self):
        """La primera la contesta el guión; la segunda llega al motor CON la
        primera puesta. Es el fallo del 1-sep, reducido a dos líneas."""
        p = _perfil()
        rel, p = self._hablar('hola', p)
        primera = rel.dicho[0]

        visto = {}

        def espia(sistema, perfil, historial, dicho, *a, **k):
            visto['historial'] = list(historial)
            return 'lo que sea', 'lo que sea'

        with mock.patch.object(aura, 'preguntar_motor', espia):
            self._hablar('¿y eso en dólares cuánto es?', p)

        junto = ' '.join(m['content'] for m in visto.get('historial', []))
        self.assertIn(primera[:60], junto,
                      'el motor no vio lo que el guión acababa de contestar: '
                      'la persona pregunta «eso» y no hay ningún «eso»')

    def test_la_memoria_del_guion_tiene_EL_MISMO_TOPE_que_la_del_motor(self):
        """Dos memorias con reglas distintas es una memoria que se comporta
        de dos maneras."""
        p = _perfil()
        for _ in range(12):
            self._hablar('hola', p)
        self.assertLessEqual(len(p['historial']), aura.MEMORIA)

    def test_y_se_recorta_igual_de_largo(self):
        p = _perfil()
        aura._recordar(p, 'x' * 2000, 'y' * 2000)
        for m in p['historial']:
            self.assertLessEqual(len(m['content']), 600)

    def test_un_nodo_sin_texto_no_ensucia_la_memoria(self):
        p = _perfil()
        aura._recordar(p, 'algo', '')
        self.assertEqual(p['historial'], [])

    def test_sirve_igual_en_ingles(self):
        """La captura era en inglés, que es donde se vio."""
        p = _perfil(idioma='en')
        rel, p = self._hablar('hello', p)
        self.assertTrue(p['historial'])
        self.assertEqual(p['historial'][-1]['content'][:60], rel.dicho[0][:60])


class LAPUERTADELIDIOMANOCUENTA(unittest.TestCase):
    """Ahí todavía no hay conversación de la que acordarse: la persona no
    eligió idioma y lo único dicho es la pregunta de qué idioma habla. Meter
    eso en la memoria sería gastar dos turnos de ocho en una puerta."""

    def test_la_puerta_no_deja_huella(self):
        rel = _Relevo()
        p = {'historial': [], 'dia': aura.hoy(), 'usadas': 0}
        aura.atender(rel, 'sistema', p, 'ana@x.com', 'hola', {})
        self.assertTrue(rel.dicho, 'no mandó la puerta')
        self.assertIn('idioma', rel.dicho[0].lower())
        self.assertEqual(p['historial'], [],
                         'la puerta del idioma se comió dos turnos de memoria')


if __name__ == '__main__':
    unittest.main(verbosity=2)
