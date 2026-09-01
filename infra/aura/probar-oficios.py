#!/usr/bin/env python3
"""Un oficio por area: la misma AU-RA hablando desde el sitio de cada uno.

POR QUE ESTAS PRUEBAS EXISTEN

Un oficio decide TONO Y MEMORIA. Nunca permiso. Es la unica frase que importa
de todo este archivo, y hay dos formas de romperla sin querer:

  · QUE UN OFICIO REEMPLACE EL PROMPT DE LA CASA en vez de sumarse. Ahi se
    van con el las reglas de la Junta, el guardia y todo lo demas — y el area
    con el oficio mas suelto se convierte en la puerta de atras.

  · QUE EL SABER DE UN AREA LO LEA OTRA. Lo que apunta contabilidad lleva
    cifras y nombres; que aparezca en la conversacion de mercadeo no es un
    detalle de tono, es una fuga.

Y una tercera, mas boba y mas probable: que el saber crezca hasta empujar
fuera de la ventana lo que ya estaba. La memoria nueva no puede comerse a la
vieja sin que nadie lo decida.
"""

import json
import pathlib
import sys
import tempfile
import unittest

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import escalafon   # noqa: E402
import oficios     # noqa: E402


class _Base(unittest.TestCase):
    def setUp(self):
        self.dir = pathlib.Path(tempfile.mkdtemp())


class CADAAREATIENESUOFICIO(_Base):

    def test_hay_uno_por_cada_tramo_del_escalafon(self):
        """Un tramo sin oficio no es «neutro»: es alguien a quien AU-RA le
        habla como a un desconocido sabiendo quién es."""
        for tramo in escalafon.TRAMOS:
            self.assertIn(tramo, oficios.OFICIOS, tramo)

    def test_y_ninguno_de_mas(self):
        for tramo in oficios.OFICIOS:
            self.assertIn(tramo, escalafon.TRAMOS, tramo)

    def test_cada_oficio_dice_quien_es_que_sabe_y_que_cuida(self):
        for tramo, o in oficios.OFICIOS.items():
            for campo in ('quien', 'sabe', 'cuida', 'apunta'):
                self.assertTrue(o.get(campo, '').strip(), f'{tramo}/{campo}')

    def test_el_sistema_de_un_tramo_que_no_existe_es_vacio(self):
        self.assertEqual(oficios.sistema('inventado'), '')


class UNOFICIOSESUMANOREEMPLAZA(unittest.TestCase):
    """La frase que importa: tono y memoria, nunca permiso."""

    FUENTE = (AQUI / 'asistente.py').read_text(encoding='utf8')

    def test_el_prompt_de_la_casa_sigue_estando(self):
        i = self.FUENTE.index('EL OFICIO DE QUIEN ESCRIBE')
        bloque = self.FUENTE[i:i + 1400]
        self.assertIn("sistema = sistema + '\\n\\n' + extra", bloque,
                      'el oficio REEMPLAZA el prompt de la casa: con él se van '
                      'las reglas de la Junta y el guardia')

    def test_ningun_oficio_puede_dar_permisos(self):
        """El escalafón decide quién puede qué, y no lee este archivo."""
        fuente = (AQUI / 'oficios.py').read_text(encoding='utf8')
        self.assertNotIn('import escalafon', fuente)
        self.assertNotIn('import catalogo', fuente)
        self.assertNotIn('import encargos', fuente)

    def test_ni_ejecutar_nada(self):
        fuente = (AQUI / 'oficios.py').read_text(encoding='utf8')
        for prohibido in ['subprocess', 'os.system', 'eval(', 'exec(',
                          'urllib', 'socket']:
            self.assertNotIn(prohibido, fuente, prohibido)

    def test_un_saber_ilegible_no_deja_a_nadie_sin_AURA(self):
        i = self.FUENTE.index('EL OFICIO DE QUIEN ESCRIBE')
        bloque = self.FUENTE[i:i + 1400]
        self.assertIn('except Exception', bloque,
                      'un archivo corrupto tumbaría la conversación entera')


class LOQUEAPUNTAUNAREANOLOLEEOTRA(_Base):
    """Lo que apunta contabilidad lleva cifras y nombres. Que aparezca en la
    conversación de mercadeo no es un detalle de tono: es una fuga."""

    def test_el_saber_de_contabilidad_no_sale_en_el_de_mercadeo(self):
        oficios.apuntar(self.dir, 'contable', 'mayra',
                        'la billetera de premios quedó en 205 ORIGEN')
        self.assertIn('205 ORIGEN', oficios.sistema('contable', self.dir))
        self.assertNotIn('205 ORIGEN', oficios.sistema('mercadeo', self.dir))

    def test_ni_al_reves(self):
        oficios.apuntar(self.dir, 'mercadeo', 'nicole', 'probamos el anuncio B')
        self.assertNotIn('anuncio B', oficios.sistema('contable', self.dir))

    def test_cada_area_escribe_en_su_propio_archivo(self):
        oficios.apuntar(self.dir, 'legal', 'melany', 'algo')
        oficios.apuntar(self.dir, 'contable', 'mayra', 'otra cosa')
        self.assertTrue((self.dir / 'saber-legal.jsonl').exists())
        self.assertTrue((self.dir / 'saber-contable.jsonl').exists())

    def test_el_saber_se_escribe_solo_para_su_dueno(self):
        import stat as st
        oficios.apuntar(self.dir, 'contable', 'mayra', 'cifras')
        modo = (self.dir / 'saber-contable.jsonl').stat().st_mode
        self.assertEqual(st.S_IMODE(modo) & 0o077, 0,
                         'el saber del área lo puede leer cualquiera')


