#!/usr/bin/env python3
"""El pagador: el unico proceso del ecosistema que firma con dinero.

POR QUE ESTAS PRUEBAS EXISTEN

Un pagador automatico tiene exactamente un fallo imperdonable: PAGAR DOS
VECES. En una cadena no se deshace. Todo lo demas —no pagar, pagar tarde,
avisar feo— se arregla; eso no. Cada prueba de aqui existe para una forma
concreta de pagar doble, o para que un archivo corrupto no convierta 1 en
1000.
"""

import json
import pathlib
import sys
import tempfile
import types
import unittest
from unittest import mock

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

# `eth_account` no esta instalado en todas las maquinas (en el nodo vive en su
# propio venv). Las pruebas no firman de verdad: se inyecta un doble ANTES de
# importar, y `_firmar` se simula entero.
_falso = types.ModuleType('eth_account')


class _CuentaFalsa:
    address = '0xPAGADOR00000000000000000000000000000000ff'
    key = b'\x01' * 32

    @staticmethod
    def from_key(_):
        return _CuentaFalsa()


_falso.Account = _CuentaFalsa

# `eth_utils` igual: `_firmar` lo usa para poner la direccion en su forma con
# mayusculas. El doble MARCA lo que convierte, para poder comprobar que la
# conversion se hizo de verdad y no que alguien la borro sin querer.
_falso_utils = types.ModuleType('eth_utils')
_falso_utils.to_checksum_address = lambda d: 'CHECKSUM(' + d + ')'

# SE INTENTA LA DE VERDAD PRIMERO, y esto no es un detalle.
#
# Antes esto era `sys.modules.setdefault('eth_account', _falso)`, que parece
# «usa la de verdad si esta» y NO ES ESO: `setdefault` solo mira si la clave ya
# esta en `sys.modules`, y no lo esta —nadie la habia importado todavia— asi
# que metia el doble SIEMPRE, tambien en el nodo, donde la librería si existe.
#
# O sea que la prueba escrita para cazar el fallo del 31-ago se saltaba en las
# dos maquinas y el `skipped=1` del final parecía normal. Una prueba que nunca
# corre es peor que no tenerla: ocupa el lugar de la que hacía falta.
try:
    import eth_account            # noqa: F401
    import eth_utils              # noqa: F401
    HAY_ETH = True
except ImportError:
    sys.modules['eth_account'] = _falso
    sys.modules['eth_utils'] = _falso_utils
    HAY_ETH = False

import pagador   # noqa: E402
import premio    # noqa: E402


def _reclamo(n=1):
    return {'quien': f'5049900000{n}', 'direccion': f'0x{n:040x}',
            'aciertos': 3, 'de': 3, 'cuando': 1, 'premio': '1 ORIGEN',
            'pagado': False, 'tx': None}


class _Base(unittest.TestCase):
    def setUp(self):
        self.dir = pathlib.Path(tempfile.mkdtemp())
        self.parches = [
            mock.patch.object(pagador, 'DATOS', self.dir),
            mock.patch.object(pagador, 'LLAVE', '0x' + 'ab' * 32),
            mock.patch.object(pagador.time, 'sleep'),
        ]
        for p in self.parches:
            p.start()
        premio.preparar(self.dir)
        self.enviados = []

    def tearDown(self):
        for p in self.parches:
            p.stop()
        premio.preparar(None)

    def escribir_reclamos(self, reclamos):
        (self.dir / 'premios.json').write_text(
            json.dumps({'reclamos': reclamos}), encoding='utf8')

    def rpc_normal(self, con_recibo=True):
        """Una cadena que se porta bien."""
        def _rpc(metodo, params):
            return {
                'eth_getBalance': hex(500 * 10 ** 18),
                'eth_gasPrice': '0x3b9aca00',
                'eth_getTransactionCount': '0x7',
                'eth_sendRawTransaction': '0xmandada',
                'eth_getTransactionReceipt': {'status': '0x1'} if con_recibo else None,
            }[metodo]
        return _rpc

    def correr(self, rpc=None, firmas=None):
        rel = mock.Mock()
        rel.enviar = lambda quien, texto: self.enviados.append((quien, texto))
        n = [0]

        def firmar(cuenta, para, nonce, gas):
            n[0] += 1
            return f'0xhash{n[0]:04d}', f'0xcrudo{n[0]:04d}'

        with mock.patch.object(pagador, '_rpc', rpc or self.rpc_normal()), \
             mock.patch.object(pagador, '_firmar', firmas or firmar), \
             mock.patch.object(pagador.whatsapp, 'RelevoWhatsApp',
                               return_value=rel), \
             mock.patch.object(pagador.registro, 'preparar'), \
             mock.patch.object(pagador.registro, 'anotar'):
            return pagador.main()


