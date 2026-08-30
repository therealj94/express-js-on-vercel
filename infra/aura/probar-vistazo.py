#!/usr/bin/env python3
"""El parte que AU-RA le manda a José.

POR QUE ESTAS PRUEBAS EXISTEN

Un parte diario falla de tres formas, y la primera es la que ya nos costó caro:

  1. SE CALLA LO QUE NO PUDO MIRAR. Es la lección del 30-ago. Un parte que
     omite la fuente rota se ve igual de bien que uno completo, y entonces
     «todo en orden» significa dos cosas distintas —«miré y está bien» y «no
     pude mirar»—. Así fue como una mentira sobre la SEC estuvo horas saliendo
     sin que nadie se enterara.

  2. SE LO MANDA A QUIEN NO ES. El parte lleva identidades en cola, premios por
     pagar y el estado de la cuenta de Meta. Que lo reciba cualquiera que
     escriba «actualizar» es una fuga de números internos.

  3. NO CABE. El hueco de una plantilla de WhatsApp no se recorta si te pasás:
     Meta rechaza el mensaje ENTERO, y el parte no llega.
"""

import os
import pathlib
import sys
import unittest
from unittest import mock

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import vistazo   # noqa: E402


class UnaFuenteRotaSEDICE(unittest.TestCase):
    """La lección más cara del día, convertida en prueba."""

    def test_lo_que_no_se_pudo_mirar_APARECE_en_el_parte(self):
        with mock.patch.object(vistazo, '_genesis', side_effect=OSError('caído')), \
             mock.patch.object(vistazo, '_cadena', return_value=(['cadena ok'], [])), \
             mock.patch.object(vistazo, '_whatsapp', return_value=([], [])), \
             mock.patch.object(vistazo, '_correo', return_value=([], [])):
            d = vistazo.juntar()
        self.assertTrue(d['rotas'], 'se calló una fuente caída')
        self.assertIn('Genesis ID', d['rotas'][0])
        self.assertIn('NO SE PUDO MIRAR', vistazo.texto(d))

    def test_una_fuente_rota_NO_tumba_las_demas(self):
        with mock.patch.object(vistazo, '_genesis', side_effect=OSError('caído')), \
             mock.patch.object(vistazo, '_cadena', return_value=(['bloque 123'], [])), \
             mock.patch.object(vistazo, '_whatsapp', return_value=([], [])), \
             mock.patch.object(vistazo, '_correo', return_value=([], [])):
            d = vistazo.juntar()
        self.assertIn('bloque 123', ' '.join(d['lineas']))

    def test_TODO_EN_ORDEN_solo_si_TODO_se_pudo_mirar(self):
        """Es la frase más peligrosa del parte: no puede significar «no miré»."""
        with mock.patch.object(vistazo, '_genesis', return_value=([], [])), \
             mock.patch.object(vistazo, '_cadena', return_value=([], [])), \
             mock.patch.object(vistazo, '_whatsapp', return_value=([], [])), \
             mock.patch.object(vistazo, '_correo', return_value=([], [])), \
             mock.patch.object(vistazo, '_reinicios', return_value=([], [])), \
             mock.patch.object(vistazo, '_disco', return_value=([], [])):
            self.assertIn('todo se pudo mirar', vistazo.texto(vistazo.juntar()))

        with mock.patch.object(vistazo, '_genesis', side_effect=OSError('x')), \
             mock.patch.object(vistazo, '_cadena', return_value=([], [])), \
             mock.patch.object(vistazo, '_whatsapp', return_value=([], [])), \
             mock.patch.object(vistazo, '_correo', return_value=([], [])):
            t = vistazo.texto(vistazo.juntar())
        self.assertNotIn('Todo en orden', t, 'dijo «todo en orden» sin haber mirado todo')

    def test_juntar_NUNCA_levanta(self):
        """Si el parte pudiera reventar, el día que algo raro pase es el día que
        no hay parte — justo cuando más falta hace."""
        for falla in ['_genesis', '_cadena', '_whatsapp', '_correo']:
            with mock.patch.object(vistazo, falla, side_effect=Exception('boom')):
                vistazo.juntar()      # no lanza

    def test_un_registro_que_revienta_tambien_se_dice(self):
        class Roto:
            def resumen(self, h): raise ValueError('archivo ilegible')
        with mock.patch.object(vistazo, '_genesis', return_value=([], [])), \
             mock.patch.object(vistazo, '_cadena', return_value=([], [])), \
             mock.patch.object(vistazo, '_whatsapp', return_value=([], [])), \
             mock.patch.object(vistazo, '_correo', return_value=([], [])):
            d = vistazo.juntar(registro=Roto())
        self.assertTrue(any('registro' in r for r in d['rotas']))


