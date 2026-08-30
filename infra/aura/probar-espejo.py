#!/usr/bin/env python3
"""El espejo: Jose viendo lo que AU-RA contesta.

POR QUE ESTAS PRUEBAS EXISTEN

El espejo muestra numeros de telefono y conversaciones privadas de gente
real. Sus dos formas de fallar mal:

  1. SE LO MUESTRA A QUIEN NO ES. Regalar la agenda y las charlas de los
     clientes a cualquiera que adivine una palabra.
  2. MUESTRA LO QUE EL MOTOR RECUERDA en vez de lo que salio. Si el problema
     es que AU-RA dijo algo raro, un resumen hecho por el modelo lo taparia.
     El espejo lee las bandejas de verdad, textual.
"""

import pathlib
import re
import sys
import time
import unittest

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import espejo   # noqa: E402

AHORA = int(time.time() * 1000)
JOSE = '50432136457'


class RelevoFalso:
    def __init__(self, charlas):
        self._charlas = charlas

    def conversaciones(self):
        return [{'correo': n, 'nombre': c.get('nombre', ''),
                 'ultimo': {'cuando': c.get('cuando', AHORA)}}
                for n, c in self._charlas.items()]

    def bandeja(self, numero):
        return self._charlas.get(numero, {}).get('mensajes', [])


def _charla(nombre, hace_horas=1, mensajes=None):
    return {'nombre': nombre, 'cuando': AHORA - hace_horas * 3600000,
            'mensajes': mensajes or [
                {'de': 'x', 'texto': '¿Qué es ORIGEN?'},
                {'de': 'aura', 'texto': 'ORIGEN sigue al oro por gramo.'}]}


class SoloParaJose(unittest.TestCase):

    def test_el_que_mira_NO_sale_en_el_espejo(self):
        """Sus propias charlas ya las tiene en su WhatsApp; listarlas seria
        ruido, y en el detalle seria un espejo mirandose a si mismo."""
        rel = RelevoFalso({JOSE: _charla('Jose'), '50498782176': _charla('Medardo')})
        filas = espejo.resumen(rel, JOSE)
        self.assertEqual([f['numero'] for f in filas], ['50498782176'])
        self.assertIn('No encuentro', espejo.detalle(rel, '6457', JOSE))

    def test_el_comando_esta_detras_de_la_misma_puerta_que_el_parte(self):
        """La llave es del asistente: el bloque del espejo exige
        `vistazo.puede_pedirlo`, la misma lista del parte."""
        fuente = (AQUI / 'asistente.py').read_text(encoding='utf8')
        bloque = fuente[fuente.index('_PIDE_CHARLAS.match'):][:200]
        self.assertIn('puede_pedirlo', bloque)


class MuestraLoQueSALIO(unittest.TestCase):

    def test_el_resumen_trae_los_dos_lados_del_ultimo_intercambio(self):
        rel = RelevoFalso({'50498782176': _charla('Medardo')})
        t = espejo.texto_resumen(espejo.resumen(rel, JOSE))
        self.assertIn('Medardo', t)
        self.assertIn('¿Qué es ORIGEN?', t)
        self.assertIn('ORIGEN sigue al oro', t)
        self.assertIn('2176', t)

    def test_lo_viejo_no_estorba(self):
        rel = RelevoFalso({'50498782176': _charla('Medardo', hace_horas=1),
                           '50499080571': _charla('Melany', hace_horas=48)})
        filas = espejo.resumen(rel, JOSE)
        self.assertEqual([f['nombre'] for f in filas], ['Medardo'])

    def test_lo_mas_nuevo_va_primero(self):
        rel = RelevoFalso({'50498782176': _charla('Medardo', hace_horas=5),
                           '50494716808': _charla('Leo', hace_horas=1)})
        filas = espejo.resumen(rel, JOSE)
        self.assertEqual([f['nombre'] for f in filas], ['Leo', 'Medardo'])

    def test_no_usa_el_motor_ni_los_perfiles(self):
        """Textual o nada: un resumen del modelo taparia justo lo que se
        vino a mirar."""
        fuente = (AQUI / 'espejo.py').read_text(encoding='utf8')
        for prohibido in ['import oido', 'import motor', 'perfiles.json',
                          'ollama', 'generar']:
            self.assertNotIn(prohibido, fuente, f'usa {prohibido}')

    def test_cabe_en_whatsapp_aunque_haya_veinte_charlas(self):
        rel = RelevoFalso({f'5049900{i:04d}': _charla(f'Persona{i}')
                           for i in range(20)})
        t = espejo.texto_resumen(espejo.resumen(rel, JOSE))
        self.assertLessEqual(len(t), espejo.TOPE)


class ElDetalle(unittest.TestCase):

    def _rel(self):
        return RelevoFalso({
            '50498782176': _charla('Medardo', mensajes=[
                {'de': 'x', 'texto': 'Que es DBNX'},
                {'de': 'aura', 'texto': 'DBNX no es del ecosistema.'},
                {'de': 'x', 'texto': 'ah ok'},
                {'de': 'aura', 'texto': '¿Te cuento de ORIGEN?'}]),
            '50411112176': _charla('Otra'),
        })

    def test_encuentra_por_las_ultimas_cifras(self):
        t = espejo.detalle(self._rel(), '82176', JOSE)
        self.assertIn('Medardo', t)
        self.assertIn('DBNX', t)
        self.assertIn('¿Te cuento de ORIGEN?', t)

    def test_si_hay_varias_pide_una_cifra_mas_en_vez_de_adivinar(self):
        t = espejo.detalle(self._rel(), '2176', JOSE)
        self.assertIn('varias', t)
        self.assertNotIn('DBNX', t, 'adivinó en vez de preguntar')

    def test_lo_que_no_existe_se_dice(self):
        self.assertIn('No encuentro', espejo.detalle(self._rel(), '9999', JOSE))


class LaPalabra(unittest.TestCase):
    """El comando, con el regex del asistente de verdad."""

    def _match(self, t):
        fuente = (AQUI / 'asistente.py').read_text(encoding='utf8')
        i = fuente.index('_PIDE_CHARLAS = _re.compile(')
        j = fuente.index('def _pide_el_parte', i)
        ambito = {'_re': re}
        exec(compile(fuente[i:j], 'asistente', 'exec'), ambito)
        return ambito['_PIDE_CHARLAS'].match(t)

    def test_charlas_y_charla_con_numero(self):
        self.assertTrue(self._match('charlas'))
        self.assertTrue(self._match(' Charlas! '))
        m = self._match('charla 2176')
        self.assertTrue(m)
        self.assertEqual(m.group('sufijo'), '2176')

    def test_pero_una_frase_con_la_palabra_NO(self):
        for t in ['me gustan las charlas con vos', 'charlamos mañana?',
                  'la charla de ayer estuvo buena']:
            self.assertIsNone(self._match(t), f'atrapó: «{t}»')


if __name__ == '__main__':
    unittest.main(verbosity=2)
