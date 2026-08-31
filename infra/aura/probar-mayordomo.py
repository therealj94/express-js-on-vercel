#!/usr/bin/env python3
"""El mayordomo: el unico que ejecuta.

POR QUE ESTAS PRUEBAS EXISTEN

`encargos.py` decide QUIEN puede pedir que. Este archivo es el que lo HACE, y
tiene su propio fallo imperdonable, distinto del de arriba: ejecutar algo que
nadie firmo.

Puede pasar de tres formas, y las tres tienen prueba:

  · tomar un encargo que todavia esta en «pedido»
  · tomar uno rechazado o caducado
  · hacer dos veces el mismo porque el proceso se corto en la mitad

Y una cuarta, mas silenciosa: que el catalogo acote lo que llega pero este
archivo arme el comando pegando texto. Por eso tambien se lee el fuente.
"""

import json
import pathlib
import sys
import tempfile
import time
import unittest
from unittest import mock

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import catalogo    # noqa: E402
import encargos    # noqa: E402
import escalafon   # noqa: E402
import mayordomo   # noqa: E402

JEFE = '50432136457'
OTRA_JEFA = '50411111111'
TECNICO = '50433333333'
LISTA = f'{JEFE}:admin, {OTRA_JEFA}:admin, {TECNICO}:tecnologico'


class _Base(unittest.TestCase):
    def setUp(self):
        self.dir = pathlib.Path(tempfile.mkdtemp())
        encargos.preparar(self.dir)
        escalafon.recargar(LISTA)
        self.avisos = []
        self.rel = mock.Mock()
        self.rel.enviar = lambda q, t: self.avisos.append((q, t))
        self.corridos = []

        def correr(llave, segundos=180):
            self.corridos.append(llave)
            return True, 'listo'
        self.parches = [
            mock.patch.object(mayordomo, '_correr', correr),
            mock.patch.object(mayordomo.time, 'sleep'),
            # `MANOS` es un diccionario de módulo: una prueba que lo cambia se
            # lo deja cambiado a las demás. Se restaura siempre.
            mock.patch.dict(mayordomo.MANOS, {}, clear=False),
        ]
        for p in self.parches:
            p.start()

    def reinicios(self):
        return [c for c in self.corridos if c.startswith('reiniciar-')]

    def tearDown(self):
        for p in self.parches:
            p.stop()
        encargos.preparar(None)
        escalafon.recargar('')

    def firmado(self, clave, valores=None, quien=TECNICO):
        e, mal = encargos.pedir(quien, clave, valores)
        self.assertIsNotNone(e, mal)
        if e['estado'] == 'pedido':
            # Firma el OTRO admin cuando el que pide es el jefe: nadie se
            # aprueba a sí mismo, ni en las pruebas.
            firma = OTRA_JEFA if escalafon.normal(quien) == JEFE else JEFE
            hecho, mal = encargos.aprobar(firma, e['id'])
            self.assertIsNone(mal, mal)
        return e['id']


class SOLOSEHACELOFIRMADO(_Base):
    """El fallo imperdonable de este archivo."""

    def test_lo_que_esta_en_pedido_NO_se_toca(self):
        e, _ = encargos.pedir(TECNICO, 'reiniciar', {'servicio': 'aura'})
        self.assertEqual(mayordomo.una_vuelta(self.rel), 0)
        self.assertEqual(self.corridos, [], 'ejecutó algo sin firma')
        self.assertEqual(encargos.ver(e['id'])['estado'], 'pedido')

    def test_ni_lo_rechazado(self):
        e, _ = encargos.pedir(TECNICO, 'reiniciar', {'servicio': 'aura'})
        encargos.rechazar(JEFE, e['id'], 'ahora no')
        mayordomo.una_vuelta(self.rel)
        self.assertEqual(self.corridos, [], 'ejecutó algo rechazado')

    def test_ni_lo_caducado(self):
        e, _ = encargos.pedir(TECNICO, 'reiniciar', {'servicio': 'aura'})
        libro = json.loads((self.dir / 'encargos.json').read_text())
        libro['encargos'][0]['pedido_en'] = 1
        (self.dir / 'encargos.json').write_text(json.dumps(libro))
        mayordomo.una_vuelta(self.rel)
        self.assertEqual(self.corridos, [])

    def test_pero_lo_firmado_SI(self):
        self.firmado('reiniciar', {'servicio': 'aura'})
        self.assertEqual(mayordomo.una_vuelta(self.rel), 1)
        self.assertEqual(self.reinicios(), ['reiniciar-aura'])


