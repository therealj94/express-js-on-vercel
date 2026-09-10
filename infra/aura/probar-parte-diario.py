#!/usr/bin/env python3
"""El envio del parte, 7:30 y 19:30.

POR QUE ESTAS PRUEBAS EXISTEN

El parte se manda cuando nadie esta mirando. Las tres formas de que falle sin
que nadie se entere hasta que haga falta:

  1. SE DA POR ENVIADO SIN SALIR. `_soltar` devuelve `{}` —sin lanzar— cuando
     todavia no hay charla abierta, que es justo el caso la primera vez. Eso
     saltaria la plantilla y el parte desapareceria en silencio.

  2. LA PLANTILLA SE RECHAZA POR UN SALTO DE LINEA. A las 7:30 no hay ventana
     libre: la plantilla es el unico camino, y Meta no limpia el hueco.

  3. FALLA CALLANDO. Un parte que dejo de llegar sin avisar se confunde con
     «no hubo nada que contar» — la misma confusion que el modulo existe para
     evitar.
"""

import importlib.util
import pathlib
import sys
import unittest
from unittest import mock

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

_e = importlib.util.spec_from_file_location('parte_diario', AQUI / 'parte-diario.py')
pd = importlib.util.module_from_spec(_e)
_e.loader.exec_module(pd)


class RelevoFalso:
    """Copiado de una respuesta de verdad del proveedor.

    En particular: un envio bueno NO siempre trae `id` en la respuesta. Se
    comprobo contra la API el 30-ago —el parte llego a WhatsApp y el codigo lo
    daba por fallido— y por eso el falso lo devuelve vacio por omision: si el
    codigo vuelve a fiarse del `id`, estas pruebas se ponen rojas.
    """

    def __init__(self, charlas=('50432136457', '50499999999'),
                 devuelve=None, revienta=None):
        self.charlas = list(charlas)
        self.devuelve, self.revienta = devuelve, revienta
        self.mandado = []

    def conversaciones(self):
        return [{'correo': c} for c in self.charlas]

    def enviar(self, para, texto, parcial=False):
        self.mandado.append((para, texto))
        if self.revienta:
            raise self.revienta
        return self.devuelve if self.devuelve is not None else {}


def _datos_falsos(pendientes=('12 premios por pagar',)):
    return {'pendientes': list(pendientes), 'rotas': [], 'lineas': ['bloque 39.949']}


class _Base(unittest.TestCase):
    def correr(self, rel, plantillas, para=('50432136457',)):
        with mock.patch.object(pd, 'PARA', list(para)), \
             mock.patch.object(pd.registro, 'preparar'), \
             mock.patch.object(pd.premio, 'preparar'), \
             mock.patch.object(pd.miradas, 'para', return_value=_datos_falsos()), \
             mock.patch.object(pd.registro, 'anotar'), \
             mock.patch.object(pd.whatsapp, 'RelevoWhatsApp', return_value=rel), \
             mock.patch.object(pd.whatsapp, '_pedir', plantillas), \
             mock.patch.object(pd.time, 'sleep'):
            return pd.main()


class ElParteABRELOSARCHIVOS(unittest.TestCase):
    """El fallo del 30-ago, y de los peores: mentir tranquilizando.

    `registro` y `premio` guardan la carpeta en una global que pone
    `preparar()`. En `asistente.py` la pone el arranque — pero el parte corre
    como servicio SUELTO, otro proceso y otra memoria, y ahí nadie la ponía.

    Sin carpeta los dos módulos no leen nada Y NO LANZAN: `premio.resumen()`
    contesta «quedan 200 de 200» y `registro.resumen()` contesta cero. Con 40
    premios entregados el parte habría seguido diciendo 200, tan campante.

    Una fuente rota que se calla ya la cubren las pruebas de `vistazo`. Ésta
    cubre la otra mitad: una fuente que ni se abrió y contesta ceros."""

    def test_prepara_registro_y_premio_ANTES_de_mirar(self):
        orden = []
        rel = RelevoFalso()
        with mock.patch.object(pd, 'PARA', ['50432136457']), \
             mock.patch.object(pd.registro, 'preparar',
                               side_effect=lambda d: orden.append('registro')), \
             mock.patch.object(pd.premio, 'preparar',
                               side_effect=lambda d: orden.append('premio')), \
             mock.patch.object(pd.miradas, 'para',
                               side_effect=lambda *a, **k: (orden.append('mirar'),
                                                            _datos_falsos())[1]), \
             mock.patch.object(pd.registro, 'anotar'), \
             mock.patch.object(pd.whatsapp, 'RelevoWhatsApp', return_value=rel), \
             mock.patch.object(pd.whatsapp, '_pedir', mock.Mock()), \
             mock.patch.object(pd.time, 'sleep'):
            pd.main()
        self.assertIn('registro', orden, 'no preparó el registro: anota en el vacío')
        self.assertIn('premio', orden, 'no preparó los premios: informaría 200 siempre')
        self.assertLess(orden.index('registro'), orden.index('mirar'))
        self.assertLess(orden.index('premio'), orden.index('mirar'))

    def test_les_pasa_la_MISMA_carpeta_que_el_asistente(self):
        vistas = []
        with mock.patch.object(pd, 'PARA', ['50432136457']), \
             mock.patch.object(pd.registro, 'preparar', side_effect=vistas.append), \
             mock.patch.object(pd.premio, 'preparar', side_effect=vistas.append), \
             mock.patch.object(pd.miradas, 'para', return_value=_datos_falsos()), \
             mock.patch.object(pd.registro, 'anotar'), \
             mock.patch.object(pd.whatsapp, 'RelevoWhatsApp', return_value=RelevoFalso()), \
             mock.patch.object(pd.whatsapp, '_pedir', mock.Mock()), \
             mock.patch.object(pd.time, 'sleep'):
            pd.main()
        self.assertEqual(vistas, [pd.DATOS, pd.DATOS])