class LoQuePideUnaPersonaVAPRIMERO(unittest.TestCase):
    """El parte contesta una pregunta: «¿hay algo que necesite que YO haga?».
    Si eso no está arriba, el parte se deja de leer."""

    def _parte(self, **kw):
        with mock.patch.object(vistazo, '_genesis', return_value=([], [])), \
             mock.patch.object(vistazo, '_cadena', return_value=(['bloque 9'], [])), \
             mock.patch.object(vistazo, '_whatsapp', return_value=([], [])), \
             mock.patch.object(vistazo, '_correo', return_value=([], [])):
            d = vistazo.juntar(**kw)
        d['pendientes'].append('3 identidades esperando')
        return vistazo.texto(d)

    def test_los_pendientes_van_arriba_del_todo(self):
        t = self._parte()
        self.assertTrue(t.startswith('NECESITA VOS'), t[:40])
        self.assertLess(t.index('identidades'), t.index('bloque 9'))

    def test_los_premios_por_pagar_son_un_pendiente(self):
        class P:
            def resumen(self): return {'por_pagar': 12, 'quedan': 188, 'tope': 200}
        with mock.patch.object(vistazo, '_genesis', return_value=([], [])), \
             mock.patch.object(vistazo, '_cadena', return_value=([], [])), \
             mock.patch.object(vistazo, '_whatsapp', return_value=([], [])), \
             mock.patch.object(vistazo, '_correo', return_value=([], [])):
            d = vistazo.juntar(premio=P())
        self.assertTrue(any('12 premio' in p for p in d['pendientes']))
        self.assertTrue(any('188 de 200' in l for l in d['lineas']))

    def test_un_corte_del_guardia_es_un_pendiente(self):
        class R:
            def resumen(self, h):
                return {'por_evento': {'guardia': 2, 'respuesta': 40},
                        'mediana_ms': 8000}
        with mock.patch.object(vistazo, '_genesis', return_value=([], [])), \
             mock.patch.object(vistazo, '_cadena', return_value=([], [])), \
             mock.patch.object(vistazo, '_whatsapp', return_value=([], [])), \
             mock.patch.object(vistazo, '_correo', return_value=([], [])):
            d = vistazo.juntar(registro=R())
        self.assertTrue(any('guardia cortó 2' in p for p in d['pendientes']))
        self.assertTrue(any('40 respuestas' in l for l in d['lineas']))


class CabeEnLaPlantilla(unittest.TestCase):
    """Meta no recorta un hueco largo: rechaza el mensaje entero, y el parte no
    llega. Un parte que no llega es peor que uno corto."""

    def test_un_parte_enorme_se_recorta_solo(self):
        d = {'pendientes': [f'pendiente numero {i} con texto de sobra' for i in range(60)],
             'lineas': ['una linea mas'] * 60, 'rotas': []}
        t = vistazo.texto(d)
        self.assertLessEqual(len(t), vistazo.TOPE)
        self.assertTrue(t.endswith('…'), 'recortó sin avisar que recortó')

    def test_y_al_recortar_SOBREVIVE_lo_que_necesita_una_persona(self):
        d = {'pendientes': ['pagar los premios'],
             'lineas': ['relleno ' * 40] * 40, 'rotas': []}
        t = vistazo.texto(d)
        self.assertIn('pagar los premios', t, 'se comió el pendiente y dejó el relleno')

    def test_uno_normal_no_se_toca(self):
        d = {'pendientes': ['3 identidades esperando'], 'lineas': ['todo lo demás bien'],
             'rotas': []}
        self.assertFalse(vistazo.texto(d).endswith('…'))


