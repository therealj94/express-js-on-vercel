#!/usr/bin/env python3
"""«Quiero ganar 1 ORIGEN»: el juego que regala dinero de verdad.

POR QUE ESTAS PRUEBAS EXISTEN

Porque esto entrega DINERO. Un ORIGEN es un gramo de oro entre cincuenta y
cinco, y si mil personas lo reclaman son mil gramos entre cincuenta y cinco que
salen de una billetera real. Un fallo aquí no es una respuesta fea: es plata.

Falla de cuatro formas y las cuatro cuestan:

  1. SE PUEDE REPETIR. Es la única que cuesta dinero directamente, y por eso
     hay DOS llaves: teléfono y billetera. Con una sola, la misma persona cobra
     dos veces —con dos números, o con dos billeteras—.

  2. SE PAGA A LA DIRECCIÓN EQUIVOCADA. Una dirección mal leída manda el premio
     al aire, y en una cadena eso no se deshace.

  3. ATRAPA. Alguien empieza el juego, se aburre y pregunta otra cosa: si el
     juego no lo suelta, queda dando vueltas pidiéndole una billetera.

  4. REPRUEBA. El examen es una clase, no un filtro: quien se equivoca aprende
     y sigue. Un juego que te deja afuera es dinero de captación tirado con la
     persona ya enganchada.
"""

import json
import pathlib
import re
import sys
import tempfile
import time
import unittest

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import premio   # noqa: E402
import guardia  # noqa: E402

UNA = '0x1111111111111111111111111111111111111111'
OTRA = '0x2222222222222222222222222222222222222222'


def limpio():
    premio.preparar(pathlib.Path(tempfile.mkdtemp()))


def jugar_bien():
    """Una partida entera contestando todo bien."""
    e = premio.arrancar()
    for r in ['el oro', 'entre cincuenta y cinco', 'a nadie']:
        premio.responder(e, r)
    return e


class NoSePuedeCobrarDosVeces(unittest.TestCase):
    """La única forma de fallar que cuesta dinero directamente."""

    def setUp(self):
        limpio()

    def test_el_mismo_telefono_no_cobra_dos_veces(self):
        self.assertEqual(premio.anotar('50499999999', UNA, 3), (True, None))
        ok, motivo = premio.anotar('50499999999', OTRA, 3)
        self.assertFalse(ok)
        self.assertEqual(motivo, 'telefono')

    def test_LA_MISMA_BILLETERA_TAMPOCO_desde_otro_numero(self):
        """Es la mitad que se olvida. Un número nuevo cuesta poco; si la
        billetera no contara, comprar chips sería el negocio."""
        premio.anotar('50411111111', UNA, 3)
        ok, motivo = premio.anotar('50422222222', UNA, 3)
        self.assertFalse(ok)
        self.assertEqual(motivo, 'billetera')

    def test_la_billetera_no_distingue_mayusculas(self):
        """Las direcciones se escriben con mayúsculas y minúsculas mezcladas.
        Si el registro no las iguala, la misma billetera cobra dos veces con
        solo cambiarle una letra de caja."""
        premio.anotar('50411111111', UNA.lower(), 3)
        ok, _ = premio.anotar('50422222222', UNA.upper().replace('0X', '0x'), 3)
        self.assertFalse(ok)

    def test_se_vuelve_a_comprobar_AL_ANOTAR_y_no_solo_antes(self):
        """Entre que alguien empieza el juego y manda su dirección pueden pasar
        minutos, y en ese rato pudo cobrar por otra vía."""
        self.assertIsNone(premio.ya_reclamo(telefono='50433333333'))
        premio.anotar('50433333333', UNA, 3)
        ok, _ = premio.anotar('50433333333', OTRA, 3)
        self.assertFalse(ok, 'anotó sin volver a comprobar')

    def test_ya_reclamo_mira_las_dos_llaves(self):
        premio.anotar('50444444444', UNA, 3)
        self.assertEqual(premio.ya_reclamo(telefono='50444444444'), 'telefono')
        self.assertEqual(premio.ya_reclamo(direccion=UNA), 'billetera')
        self.assertIsNone(premio.ya_reclamo(telefono='50455555555', direccion=OTRA))


