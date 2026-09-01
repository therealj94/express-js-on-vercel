#!/usr/bin/env python3
"""Quién es quién. El archivo que decide TODOS los permisos, y no tenía prueba.

POR QUÉ ESTE ARCHIVO APARECE TAN TARDE

Salió de una revisión de cobertura: `escalafon.py` son 256 líneas, y todo el
sistema le pregunta a él —el parte (`vistazo.puede_pedirlo`), el espejo con las
conversaciones privadas de la gente (`es_admin`), la puerta de los encargos
(`tramo_de`), la firma de lo que se ejecuta (`admins`), y el portal público—.
Era el archivo con más consecuencias por línea de todo el proyecto y el único
crítico con cero pruebas.

Las piezas chicas tienen dos líneas de prueba por cada una de código. Esta
tenía cero, precisamente por ser vieja: se escribió antes de que colgara tanto
de ella y nadie volvió a mirarla.

LO QUE SE VIGILA, EN ORDEN DE LO QUE DUELE

  1. Que se caiga CERRADO. Una lista rota deja a todo el mundo afuera, nunca
     adentro.
  2. Que dos maneras de escribir el mismo teléfono sean la misma persona — y
     que dos personas distintas no se confundan jamás.
  3. Que un admin sea admin y nadie más lo sea.
"""

import os
import pathlib
import sys
import unittest

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import escalafon  # noqa: E402

REAL = escalafon.recargar   # se restaura en cada prueba


class _Con:
    """Carga una lista y devuelve la de verdad al salir."""

    def __init__(self, crudo):
        self.crudo = crudo

    def __enter__(self):
        escalafon.recargar(self.crudo)
        return escalafon

    def __exit__(self, *_):
        escalafon.recargar()
        return False


class SECAECERRADO(unittest.TestCase):
    """Lo primero, porque es lo que decide qué pasa el día que algo se rompe."""

    def test_una_lista_vacia_no_le_da_permisos_a_nadie(self):
        with _Con(''):
            for quien in ['50432136457', 'j.ordonez@ordenglobal.org', 'x']:
                self.assertFalse(escalafon.es_admin(quien), quien)
                self.assertIsNone(escalafon.tramo_de(quien), quien)
                self.assertFalse(escalafon.tramos_de(quien), quien)
            self.assertEqual(list(escalafon.admins()), [])

    def test_una_lista_ROTA_tampoco(self):
        for basura in ['???', ':::', 'sin dos puntos', ',,,', 'a:b:c:d',
                       '50432136457', ':admin', '50432136457:']:
            with _Con(basura):
                self.assertFalse(escalafon.es_admin('50432136457'), basura)

    def test_un_tramo_MAL_ESCRITO_deja_fuera_no_degrada(self):
        """Degradar en silencio es como alguien termina con permisos que nadie
        le dio — o los pierde sin que nadie lo note."""
        with _Con('50432136457:admnistrador'):
            self.assertFalse(escalafon.tramos_de('50432136457'))
            self.assertFalse(escalafon.es_admin('50432136457'))

    def test_un_tramo_bueno_y_uno_malo_juntos(self):
        """El bueno vale; el malo NO se cuela ni se convierte en otra cosa."""
        with _Con('50432136457:legal+inventado'):
            t = escalafon.tramos_de('50432136457')
            self.assertIn('legal', t)
            self.assertNotIn('inventado', t)
            self.assertFalse(escalafon.es_admin('50432136457'))

    def test_NADIE_es_admin_por_descuido(self):
        """La prueba que de verdad importa: con cualquier lista razonable, el
        que no está puesto como admin no lo es."""
        with _Con('50432136457:admin, 50499999999:legal, 50488888888:mercadeo'):
            self.assertTrue(escalafon.es_admin('50432136457'))
            for otro in ['50499999999', '50488888888', '50400000000',
                         'cualquiera@x.com', '', None, 'admin']:
                self.assertFalse(escalafon.es_admin(otro), repr(otro))