class SeIntentaLoBaratoPrimero(_Base):

    def test_si_hay_ventana_va_por_libre_y_NO_gasta_plantilla(self):
        rel = RelevoFalso()
        plantillas = mock.Mock()
        self.assertEqual(self.correr(rel, plantillas), 0)
        self.assertEqual(len(rel.mandado), 1)
        plantillas.assert_not_called()

    def test_el_libre_conserva_los_saltos(self):
        """Un parte de una sola linea se lee mucho peor, y por el libre no hace
        falta aplanarlo."""
        rel = RelevoFalso()
        self.correr(rel, mock.Mock())
        self.assertIn('\n', rel.mandado[0][1])
        self.assertIn('Parte de', rel.mandado[0][1])


class UnEnvioBuenoNOSEDAPORFALLIDO(_Base):
    """El error del 30-ago, puesto como prueba.

    La respuesta del proveedor a un envío bueno no siempre trae `id`. Fiarse de
    ese campo daba por caído lo que sí había salido, y entonces se mandaba
    ADEMÁS la plantilla: parte duplicado y cupo quemado dos veces al día."""

    def test_sin_id_en_la_respuesta_NO_se_manda_la_plantilla_encima(self):
        for respuesta in ({}, {'id': None}, None):
            with self.subTest(respuesta=respuesta):
                rel = RelevoFalso(devuelve=respuesta)
                plantillas = mock.Mock()
                self.assertEqual(self.correr(rel, plantillas), 0)
                plantillas.assert_not_called()

    def test_una_respuesta_a_medias_tampoco_se_duplica(self):
        """`_soltar` ya decidió no reintentar cuando salieron algunos trozos.
        Mandar la plantilla encima sería la duplicación que evitó."""
        rel = RelevoFalso(devuelve={'id': 'x', 'aMedias': True})
        plantillas = mock.Mock()
        self.correr(rel, plantillas)
        plantillas.assert_not_called()


class ElSilencioCUENTACOMOFALLO(_Base):
    """La número 1 de la cabecera: la charla que todavía no existe."""

    def test_sin_charla_abierta_va_por_plantilla(self):
        rel = RelevoFalso(charlas=[])
        plantillas = mock.Mock()
        self.assertEqual(self.correr(rel, plantillas), 0)
        plantillas.assert_called_once()
        self.assertEqual(rel.mandado, [], 'intentó escribir en una charla que no existe')

    def test_con_la_charla_de_OTRA_persona_tampoco_vale(self):
        rel = RelevoFalso(charlas=['50499999999'])
        plantillas = mock.Mock()
        self.correr(rel, plantillas)
        plantillas.assert_called_once()


class FueraDeLaVentanaVALAPLANTILLA(_Base):

    def _params(self, rel=None):
        rel = rel or RelevoFalso(revienta=RuntimeError('400 fuera de ventana'))
        plantillas = mock.Mock()
        self.correr(rel, plantillas)
        return plantillas.call_args[0][2]

    def test_manda_la_plantilla_con_los_dos_huecos(self):
        cuerpo = self._params()
        self.assertEqual(cuerpo['templateName'], 'og_parte_del_dia')
        self.assertEqual(len(cuerpo['templateParams']), 2)

    def test_EL_HUECO_NO_LLEVA_SALTOS(self):
        """Meta no lo limpia: rechaza el envío entero y no hay parte."""
        for hueco in self._params()['templateParams']:
            self.assertNotIn('\n', hueco)
            self.assertNotIn('\t', hueco)

    def test_y_el_hueco_sigue_diciendo_lo_que_hay_que_hacer(self):
        self.assertIn('12 premios por pagar', self._params()['templateParams'][1])


