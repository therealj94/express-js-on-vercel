#!/usr/bin/env python3
"""Lo que la voz ya dijo una vez no se vuelve a fabricar.

MEDIDO EN EL NODO, ANTES DE ESTO

    frase corta   (16 letras) →  1,6 s
    típica       (125 letras) →  8,2 s
    larga        (224 letras) → 22,4 s
    primera tras arrancar     → 23,8 s   ← peaje de arranque en frío

Y la MISMA frase dos veces seguidas: 1,63 s y 1,58 s. Se fabricaba de nuevo
cada vez; no había memoria de ninguna clase.

Y eso no es sólo lentitud: es lo que MATÓ las notas de voz. Están retiradas
—lo dice la cabecera de `voz.py`— porque costaban 657 segundos de GPU al día y
causaban esperas de 21 a 59 segundos. Las dos cosas salen de lo mismo: se
pagaba entera cada vez, y la mayor parte de lo que AU-RA dice es siempre lo
mismo.
"""

import pathlib
import sys
import tempfile
import time
import unittest

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import vozmemoria   # noqa: E402

MP3 = b'\xff\xfb' + b'x' * 5000


class SEACUERDADELOQUEYADIJO(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()

    def test_lo_guardado_se_encuentra(self):
        vozmemoria.guardar(self.d, 'Hola', 'calida', 'es', MP3)
        self.assertEqual(vozmemoria.buscar(self.d, 'Hola', 'calida', 'es'), MP3)

    def test_lo_que_no_se_guardo_no_esta(self):
        self.assertIsNone(vozmemoria.buscar(self.d, 'Hola', 'calida', 'es'))

    def test_UNA_COMA_distinta_es_otro_audio(self):
        """Si no, se serviría un audio que dice otra cosa — y eso es peor que
        tardar. Es la misma regla que en `voz-grabada`."""
        vozmemoria.guardar(self.d, 'Hola, Ana', 'calida', 'es', MP3)
        self.assertIsNone(vozmemoria.buscar(self.d, 'Hola Ana', 'calida', 'es'))

    def test_OTRA_VOZ_es_otro_audio(self):
        vozmemoria.guardar(self.d, 'Hola', 'calida', 'es', MP3)
        self.assertIsNone(vozmemoria.buscar(self.d, 'Hola', 'agil', 'es'))

    def test_OTRO_IDIOMA_es_otro_audio(self):
        """Servir el de al lado sería una voz española leyendo inglés."""
        vozmemoria.guardar(self.d, 'Hello', 'calida', 'es', MP3)
        self.assertIsNone(vozmemoria.buscar(self.d, 'Hello', 'calida', 'en'))

    def test_un_audio_vacio_no_se_guarda(self):
        """Guardar el vacío sería recordar un fallo y servirlo para siempre."""
        self.assertFalse(vozmemoria.guardar(self.d, 'x', 'calida', 'es', b''))
        self.assertIsNone(vozmemoria.buscar(self.d, 'x', 'calida', 'es'))

    def test_se_escribe_DE_UNA_PIEZA(self):
        """A medio escribir, la próxima serviría un audio cortado."""
        self.assertIn('os.replace', (AQUI / 'vozmemoria.py').read_text())


class GUARDARNOPUEDEDEJARLAMUDA(unittest.TestCase):
    """Si guardar falla, lo peor que pasa es que se fabrique otra vez. Que un
    disco lleno deje a AU-RA muda sería cambiar un problema chico por uno
    grande."""

    def test_una_carpeta_imposible_no_lanza(self):
        """Se cuelga la carpeta DE UN FICHERO, que no se puede crear de
        ninguna manera. La primera versión usaba «/no/existe/jamas» y pasaba:
        corriendo como root, `mkdir(parents=True)` la creaba tan tranquilo — la
        prueba no probaba nada y encima ensuciaba la raíz."""
        suelo = pathlib.Path(tempfile.mkdtemp(), 'soy-un-fichero')
        suelo.write_text('x')
        self.assertFalse(
            vozmemoria.guardar(str(suelo / 'dentro'), 'x', 'v', 'es', MP3))

    def test_buscar_en_una_carpeta_imposible_tampoco(self):
        suelo = pathlib.Path(tempfile.mkdtemp(), 'soy-un-fichero')
        suelo.write_text('x')
        self.assertIsNone(vozmemoria.buscar(str(suelo / 'dentro'), 'x', 'v', 'es'))

    def test_limpiar_tampoco(self):
        suelo = pathlib.Path(tempfile.mkdtemp(), 'soy-un-fichero')
        suelo.write_text('x')
        self.assertEqual(vozmemoria.limpiar(str(suelo / 'dentro')), 0)


class LOQUESEUSANOCADUCA(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()

    def test_lo_viejo_se_va(self):
        vozmemoria.guardar(self.d, 'viejo', 'v', 'es', MP3)
        n = vozmemoria.limpiar(self.d,
                               ahora=time.time() + (vozmemoria.DIAS + 1) * 86400)
        self.assertEqual(n, 1)
        self.assertIsNone(vozmemoria.buscar(self.d, 'viejo', 'v', 'es'))

    def test_lo_reciente_se_queda(self):
        vozmemoria.guardar(self.d, 'nuevo', 'v', 'es', MP3)
        vozmemoria.limpiar(self.d)
        self.assertIsNotNone(vozmemoria.buscar(self.d, 'nuevo', 'v', 'es'))

    def test_USARLO_lo_rejuvenece(self):
        """Caduca por no usarse, no por viejo. Sin esto, el saludo —lo más
        pedido de todo— se borraría a los treinta días justo por haber sido el
        primero en fabricarse."""
        vozmemoria.guardar(self.d, 'saludo', 'v', 'es', MP3)
        f = pathlib.Path(self.d, 'memoria',
                         vozmemoria.llave('saludo', 'v', 'es') + '.mp3')
        import os
        viejo = time.time() - (vozmemoria.DIAS + 5) * 86400
        os.utime(f, (viejo, viejo))
        vozmemoria.buscar(self.d, 'saludo', 'v', 'es')       # se usa
        self.assertEqual(vozmemoria.limpiar(self.d), 0,
                         'borró el audio que se acababa de usar')

    def test_hay_TOPE_de_tamaño(self):
        """Esto vive en la misma máquina que sostiene el modelo. Una memoria
        sin tope crece hasta que un día no arranca nada."""
        self.assertTrue(0 < vozmemoria.TOPE_MB <= 5000)

    def test_cuanto_cuenta_lo_que_hay(self):
        for i in range(3):
            vozmemoria.guardar(self.d, f'f{i}', 'v', 'es', MP3)
        n, mb = vozmemoria.cuanto(self.d)
        self.assertEqual(n, 3)
        self.assertGreater(mb, 0)


class NOSEGUARDATEXTONIQUIENLOPIDIO(unittest.TestCase):
    """Un fichero de esa carpeta es una voz diciendo algo que AU-RA ya dijo en
    público. No dice a quién, y no se puede caminar de vuelta hasta nadie."""

    def test_el_nombre_del_fichero_no_deja_leer_el_texto(self):
        d = tempfile.mkdtemp()
        vozmemoria.guardar(d, 'Dale, Ana, te mando tu ORIGEN', 'v', 'es', MP3)
        nombres = [f.name for f in pathlib.Path(d, 'memoria').glob('*')]
        self.assertTrue(nombres)
        for n in nombres:
            self.assertNotIn('Ana', n)
            self.assertNotIn('ORIGEN', n)

    def test_no_se_escribe_ningun_indice_de_texto(self):
        d = tempfile.mkdtemp()
        vozmemoria.guardar(d, 'Dale, Ana', 'v', 'es', MP3)
        for f in pathlib.Path(d).rglob('*'):
            if f.is_file():
                self.assertNotIn(b'Ana', f.read_bytes()[:200])

    def test_aun_asi_CADUCA(self):
        """Lo que AU-RA improvisa lleva a veces el nombre de quien preguntó, y
        eso no tiene por qué quedarse en un disco para siempre. Treinta días,
        el mismo plazo que los perfiles de la web."""
        self.assertEqual(vozmemoria.DIAS, 30)


class ENCHUFADAALAVOZ(unittest.TestCase):
    def test_decir_MIRA_la_memoria_antes_de_fabricar(self):
        fuente = (AQUI / 'voz.py').read_text()
        i = fuente.index('def decir(self, texto')
        cuerpo = fuente[i:i + 3000]
        self.assertLess(cuerpo.index('vozmemoria.buscar'),
                        cuerpo.index('self.modelo.generate'),
                        'fabrica antes de mirar si ya lo tenía')

    def test_y_GUARDA_lo_que_fabrica(self):
        self.assertIn('vozmemoria.guardar(MEMORIA_DIR',
                      (AQUI / 'voz.py').read_text())

    def test_la_voz_SE_TEMPLA_antes_de_decir_que_esta_lista(self):
        """La primera frase tras arrancar tardaba 23,8 s y la misma un minuto
        después, 1,6. Veintidós segundos de peaje que pagaba una persona de
        verdad — y como el servicio se reinicia con cada despliegue, seguido."""
        # Hay DOS `cargar`: el del oído (Whisper) y el de la voz. Se ancla en
        # el de Chatterbox, que es el que importa aquí — la primera versión de
        # esta prueba encontraba el otro y reventaba sin decir por qué.
        fuente = (AQUI / 'voz.py').read_text()
        i = fuente.index('ChatterboxMultilingualTTS.from_pretrained')
        cuerpo = fuente[i:i + 2500]
        self.assertLess(cuerpo.index("self.modelo.generate('Hola.'"),
                        cuerpo.index('self.listo.set()'),
                        'se declara lista antes de estar templada')

    def test_y_si_el_templado_falla_la_voz_ARRANCA_IGUAL(self):
        """Peor lenta que muda."""
        fuente = (AQUI / 'voz.py').read_text()
        i = fuente.index("self.modelo.generate('Hola.'")
        self.assertIn('except Exception', fuente[i:i + 900])


if __name__ == '__main__':
    unittest.main(verbosity=2)