class ElMontoNoSePuedeTOCAR(unittest.TestCase):
    """Un archivo corrupto o una variable mal puesta no pueden convertir
    1 en 1000."""

    def test_es_exactamente_un_origen(self):
        self.assertEqual(pagador.MONTO_WEI, 10 ** 18)

    def test_y_no_sale_de_ninguna_variable_de_entorno(self):
        fuente = (AQUI / 'pagador.py').read_text(encoding='utf8')
        import re
        linea = next(l for l in fuente.splitlines() if l.startswith('MONTO_WEI'))
        self.assertNotIn('environ', linea, 'el monto se puede configurar')
        self.assertNotIn('json', linea, 'el monto se lee de un archivo')

    def test_ni_del_archivo_de_reclamos(self):
        """Aunque el reclamo diga otro premio, se paga 1."""
        fuente = (AQUI / 'pagador.py').read_text(encoding='utf8')
        self.assertNotIn("r['premio']", fuente)
        self.assertNotIn('r.get("premio")', fuente)
        self.assertNotIn("r.get('premio')", fuente)


class PagaYDejaRecibo(_Base):

    def test_el_camino_feliz_entero(self):
        self.escribir_reclamos([_reclamo(1)])
        self.assertEqual(self.correr(), 0)
        # quedo marcado pagado con su hash
        d = json.loads((self.dir / 'premios.json').read_text())
        self.assertTrue(d['reclamos'][0]['pagado'])
        self.assertEqual(d['reclamos'][0]['tx'], '0xhash0001')
        # y la persona recibio el recibo con el hash ENTERO
        self.assertEqual(len(self.enviados), 1)
        quien, texto = self.enviados[0]
        self.assertEqual(quien, '50499000001')
        self.assertIn('0xhash0001', texto)
        self.assertIn('ordenscan.com', texto)

    def test_el_recibo_habla_el_idioma_de_la_persona(self):
        (self.dir / 'perfiles.json').write_text(
            json.dumps({'50499000001': {'idioma': 'en'}}), encoding='utf8')
        self.escribir_reclamos([_reclamo(1)])
        self.correr()
        self.assertIn('your wallet', self.enviados[0][1])

    def test_no_mas_de_POR_VUELTA_por_corrida(self):
        """Un fallo raro avanza despacio, y despacio se nota."""
        self.escribir_reclamos([_reclamo(i) for i in range(1, 10)])
        self.correr()
        d = json.loads((self.dir / 'premios.json').read_text())
        self.assertEqual(sum(1 for r in d['reclamos'] if r['pagado']),
                         pagador.POR_VUELTA)