class SiNoSALEsedice(_Base):

    def test_los_dos_caminos_caidos_dan_codigo_distinto_de_cero(self):
        rel = RelevoFalso(revienta=RuntimeError('sin ventana'))
        plantillas = mock.Mock(side_effect=RuntimeError('plantilla rechazada'))
        self.assertEqual(self.correr(rel, plantillas), 1)

    def test_sin_destinatario_no_se_finge_que_salio(self):
        self.assertEqual(self.correr(RelevoFalso(), mock.Mock(), para=()), 1)

    def test_un_destinatario_caido_no_impide_el_de_al_lado(self):
        rel = RelevoFalso()
        plantillas = mock.Mock()
        r = self.correr(rel, plantillas, para=('50432136457', '50499999999'))
        self.assertEqual(r, 0)
        self.assertEqual(len(rel.mandado), 2)

    def test_se_anota_ANTES_de_mandar(self):
        """Si el envío revienta a mitad, el registro ya sabe que hubo parte y
        con qué. Anotar después borraría la única huella."""
        orden = []
        rel = RelevoFalso(revienta=RuntimeError('caído'))
        with mock.patch.object(pd, 'PARA', ['50432136457']), \
             mock.patch.object(pd.registro, 'preparar'), \
             mock.patch.object(pd.premio, 'preparar'), \
             mock.patch.object(pd.miradas, 'para', return_value=_datos_falsos()), \
             mock.patch.object(pd.registro, 'anotar',
                               side_effect=lambda *a, **k: orden.append('anotar')), \
             mock.patch.object(pd.whatsapp, 'RelevoWhatsApp', return_value=rel), \
             mock.patch.object(pd.whatsapp, '_pedir',
                               side_effect=lambda *a, **k: orden.append('mandar')), \
             mock.patch.object(pd.time, 'sleep'):
            pd.main()
        self.assertEqual(orden[0], 'anotar')


class ACADAQUIENELSUYO(unittest.TestCase):
    """Desde el 1-sep el parte no es uno: es el de cada tramo.

    Un parte con cosas que no son tuyas no se lee a medias — se deja de leer
    entero. Nicole no tiene por qué recibir el disco del nodo.
    """

    def setUp(self):
        import escalafon
        self.esc = escalafon
        escalafon.recargar(
            '50432136457/j.ordonez@ordenglobal.org:admin,'
            '50498782176:admin,'
            '50433467760:mercadeo,'
            '50499080571:legal+contable+mercadeo,'
            'sin.telefono@ordenglobal.org:legal')

    def tearDown(self):
        self.esc.recargar('')

    def test_cada_persona_recibe_los_tramos_que_lleva(self):
        with mock.patch.object(pd, 'PARA', []):
            toca = dict(pd.a_quien_le_toca())
        self.assertEqual(toca['50433467760'], ['mercadeo'])
        self.assertEqual(toca['50499080571'], ['legal', 'contable', 'mercadeo'])
        self.assertEqual(toca['50432136457'], ['admin'])

    def test_a_quien_no_tiene_telefono_no_se_le_manda_por_aqui(self):
        with mock.patch.object(pd, 'PARA', []):
            toca = dict(pd.a_quien_le_toca())
        self.assertNotIn('sin.telefono@ordenglobal.org', toca)

    def test_quien_esta_en_las_DOS_listas_recibe_UNA_vez(self):
        """Y con su tramo, no con el de admin: dos partes iguales seguidos es
        como se deja de leer el parte."""
        with mock.patch.object(pd, 'PARA', ['50433467760', '+504 3213-6457']):
            toca = pd.a_quien_le_toca()
        self.assertEqual(len(toca), len({q for q, _ in toca}))
        self.assertEqual(dict(toca)['50433467760'], ['mercadeo'])

    def test_quien_NO_esta_en_el_escalafon_sigue_recibiendo_el_de_admin(self):
        """`AURA_PARTE_PARA` se queda para un buzón de copia. Lo que ya
        funcionaba no se rompe porque haya tramos nuevos."""
        with mock.patch.object(pd, 'PARA', ['50411112222']):
            self.assertEqual(dict(pd.a_quien_le_toca())['50411112222'], ['admin'])

    def test_sin_nadie_en_ninguna_lista_lo_dice_y_sale_con_error(self):
        self.esc.recargar('')
        with mock.patch.object(pd, 'PARA', []):
            self.assertEqual(pd.main(), 1)

    def test_el_parte_se_arma_UNA_vez_por_combinacion_no_por_persona(self):
        """Nicole y otra de mercadeo comparten el mismo. Armarlo dos veces es
        preguntarle a la cadena y a Meta el doble de veces por lo mismo."""
        self.esc.recargar('50433467760:mercadeo, 50411113333:mercadeo,'
                          '50432136457:admin')
        armados = []
        rel = RelevoFalso()
        with mock.patch.object(pd, 'PARA', []), \
             mock.patch.object(pd.registro, 'preparar'), \
             mock.patch.object(pd.premio, 'preparar'), \
             mock.patch.object(pd.encargos, 'preparar'), \
             mock.patch.object(pd.registro, 'anotar'), \
             mock.patch.object(pd.miradas, 'para',
                               side_effect=lambda ts, **k: (armados.append(tuple(ts)),
                                                            _datos_falsos())[1]), \
             mock.patch.object(pd.whatsapp, 'RelevoWhatsApp', return_value=rel), \
             mock.patch.object(pd.whatsapp, '_pedir', mock.Mock()), \
             mock.patch.object(pd.time, 'sleep'):
            pd.main()
        self.assertEqual(len(armados), len(set(armados)),
                         f'armó el mismo parte más de una vez: {armados}')
        self.assertEqual(set(armados), {('mercadeo',), ('admin',)})


if __name__ == '__main__':
    unittest.main(verbosity=2)
