#!/usr/bin/env python3
"""La puerta: lo unico que convierte un WhatsApp en algo que puede ejecutarse.

POR QUE ESTAS PRUEBAS EXISTEN

`encargos.py` tiene las reglas y `probar-encargos.py` las vigila. Pero una
regla perfecta con una puerta mal dibujada no protege nada: lo que importa
aqui es que la puerta USE las reglas, no que las tenga al lado.

Los dos fallos que se buscan son de dibujo, no de logica:

  · QUE EL BOTON SEA UNA FIRMA EN BLANCO. Un boton que lleva solo el numero
    dice «si» a lo que haya en el libro en el momento del toque, que no tiene
    por que ser lo que la persona leyo. Va la huella pegada, o no vale.

  · QUE EL ADMIN FIRME SIN VER. Un texto recortado con «…» es una firma sobre
    algo que no se leyo — y lo que no se lee es justo donde alguien esconderia
    la parte fea. El aviso lleva el encargo ENTERO.

Y uno de reparto: que el aviso NO le llegue al que lo pidio. Si le llega, la
regla 1 sigue en pie pero la puerta le esta ofreciendo un boton que no puede
usar, y eso es como se aprende a ignorar los avisos.
"""

import pathlib
import sys
import tempfile
import unittest
from unittest import mock

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import catalogo    # noqa: E402
import encargos    # noqa: E402
import escalafon   # noqa: E402
import puerta      # noqa: E402

JOSE = '50432136457'
JOSE_MAIL = 'j.ordonez@ordenglobal.org'
MEDA = '50498782176'
MEDA_MAIL = 'm.ordonez@ordenglobal.org'
TECNICO = '50433333333'
NADIE = '50499999999'

LISTA = (f'{JOSE}/{JOSE_MAIL}:admin, {MEDA}/{MEDA_MAIL}:admin, '
         f'{TECNICO}:tecnologico')


class _Relevo:
    """Anota lo que se manda en vez de mandarlo."""

    def __init__(self):
        self.textos, self.botones, self.listas = [], [], []

    def enviar(self, para, texto, parcial=False):
        self.textos.append((para, texto))

    def con_botones(self, para, texto, botones):
        self.botones.append((para, texto, botones))

    def con_lista(self, para, texto, boton, filas):
        self.listas.append((para, texto, filas))

    def a(self, quien):
        """Todo lo que se le mandó a alguien, junto."""
        return '\n'.join(t for p, t in self.textos if p == quien) + \
               '\n'.join(t for p, t, _ in self.botones if p == quien)


class _Base(unittest.TestCase):
    def setUp(self):
        self.dir = pathlib.Path(tempfile.mkdtemp())
        encargos.preparar(self.dir)
        escalafon.recargar(LISTA)
        self.rel = _Relevo()

    def tearDown(self):
        encargos.preparar(None)
        escalafon.recargar('')


# ── Abrir ───────────────────────────────────────────────────────────────────

class LAPUERTAESTAANCLADA(_Base):

    def test_las_palabras_justas_la_abren(self):
        for d in ['encargos', 'Encargos', ' MENÚ ', '¿qué puedo pedir?']:
            self.assertTrue(puerta.le_abre(d), d)

    def test_y_una_frase_de_conversacion_NO(self):
        """«contame de los encargos que hay» es alguien hablando, no una
        orden. Si eso abriera la puerta, se abriría sola todo el día."""
        for d in ['contame de los encargos que hay', 'tengo un encargo para vos',
                  'me haces un menu de comida', '', 'hola']:
            self.assertFalse(puerta.le_abre(d), d)