class JamasADosVeces(_Base):
    """El fallo imperdonable, en todas sus formas."""

    def test_se_apunta_EN_DISCO_antes_de_mandar(self):
        """El orden sagrado de la cabecera, comprobado con un espía."""
        orden = []

        def rpc(metodo, params):
            if metodo == 'eth_sendRawTransaction':
                orden.append(('mandar',
                              bool(pagador._vuelo_cargar() or
                                   (self.dir / 'pagos-en-vuelo.json').exists())))
                return '0x'
            return self.rpc_normal()(metodo, params)

        self.escribir_reclamos([_reclamo(1)])
        self.correr(rpc=rpc)
        self.assertEqual(orden[0], ('mandar', True),
                         'mandó sin apuntar primero: un crash ahí paga doble')

    def test_lo_que_quedo_en_vuelo_NO_se_firma_de_nuevo(self):
        """Firmar de nuevo cambia el nonce, y ahí sí son dos pagos."""
        self.escribir_reclamos([_reclamo(1)])
        pagador._vuelo_guardar([{'quien': '50499000001',
                                 'direccion': _reclamo(1)['direccion'],
                                 'hash': '0xviejo', 'crudo': '0xcrudoviejo',
                                 'nonce': 5}])
        firmados = []

        def firmar(*a):
            firmados.append(a)
            return '0xnuevo', '0xcrudonuevo'

        def rpc(metodo, params):
            if metodo == 'eth_getTransactionReceipt':
                return None            # la vieja no llegó todavía
            if metodo == 'eth_sendRawTransaction':
                self.assertEqual(params[0], '0xcrudoviejo',
                                 'reenvió otra cosa en vez de LA MISMA cruda')
                return '0x'
            return self.rpc_normal()(metodo, params)

        self.correr(rpc=rpc, firmas=firmar)
        self.assertEqual(firmados, [], 'firmó de nuevo un pago en vuelo')

    def test_un_crash_despues_de_mandar_se_recupera_sin_pagar_doble(self):
        """La corrida anterior murió entre mandar y confirmar. Esta encuentra
        el recibo en la cadena, termina el papeleo, y NO paga otra vez."""
        self.escribir_reclamos([_reclamo(1)])
        pagador._vuelo_guardar([{'quien': '50499000001',
                                 'direccion': _reclamo(1)['direccion'],
                                 'hash': '0xdeantes', 'crudo': '0xcrudo',
                                 'nonce': 5}])
        mandadas = []

        def rpc(metodo, params):
            if metodo == 'eth_sendRawTransaction':
                mandadas.append(params[0])
                return '0x'
            return self.rpc_normal()(metodo, params)

        self.correr(rpc=rpc)
        self.assertEqual(mandadas, [], 'volvió a mandar un pago ya confirmado')
        d = json.loads((self.dir / 'premios.json').read_text())
        self.assertTrue(d['reclamos'][0]['pagado'])
        self.assertEqual(d['reclamos'][0]['tx'], '0xdeantes')
        self.assertEqual(pagador._vuelo_cargar(), [], 'no limpió el vuelo')
        self.assertEqual(len(self.enviados), 1, 'no avisó al recuperar')

    def test_una_REVERTIDA_queda_bloqueada_para_una_persona(self):
        """Dinero raro no se reintenta solo."""
        self.escribir_reclamos([_reclamo(1)])
        pagador._vuelo_guardar([{'quien': '50499000001',
                                 'direccion': _reclamo(1)['direccion'],
                                 'hash': '0xrev', 'crudo': '0xcrudo', 'nonce': 5}])

        def rpc(metodo, params):
            if metodo == 'eth_getTransactionReceipt':
                return {'status': '0x0'}          # revirtió
            if metodo == 'eth_sendRawTransaction':
                self.fail('reenvió una revertida')
            return self.rpc_normal()(metodo, params)

        self.correr(rpc=rpc)
        vuelo = pagador._vuelo_cargar()
        self.assertEqual(len(vuelo), 1)
        self.assertTrue(vuelo[0]['revertida'])
        d = json.loads((self.dir / 'premios.json').read_text())
        self.assertFalse(d['reclamos'][0]['pagado'],
                         'marcó pagado un pago que revirtió')
        self.assertEqual(self.enviados, [], 'mandó recibo de un pago revertido')


class LoQueNoSePagaNUNCA(_Base):

    def test_una_billetera_nuestra_no_cobra_ni_desde_el_archivo(self):
        """Defensa en profundidad: `premio` ya la rechaza al reclamar, pero si
        el archivo la trae igual —editado a mano, restaurado viejo— tampoco."""
        r = _reclamo(1)
        r['direccion'] = premio.BILLETERA_PREMIOS
        self.escribir_reclamos([r])
        mandadas = []

        def rpc(metodo, params):
            if metodo == 'eth_sendRawTransaction':
                mandadas.append(params[0])
                return '0x'
            return self.rpc_normal()(metodo, params)

        self.correr(rpc=rpc)
        self.assertEqual(mandadas, [], 'le pagó a una billetera nuestra')

    def test_sin_saldo_no_manda_y_no_revienta(self):
        self.escribir_reclamos([_reclamo(1)])

        def rpc(metodo, params):
            if metodo == 'eth_getBalance':
                return hex(10 ** 17)               # 0.1: no alcanza
            if metodo == 'eth_sendRawTransaction':
                self.fail('mandó sin saldo')
            return self.rpc_normal()(metodo, params)

        self.assertEqual(self.correr(rpc=rpc), 0)

    def test_sin_llave_no_hace_nada_y_sale_bien(self):
        """Un despliegue sin la llave no es un error: es WhatsApp sin boca,
        dicho y en paz."""
        with mock.patch.object(pagador, 'LLAVE', ''):
            self.assertEqual(pagador.main(), 0)


