#!/usr/bin/env python3
"""La puerta publica: que nadie entre por ahi a lo que no es suyo.

POR QUE ESTE ARCHIVO ES EL MAS IMPORTANTE DE LOS DE PRUEBAS

Todo lo demas del sistema le habla a gente que tiene numero de telefono y esta
en el escalafon. El portal le habla a CUALQUIERA, sin registro, sin telefono y
sin nada que perder si se porta mal.

Y dentro de `asistente.atender` los permisos se deciden por el `de`. O sea que
la unica pregunta de seguridad que importa es: ¿puede el visitante elegir su
`de`? Si puede, manda el telefono de Jose y le abre el espejo —conversaciones
privadas de gente real— o le firma un encargo.
"""

import pathlib
import sys
import time
import unittest
from unittest import mock

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import asistente   # noqa: E402
import escalafon   # noqa: E402
import portal      # noqa: E402

# `asistente` se importa UNA vez, aqui arriba, y se parchean sus atributos.
# Con `mock.patch.dict(sys.modules)` se quedaba fuera y volvia a importarse al
# salir del `with`, y `cryptography` —que entra por `candado.py`— no se puede
# inicializar dos veces en el mismo proceso: «PyO3 modules compiled for CPython
# 3.8 or older may only be initialized once».


def _limpio():
    portal._visto.clear()
    portal._dentro = 0


class NADIEENTRAPORAQUICOMOADMIN(unittest.TestCase):
    """Lo único que de verdad hay que garantizar."""

    def test_un_telefono_del_equipo_NO_se_acepta_como_sesion(self):
        """El ataque entero es una línea: mandar el número de José como
        sesión. Si esto pasa, todo lo demás del portal da igual."""
        for persona in escalafon.admins():
            for donde in escalafon.formas_de(persona):
                self.assertIsNone(portal.valida(donde),
                                  f'la web pudo hacerse pasar por {donde[-4:]}')

    def test_ni_disfrazado_de_sesion_web(self):
        for intento in ['web:50432136457', 'web:' + 'a' * 21 + ':50432136457',
                        'web:j.ordonez@ordenglobal.org', 'WEB:aaaaaaaaaaaaaaaaaaaaaa',
                        '  web:aaaaaaaaaaaaaaaaaaaaaa  ', 'web:', 'web:../../etc',
                        'j.ordonez@ordenglobal.org', '50432136457', '', None]:
            self.assertIsNone(portal.valida(intento), repr(intento))

    def test_una_sesion_de_verdad_si_se_acepta(self):
        s = portal.nueva_sesion()
        self.assertEqual(portal.valida(s), s)

    def test_el_nombre_de_la_web_NO_SE_PUEDE_ESCRIBIR_en_el_escalafon(self):
        """La defensa de fondo: no es una lista de prohibiciones —esas se
        quedan viejas cuando alguien agrega una función nueva— es que el
        nombre sea imposible de poner en el fichero. Los dos puntos son el
        separador del escalafón, así que una línea con `web:…` no existe."""
        s = portal.nueva_sesion()
        self.assertIn(':', s)
        self.assertFalse(escalafon.tramos_de(s))
        self.assertFalse(escalafon.es_admin(s))
        self.assertIsNone(escalafon.tramo_de(s))

    def test_dos_sesiones_nunca_son_la_misma(self):
        self.assertEqual(len({portal.nueva_sesion() for _ in range(500)}), 500)

    def test_la_sesion_no_lleva_nada_de_la_persona_dentro(self):
        """Ni correo, ni IP, ni la hora. Lo que no se guarda no se filtra."""
        s = portal.nueva_sesion()
        self.assertNotIn(str(int(time.time()))[:6], s)


class ELESPEJONOSEASOMAALAWEB(unittest.TestCase):
    """El recado devuelve vacío donde el espejo mira, y no por casualidad."""

    def test_no_hay_agenda(self):
        r = portal.Recado()
        self.assertEqual(r.conversaciones(), [])
        self.assertEqual(r.bandeja('quien sea'), [])

    def test_el_recado_junta_lo_que_se_dijo(self):
        r = portal.Recado()
        r.enviar('x', 'hola')
        r.con_botones('x', 'elegí', [('Sí', 'si'), ('No', 'no')])
        j = r.como_json()
        self.assertIn('hola', j['texto'])
        self.assertEqual([b['id'] for b in j['botones']], ['si', 'no'])

    def test_nunca_mas_de_tres_botones(self):
        """WhatsApp acepta tres; la web usa los mismos nodos del guión. Si
        aquí salieran diez, los dos lados dejarían de verse igual."""
        r = portal.Recado()
        r.con_lista('x', 't', 'Ver', [(f'i{n}', f't{n}', 'd') for n in range(10)])
        self.assertLessEqual(len(r.como_json()['botones']), 3)