class CADAUNOVESULISTA(_Base):

    def test_a_quien_no_esta_en_la_lista_no_se_le_abre_nada(self):
        self.assertFalse(puerta.menu(self.rel, NADIE))
        self.assertEqual(self.rel.listas, [], 'le enseñó el menú a un extraño')

    def test_tecnologia_ve_lo_suyo_y_no_los_papeles(self):
        puerta.menu(self.rel, TECNICO)
        filas = self.rel.listas[0][2]
        claves = [f[0].replace(puerta.TOCO_PEDIR, '') for f in filas]
        self.assertIn('cadena', claves)
        self.assertIn('desplegar', claves)
        self.assertNotIn('papeles', claves)

    def test_el_admin_LLEGA_a_todo(self):
        """Meta admite diez filas y el admin ya pasa de diez, así que el menú
        se pagina. Lo que hay que garantizar no cambia: que pueda LLEGAR a
        todo. Recortar en silencio sería esconderle cosas que puede pedir —y
        ése es el fallo que no se descubre nunca: no falla nada, simplemente
        hay una función que nadie usa porque nadie sabe que está."""
        vistas = set()
        for pagina in (0, 1):
            rel = _Relevo()
            puerta.menu(rel, JOSE, desde=pagina)
            vistas |= {f[0].replace(puerta.TOCO_PEDIR, '')
                       for f in rel.listas[0][2]}
        vistas -= {'+mas', '+menos'}
        self.assertEqual(vistas, set(catalogo.ENCARGOS))

    def test_y_la_fila_de_VER_EL_RESTO_lleva_de_verdad_al_resto(self):
        """Sin esto, el botón existiría y no haría nada — que es peor que no
        tenerlo, porque la persona cree que ya vio todo."""
        rel = _Relevo()
        puerta.toque(rel, JOSE, puerta.TOCO_MAS)
        self.assertTrue(rel.listas, 'tocar «ver el resto» no abrió nada')
        claves = {f[0].replace(puerta.TOCO_PEDIR, '') for f in rel.listas[0][2]}
        self.assertIn('claude', claves)

    def test_y_se_puede_volver(self):
        rel = _Relevo()
        puerta.toque(rel, JOSE, puerta.TOCO_MENOS)
        claves = {f[0].replace(puerta.TOCO_PEDIR, '') for f in rel.listas[0][2]}
        self.assertIn('parte', claves)

    def test_quien_TIENE_POCAS_no_ve_ninguna_fila_de_paginar(self):
        """Una fila de «ver el resto» cuando no hay resto es un menú que se
        burla de quien lo abre."""
        escalafon.recargar(f'{TECNICO}:tecnologico')
        rel = _Relevo()
        puerta.menu(rel, TECNICO)
        claves = [f[0] for f in rel.listas[0][2]]
        self.assertNotIn(puerta.TOCO_MAS, claves)

    def test_se_ve_a_simple_vista_que_necesita_firma(self):
        puerta.menu(self.rel, TECNICO)
        for fid, titulo, desc in self.rel.listas[0][2]:
            clave = fid.replace(puerta.TOCO_PEDIR, '')
            if catalogo.necesita_permiso(clave):
                self.assertIn('necesita firma', desc, clave)

    def test_la_lista_cabe_en_WhatsApp(self):
        """Diez filas es el techo de Meta, 24 el título y 72 la descripción.
        Pasarse no recorta: Meta rechaza el mensaje ENTERO."""
        for tramo in escalafon.TRAMOS:
            escalafon.recargar(f'{JOSE}:{tramo}')
            rel = _Relevo()
            if not puerta.menu(rel, JOSE):
                continue
            filas = rel.listas[0][2]
            self.assertLessEqual(len(filas), 10, tramo)
            for fid, titulo, desc in filas:
                self.assertLessEqual(len(titulo), 24, f'{tramo}: «{titulo}»')
                self.assertLessEqual(len(desc), 72, f'{tramo}: «{desc}»')


# ── Pedir ───────────────────────────────────────────────────────────────────

class PEDIRLOQUENOTETOCANOSEPUEDE(_Base):

    def test_tecnologia_no_puede_pedir_papeles_ni_tocando_el_boton(self):
        """El menú no se lo ofrece, pero un botón viejo de otra lista sigue
        llegando. La puerta no puede confiar en lo que dibujó ayer."""
        puerta.toque(self.rel, TECNICO, puerta.TOCO_PEDIR + 'papeles')
        self.assertIn('no es de tecnología', self.rel.a(TECNICO))
        self.assertEqual(encargos.mios(TECNICO), [])

    def test_un_boton_inventado_no_hace_nada(self):
        for p in ['enc:borrar-todo', 'enc:', 'enc:../pagador', 'otracosa']:
            self.assertIsNone(puerta.toque(self.rel, JOSE, p), p)


