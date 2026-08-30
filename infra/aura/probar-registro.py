#!/usr/bin/env python3
"""El registro de AU-RA y el aviso cuando el guardia corta.

POR QUE ESTAS PRUEBAS EXISTEN

El registro nació de un problema —nadie veía lo que AU-RA decía— y puede
convertirse en otro peor si se hace sin cuidado: una transcripción de todas las
conversaciones, para siempre, esquivando por la puerta de atrás el plazo de
treinta días que se acordó el mismo día.

Así que la regla es exactamente esta, y estas pruebas la sostienen:

  · De una respuesta NORMAL se anotan cuatro números y nada de lo que se dijo.
  · Cuando el guardia CORTA sí se guarda el texto — es lo que AU-RA estuvo a
    punto de decirle a alguien, y sin leerlo no se puede arreglar.

Y el aviso tiene freno. Si el guardia corta cincuenta veces en una hora, el
aviso número cincuenta no informa de nada que el primero no dijera, y en cambio
convierte el buzón en ruido: que es como se deja de mirar un aviso.
"""

import json
import os
import pathlib
import re
import stat
import sys
import tempfile
import time
import unittest

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import registro   # noqa: E402


class Relevo:
    """Un relevo de mentira que anota lo que se le manda."""
    def __init__(self, rompe=False):
        self.enviados, self.rompe = [], rompe

    def enviar(self, para, texto, parcial=False):
        if self.rompe:
            raise OSError('relevo caído')
        self.enviados.append((para, texto))
        return {'id': 'x'}


def carpeta():
    d = pathlib.Path(tempfile.mkdtemp())
    registro.preparar(d)
    return d


def lineas(d):
    f = d / 'registro.jsonl'
    if not f.exists():
        return []
    return [json.loads(x) for x in f.read_text(encoding='utf8').splitlines() if x]


class UnaRespuestaNormalNoDejaTRANSCRIPCION(unittest.TestCase):

    def test_se_anotan_numeros_y_nada_mas(self):
        d = carpeta()
        registro.anotar('respuesta', ms=8400, largo=312, corto=False, voz=True)
        (l,) = lineas(d)
        self.assertEqual(l['e'], 'respuesta')
        self.assertEqual(l['ms'], 8400)
        self.assertEqual(l['largo'], 312)
        self.assertNotIn('texto', l, 'se coló el texto de una respuesta normal')

    def test_EL_ASISTENTE_NO_LE_PASA_EL_TEXTO(self):
        """La comprobación de verdad no es sobre este módulo sino sobre quien lo
        llama: que la llamada de una respuesta normal, tal como está escrita en
        `asistente.py`, no lleve el texto."""
        fuente = (AQUI / 'asistente.py').read_text(encoding='utf8')
        i = fuente.index("registro.anotar('respuesta'")
        llamada = fuente[i:fuente.index(')', fuente.index('voz=', i))]
        self.assertNotIn('texto', llamada,
                         'la nota de una respuesta normal lleva el texto: '
                         'eso es una transcripción de todas las conversaciones')
        self.assertIn('ms=', llamada)


class CuandoElGuardiaCortaSISeGuardaElTexto(unittest.TestCase):

    def test_el_texto_queda_para_poder_arreglarlo(self):
        d = carpeta()
        registro.anotar('guardia', motivo='legal',
                        texto='Orden Global se constituyó bajo la Regulación A')
        (l,) = lineas(d)
        self.assertEqual(l['motivo'], 'legal')
        self.assertIn('Regulación A', l['texto'])

    def test_el_asistente_si_se_lo_pasa_en_los_tres_cortes(self):
        fuente = (AQUI / 'asistente.py').read_text(encoding='utf8')
        cortes = re.findall(r"registro\.anotar\('guardia'[^)]*\)", fuente)
        self.assertEqual(len(cortes), 3,
                         'hay tres salidas por las que puede cortar el guardia')
        for c in cortes:
            self.assertIn('texto=', c, f'este corte no guarda qué se iba a decir: {c}')