class ElAvisoCaidoNoDeshaceElPago(_Base):

    def test_si_whatsapp_falla_el_pago_queda_pagado_igual(self):
        self.escribir_reclamos([_reclamo(1)])
        rel = mock.Mock()
        rel.enviar = mock.Mock(side_effect=RuntimeError('429'))
        with mock.patch.object(pagador, '_rpc', self.rpc_normal()), \
             mock.patch.object(pagador, '_firmar',
                               lambda *a: ('0xh', '0xc')), \
             mock.patch.object(pagador.whatsapp, 'RelevoWhatsApp',
                               return_value=rel), \
             mock.patch.object(pagador.registro, 'preparar'), \
             mock.patch.object(pagador.registro, 'anotar'):
            pagador.main()
        d = json.loads((self.dir / 'premios.json').read_text())
        self.assertTrue(d['reclamos'][0]['pagado'],
                        'un aviso caído deshizo un pago hecho')


class LOQUEPAGAESLOQUESEVIGILA(unittest.TestCase):
    """El parte vigilaba el saldo de MERCADEO —296 ORIGEN— mientras la
    billetera que de verdad manda los premios tenía 205.

    Si esa se vaciara, el parte habría seguido diciendo 296 tan tranquilo
    mientras cada premio fallaba por falta de fondos. Un vigilante que mira el
    bolsillo equivocado es peor que ninguno: da tranquilidad falsa."""

    def test_el_pagador_firma_con_la_billetera_que_premio_declara(self):
        """`vistazo` mira el saldo de `premio.BILLETERA_PREMIOS`. Si el pagador
        firmara con otra, se estaría vigilando un bolsillo que no se gasta."""
        from eth_account import Account
        cuenta = Account.from_key('0x' + 'ab' * 32)
        # No se compara la llave —que no sale de su nodo— sino que la dirección
        # declarada esté entre las nuestras: es lo comprobable desde aquí.
        self.assertIn(premio.BILLETERA_PREMIOS, premio.BILLETERAS_INTERNAS)
        self.assertTrue(premio.BILLETERA_PREMIOS.startswith('0x'))
        self.assertEqual(len(premio.BILLETERA_PREMIOS), 42)
        self.assertEqual(premio.BILLETERA_PREMIOS, premio.BILLETERA_PREMIOS.lower(),
                         'en minúsculas, o la comparación con lo que escribe '
                         'la gente falla a veces')
        del cuenta

    def test_vistazo_mira_ESA_y_no_otra(self):
        fuente = (AQUI / 'vistazo.py').read_text(encoding='utf8')
        self.assertIn("getattr(premio, 'BILLETERA_PREMIOS', '')", fuente,
                      'vistazo repite una dirección en vez de preguntársela a '
                      '`premio`: dos sitios con la misma dirección es un sitio '
                      'donde queda la vieja')

    def test_las_billeteras_viejas_siguen_sin_poder_cobrar(self):
        """Ya cambió dos veces. Las anteriores andan circulando en mensajes y
        notas, y alguien puede pegar una de buena fe."""
        for vieja in ['0x746268404cc9ca2ef0ac344f02b236db232c3ad8',
                      '0xdb11c06794d779eaf8aac59f099ae32ef493bdd4']:
            self.assertIn(vieja, premio.BILLETERAS_INTERNAS, vieja)
            self.assertIsNotNone(premio.problema_con(vieja), vieja)