class LaDireccion(unittest.TestCase):

    def test_se_lee_aunque_venga_con_texto_alrededor(self):
        """La gente pega la dirección con un «esta es» adelante o un emoji
        detrás. Rechazarla por eso es perder a alguien en el último paso."""
        for dicho in [UNA, f'esta es mi billetera {UNA}', f'{UNA} 🙏',
                      f'listo!! {UNA} gracias']:
            self.assertEqual(premio.leer_direccion(dicho), UNA.lower())

    def test_lo_que_no_es_una_direccion_no_se_confunde(self):
        for dicho in ['no la encuentro', '0x123', 'mi correo es a@b.com',
                      '', 'ya la mandé']:
            self.assertIsNone(premio.leer_direccion(dicho))

    def test_LA_BILLETERA_DE_LOS_PREMIOS_SE_RECHAZA(self):
        """Alguien la copia de algún sitio y la manda como suya. Pagarse a uno
        mismo no tiene sentido, y peor: haría que el registro la marque como
        cobrada y nadie más pudiera usarla."""
        self.assertIsNotNone(premio.problema_con(premio.BILLETERA_PREMIOS.lower()))

    def test_TAMBIEN_se_rechaza_la_billetera_VIEJA_de_premios(self):
        """La de premios cambió, y la vieja anduvo circulando: está en
        mensajes, en notas y en la versión anterior del archivo. Alguien la
        puede pegar de buena fe. Si solo se rechazara la que paga hoy, mandarnos
        la vieja sería un premio pagado a una cuenta nuestra — y en una cadena
        eso no se deshace."""
        vieja = '0x746268404cc9ca2ef0ac344f02b236db232c3ad8'
        self.assertIsNotNone(premio.problema_con(vieja))
        self.assertIsNotNone(premio.problema_con(vieja.upper().replace('0X', '0x')))

    def test_ninguna_billetera_nuestra_se_puede_cobrar(self):
        for w in premio.BILLETERAS_INTERNAS:
            self.assertIsNotNone(premio.problema_con(w), w)

    def test_la_de_alguien_mas_SI_se_paga(self):
        self.assertIsNone(
            premio.problema_con('0x1111111111111111111111111111111111111111'))
        self.assertIsNone(premio.problema_con(UNA))

    def test_la_de_premios_tiene_forma_valida(self):
        self.assertRegex(premio.BILLETERA_PREMIOS, r'^0x[0-9a-fA-F]{40}$')


class ElExamenEsUnaClase(unittest.TestCase):
    """Quien se equivoca aprende y sigue. Ver la cabecera del módulo."""

    def test_equivocarse_no_deja_a_nadie_afuera(self):
        e = premio.arrancar()
        for _ in range(len(premio.PREGUNTAS)):
            texto, termino = premio.responder(e, 'ni idea')
            self.assertTrue(texto)
        self.assertTrue(termino)
        self.assertEqual(e['aciertos'], 0)

    def test_pero_se_le_ENSEÑA_la_respuesta(self):
        e = premio.arrancar()
        texto, _ = premio.responder(e, 'no sé')
        self.assertIn('oro', texto.lower(), 'no le enseñó la respuesta')

    def test_acertar_se_reconoce(self):
        e = premio.arrancar()
        texto, _ = premio.responder(e, 'sigue al oro')
        self.assertIn('!', texto)
        self.assertEqual(e['aciertos'], 1)

    def test_las_respuestas_se_aceptan_como_las_escribe_la_gente(self):
        for r in ['oro', 'el oro', 'al oro', 'ORO', 'sigue el oro pues']:
            e = premio.arrancar()
            premio.responder(e, r)
            self.assertEqual(e['aciertos'], 1, f'no aceptó «{r}»')

    def test_el_cincuenta_y_cinco_en_numero_o_en_letra(self):
        for r in ['55', 'cincuenta y cinco', 'entre 55']:
            e = premio.arrancar()
            premio.responder(e, 'oro')
            premio.responder(e, r)
            self.assertEqual(e['aciertos'], 2, f'no aceptó «{r}»')

    def test_LA_TERCERA_ES_LA_QUE_JUSTIFICA_EL_PREMIO(self):
        """«¿A quién le podés dar tu frase de respaldo?» — a nadie. Es la única
        lección que evita que a alguien le vacíen la billetera, y aquí se
        aprende cobrando en vez de perdiendo."""
        q = premio.PREGUNTAS[-1]
        self.assertIn('respaldo', premio._en(q['pregunta'], 'es').lower())
        self.assertIn('recovery phrase', premio._en(q['pregunta'], 'en').lower())
        # Se acepta la respuesta en cualquiera de los dos idiomas: quien va por
        # el camino en inglés y contesta «a nadie» acertó igual.
        for r in ['a nadie', 'nadie', 'a ninguno', 'solo yo',
                  'no one', 'nobody', 'only me']:
            self.assertTrue(q['acierta'].search(premio._llano(r)), r)
        # Y si se equivoca, la enseñanza es tajante en los dos.
        self.assertIn('nadie', premio._en(q['ensena'], 'es').lower())
        self.assertIn('rob', premio._en(q['ensena'], 'es').lower())
        self.assertIn('nobody', premio._en(q['ensena'], 'en').lower())
        self.assertIn('robbing', premio._en(q['ensena'], 'en').lower())