class ElArchivo(unittest.TestCase):

    def test_se_crea_con_permisos_600(self):
        """Cuando el guardia corta hay texto de una conversación ahí dentro."""
        d = carpeta()
        registro.anotar('guardia', motivo='legal', texto='algo')
        m = oct((d / 'registro.jsonl').stat().st_mode & 0o777)
        self.assertEqual(m, '0o600', f'permisos {m}')

    def test_sin_preparar_no_escribe_y_no_revienta(self):
        registro.DATOS = None
        registro.anotar('respuesta', ms=1)     # no lanza

    def test_no_crece_sin_fin(self):
        d = carpeta()
        for i in range(300):
            registro.anotar('guardia', motivo='legal', texto='x' * 1500)
        n = len(lineas(d))
        self.assertLessEqual(n, registro.TOPE_LINEAS)
        self.assertGreater(n, 0, 'se comió el archivo entero')

    def test_una_linea_rota_no_rompe_el_resumen(self):
        d = carpeta()
        registro.anotar('respuesta', ms=100)
        (d / 'registro.jsonl').open('a').write('esto no es json\n')
        registro.anotar('respuesta', ms=200)
        r = registro.resumen()
        self.assertEqual(r['por_evento']['respuesta'], 2)


class ElAviso(unittest.TestCase):

    def setUp(self):
        registro._ultimo_aviso.clear()
        registro.AVISAR_A = 'jose@ordenglobal.org'

    def test_llega_a_quien_toca_con_el_texto_dentro(self):
        rel = Relevo()
        self.assertTrue(registro.avisar(rel, 'legal', 'dijo lo de la SEC'))
        (para, texto), = rel.enviados
        self.assertEqual(para, 'jose@ordenglobal.org')
        self.assertIn('lo de la SEC', texto)
        self.assertIn('legal', texto)

    def test_EL_SEGUNDO_DEL_MISMO_MOTIVO_NO_SALE(self):
        """Cincuenta avisos iguales convierten el buzón en ruido, y así es como
        se deja de mirar un aviso."""
        rel = Relevo()
        registro.avisar(rel, 'legal', 'uno')
        registro.avisar(rel, 'legal', 'dos')
        registro.avisar(rel, 'legal', 'tres')
        self.assertEqual(len(rel.enviados), 1)

    def test_pero_OTRO_motivo_si_sale(self):
        """Dos problemas distintos son dos avisos: el freno agrupa por motivo,
        no por rato."""
        rel = Relevo()
        registro.avisar(rel, 'legal', 'uno')
        registro.avisar(rel, 'idioma', 'se fue al chino')
        self.assertEqual(len(rel.enviados), 2)

    def test_pasado_el_freno_vuelve_a_avisar(self):
        rel = Relevo()
        registro.avisar(rel, 'legal', 'uno')
        registro._ultimo_aviso['legal'] = time.time() - registro.FRENO_AVISO - 1
        registro.avisar(rel, 'legal', 'dos')
        self.assertEqual(len(rel.enviados), 2)

    def test_SIN_CONFIGURAR_NO_AVISA_Y_NO_SE_QUEJA(self):
        registro.AVISAR_A = ''
        self.assertFalse(registro.avisar(Relevo(), 'legal', 'x'))

    def test_si_el_relevo_esta_caido_no_tumba_nada(self):
        """El aviso es lo último que puede llevarse por delante una respuesta."""
        self.assertFalse(registro.avisar(Relevo(rompe=True), 'legal', 'x'))


class ElResumen(unittest.TestCase):

    def test_cuenta_por_evento_y_da_la_mediana(self):
        d = carpeta()
        for ms in (100, 200, 300, 400, 500):
            registro.anotar('respuesta', ms=ms)
        registro.anotar('guardia', motivo='legal', texto='x')
        r = registro.resumen()
        self.assertEqual(r['por_evento'], {'respuesta': 5, 'guardia': 1})
        self.assertEqual(r['mediana_ms'], 300)
        self.assertEqual(r['mas_lenta_ms'], 500)

    def test_no_devuelve_NI_UN_TEXTO(self):
        """El resumen es para mirarlo de un vistazo, y lo que se mira de un
        vistazo se copia y se pega en cualquier parte."""
        d = carpeta()
        registro.anotar('guardia', motivo='legal', texto='algo muy privado')
        self.assertNotIn('privado', json.dumps(registro.resumen(), ensure_ascii=False))

    def test_lo_viejo_no_cuenta(self):
        d = carpeta()
        registro.anotar('respuesta', ms=1)
        f = d / 'registro.jsonl'
        viejo = json.loads(f.read_text().splitlines()[0])
        viejo['t'] = int(time.time()) - 48 * 3600
        f.write_text(json.dumps(viejo) + '\n')
        self.assertEqual(registro.resumen(desde_horas=24)['lineas'], 0)

    def test_sin_archivo_no_revienta(self):
        registro.preparar(pathlib.Path(tempfile.mkdtemp()))
        self.assertEqual(registro.resumen()['lineas'], 0)


if __name__ == '__main__':
    unittest.main(verbosity=2)