class JAMASDOSVECES(_Base):

    def test_una_segunda_vuelta_no_lo_repite(self):
        self.firmado('reiniciar', {'servicio': 'aura'})
        mayordomo.una_vuelta(self.rel)
        mayordomo.una_vuelta(self.rel)
        self.assertEqual(len(self.reinicios()), 1, 'lo reinició dos veces')

    def test_lo_que_quedo_a_medias_NO_se_reintenta_solo(self):
        """Reintentar algo que ya empezó es como se despliega dos veces."""
        i = self.firmado('desplegar')
        encargos.tomar(i)          # se cae justo aquí
        self.assertEqual(mayordomo.una_vuelta(self.rel), 0)
        self.assertEqual(self.corridos, [])
        self.assertEqual(encargos.ver(i)['estado'], 'haciendo',
                         'lo dejó en otro estado: nadie va a mirarlo')

    def test_no_hace_mas_de_POR_VUELTA(self):
        for _ in range(6):
            self.firmado('cadena')
        with mock.patch.object(mayordomo, '_cadena',
                               lambda e: (True, 'ok')):
            self.assertEqual(mayordomo.una_vuelta(self.rel),
                             mayordomo.POR_VUELTA)


class SEAVISAALOSDOS(_Base):

    def test_al_que_pidio_y_al_que_firmo(self):
        i = self.firmado('reiniciar', {'servicio': 'aura'})
        mayordomo.una_vuelta(self.rel)
        quienes = [q for q, _ in self.avisos]
        self.assertIn(TECNICO, quienes, 'no le dijo nada al que lo pidió')
        self.assertIn(JEFE, quienes, 'el que firmó no se enteró de cómo salió')

    def test_el_aviso_lleva_el_numero_del_encargo(self):
        i = self.firmado('reiniciar', {'servicio': 'aura'})
        mayordomo.una_vuelta(self.rel)
        self.assertIn(i, self.avisos[0][1])

    def test_lo_que_sale_solo_no_molesta_a_ningun_admin(self):
        with mock.patch.object(mayordomo, '_cadena', lambda e: (True, 'ok')):
            self.firmado('cadena')
            mayordomo.una_vuelta(self.rel)
        self.assertEqual([q for q, _ in self.avisos], [TECNICO])

    def test_un_fallo_se_dice_y_queda_escrito(self):
        i = self.firmado('reiniciar', {'servicio': 'aura'})
        with mock.patch.object(mayordomo, '_correr',
                               lambda k, segundos=180: (False, 'unit not found')):
            mayordomo.una_vuelta(self.rel)
        self.assertEqual(encargos.ver(i)['estado'], 'fallido')
        self.assertIn('⚠️', self.avisos[0][1])
        self.assertIn('unit not found', encargos.ver(i)['resultado'])

    def test_una_mano_que_revienta_no_tumba_la_vuelta(self):
        i = self.firmado('reiniciar', {'servicio': 'aura'})
        self.firmado('cadena')
        def explota(e):
            raise RuntimeError('se cayó todo')
        with mock.patch.object(mayordomo, '_reiniciar', explota), \
             mock.patch.object(mayordomo, '_cadena', lambda e: (True, 'ok')):
            mayordomo.MANOS['reiniciar'] = explota
            mayordomo.MANOS['cadena'] = lambda e: (True, 'ok')
            mayordomo.una_vuelta(self.rel)
        self.assertEqual(encargos.ver(i)['estado'], 'fallido')
        self.assertIn('RuntimeError', encargos.ver(i)['resultado'])

    def test_el_aviso_caido_no_deshace_lo_hecho(self):
        i = self.firmado('reiniciar', {'servicio': 'aura'})
        rel = mock.Mock()
        rel.enviar = mock.Mock(side_effect=RuntimeError('sin red'))
        mayordomo.una_vuelta(rel)
        self.assertEqual(encargos.ver(i)['estado'], 'hecho')