class ElHuecoDeLaPlantillaNOADMITESALTOS(unittest.TestCase):
    """Meta no limpia un hueco con saltos de línea: rechaza el envío entero. Y
    el parte de las 7:30 casi siempre cae fuera de la ventana de 24h, así que
    la plantilla es el único camino que queda — si revienta, no hay parte."""

    def _datos(self):
        return {'pendientes': ['12 premio(s) por pagar', 'la verificación sin enviar'],
                'rotas': ['el correo no se pudo mirar (OSError)'],
                'lineas': ['cadena en el bloque 39.949', 'quedan 185 de 200 premios']}

    def test_NI_UN_SALTO_NI_UN_TABULADOR_NI_CUATRO_ESPACIOS(self):
        t = vistazo.para_plantilla(self._datos())
        for prohibido, nombre in [('\n', 'salto'), ('\r', 'retorno'),
                                  ('\t', 'tabulador'), ('    ', 'cuatro espacios')]:
            self.assertNotIn(prohibido, t, f'lleva un {nombre}: Meta lo rechaza')

    def test_aunque_una_fuente_traiga_su_propio_salto(self):
        """Un asunto de correo puede traer un salto de línea de fuera."""
        d = self._datos()
        d['lineas'].append('· Meta: tu\nplantilla\tfue aprobada')
        self.assertNotIn('\n', vistazo.para_plantilla(d))
        self.assertNotIn('\t', vistazo.para_plantilla(d))

    def test_no_se_pega_todo_en_una_frase_sola(self):
        """Sin separadores visibles el parte se lee como una sola oración."""
        t = vistazo.para_plantilla(self._datos())
        self.assertIn(' · ', t)
        self.assertIn('NECESITA VOS:', t)
        self.assertIn('NO SE PUDO MIRAR:', t)

    def test_lo_que_necesita_una_persona_sigue_yendo_primero(self):
        t = vistazo.para_plantilla(self._datos())
        self.assertTrue(t.startswith('NECESITA VOS'), t[:40])
        self.assertLess(t.index('premio(s) por pagar'), t.index('bloque'))

    def test_un_parte_enorme_cabe_igual(self):
        d = {'pendientes': [f'pendiente {i} con texto de sobra' for i in range(80)],
             'rotas': [], 'lineas': ['relleno'] * 80}
        t = vistazo.para_plantilla(d)
        self.assertLessEqual(len(t), 900)
        self.assertNotIn('\n', t)

    def test_todo_en_orden_tambien_cabe(self):
        t = vistazo.para_plantilla({'pendientes': [], 'rotas': [], 'lineas': []})
        self.assertIn('todo se pudo mirar', t)


class ElParteNoEsParaCUALQUIERA(unittest.TestCase):
    """Lleva identidades en cola, premios por pagar y el estado de Meta."""

    def test_sin_configurar_NO_LO_RECIBE_NADIE(self):
        with mock.patch.object(vistazo, 'JEFES', set()):
            self.assertFalse(vistazo.puede_pedirlo('50432136457'))
            self.assertFalse(vistazo.puede_pedirlo('cualquiera'))

    def test_solo_quien_esta_en_la_lista(self):
        with mock.patch.object(vistazo, 'JEFES', {'50432136457'}):
            self.assertTrue(vistazo.puede_pedirlo('50432136457'))
            self.assertFalse(vistazo.puede_pedirlo('50499999999'))

    def test_no_distingue_mayusculas_ni_espacios(self):
        with mock.patch.object(vistazo, 'JEFES', {'j.ordonez@ordenglobal.org'}):
            self.assertTrue(vistazo.puede_pedirlo('  J.Ordonez@OrdenGlobal.org '))


class LaPalabraQuePideElParte(unittest.TestCase):

    def _pide(self, t):
        fuente = (AQUI / 'asistente.py').read_text(encoding='utf8')
        import re
        i = fuente.index('_PIDE_PARTE = _re.compile(')
        j = fuente.index('def _arrancar_juego', i)
        ambito = {'_re': re}
        exec(compile(fuente[i:j], 'asistente', 'exec'), ambito)
        return ambito['_pide_el_parte'](t)

    def test_actualizar_a_secas_pide_el_parte(self):
        for t in ['actualizar', 'Actualizar', ' actualizar ', 'parte', 'resumen',
                  'cómo vamos']:
            self.assertTrue(self._pide(t), t)

    def test_PERO_UNA_PREGUNTA_CON_ESA_PALABRA_NO(self):
        """«como actualizo la app» es alguien preguntando. Con `\\b` en medio de
        la frase caería aquí, y ya nos pasó hoy con la palabra «ayuda»."""
        for t in ['cómo actualizo la app', 'no me deja actualizar la wallet',
                  'quiero un resumen de lo que hace origen',
                  'cuál es el estado de mi verificación']:
            self.assertFalse(self._pide(t), f'atrapó: «{t}»')