class LAUNICAFUNCIONQUENADIEEJECUTABA(unittest.TestCase):
    """`_firmar` estaba simulada en TODAS las pruebas de este archivo.

    Del 31-ago 20:12 al 1-sep dio 438 vueltas seguidas reventando con
    «Transaction had invalid fields: {'to': '0xd894…'}» —el pagador no pagó ni
    una vez en veintidós horas, con el premio de una persona esperando— y la
    batería entera seguía en verde.

    `eth_account` exige la dirección en su forma con mayúsculas y minúsculas
    (EIP-55). Nosotros la guardamos en minúsculas a propósito, porque es la
    única manera de que `en_vuelo` y `problema_con` comparen bien: dos formas
    de escribir la misma dirección son dos direcciones para un `set`, y ahí
    empieza el doble pago.

    O sea que las dos cosas son ciertas y las dos hacen falta. La conversión va
    en el último instante, al firmar, y no antes.
    """

    def _firma(self, direccion):
        visto = {}

        class Cuenta:
            address = '0xPAGADOR'
            key = b'\x01' * 32

        def sign_transaction(tx, _clave):
            visto['tx'] = tx
            class F:
                hash = type('h', (), {'hex': staticmethod(lambda: '0xaa')})()
                raw_transaction = type('r', (), {'hex': staticmethod(lambda: '0xbb')})()
            return F()

        # La marca se pone aqui, sobre la que este cargada —la de verdad o el
        # doble—, para que esta prueba diga lo mismo en las dos maquinas.
        # `_firmar` importa dentro de la funcion, asi que le llega la parcheada.
        with mock.patch.object(sys.modules['eth_account'], 'Account',
                               type('A', (), {'sign_transaction':
                                              staticmethod(sign_transaction)})), \
             mock.patch.object(sys.modules['eth_utils'], 'to_checksum_address',
                               lambda d: 'CHECKSUM(' + d + ')'):
            pagador._firmar(Cuenta(), direccion, 7, 1000)
        return visto['tx']

    def test_la_direccion_se_convierte_ANTES_de_firmar(self):
        tx = self._firma('0xd894df2b1eedd017c7bb2b01d9a16391ccc4bda5')
        self.assertEqual(tx['to'],
                         'CHECKSUM(0xd894df2b1eedd017c7bb2b01d9a16391ccc4bda5)',
                         'se firmó con la dirección tal cual: es el fallo del '
                         '31-ago, 438 vueltas sin pagar')

    def test_y_lo_demas_de_la_transaccion_sigue_igual(self):
        """La conversión no puede llevarse por delante el monto grabado."""
        tx = self._firma('0x' + 'ab' * 20)
        self.assertEqual(tx['value'], pagador.MONTO_WEI)
        self.assertEqual(tx['nonce'], 7)
        self.assertEqual(tx['chainId'], pagador.CADENA_ID)

    def test_lo_que_se_GUARDA_sigue_en_minusculas(self):
        """Si lo guardado cambiara de forma, `en_vuelo` dejaría de reconocerlo
        y el mismo premio se pagaría dos veces."""
        self.assertEqual((' 0xAB' * 1).strip().lower(), '0xab')
        # La minúscula se aplica al leer el reclamo, no al firmar: se comprueba
        # sobre el código para que nadie la mueva a `_firmar` «para unificar».
        fuente = (AQUI / 'pagador.py').read_text()
        self.assertIn("para = (r.get('direccion') or '').lower()", fuente,
                      'la dirección dejó de guardarse en minúsculas: '
                      'ahí empieza el doble pago')


@unittest.skipUnless(HAY_ETH, 'eth_account solo vive en el venv del nodo')
class FIRMANDODEVERDAD(unittest.TestCase):
    """Con la librería de verdad, que es la que rechazó la dirección.

    Se salta en la máquina de desarrollo y corre en el nodo, que es donde el
    pagador vive. Un doble nunca habría cazado esto: el doble aceptaba todo.
    """

    def test_una_direccion_en_minusculas_se_firma_sin_reventar(self):
        from eth_account import Account
        cuenta = Account.from_key('0x' + '11' * 32)
        h, crudo = pagador._firmar(
            cuenta, '0xd894df2b1eedd017c7bb2b01d9a16391ccc4bda5', 0, 1000)
        self.assertTrue(h.startswith('0x'))
        self.assertTrue(crudo.startswith('0x'))


if __name__ == '__main__':
    unittest.main(verbosity=2)
