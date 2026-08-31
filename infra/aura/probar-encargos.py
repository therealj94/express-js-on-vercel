#!/usr/bin/env python3
"""El permiso: lo unico que separa a AU-RA de ser un agujero.

POR QUE ESTAS PRUEBAS EXISTEN

AU-RA habla con desconocidos, pegada a un modelo de lenguaje, por WhatsApp. En
cuanto puede EJECUTAR, la pregunta deja de ser «¿contesta bien?» y pasa a ser
«¿quien le puede dar ordenes a la casa?».

Un fallo aqui no se ve en una captura ni lo reporta nadie: se ve cuando algo
ya se ejecuto. Asi que cada regla de `encargos.py` tiene su prueba, y cada
prueba esta escrita desde el ataque, no desde el camino feliz:

  · pedir algo que no es de tu tramo
  · aprobarte a vos mismo
  · aprobar una cosa y que se ejecute otra
  · contestar por otro
  · que un encargo dormido de la semana pasada siga sirviendo
  · que un corte a la mitad lo haga dos veces
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

JEFE = '50432136457'        # admin
OTRA_JEFA = '50411111111'   # admin, la que firma lo del jefe
ABOGADA = '50422222222'     # legal
TECNICO = '50433333333'     # tecnologico
NADIE = '50499999999'       # fuera de la lista

CORREO_JEFE = 'j.ordonez@ordenglobal.org'    # el MISMO José, otro sitio
LISTA = (f'{JEFE}|{CORREO_JEFE}:admin, {OTRA_JEFA}:admin, {ABOGADA}:legal, '
         f'{TECNICO}:tecnologico')


class _Base(unittest.TestCase):
    def setUp(self):
        self.dir = pathlib.Path(tempfile.mkdtemp())
        encargos.preparar(self.dir)
        escalafon.recargar(LISTA)

    def tearDown(self):
        encargos.preparar(None)
        escalafon.recargar('')


# ── Quien es quien ──────────────────────────────────────────────────────────

class ElEscalafonCierraPorOmision(_Base):
    """Una lista mal escrita tiene que dejar a la gente AFUERA."""

    def test_quien_no_esta_en_la_lista_no_puede_pedir_nada(self):
        for clave in catalogo.ENCARGOS:
            e, mal = encargos.pedir(NADIE, clave)
            self.assertIsNone(e, f'{clave}: se lo dio a alguien de fuera')
            self.assertIn('no estás en la lista', mal)

    def test_un_tramo_mal_escrito_deja_afuera_no_degrada(self):
        escalafon.recargar(f'{JEFE}:administrador')   # no es un tramo
        self.assertIsNone(escalafon.tramo_de(JEFE),
                          'un tramo con falta de ortografía dio permisos')

    def test_el_mismo_numero_escrito_de_otra_forma_es_la_misma_persona(self):
        escalafon.recargar(f'+504 3213-6457:admin')
        self.assertEqual(escalafon.tramo_de('50432136457'), 'admin')
        self.assertEqual(escalafon.tramo_de('+504 3213 6457'), 'admin')

    def test_sin_lista_puesta_no_hay_admins(self):
        escalafon.recargar('')
        self.assertEqual(escalafon.admins(), [])
        self.assertFalse(escalafon.es_admin(JEFE))


class CadaTramoPideLOSUYO(_Base):

    def test_legal_no_puede_tocar_el_nodo(self):
        e, mal = encargos.pedir(ABOGADA, 'desplegar')
        self.assertIsNone(e)
        self.assertIn('no es de legal', mal)

    def test_ni_tecnologia_los_papeles(self):
        e, mal = encargos.pedir(TECNICO, 'papeles')
        self.assertIsNone(e)

    def test_pero_cada_uno_lo_suyo_si(self):
        for quien, clave in [(ABOGADA, 'papeles'), (TECNICO, 'cadena'),
                             (TECNICO, 'desplegar'), (JEFE, 'saldos')]:
            e, mal = encargos.pedir(quien, clave)
            self.assertIsNotNone(e, f'{quien}/{clave}: {mal}')

    def test_el_admin_puede_pedir_todo(self):
        for clave, ficha in catalogo.ENCARGOS.items():
            self.assertIn('admin', ficha['quien'],
                          f'{clave}: el admin no lo puede pedir y debería')


# ── La regla 1: nadie se aprueba a si mismo ────────────────────────────────

class NADIESEAPRUEBAASIMISMO(_Base):
    """Una firma que uno se puede poner solo no es una firma."""

    def test_ni_siquiera_el_jefe(self):
        e, _ = encargos.pedir(JEFE, 'desplegar')
        hecho, mal = encargos.aprobar(JEFE, e['id'])
        self.assertIsNone(hecho, 'el jefe se aprobó a sí mismo')
        self.assertIn('lo pediste vos', mal)
        self.assertEqual(encargos.ver(e['id'])['estado'], 'pedido')

    def test_pero_otro_admin_si(self):
        e, _ = encargos.pedir(JEFE, 'desplegar')
        hecho, mal = encargos.aprobar(OTRA_JEFA, e['id'])
        self.assertIsNone(mal, mal)
        self.assertEqual(hecho['estado'], 'aprobado')
        self.assertEqual(hecho['firma'], OTRA_JEFA)

    def test_tampoco_escribiendo_el_numero_de_otra_forma(self):
        """El mismo teléfono con espacios y guiones tiene que seguir siendo
        la misma persona: si no, la regla se salta escribiéndolo distinto."""
        e, _ = encargos.pedir(JEFE, 'desplegar')
        hecho, mal = encargos.aprobar('+504 3213-6457', e['id'])
        self.assertIsNone(hecho, 'se aprobó a sí mismo cambiando el formato')
        self.assertIn('lo pediste vos', mal)

    def test_con_UN_solo_admin_no_se_puede_pedir_lo_que_necesita_firma(self):
        """Incómodo a propósito: la salida es sumar un segundo admin, no
        saltarse la regla."""
        escalafon.recargar(f'{JEFE}:admin')
        e, mal = encargos.pedir(JEFE, 'desplegar')
        self.assertIsNone(e)
        self.assertIn('no hay otro admin', mal)

    def test_y_aun_asi_lo_que_solo_mira_sale(self):
        escalafon.recargar(f'{JEFE}:admin')
        e, mal = encargos.pedir(JEFE, 'parte')
        self.assertIsNotNone(e, mal)
        self.assertEqual(e['estado'], 'aprobado')


class UNAPERSONANOSONDOSFIRMAS(_Base):
    """El agujero del 31-ago, encontrado antes de encender nada.

    José escribe desde su teléfono y desde j.ordonez@ordenglobal.org. Si la
    lista los cuenta como dos admin, «nadie se aprueba a sí mismo» se salta
    escribiéndose dos veces: pide desde el teléfono, firma desde el correo, y
    el control desaparece sin que nadie toque una línea de código.

    Lo que cuenta para firmar no es el número ni el correo: es LA PERSONA.
    """

    def test_el_telefono_y_el_correo_del_mismo_son_UNA_persona(self):
        self.assertEqual(escalafon.persona_de(JEFE),
                         escalafon.persona_de(CORREO_JEFE))

    def test_y_los_dos_llevan_su_tramo(self):
        self.assertEqual(escalafon.tramo_de(CORREO_JEFE), 'admin')
        self.assertEqual(escalafon.tramo_de('J.Ordonez@OrdenGlobal.org'), 'admin')

    def test_NO_puede_pedir_desde_el_telefono_y_firmar_desde_el_correo(self):
        e, mal = encargos.pedir(JEFE, 'desplegar')
        self.assertIsNotNone(e, mal)
        hecho, mal = encargos.aprobar(CORREO_JEFE, e['id'])
        self.assertIsNone(hecho, 'se firmó a sí mismo cambiando de sitio')
        self.assertIn('lo pediste vos', mal)

    def test_ni_al_reves(self):
        e, mal = encargos.pedir(CORREO_JEFE, 'desplegar')
        self.assertIsNotNone(e, mal)
        hecho, mal = encargos.aprobar(JEFE, e['id'])
        self.assertIsNone(hecho, 'se firmó a sí mismo cambiando de sitio')

    def test_los_admin_se_cuentan_por_PERSONA_no_por_correo(self):
        escalafon.recargar(f'{JEFE}|{CORREO_JEFE}|otro@ordenglobal.org:admin')
        self.assertEqual(len(escalafon.admins()), 1,
                         'tres formas del mismo cuentan como tres admin')
        self.assertFalse(escalafon.hay_con_quien_aprobar(JEFE))
        e, mal = encargos.pedir(CORREO_JEFE, 'desplegar')
        self.assertIsNone(e, 'pudo pedir algo que solo podría firmarse solo')

    def test_pero_OTRA_persona_si_le_firma(self):
        e, _ = encargos.pedir(CORREO_JEFE, 'desplegar')
        hecho, mal = encargos.aprobar(OTRA_JEFA, e['id'])
        self.assertIsNone(mal, mal)
        self.assertEqual(hecho['estado'], 'aprobado')

    def test_lo_que_pidio_por_un_sitio_le_sale_en_lo_suyo_por_el_otro(self):
        encargos.pedir(JEFE, 'desplegar')
        self.assertEqual(len(encargos.mios(CORREO_JEFE)), 1,
                         'lo que pidió por teléfono no aparece en lo suyo')

    def test_la_huella_es_la_misma_escriba_desde_donde_escriba(self):
        """Si no, aprobar lo pedido por teléfono no cubriría lo mismo pedido
        por correo, y aparecerían encargos gemelos que nadie entiende."""
        self.assertEqual(encargos.huella('desplegar', {}, JEFE),
                         encargos.huella('desplegar', {}, CORREO_JEFE))


class SOLOUNADMINCONTESTA(_Base):

    def test_legal_no_puede_aprobar_lo_de_tecnologia(self):
        e, _ = encargos.pedir(TECNICO, 'desplegar')
        hecho, mal = encargos.aprobar(ABOGADA, e['id'])
        self.assertIsNone(hecho)
        self.assertIn('admin', mal)

    def test_ni_alguien_de_fuera_de_la_lista(self):
        e, _ = encargos.pedir(TECNICO, 'desplegar')
        hecho, mal = encargos.aprobar(NADIE, e['id'])
        self.assertIsNone(hecho)
        self.assertEqual(encargos.ver(e['id'])['estado'], 'pedido')

    def test_ni_el_que_lo_pidio_aunque_sea_de_su_tramo(self):
        e, _ = encargos.pedir(TECNICO, 'desplegar')
        hecho, mal = encargos.aprobar(TECNICO, e['id'])
        self.assertIsNone(hecho)


# ── La regla 2: la firma va atada al texto ─────────────────────────────────

class SEFIRMALOQUESELEYO(_Base):
    """Sin esto, aprobar es firmar en blanco."""

    def test_si_el_encargo_cambio_despues_de_mostrarlo_no_se_firma(self):
        e, _ = encargos.pedir(ABOGADA, 'claude', {'trabajo': 'ordená el README'})
        vista = e['huella']
        # Alguien toca el libro entre el aviso y el «sí».
        libro = json.loads((self.dir / 'encargos.json').read_text())
        libro['encargos'][0]['valores']['trabajo'] = 'borrá la base de datos'
        libro['encargos'][0]['huella'] = encargos.huella(
            'claude', {'trabajo': 'borrá la base de datos'}, ABOGADA)
        (self.dir / 'encargos.json').write_text(json.dumps(libro))

        hecho, mal = encargos.aprobar(JEFE, e['id'], huella_vista=vista)
        self.assertIsNone(hecho, 'firmó algo distinto de lo que leyó')
        self.assertIn('cambió después de mostrártelo', mal)

    def test_con_la_huella_buena_firma_normal(self):
        e, _ = encargos.pedir(ABOGADA, 'claude', {'trabajo': 'ordená el README'})
        hecho, mal = encargos.aprobar(JEFE, e['id'], huella_vista=e['huella'])
        self.assertIsNone(mal, mal)
        self.assertEqual(hecho['estado'], 'aprobado')

    def test_la_huella_cambia_si_cambia_UNA_letra(self):
        a = encargos.huella('claude', {'trabajo': 'borrá el archivo'}, ABOGADA)
        b = encargos.huella('claude', {'trabajo': 'borrá el archivó'}, ABOGADA)
        self.assertNotEqual(a, b)

    def test_y_si_cambia_QUIEN_lo_pidio(self):
        """Aprobar «reiniciar aura» para uno no puede valer para otro."""
        a = encargos.huella('reiniciar', {'servicio': 'aura'}, TECNICO)
        b = encargos.huella('reiniciar', {'servicio': 'aura'}, ABOGADA)
        self.assertNotEqual(a, b)


# ── La regla 3: caduca ─────────────────────────────────────────────────────

class UNSIVIEJONOSIRVE(_Base):

    def test_a_las_veinticuatro_horas_se_muere_solo(self):
        e, _ = encargos.pedir(TECNICO, 'desplegar')
        libro = json.loads((self.dir / 'encargos.json').read_text())
        libro['encargos'][0]['pedido_en'] = int(time.time()) - int(encargos.CADUCA) - 5
        (self.dir / 'encargos.json').write_text(json.dumps(libro))

        hecho, mal = encargos.aprobar(JEFE, e['id'])
        self.assertIsNone(hecho, 'firmó un encargo dormido de ayer')
        self.assertIn('caducó', mal)

    def test_y_el_que_esta_fresco_no(self):
        e, _ = encargos.pedir(TECNICO, 'desplegar')
        hecho, mal = encargos.aprobar(JEFE, e['id'])
        self.assertIsNone(mal, mal)

    def test_caducar_dice_cuales_se_murieron(self):
        e, _ = encargos.pedir(TECNICO, 'desplegar')
        libro = json.loads((self.dir / 'encargos.json').read_text())
        libro['encargos'][0]['pedido_en'] = 1
        (self.dir / 'encargos.json').write_text(json.dumps(libro))
        self.assertEqual(encargos.caducar(), [e['id']])


# ── La regla 4: se hace una vez ────────────────────────────────────────────

class UNAVEZYNADAMAS(_Base):
    """La lección del pagador, aplicada antes de que cueste."""

    def test_tomar_dos_veces_devuelve_None_la_segunda(self):
        e, _ = encargos.pedir(TECNICO, 'desplegar')
        encargos.aprobar(JEFE, e['id'])
        self.assertIsNotNone(encargos.tomar(e['id']))
        self.assertIsNone(encargos.tomar(e['id']),
                          'lo tomó dos veces: se ejecutaría dos veces')

    def test_queda_marcado_EN_DISCO_antes_de_empezar(self):
        e, _ = encargos.pedir(TECNICO, 'desplegar')
        encargos.aprobar(JEFE, e['id'])
        encargos.tomar(e['id'])
        # Se relee del archivo, no de memoria: si el proceso muere ahora, esto
        # es lo único que queda para saber que ya salió.
        libro = json.loads((self.dir / 'encargos.json').read_text())
        self.assertEqual(libro['encargos'][0]['estado'], 'haciendo')

    def test_lo_que_no_esta_aprobado_no_se_puede_tomar(self):
        e, _ = encargos.pedir(TECNICO, 'desplegar')
        self.assertIsNone(encargos.tomar(e['id']), 'tomó algo sin firmar')

    def test_ni_lo_rechazado(self):
        e, _ = encargos.pedir(TECNICO, 'desplegar')
        encargos.rechazar(JEFE, e['id'], 'ahora no')
        self.assertIsNone(encargos.tomar(e['id']))

    def test_un_encargo_ya_contestado_no_se_vuelve_a_contestar(self):
        e, _ = encargos.pedir(TECNICO, 'desplegar')
        encargos.rechazar(JEFE, e['id'], 'ahora no')
        hecho, mal = encargos.aprobar(OTRA_JEFA, e['id'])
        self.assertIsNone(hecho, 'un segundo admin revirtió el «no» del primero')
        self.assertIn('rechazado', mal)


# ── La regla 5: queda escrito ──────────────────────────────────────────────

class TODOQUEDAESCRITO(_Base):

    def test_se_guarda_quien_pidio_quien_firmo_y_cuando(self):
        e, _ = encargos.pedir(TECNICO, 'reiniciar', {'servicio': 'aura'})
        encargos.aprobar(JEFE, e['id'])
        encargos.tomar(e['id'])
        encargos.terminar(e['id'], True, 'reiniciado')
        f = encargos.ver(e['id'])
        self.assertEqual(f['quien'], TECNICO)
        self.assertEqual(f['firma'], JEFE)
        self.assertEqual(f['estado'], 'hecho')
        self.assertEqual(f['valores'], {'servicio': 'aura'})
        for campo in ['pedido_en', 'firmado_en', 'empezado_en', 'terminado_en']:
            self.assertTrue(f.get(campo), f'no quedó {campo}')

    def test_lo_que_sale_solo_TAMBIEN_queda_escrito(self):
        """Que no necesite permiso no quiere decir que no deje rastro."""
        e, _ = encargos.pedir(ABOGADA, 'papeles')
        self.assertEqual(encargos.ver(e['id'])['firma'], 'sale solo')

    def test_el_rechazo_guarda_el_motivo(self):
        e, _ = encargos.pedir(TECNICO, 'desplegar')
        encargos.rechazar(JEFE, e['id'], 'esperá al lunes')
        self.assertEqual(encargos.ver(e['id'])['motivo'], 'esperá al lunes')


# ── El catalogo ────────────────────────────────────────────────────────────

class LOQUESEPUEDEPEDIRESUNALISTACERRADA(_Base):

    def test_no_se_puede_pedir_algo_que_no_esta_en_la_lista(self):
        for inventado in ['borrar-todo', 'shell', '../pagador', '']:
            e, mal = encargos.pedir(JEFE, inventado)
            self.assertIsNone(e, f'aceptó «{inventado}»')

    def test_un_hueco_de_opciones_no_admite_nada_mas(self):
        for malo in ['postgres', 'aura; rm -rf /', 'AURA ', '']:
            e, mal = encargos.pedir(TECNICO, 'reiniciar', {'servicio': malo})
            if malo == 'AURA ':
                self.assertIsNotNone(e, 'no aceptó el mismo nombre con espacios')
                continue
            self.assertIsNone(e, f'aceptó el servicio «{malo}»')

    def test_el_texto_libre_tiene_tope_y_se_dice_cual(self):
        largo = 'a' * 5000
        e, mal = encargos.pedir(ABOGADA, 'claude', {'trabajo': largo})
        self.assertIsNone(e)
        self.assertIn('1200', mal)

    def test_los_caracteres_invisibles_se_sacan_del_texto(self):
        """En un texto que después se muestra para aprobar, son justo lo que
        se usa para esconder media orden debajo de una línea en blanco."""
        e, _ = encargos.pedir(ABOGADA, 'claude',
                              {'trabajo': 'ordená el README\x00\x07 y ya'})
        self.assertEqual(e['valores']['trabajo'], 'ordená el README y ya')

    def test_un_encargo_vacio_no_pasa(self):
        e, mal = encargos.pedir(ABOGADA, 'claude', {'trabajo': '   '})
        self.assertIsNone(e)

    def test_lo_que_MIRA_no_necesita_firma_y_lo_que_TOCA_si(self):
        for clave, ficha in catalogo.ENCARGOS.items():
            self.assertEqual(catalogo.necesita_permiso(clave),
                             ficha['riesgo'] != 'mira', clave)

    def test_el_riesgo_de_cada_encargo_es_uno_de_los_tres(self):
        for clave, ficha in catalogo.ENCARGOS.items():
            self.assertIn(ficha['riesgo'], ('mira', 'toca', 'ejecuta'), clave)

    def test_lo_que_se_le_muestra_al_admin_lleva_el_texto_ENTERO(self):
        """Aprobar sin ver lo que se aprueba es firmar en blanco."""
        t = 'migrá la tabla de usuarios y borrá las columnas viejas'
        leido = catalogo.como_se_lee('claude', {'trabajo': t})
        self.assertIn(t, leido)


class NOSEPUEDEATASCARELTELEFONODELOSADMIN(_Base):

    def test_hay_un_tope_de_encargos_esperando_por_persona(self):
        for i in range(encargos.TOPE_ABIERTOS):
            e, mal = encargos.pedir(TECNICO, 'claude', {'trabajo': f'cosa {i}'})
            self.assertIsNotNone(e, mal)
        e, mal = encargos.pedir(TECNICO, 'claude', {'trabajo': 'una más'})
        self.assertIsNone(e)
        self.assertIn('esperando respuesta', mal)

    def test_pero_contestar_uno_libera_el_sitio(self):
        ids = []
        for i in range(encargos.TOPE_ABIERTOS):
            e, _ = encargos.pedir(TECNICO, 'claude', {'trabajo': f'cosa {i}'})
            ids.append(e['id'])
        encargos.rechazar(JEFE, ids[0], 'no')
        e, mal = encargos.pedir(TECNICO, 'claude', {'trabajo': 'ahora sí'})
        self.assertIsNotNone(e, mal)

    def test_y_lo_que_solo_mira_nunca_se_atasca(self):
        """El parte no molesta a nadie: no tiene por qué contar contra el tope."""
        for i in range(encargos.TOPE_ABIERTOS + 3):
            e, mal = encargos.pedir(TECNICO, 'cadena')
            self.assertIsNotNone(e, mal)


# ── Lo que este archivo NO puede hacer ─────────────────────────────────────

class ELLIBRONOEJECUTA(unittest.TestCase):
    """La misma vigilancia que tiene `premio.py`.

    Si un día alguien mete aquí un `subprocess` «para que sea más cómodo», el
    proceso que habla con desconocidos vuelve a ser el que ejecuta — y todo lo
    de arriba deja de importar.
    """

    FUENTE = (AQUI / 'encargos.py').read_text(encoding='utf8')

    def test_no_hay_nada_que_corra_un_comando(self):
        for prohibido in ['subprocess', 'os.system', 'os.popen', 'popen',
                          'eval(', 'exec(', 'pty', '__import__']:
            self.assertNotIn(prohibido, self.FUENTE,
                             f'el libro de encargos puede ejecutar: «{prohibido}»')

    def test_ni_que_mande_nada_por_la_red(self):
        for prohibido in ['urllib', 'requests', 'http.client', 'socket']:
            self.assertNotIn(prohibido, self.FUENTE,
                             f'el libro sale a la red: «{prohibido}»')

    def test_el_archivo_se_escribe_solo_para_su_dueno(self):
        """Lleva quién pidió qué: no es de lectura pública en la máquina."""
        self.assertIn('S_IRUSR | stat.S_IWUSR', self.FUENTE)


if __name__ == '__main__':
    unittest.main(verbosity=2)
