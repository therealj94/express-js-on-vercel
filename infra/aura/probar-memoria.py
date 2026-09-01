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


# CADA PRUEBA CON SU PROPIA IDENTIDAD, y no es un detalle de estilo.
#
# `asistente.hay_rafaga(de)` es un freno GLOBAL: seis preguntas en sesenta
# segundos y corta. Con todas las pruebas hablando como «ana@x.com», la
# séptima llamada del archivo se comía el freno y fallaba una prueba que no
# tenía nada que ver — y peor, fallaba SOLO al correr el archivo entero, que
# es como se pierde media hora buscando un fallo que no existe.
#
# El freno hace bien su trabajo. Lo que estaba mal eran las pruebas.
def _quien(caso):
    return f'{caso.id().rsplit(".", 1)[-1]}@prueba.local'


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
        aura.atender(rel, 'sistema de prueba', p, _quien(self), dicho, {})
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
        aura.atender(rel, 'sistema', p, _quien(self), 'hola', {})
        self.assertTrue(rel.dicho, 'no mandó la puerta')
        self.assertIn('idioma', rel.dicho[0].lower())
        self.assertEqual(p['historial'], [],
                         'la puerta del idioma se comió dos turnos de memoria')




class ELIDIOMASIGUEALAPERSONA(unittest.TestCase):
    """La puerta pregunta el idioma UNA VEZ y lo guarda. Y no volvía a mirar.

    El motor sí seguía a la persona —se lo dice el prompt— así que el sistema
    se comportaba de dos maneras: el motor te seguía, el guión no. Quien
    cambiaba de idioma recibía media conversación en cada uno.

    Es la queja de José del 30-ago: «me cambió el idioma».
    """

    def _hablar(self, dicho, p):
        rel = _Relevo()
        aura.atender(rel, 'sistema', p, _quien(self), dicho, {})
        return rel, p

    def test_quien_eligio_español_y_escribe_en_ingles_recibe_ingles(self):
        p = _perfil(idioma='es')
        self._hablar('hello', p)
        self.assertEqual(p['idioma'], 'en')

    def test_y_al_reves(self):
        p = _perfil(idioma='en')
        self._hablar('hola, quiero abrir mi billetera', p)
        self.assertEqual(p['idioma'], 'es')

    def test_lo_AMBIGUO_no_le_cambia_el_idioma_a_nadie(self):
        """«ok», «sí», un nombre o un número no deciden nada. Cambiárselo a
        quien no lo pidió se lee como que la máquina se equivocó."""
        for dicho in ['ok', 'si', 'Maria', '123', '👍', 'no']:
            p = _perfil(idioma='es')
            self._hablar(dicho, p)
            self.assertEqual(p['idioma'], 'es', f'«{dicho}» le cambió el idioma')

    def test_el_guion_contesta_en_el_idioma_del_MENSAJE(self):
        """Es lo que fallaba: el guión iba por el guardado."""
        p = _perfil(idioma='es')
        rel, _p = self._hablar('hello', p)
        self.assertTrue(rel.dicho)
        # El nodo `inicio` en inglés no lleva tildes ni palabras españolas.
        self.assertNotIn('ahorrás', rel.dicho[0])

    def test_una_tilde_es_español_y_no_hay_vuelta_de_hoja(self):
        self.assertEqual(guion.en_que_habla('¿cuánto?'), 'es')
        self.assertEqual(guion.en_que_habla('el niño'), 'es')

    def test_hace_falta_ventaja_clara_no_una_palabra_suelta(self):
        """«me» y «no» existen en los dos. Con una sola palabra en común se
        cambiaría de idioma por nada."""
        self.assertIsNone(guion.en_que_habla('me no'))
        self.assertIsNone(guion.en_que_habla('the'))

if __name__ == '__main__':
    unittest.main(verbosity=2)