class LACOLADECLAUDE(_Base):
    """El puente no arranca nada solo: deja el encargo firmado en una cola.

    Lo que hay que probar no es que «funcione», sino que NO PIERDA NADA y que
    no se lleve más de lo que le toca."""

    def setUp(self):
        super().setUp()
        self.dc = mock.patch.object(mayordomo, 'DATOS', self.dir)
        self.dc.start()

    def tearDown(self):
        self.dc.stop()
        super().tearDown()

    def cola(self):
        f = self.dir / 'para-claude.jsonl'
        if not f.exists():
            return []
        return [json.loads(x) for x in f.read_text(encoding='utf8').splitlines() if x.strip()]

    def test_el_encargo_firmado_queda_escrito_en_la_cola(self):
        i = self.firmado('claude', {'trabajo': 'ordená el README'})
        mayordomo.una_vuelta(self.rel)
        self.assertEqual(encargos.ver(i)['estado'], 'hecho')
        c = self.cola()
        self.assertEqual(len(c), 1)
        self.assertEqual(c[0]['id'], i)
        self.assertEqual(c[0]['trabajo'], 'ordená el README')
        self.assertEqual(c[0]['pidio'], TECNICO)
        self.assertEqual(c[0]['firmo'], JEFE)

    def test_y_NADA_MAS_que_eso(self):
        """Un archivo que se lee después no puede llevar de arrastre el libro
        entero, ni encargos de otra gente."""
        self.firmado('claude', {'trabajo': 'algo'})
        self.firmado('claude', {'trabajo': 'otra cosa'})
        mayordomo.una_vuelta(self.rel)
        for fila in self.cola():
            self.assertEqual(set(fila), {'id', 'trabajo', 'pidio', 'tramo',
                                         'firmo', 'huella', 'cuando'})

    def test_dos_encargos_no_se_pisan(self):
        self.firmado('claude', {'trabajo': 'uno'})
        self.firmado('claude', {'trabajo': 'dos'})
        mayordomo.una_vuelta(self.rel)
        self.assertEqual([x['trabajo'] for x in self.cola()], ['uno', 'dos'])

    def test_la_cola_se_escribe_solo_para_su_dueno(self):
        """Lleva quién pidió qué: no es de lectura pública en la máquina."""
        import stat as st
        self.firmado('claude', {'trabajo': 'algo'})
        mayordomo.una_vuelta(self.rel)
        modo = (self.dir / 'para-claude.jsonl').stat().st_mode
        self.assertEqual(st.S_IMODE(modo) & 0o077, 0,
                         'la cola de encargos la puede leer cualquiera')

    def test_se_le_dice_a_la_persona_que_quedo_anotado_y_con_que_numero(self):
        i = self.firmado('claude', {'trabajo': 'algo'})
        mayordomo.una_vuelta(self.rel)
        self.assertIn(i, self.avisos[0][1])

    def test_en_cola_cuenta_lo_que_espera(self):
        self.assertEqual(mayordomo.en_cola(), 0)
        self.firmado('claude', {'trabajo': 'uno'})
        mayordomo.una_vuelta(self.rel)
        self.assertEqual(mayordomo.en_cola(), 1)

    def test_un_gancho_caido_NO_pierde_el_encargo(self):
        """La cola es la verdad; el gancho es un aviso. Si el aviso falla, el
        encargo sigue anotado — al revés sería un puente que se traga cosas."""
        i = self.firmado('claude', {'trabajo': 'algo'})
        with mock.patch.object(mayordomo, 'GANCHO_CLAUDE', 'https://x/y'), \
             mock.patch.object(mayordomo.urllib.request, 'urlopen',
                               mock.Mock(side_effect=OSError('sin red'))):
            mayordomo.una_vuelta(self.rel)
        self.assertEqual(encargos.ver(i)['estado'], 'hecho')
        self.assertEqual(len(self.cola()), 1)
        self.assertIn('no salió', encargos.ver(i)['resultado'])

    def test_sin_firma_no_llega_a_la_cola(self):
        e, _ = encargos.pedir(TECNICO, 'claude', {'trabajo': 'algo'})
        mayordomo.una_vuelta(self.rel)
        self.assertEqual(self.cola(), [], 'entró a la cola sin que nadie firmara')