class LaMemoriaNoSeComeLoQueYaEstaba(_Base):

    def test_se_queda_con_lo_MAS_NUEVO_cuando_no_cabe_todo(self):
        """Recortar por el final deja al modelo con la memoria de hace tres
        meses y sin la de ayer."""
        for i in range(200):
            oficios.apuntar(self.dir, 'legal', 'melany', f'apunte número {i} ' + 'x' * 40)
        s = oficios.sistema('legal', self.dir)
        self.assertIn('apunte número 199', s, 'perdió lo más nuevo')
        self.assertNotIn('apunte número 0 ', s, 'no recortó nada')

    def test_y_no_pasa_del_tope(self):
        for i in range(300):
            oficios.apuntar(self.dir, 'legal', 'melany', 'y' * 60)
        largo = len(oficios._lo_ultimo(self.dir, 'legal'))
        self.assertLessEqual(largo, oficios.TOPE_SABER + 80)

    def test_los_apuntes_salen_en_orden_del_mas_viejo_al_mas_nuevo(self):
        for i in range(3):
            oficios.apuntar(self.dir, 'legal', 'melany', f'paso {i}')
        t = oficios._lo_ultimo(self.dir, 'legal')
        self.assertLess(t.index('paso 0'), t.index('paso 2'))

    def test_una_linea_rota_no_se_lleva_el_resto(self):
        oficios.apuntar(self.dir, 'legal', 'melany', 'bueno')
        with open(self.dir / 'saber-legal.jsonl', 'a', encoding='utf8') as f:
            f.write('{esto no es json\n')
        oficios.apuntar(self.dir, 'legal', 'melany', 'también bueno')
        textos = [a['texto'] for a in oficios.apuntes(self.dir, 'legal')]
        self.assertEqual(textos, ['bueno', 'también bueno'])

    def test_sin_ningun_apunte_el_oficio_igual_sirve(self):
        s = oficios.sistema('legal', self.dir)
        self.assertIn('cumplimiento', s)
        self.assertNotIn('Lo último que anotó', s)

    def test_sin_carpeta_no_revienta(self):
        self.assertEqual(oficios.apuntes(pathlib.Path('/no/existe'), 'legal'), [])


class LOQUECADAOFICIONOPUEDEDECIR(_Base):
    """Las prohibiciones de la Junta, por área. No reemplazan al guardia — se
    suman, y por eso importan: son lo que ese oficio tiene MÁS a mano."""

    def test_legal_lleva_encima_lo_del_respaldo(self):
        s = oficios.sistema('legal')
        self.assertIn('no están respaldados', s)
        self.assertIn('REFERENCIA', s)
        self.assertIn('ONDK', s)

    def test_legal_no_puede_decir_que_estamos_regulados(self):
        self.assertIn('regulada', oficios.OFICIOS['legal']['cuida'])

    def test_mercadeo_lleva_encima_lo_de_no_prometer(self):
        c = oficios.OFICIOS['mercadeo']['cuida']
        for palabra in ['ganancia', 'revalorización', 'rendimiento']:
            self.assertIn(palabra, c)

    def test_tecnologia_no_cuenta_como_esta_armada_la_casa(self):
        self.assertIn('infraestructura', oficios.OFICIOS['tecnologico']['cuida'])

    def test_contabilidad_no_da_saldos_de_memoria(self):
        self.assertIn('de memoria', oficios.OFICIOS['contable']['cuida'])

    def test_lo_que_cuida_cada_uno_viaja_MARCADO(self):
        """Enterrado entre el resto del prompt, un «nunca» se diluye."""
        for tramo in oficios.OFICIOS:
            self.assertIn('MUY IMPORTANTE', oficios.sistema(tramo))

    def test_ningun_oficio_promete_nada_por_su_cuenta(self):
        """El oficio es texto que va al modelo: si el oficio mismo promete,
        el modelo lo repite con toda naturalidad."""
        prohibidas = ['garantiza', 'asegurá que van a ganar', 'rentabilidad',
                      'te conviene invertir']
        for tramo, o in oficios.OFICIOS.items():
            entero = ' '.join(o.values()).lower()
            for mala in prohibidas:
                self.assertNotIn(mala, entero, f'{tramo}: «{mala}»')


if __name__ == '__main__':
    unittest.main(verbosity=2)