class NoAtrapaAlQueSeAburre(unittest.TestCase):

    def test_el_juego_termina_despues_de_las_preguntas(self):
        e = jugar_bien()
        self.assertIsNone(premio.pregunta_de(e))
        self.assertEqual(premio.responder(e, 'lo que sea'), (None, True))


class ElPagoNoSaleSOLO(unittest.TestCase):
    """Este módulo comprueba y deja listo. No manda dinero.

    Mandarlo solo obligaría a poner una llave privada con fondos en la misma
    máquina que corre un modelo y habla con internet. Esa es una decisión de
    José, no una que se toma escribiendo código.
    """

    def setUp(self):
        limpio()

    def test_un_reclamo_queda_SIN_pagar(self):
        premio.anotar('50466666666', UNA, 3)
        (r,) = premio.por_pagar()
        self.assertFalse(r['pagado'])
        self.assertIsNone(r['tx'])
        self.assertEqual(r['direccion'], UNA)

    def test_NO_HAY_NADA_QUE_FIRME_NI_MANDE_UNA_TRANSACCION(self):
        fuente = (AQUI / 'premio.py').read_text(encoding='utf8')
        for peligro in ['eth_sendRawTransaction', 'privateKey', 'llave_privada',
                        'sign(', 'PRIVADA']:
            self.assertNotIn(peligro, fuente,
                             f'el módulo del premio toca «{peligro}»')

    def test_marcarlo_pagado_deja_el_hash(self):
        premio.anotar('50477777777', UNA, 3)
        self.assertTrue(premio.marcar_pagado(UNA, '0xabc'))
        self.assertEqual(premio.por_pagar(), [])
        # Se comprueban los campos que importan y no el diccionario entero:
        # añadirle uno nuevo no puede romper una prueba que habla de pagos.
        r = premio.resumen()
        self.assertEqual((r['reclamos'], r['por_pagar'], r['pagados']), (1, 0, 1))

    def test_no_se_paga_dos_veces_el_mismo(self):
        premio.anotar('50488888888', UNA, 3)
        premio.marcar_pagado(UNA, '0xabc')
        self.assertFalse(premio.marcar_pagado(UNA, '0xdef'))


class ElArchivo(unittest.TestCase):

    def test_se_guarda_con_permisos_600(self):
        """Ahí dentro hay teléfonos y direcciones de billetera de personas."""
        limpio()
        premio.anotar('50499999999', UNA, 3)
        import os
        m = oct(premio._archivo().stat().st_mode & 0o777)
        self.assertEqual(m, '0o600', f'permisos {m}')

    def test_sobrevive_a_un_reinicio(self):
        limpio()
        premio.anotar('50412345678', UNA, 3)
        # Se relee del disco, como haría el proceso al arrancar de nuevo.
        self.assertEqual(premio.ya_reclamo(telefono='50412345678'), 'telefono')

    def test_UN_ARCHIVO_ROTO_FALLA_CERRADO(self):
        """Lo peor posible sería que un archivo corrupto se leyera como «no hay
        reclamos» y todo el mundo volviera a cobrar. En una cadena eso no se
        deshace. Negarse a pagar se arregla arreglando el archivo."""
        limpio()
        premio.anotar('50412345678', UNA, 3)
        premio._archivo().write_text('{ esto no es json', encoding='utf8')
        self.assertEqual(premio.ya_reclamo(telefono='50499999999'), 'ilegible',
                         'con el archivo roto dejaría cobrar a cualquiera')
        ok, motivo = premio.anotar('50499999999', OTRA, 3)
        self.assertFalse(ok, 'ANOTÓ un reclamo sin poder comprobar si repetía')
        self.assertEqual(motivo, 'ilegible')

    def test_y_un_archivo_con_otra_forma_tambien(self):
        limpio()
        premio._archivo().write_text('[]', encoding='utf8')
        self.assertEqual(premio.ya_reclamo(telefono='50411111111'), 'ilegible')

    def test_que_NO_exista_es_normal_y_deja_pasar(self):
        """El primer reclamo del mundo. No hay archivo y eso no es un fallo."""
        limpio()
        self.assertIsNone(premio.ya_reclamo(telefono='50411111111'))