class ELFRENO(unittest.TestCase):
    def setUp(self):
        _limpio()

    def test_deja_hablar_hasta_el_tope_y_despues_no(self):
        s = portal.nueva_sesion()
        for i in range(portal.POR_SESION):
            self.assertTrue(portal.deja_hablar(s, 1000)[0], i)
            portal.apuntar(s, 1000)
        self.assertEqual(portal.deja_hablar(s, 1000), (False, 'muchas'))

    def test_pasado_el_rato_vuelve_a_dejar(self):
        s = portal.nueva_sesion()
        for _ in range(portal.POR_SESION):
            portal.apuntar(s, 1000)
        self.assertFalse(portal.deja_hablar(s, 1000)[0])
        self.assertTrue(portal.deja_hablar(s, 1000 + portal.EN + 1)[0])

    def test_el_freno_de_uno_no_frena_a_otro(self):
        a, b = portal.nueva_sesion(), portal.nueva_sesion()
        for _ in range(portal.POR_SESION):
            portal.apuntar(a, 1000)
        self.assertFalse(portal.deja_hablar(a, 1000)[0])
        self.assertTrue(portal.deja_hablar(b, 1000)[0])

    def test_y_HACE_FALTA_el_freno_de_la_casa(self):
        """Con solo el de la sesión, mil sesiones nuevas pasan todas y la
        tarjeta que le contesta a WhatsApp se queda sin sitio."""
        with portal.enCurso(), portal.enCurso():
            self.assertEqual(portal.deja_hablar(portal.nueva_sesion(), 1000),
                             (False, 'ocupado'))

    def test_deja_libre_un_sitio_para_WHATSAPP(self):
        """La tarjeta atiende tres. El portal nunca ocupa los tres: quien
        escribe por WhatsApp no puede quedarse esperando detrás de la web."""
        self.assertLess(portal.A_LA_VEZ, 3)

    def test_el_sitio_se_suelta_aunque_reviente(self):
        antes = portal._dentro
        with self.assertRaises(ValueError):
            with portal.enCurso():
                raise ValueError('lo que sea')
        self.assertEqual(portal._dentro, antes)

    def test_el_no_SIEMPRE_lleva_explicacion(self):
        """Un «no» sin motivo se lee como que se rompió, y quien cree que se
        rompió recarga y vuelve a pedir — justo lo que no queremos."""
        for motivo in ('muchas', 'ocupado'):
            for idi in ('es', 'en'):
                self.assertTrue(portal.ESPERA[motivo][idi].strip())


class LOQUENOSEGUARDAPARASIEMPRE(unittest.TestCase):
    def test_un_visitante_viejo_se_borra(self):
        s = portal.nueva_sesion()
        p = {s: {'visto': 0}}
        self.assertEqual(portal.caducar(p, 10 ** 9), 1)
        self.assertEqual(p, {})

    def test_uno_reciente_se_queda(self):
        s = portal.nueva_sesion()
        ahora = 10 ** 9
        p = {s: {'visto': ahora - 60}}
        portal.caducar(p, ahora)
        self.assertIn(s, p)

    def test_JAMAS_toca_un_perfil_de_whatsapp(self):
        """Un fallo aquí no puede llevarse por delante la memoria de alguien
        del equipo, que sí tiene que durar."""
        p = {'50432136457': {'visto': 0}, 'j.ordonez@ordenglobal.org': {}}
        self.assertEqual(portal.caducar(p, 10 ** 9), 0)
        self.assertEqual(len(p), 2)


class HABLANDODEVERDAD(unittest.TestCase):
    """El portal no decide qué contestar: llama al mismo `atender`."""

    def setUp(self):
        _limpio()

    def test_llama_al_asistente_con_la_sesion_como_de(self):
        visto = {}

        def falso(rel, _sis, _p, de, dicho, _m=None):
            visto['de'] = de
            visto['dicho'] = dicho
            rel.enviar(de, 'contestado')

        with mock.patch.object(asistente, 'atender', falso), \
             mock.patch.object(asistente, 'perfil_de',
                               lambda pf, q: pf.setdefault(q, {})):
            r, s = portal.hablar('sis', {}, None, 'hola')
        self.assertTrue(portal.es_de_la_web(visto['de']))
        self.assertEqual(visto['de'], s)
        self.assertEqual(r['texto'], 'contestado')

    def test_una_sesion_mala_NO_hereda_la_charla_de_nadie(self):
        """Se abre una sesión nueva en vez de aceptar el nombre raro: lo peor
        que pasa es que alguien pierda el hilo; lo peor del otro camino es que
        un desconocido sea admin."""
        with mock.patch.object(asistente, 'atender',
                               lambda rel, *a, **k: rel.enviar('x', 'ok')), \
             mock.patch.object(asistente, 'perfil_de',
                               lambda pf, q: pf.setdefault(q, {})):
            _r, s = portal.hablar('sis', {}, '50432136457', 'hola')
        self.assertNotEqual(s, '50432136457')
        self.assertTrue(portal.es_de_la_web(s))

    def test_el_freno_contesta_sin_gastar_la_tarjeta(self):
        s = portal.nueva_sesion()
        for _ in range(portal.POR_SESION):
            portal.apuntar(s, time.time())
        llamado = []
        with mock.patch.object(asistente, 'atender',
                               lambda *a, **k: llamado.append(1)), \
             mock.patch.object(asistente, 'perfil_de',
                               lambda pf, q: pf.setdefault(q, {})):
            r, _s = portal.hablar('sis', {s: {}}, s, 'hola')
        self.assertTrue(r.get('espera'))
        self.assertFalse(llamado, 'gastó la GPU para decir que no')


if __name__ == '__main__':
    unittest.main(verbosity=2)