class ElCorreo(unittest.TestCase):

    def test_sin_credenciales_no_se_mira_y_no_revienta(self):
        with mock.patch.object(vistazo, 'CORREO_SERVIDOR', ''):
            self.assertEqual(vistazo._correo(), ([], []))

    def test_SE_ABRE_SOLO_PARA_LEER(self):
        """Sin `readonly`, mirar el correo lo marcaría como leído: el parte
        cambiaría el buzón que viene a mirar, y al día siguiente diría que no
        hay nada nuevo."""
        fuente = (AQUI / 'vistazo.py').read_text(encoding='utf8')
        self.assertIn("select('INBOX', readonly=True)", fuente)

    def test_NO_SE_BAJA_EL_CUERPO_DE_NINGUN_CORREO(self):
        """Remitente, asunto y fecha bastan para saber si algo necesita
        respuesta. Bajar el contenido de los correos de una empresa a un
        servidor de GPU es más dato en riesgo por cada línea de parte."""
        fuente = (AQUI / 'vistazo.py').read_text(encoding='utf8')
        self.assertIn('HEADER.FIELDS (FROM SUBJECT)', fuente)
        for peligro in ['BODY[TEXT]', 'RFC822)', 'BODY[]']:
            self.assertNotIn(peligro, fuente, f'se baja el cuerpo con «{peligro}»')

    def test_usa_BODY_PEEK_para_no_marcar_leido(self):
        """`BODY[...]` marca leído aunque la carpeta esté en solo lectura en
        algunos servidores. `BODY.PEEK[...]` nunca."""
        fuente = (AQUI / 'vistazo.py').read_text(encoding='utf8')
        self.assertIn('BODY.PEEK[', fuente)


class LosReiniciosQueNADIEVE(unittest.TestCase):
    """`Restart=always` hace que un servicio que se cae cada media hora se vea
    igual que uno sano: «active (running)». Nadie mira eso."""

    def _corre(self, salida, codigo=0):
        r = mock.Mock(returncode=codigo, stdout=salida, stderr='')
        with mock.patch.object(vistazo.shutil, 'which', return_value='/usr/bin/systemctl'), \
             mock.patch.object(vistazo.subprocess, 'run', return_value=r):
            return vistazo._reinicios()

    def test_NO_cuenta_los_despliegues(self):
        """El fallo del parte de las 15:31: contaba las líneas «AU-RA de pie»
        del journal, que suben con cada despliegue. Avisó «12 veces, algo la
        está tumbando» y las doce eran despliegues míos de esa tarde.

        `NRestarts` es el contador de systemd y solo sube cuando el servicio se
        CAE. Un vigilante que grita en falso se termina ignorando."""
        lineas, pend = self._corre('NRestarts=0\n')
        self.assertEqual(pend, [], 'inventó una avería con cero caídas')
        self.assertEqual(lineas, [])

    def test_muchas_caidas_SI_son_un_pendiente(self):
        _, pend = self._corre('NRestarts=47\n')
        self.assertTrue(pend)
        self.assertIn('47', pend[0])

    def test_una_o_dos_se_cuentan_sin_alarmar(self):
        lineas, pend = self._corre('NRestarts=2\n')
        self.assertEqual(pend, [])
        self.assertIn('2 caída', lineas[0])

    def test_sin_systemctl_se_calla_en_vez_de_inventar(self):
        """Otra máquina, no una avería. Igual que el correo sin credenciales."""
        with mock.patch.object(vistazo.shutil, 'which', return_value=None):
            self.assertEqual(vistazo._reinicios(), ([], []))

    def test_pero_si_systemctl_FALLA_eso_si_se_dice(self):
        with self.assertRaises(OSError):
            self._corre('', codigo=1)

    def test_una_respuesta_que_no_se_entiende_tambien_se_dice(self):
        """Callarse porque el formato cambió es dejar de vigilar en silencio."""
        with self.assertRaises(OSError):
            self._corre('cualquier cosa\n')