class NOSEARMANCOMANDOSPEGANDOTEXTO(unittest.TestCase):
    """El catálogo acota lo que llega. Esto es el segundo cerrojo: el primero
    que falle no puede ser el último."""

    FUENTE = (AQUI / 'mayordomo.py').read_text(encoding='utf8')

    def test_nunca_se_corre_nada_por_la_shell(self):
        self.assertNotIn('shell=True', self.FUENTE)
        for prohibido in ['os.system', 'os.popen', 'eval(', 'exec(']:
            self.assertNotIn(prohibido, self.FUENTE, prohibido)

    def test_todos_los_comandos_estan_escritos_ENTEROS_en_el_fuente(self):
        """Nada de lo que llega de fuera puede ser parte de un comando.

        Esta prueba encontró un fallo de verdad el 31-ago: `_reiniciar` hacía
        `_correr(['systemctl', 'restart', servicio])` con `servicio` viniendo
        del encargo. Estaba acotado por el catálogo a dos valores, así que no
        era explotable — pero era la única línea del sistema donde algo de
        fuera llegaba a formar parte de un comando, y esa línea no puede
        existir. Hoy se elige una FILA de `ORDENES`, no se arma nada.
        """
        for llave, orden in mayordomo.ORDENES.items():
            self.assertIsInstance(orden, list, llave)
            for trozo in orden:
                self.assertIsInstance(trozo, str, f'{llave}: {trozo!r}')

    def test_y_ninguna_llave_de_comando_se_ARMA(self):
        """Una llave que se concatena vuelve a ser un comando que se arma, con
        otro nombre. Se exige que sea una constante o un nombre —nunca un
        `+`, un f-string ni el resultado de una llamada."""
        import ast
        for n in ast.walk(ast.parse(self.FUENTE)):
            if not (isinstance(n, ast.Call)
                    and getattr(n.func, 'id', '') == '_correr'):
                continue
            primero = n.args[0]
            self.assertIsInstance(
                primero, (ast.Constant, ast.Name),
                f'línea {n.lineno}: la llave del comando se está armando')
            if isinstance(primero, ast.Constant):
                self.assertIn(primero.value, mayordomo.ORDENES,
                              f'línea {n.lineno}: llave que no existe')

    def test_las_llaves_que_llegan_por_variable_salen_de_una_tabla_cerrada(self):
        """El único caso con variable es `_reiniciar`, y su variable sale de
        `_SERVICIOS`: una tabla escrita aquí, no algo que venga del encargo."""
        for servicio, llaves in mayordomo._SERVICIOS.items():
            for llave in llaves:
                self.assertIn(llave, mayordomo.ORDENES,
                              f'{servicio}: «{llave}» no está en ORDENES')

    def test_un_servicio_de_fuera_de_la_tabla_no_corre_nada(self):
        """El segundo cerrojo, probado: aunque el catálogo fallara y dejara
        pasar cualquier cosa, aquí no corre."""
        with mock.patch.object(mayordomo, '_correr') as corre:
            bien, texto = mayordomo._reiniciar(
                {'valores': {'servicio': 'postgres; rm -rf /'}})
        self.assertFalse(bien)
        corre.assert_not_called()
        self.assertIn('no es un servicio', texto)

    def test_toda_mano_del_catalogo_existe_y_al_reves(self):
        """Un encargo sin mano se queda girando; una mano sin encargo es una
        puerta que no figura en ninguna lista."""
        self.assertEqual(set(mayordomo.MANOS), set(catalogo.ENCARGOS))


if __name__ == '__main__':
    unittest.main(verbosity=2)