class LOQUENECESITAFIRMAAVISAALOSOTROSADMIN(_Base):

    def test_le_llega_al_OTRO_admin_y_no_al_que_lo_pidio(self):
        puerta.pedir(self.rel, JOSE, 'reiniciar', {'servicio': 'aura'})
        a_quien = [p for p, _t, _b in self.rel.botones]
        self.assertEqual(a_quien, [MEDA],
                         'le ofreció firmar al que lo pidió, o no avisó a nadie')

    def test_el_aviso_lleva_el_encargo_ENTERO_no_un_resumen(self):
        largo = ('migrá la tabla de usuarios, borrá las columnas viejas y '
                 'dejá el respaldo en S3 antes de tocar nada')
        puerta.pedir(self.rel, TECNICO, 'claude', {'trabajo': largo})
        _para, texto, _b = self.rel.botones[0]
        self.assertIn(largo, texto, 'el admin firmaría algo que no leyó entero')
        self.assertNotIn('…', texto)

    def test_y_dice_quien_lo_pidio_y_de_que_tramo(self):
        puerta.pedir(self.rel, TECNICO, 'desplegar')
        _p, texto, _b = self.rel.botones[0]
        self.assertIn(TECNICO, texto)
        self.assertIn('tecnología', texto)

    def test_al_que_pidio_se_le_dice_el_numero(self):
        e = puerta.pedir(self.rel, TECNICO, 'desplegar')
        self.assertIn(e['id'], self.rel.a(TECNICO))

    def test_un_admin_con_dos_buzones_recibe_UN_aviso_no_dos(self):
        puerta.pedir(self.rel, TECNICO, 'desplegar')
        self.assertEqual(len(self.rel.botones), 2,
                         'los dos admin tenían que recibir uno cada uno')
        self.assertEqual(sorted(p for p, _t, _b in self.rel.botones),
                         sorted([JOSE, MEDA]))


class ELBOTONNOESUNAFIRMAENBLANCO(_Base):
    """Un botón con solo el número dice «sí» a lo que haya en el libro en el
    momento del toque, que no tiene por qué ser lo que se leyó."""

    def test_el_boton_lleva_la_huella_de_lo_que_se_mostro(self):
        e = puerta.pedir(self.rel, JOSE, 'reiniciar', {'servicio': 'aura'})
        _p, _t, botones = self.rel.botones[0]
        for _titulo, payload in botones:
            self.assertIn(e['huella'], payload,
                          'el botón firma en blanco: no lleva la huella')

    def test_una_huella_que_no_cuadra_NO_firma(self):
        e = puerta.pedir(self.rel, JOSE, 'reiniciar', {'servicio': 'aura'})
        puerta.toque(self.rel, MEDA, f'{puerta.TOCO_SI}{e["id"]}:huellavieja')
        self.assertEqual(encargos.ver(e['id'])['estado'], 'pedido')
        self.assertIn('cambió después de mostrártelo', self.rel.a(MEDA))

    def test_con_la_huella_buena_firma(self):
        e = puerta.pedir(self.rel, JOSE, 'reiniciar', {'servicio': 'aura'})
        puerta.toque(self.rel, MEDA, f'{puerta.TOCO_SI}{e["id"]}:{e["huella"]}')
        self.assertEqual(encargos.ver(e['id'])['estado'], 'aprobado')
        self.assertEqual(encargos.ver(e['id'])['firma'], MEDA)

    def test_el_que_lo_pidio_no_puede_firmarlo_ni_con_la_huella_buena(self):
        e = puerta.pedir(self.rel, JOSE, 'reiniciar', {'servicio': 'aura'})
        puerta.toque(self.rel, JOSE, f'{puerta.TOCO_SI}{e["id"]}:{e["huella"]}')
        self.assertEqual(encargos.ver(e['id'])['estado'], 'pedido')
        self.assertIn('lo pediste vos', self.rel.a(JOSE))

    def test_ni_desde_su_otro_buzon(self):
        e = puerta.pedir(self.rel, JOSE, 'reiniciar', {'servicio': 'aura'})
        puerta.toque(self.rel, JOSE_MAIL,
                     f'{puerta.TOCO_SI}{e["id"]}:{e["huella"]}')
        self.assertEqual(encargos.ver(e['id'])['estado'], 'pedido')

    def test_alguien_de_fuera_no_puede_firmar_aunque_tenga_el_boton(self):
        """El payload se puede copiar de una captura. Lo que decide es quién
        toca, no qué botón."""
        e = puerta.pedir(self.rel, JOSE, 'reiniciar', {'servicio': 'aura'})
        puerta.toque(self.rel, NADIE, f'{puerta.TOCO_SI}{e["id"]}:{e["huella"]}')
        self.assertEqual(encargos.ver(e['id'])['estado'], 'pedido')

    def test_ni_alguien_de_la_casa_que_no_es_admin(self):
        e = puerta.pedir(self.rel, JOSE, 'reiniciar', {'servicio': 'aura'})
        puerta.toque(self.rel, TECNICO,
                     f'{puerta.TOCO_SI}{e["id"]}:{e["huella"]}')
        self.assertEqual(encargos.ver(e['id'])['estado'], 'pedido')