class LaBilleteraQuePAGA(unittest.TestCase):
    """Prometer 200 premios con la billetera vacía es el fallo que no avisa:
    nadie lo nota hasta que alguien gana, manda su dirección, y no hay con qué
    pagarle — y para entonces ya se prometió en público."""

    def _saldo(self, origen):
        crudo = ('{"result":"0x%x"}' % int(origen * 10 ** 18)).encode()
        r = mock.MagicMock()
        r.__enter__.return_value.read.return_value = crudo
        return mock.patch.object(vistazo.urllib.request, 'urlopen', return_value=r)

    def test_si_NO_alcanza_es_un_pendiente(self):
        with self._saldo(30):
            lineas, pend = vistazo._billetera('0xdb11', quedan=185)
        self.assertTrue(pend)
        self.assertIn('30 ORIGEN', pend[0])
        self.assertIn('185 premios', pend[0])

    def test_si_alcanza_es_solo_un_dato(self):
        with self._saldo(501):
            lineas, pend = vistazo._billetera('0xdb11', quedan=185)
        self.assertEqual(pend, [])
        self.assertIn('501 ORIGEN', lineas[0])

    def test_sin_direccion_no_se_inventa_nada(self):
        self.assertEqual(vistazo._billetera('', 200), ([], []))

    def test_la_direccion_sale_del_MODULO_no_de_una_copia(self):
        """Dos sitios con la misma dirección es un sitio donde queda la vieja."""
        class P:
            BILLETERA_PREMIOS = '0xdb11c06794d779eaf8aac59f099ae32ef493bdd4'
            def resumen(self): return {'quedan': 200, 'tope': 200}
        vistas = []
        with mock.patch.object(vistazo, '_genesis', return_value=([], [])), \
             mock.patch.object(vistazo, '_cadena', return_value=([], [])), \
             mock.patch.object(vistazo, '_whatsapp', return_value=([], [])), \
             mock.patch.object(vistazo, '_correo', return_value=([], [])), \
             mock.patch.object(vistazo, '_reinicios', return_value=([], [])), \
             mock.patch.object(vistazo, '_billetera',
                               side_effect=lambda d, q: (vistas.append(d), ([], []))[1]):
            vistazo.juntar(premio=P())
        self.assertEqual(vistas, [P.BILLETERA_PREMIOS])

    def test_una_billetera_que_no_se_puede_consultar_SE_DICE(self):
        class P:
            BILLETERA_PREMIOS = '0xdb11'
            def resumen(self): return {'quedan': 200, 'tope': 200}
        with mock.patch.object(vistazo, '_genesis', return_value=([], [])), \
             mock.patch.object(vistazo, '_cadena', return_value=([], [])), \
             mock.patch.object(vistazo, '_whatsapp', return_value=([], [])), \
             mock.patch.object(vistazo, '_correo', return_value=([], [])), \
             mock.patch.object(vistazo, '_reinicios', return_value=([], [])), \
             mock.patch.object(vistazo, '_billetera', side_effect=OSError('rpc caído')):
            d = vistazo.juntar(premio=P())
        self.assertTrue(any('billetera' in r for r in d['rotas']))


class ElDiscoLLENONOAVISA(unittest.TestCase):
    """El disco lleno no da la cara: el servicio sigue «active», el motor
    sigue cargado, y lo que falla es lo que ESCRIBE — los perfiles, el
    registro, los reclamos de premio.

    O sea que la primera señal de un disco lleno sería alguien reclamando su
    ORIGEN dos veces porque el archivo no se pudo guardar."""

    def _con(self, por_ciento):
        class St:
            f_frsize = 4096
            f_blocks = 1000000
            f_bavail = int(1000000 * (100 - por_ciento) / 100)
        return mock.patch.object(vistazo.os, 'statvfs', return_value=St())

    def test_lleno_es_un_pendiente(self):
        with self._con(92):
            lineas, pend = vistazo._disco()
        self.assertTrue(pend)
        self.assertIn('92%', pend[0])

    def test_con_sitio_es_solo_un_dato(self):
        with self._con(40):
            lineas, pend = vistazo._disco()
        self.assertEqual(pend, [])
        self.assertIn('40%', lineas[0])

    def test_avisa_ANTES_de_que_sea_tarde(self):
        """A 95 ya se están perdiendo escrituras. El aviso tiene que llegar
        cuando todavía se puede hacer algo."""
        self.assertLessEqual(vistazo.TOPE_DISCO, 90)

    def test_no_ejecuta_df_ni_parsea_su_salida(self):
        """Un formato de `df` distinto no puede romper el parte."""
        fuente = (AQUI / 'vistazo.py').read_text(encoding='utf8')
        i = fuente.index('def _disco')
        cuerpo = fuente[i:fuente.index('\ndef ', i + 10)]
        self.assertIn('statvfs', cuerpo)
        self.assertNotIn('subprocess', cuerpo)


if __name__ == '__main__':
    unittest.main(verbosity=2)