class LoQueDiceNoSePuedeDECIR(unittest.TestCase):
    """El guardia también manda aquí: un texto del premio que hable de
    rendimiento o de inversión sería exactamente la frase que no puede salir."""

    def test_ningun_texto_del_juego_lo_cortaria_el_guardia(self):
        textos = []
        for idioma in premio.IDIOMAS:
            textos.append(premio.pide_billetera(idioma))
            for q in premio.PREGUNTAS:
                textos += [premio._en(q[c], idioma)
                           for c in ('pregunta', 'ensena', 'bien')]
        for t in textos:
            self.assertIsNone(guardia.revisar(t)[1], f'lo cortaría: «{t[:60]}»')

    def test_no_promete_ganancia_en_ninguna_parte(self):
        partes = []
        for idioma in premio.IDIOMAS:
            partes.append(premio.pide_billetera(idioma))
            for q in premio.PREGUNTAS:
                partes += [premio._en(q[c], idioma)
                           for c in ('pregunta', 'ensena', 'bien')]
        junto = ' '.join(partes).lower()
        for prohibido in ['invertí', 'invertir', 'rendimiento', 'ganancia',
                          'rentabilidad', 'se multiplica', 'vas a ganar más',
                          'invest', 'return on', 'profit', 'guaranteed']:
            self.assertNotIn(prohibido, junto, f'dice «{prohibido}»')



class ElTope(unittest.TestCase):
    """Doscientos y se acaba. Un regalo sin tope no es una campaña: es una
    cuenta abierta."""

    def setUp(self):
        limpio()

    def _llenar(self, n):
        for i in range(n):
            ok, motivo = premio.anotar(f'504{i:08d}', f'0x{i:040x}', 3)
            if not ok:
                return i, motivo
        return n, None

    def test_al_llegar_al_tope_se_cierra(self):
        premio.TOPE_PREMIOS = 5
        try:
            hechos, motivo = self._llenar(8)
            self.assertEqual(hechos, 5)
            self.assertEqual(motivo, 'agotado')
        finally:
            premio.TOPE_PREMIOS = 200

    def test_quedan_cuenta_bien(self):
        premio.TOPE_PREMIOS = 3
        try:
            self.assertEqual(premio.quedan(), 3)
            premio.anotar('50411111111', UNA, 3)
            self.assertEqual(premio.quedan(), 2)
            self.assertFalse(premio.agotado())
            self._llenar(5)
            self.assertTrue(premio.agotado())
            self.assertEqual(premio.quedan(), 0)
        finally:
            premio.TOPE_PREMIOS = 200

    def test_SE_COMPRUEBA_AL_ANOTAR_Y_NO_SOLO_ANTES(self):
        """Entre que alguien empieza a jugar y manda su dirección pueden entrar
        otros veinte. Sin la segunda comprobación se pagarían 220."""
        premio.TOPE_PREMIOS = 2
        try:
            self.assertFalse(premio.agotado())      # como al arrancar el juego
            self._llenar(2)                         # entran otros mientras juega
            ok, motivo = premio.anotar('50499999999', OTRA, 3)
            self.assertFalse(ok)
            self.assertEqual(motivo, 'agotado')
        finally:
            premio.TOPE_PREMIOS = 200

    def test_con_el_registro_ilegible_NO_se_reparte(self):
        """Misma regla de fallar cerrado: si no se puede contar, no se da."""
        premio.anotar('50411111111', UNA, 3)
        premio._archivo().write_text('roto', encoding='utf8')
        self.assertIsNone(premio.cuantos_van())
        self.assertEqual(premio.quedan(), 0)
        self.assertTrue(premio.agotado())

    def test_el_tope_por_defecto_es_doscientos(self):
        import re as _re
        fuente = (AQUI / 'premio.py').read_text(encoding='utf8')
        m = _re.search(r"TOPE_PREMIOS = int\(os\.environ\.get\('AURA_TOPE_PREMIOS', '(\d+)'\)\)",
                       fuente)
        self.assertIsNotNone(m)
        self.assertEqual(m.group(1), '200')

    def test_el_resumen_dice_cuantos_quedan(self):
        premio.anotar('50411111111', UNA, 3)
        r = premio.resumen()
        self.assertEqual(r['tope'], 200)
        self.assertEqual(r['quedan'], 199)

if __name__ == '__main__':
    unittest.main(verbosity=2)