class ELQUEPIDIOSEENTERASIEMPRE(_Base):
    """Un encargo que se muere en silencio es peor que uno rechazado."""

    def test_cuando_se_lo_aprueban(self):
        e = puerta.pedir(self.rel, TECNICO, 'desplegar')
        self.rel.textos.clear()
        puerta.toque(self.rel, JOSE, f'{puerta.TOCO_SI}{e["id"]}:{e["huella"]}')
        self.assertIn(e['id'], self.rel.a(TECNICO))
        self.assertIn('aprobado', self.rel.a(TECNICO))

    def test_y_cuando_se_lo_rechazan(self):
        e = puerta.pedir(self.rel, TECNICO, 'desplegar')
        self.rel.textos.clear()
        puerta.toque(self.rel, JOSE, f'{puerta.TOCO_NO}{e["id"]}:{e["huella"]}')
        self.assertIn('no se aprobó', self.rel.a(TECNICO))
        self.assertEqual(encargos.ver(e['id'])['estado'], 'rechazado')

    def test_puede_ver_lo_suyo_cuando_quiera(self):
        puerta.pedir(self.rel, TECNICO, 'desplegar')
        self.rel.textos.clear()
        puerta.mios(self.rel, TECNICO)
        self.assertIn('esperando firma', self.rel.a(TECNICO))

    def test_y_lo_ve_igual_desde_su_otro_buzon(self):
        puerta.pedir(self.rel, JOSE, 'reiniciar', {'servicio': 'aura'})
        self.rel.textos.clear()
        puerta.mios(self.rel, JOSE_MAIL)
        self.assertIn('esperando firma', self.rel.a(JOSE_MAIL))


class LOQUESALESOLONOMOLESTAANADIE(_Base):

    def test_no_se_le_avisa_a_ningun_admin(self):
        hecho = []
        puerta.pedir(self.rel, TECNICO, 'cadena', hacer=hecho.append)
        self.assertEqual(self.rel.botones, [], 'molestó a un admin por un vistazo')
        self.assertEqual(len(hecho), 1, 'no lo hizo')

    def test_y_queda_anotado_igual(self):
        e = puerta.pedir(self.rel, TECNICO, 'cadena', hacer=lambda x: None)
        self.assertEqual(encargos.ver(e['id'])['estado'], 'aprobado')
        self.assertEqual(encargos.ver(e['id'])['firma'], 'sale solo')


class LAPUERTANOEJECUTA(unittest.TestCase):
    """La misma vigilancia que `encargos.py`. Si algún día alguien mete aquí
    un `subprocess` «para que sea más directo», el proceso que habla con
    desconocidos vuelve a ser el que ejecuta."""

    FUENTE = (AQUI / 'puerta.py').read_text(encoding='utf8')

    def test_no_hay_nada_que_corra_un_comando(self):
        for prohibido in ['subprocess', 'os.system', 'os.popen', 'eval(',
                          'exec(', '__import__']:
            self.assertNotIn(prohibido, self.FUENTE, prohibido)

    def test_ni_importa_al_mayordomo(self):
        """Lo que se hace solo entra por parámetro. El que dibuja la puerta no
        tiene por qué poder hacer nada."""
        self.assertNotIn('import mayordomo', self.FUENTE)




class LOMASESPECIFICOMANDA(_Base):
    """«mis encargos» y «encargos» se parecen demasiado.

    Estaban las dos en `PALABRAS`, y como el menú se miraba primero, quien
    escribía «mis encargos» recibía la lista de lo que PUEDE pedir en vez de
    cómo quedó lo que YA pidió. Lo cazó una simulación en el nodo el 1-sep.
    """

    FUENTE = (AQUI / 'asistente.py').read_text(encoding='utf8')

    def test_mis_encargos_NO_abre_el_menu(self):
        self.assertFalse(puerta.le_abre('mis encargos'))
        self.assertFalse(puerta.le_abre('lo mío'))

    def test_pero_encargos_a_secas_SI(self):
        self.assertTrue(puerta.le_abre('encargos'))
        self.assertTrue(puerta.le_abre('menú'))

    def test_y_se_mira_ANTES_que_el_menu(self):
        """Aunque un día vuelva a estar en las dos listas."""
        i = self.FUENTE.index("'mis encargos'")
        j = self.FUENTE.index('puerta.le_abre(dicho)')
        self.assertLess(i, j, 'el menú se come a «mis encargos»')

    def test_mios_enseña_COMO_QUEDO_lo_pedido(self):
        e = puerta.pedir(self.rel, TECNICO, 'desplegar')
        self.rel.textos.clear()
        puerta.mios(self.rel, TECNICO)
        dicho = self.rel.a(TECNICO)
        self.assertIn(e['id'], dicho)
        self.assertIn('esperando firma', dicho)
        self.assertNotIn('lo que podés pedirme', dicho)

if __name__ == '__main__':
    unittest.main(verbosity=2)
