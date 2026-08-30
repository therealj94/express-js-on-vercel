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
sys.modules.setdefault('eth_account', _falso)

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


if __name__ == '__main__':
    unittest.main(verbosity=2)