class ELMISMOTELEFONOESLAMISMAPERSONA(unittest.TestCase):
    """«+504 3213-6457» y «50432136457» tienen que ser la misma.

    Si no, la de la derecha tiene permisos que la de la izquierda no, y es la
    clase de diferencia que nadie ve hasta que falla.
    """

    def test_da_igual_como_se_escriba_el_numero(self):
        with _Con('50432136457:admin'):
            for forma in ['50432136457', '+50432136457', '+504 3213-6457',
                          ' 504 3213 6457 ', '(504) 3213-6457']:
                self.assertTrue(escalafon.es_admin(forma), forma)

    def test_el_correo_da_igual_en_mayusculas(self):
        with _Con('J.Ordonez@OrdenGlobal.org:admin'):
            self.assertTrue(escalafon.es_admin('j.ordonez@ordenglobal.org'))
            self.assertTrue(escalafon.es_admin('J.ORDONEZ@ORDENGLOBAL.ORG'))

    def test_pero_DOS_PERSONAS_DISTINTAS_no_se_confunden(self):
        """Lo de arriba al revés, que es el fallo caro: si normalizar de más
        juntara a dos, una heredaría los permisos de la otra."""
        with _Con('50432136457:admin, 50432136458:legal'):
            self.assertTrue(escalafon.es_admin('50432136457'))
            self.assertFalse(escalafon.es_admin('50432136458'))

    def test_un_numero_que_CONTIENE_a_otro_no_es_el_otro(self):
        with _Con('3213:admin'):
            self.assertFalse(escalafon.es_admin('50432136457'),
                             'un trozo del número dio permisos de admin')
            self.assertFalse(escalafon.es_admin('32130'))

    def test_el_telefono_y_el_correo_de_uno_son_UNA_persona(self):
        """Si contaran como dos, esa persona firmaría dos veces y la regla de
        «hacen falta dos» se cae sola."""
        with _Con('50432136457/j.ordonez@ordenglobal.org:admin, '
                  '50498782176:admin'):
            self.assertEqual(
                escalafon.persona_de('50432136457'),
                escalafon.persona_de('j.ordonez@ordenglobal.org'))
            self.assertEqual(len(list(escalafon.admins())), 2,
                             'una persona con dos buzones contó como dos admin')


class LOQUEELPORTALNECESITA(unittest.TestCase):
    """El portal público apoya toda su seguridad en esto."""

    def test_un_nombre_con_dos_puntos_NO_puede_estar_en_la_lista(self):
        """Es la defensa entera de `portal.py`: la sesión de la web lleva dos
        puntos, que es el separador del fichero, así que una línea con ese
        nombre no se puede escribir."""
        with _Con('web:AAAAAAAAAAAAAAAAAAAAAA:admin'):
            self.assertFalse(escalafon.es_admin('web:AAAAAAAAAAAAAAAAAAAAAA'))
            self.assertFalse(escalafon.tramos_de('web:AAAAAAAAAAAAAAAAAAAAAA'))

    def test_y_tampoco_al_reves_por_el_lado_del_correo(self):
        with _Con('50432136457:admin'):
            self.assertIsNone(escalafon.persona_de('web:AAAAAAAAAAAAAAAAAAAAAA'))


class LOSDOSQUEFIRMAN(unittest.TestCase):
    def test_con_un_solo_admin_no_hay_con_quien_aprobar(self):
        """Un admin solo no puede firmar lo suyo: una firma que se pone uno
        mismo no es una firma."""
        with _Con('50432136457:admin, 50499999999:legal'):
            solo = escalafon.persona_de('50432136457')
            self.assertFalse(escalafon.hay_con_quien_aprobar(sin_contar=solo))

    def test_con_dos_si(self):
        with _Con('50432136457:admin, 50498782176:admin'):
            uno = escalafon.persona_de('50432136457')
            self.assertTrue(escalafon.hay_con_quien_aprobar(sin_contar=uno))


HAY_LISTA = bool(os.environ.get('AURA_ESCALAFON', '').strip())


@unittest.skipUnless(HAY_LISTA, 'AURA_ESCALAFON solo está puesta en el nodo')
class LOQUEESTAPUESTOHOY(unittest.TestCase):
    """Sobre la lista de VERDAD. Si alguien la cambia mal, esto avisa.

    Se salta en la máquina de desarrollo —ahí la lista no existe— y corre en el
    nodo, que es donde vale. El guardia mira la variable de entorno de verdad,
    no una que este archivo haya puesto: en `probar-pagador.py` escribí un
    guardia que se saltaba SIEMPRE, también donde tenía que correr, y el
    `skipped=1` del final parecía de lo más normal.
    """

    def test_hay_exactamente_dos_admin(self):
        self.assertEqual(len(list(escalafon.admins())), 2,
                         'cambió cuántos admin hay: si es a propósito, '
                         'actualizá esta prueba; si no, mirá AURA_ESCALAFON')

    def test_y_por_lo_tanto_se_puede_firmar(self):
        for persona in escalafon.admins():
            self.assertTrue(escalafon.hay_con_quien_aprobar(sin_contar=persona),
                            'quedó un admin que no tiene quién le firme')

    def test_todo_el_mundo_de_la_lista_tiene_un_tramo_conocido(self):
        for persona in escalafon.admins():
            for donde in escalafon.formas_de(persona):
                for t in escalafon.tramos_de(donde):
                    self.assertIn(t, escalafon.TRAMOS, t)

    def test_un_desconocido_sigue_sin_poder_nada(self):
        for quien in ['50400000000', 'nadie@ejemplo.com', 'admin', '0']:
            self.assertFalse(escalafon.es_admin(quien), quien)
            self.assertIsNone(escalafon.tramo_de(quien), quien)


if __name__ == '__main__':
    unittest.main(verbosity=2)
