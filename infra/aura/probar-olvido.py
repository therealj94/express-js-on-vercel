#!/usr/bin/env python3
"""El olvido: un mes sin escribir y se borra todo lo suyo.

POR QUE ESTAS PRUEBAS EXISTEN

Borrar datos de personas automáticamente es de las cosas que más caro salen
cuando se hacen mal, y falla en las dos direcciones:

  · SI BORRA DE MÁS, alguien que escribió ayer vuelve hoy y AU-RA no lo conoce:
    lo saluda de cero, le vuelve a hacer la entrevista y pierde su historial.
    El caso peligroso no es el obvio — es el perfil SIN FECHA. Los que ya
    existían no la tienen, y tratar «sin fecha» como «viejísimo» borraría a
    todo el mundo la primera vez que esto corre.

  · SI BORRA DE MENOS, no sirve: el compromiso con José es un mes, y una
    empresa que vende cumplimiento no puede guardar conversaciones sin plazo.

Y hay un tercer daño, más silencioso: borrar el perfil de alguien MIENTRAS se
le está contestando deja a su hilo escribiendo en un diccionario que ya no está
en ninguna parte, y la persona se queda sin respuesta a mitad.

No se importa `asistente.py` entero —arrastra el módulo de cripto, que en el
contenedor de trabajo está roto— sino que se extrae la función y se ejecuta con
un ámbito controlado. Lo que se prueba es el código de verdad, tal cual está en
el archivo.
"""

import os
import pathlib
import re
import sys
import threading
import time
import unittest

AQUI = pathlib.Path(__file__).resolve().parent


def cargar_olvido(plazo_dias=30, en_curso=None, guardados=None):
    """Saca `olvidar_inactivos` del archivo y la corre con un ámbito de mentira."""
    fuente = (AQUI / 'asistente.py').read_text(encoding='utf8')
    i = fuente.index('def olvidar_inactivos(')
    j = fuente.index('def vuelta_whatsapp(')
    ambito = {
        'time': time,
        'PLAZO_DIAS': plazo_dias,
        'EN_CURSO': en_curso if en_curso is not None else set(),
        'CANDADO_CURSO': threading.Lock(),
        'CANDADO_PERFILES': threading.RLock(),
        'guardar_perfiles': (guardados.append if guardados is not None
                             else (lambda p: None)),
        'log': lambda *a: (guardados is not None
                           and guardados.append(('log', ' '.join(map(str, a))))),
    }
    exec(compile(fuente[i:j], 'asistente', 'exec'), ambito)
    return ambito['olvidar_inactivos']


DIA = 86400
AHORA = 1_800_000_000


def perfil(dias_sin_escribir, **extra):
    return {'visto': AHORA - int(dias_sin_escribir * DIA),
            'historial': [{'role': 'user', 'content': 'hola'}],
            'trabajo': 'tiene una pulpería', **extra}


class ElPlazo(unittest.TestCase):

    def test_quien_escribio_hoy_se_queda(self):
        olvidar = cargar_olvido()
        p = {'ana@x.invalid': perfil(0)}
        self.assertEqual(olvidar(p, AHORA), 0)
        self.assertIn('ana@x.invalid', p)

    def test_quien_escribio_hace_un_mes_y_un_dia_SE_BORRA(self):
        olvidar = cargar_olvido()
        p = {'ana@x.invalid': perfil(31)}
        self.assertEqual(olvidar(p, AHORA), 1)
        self.assertEqual(p, {})

    def test_justo_en_el_plazo_todavia_no(self):
        """A los treinta días clavados se queda: el corte es «pasado el mes»,
        no «llegando al mes». Un día de más no le hace daño a nadie; un día de
        menos borra a quien iba a escribir mañana."""
        olvidar = cargar_olvido()
        p = {'ana@x.invalid': perfil(30)}
        self.assertEqual(olvidar(p, AHORA), 0)
        self.assertIn('ana@x.invalid', p)

    def test_el_plazo_se_puede_cambiar(self):
        olvidar = cargar_olvido(plazo_dias=7)
        p = {'ana@x.invalid': perfil(10)}
        self.assertEqual(olvidar(p, AHORA), 1)


class ElPerfilSinFecha(unittest.TestCase):
    """El caso que borraría a todo el mundo la primera vez."""

    def test_UN_PERFIL_SIN_FECHA_NO_SE_BORRA(self):
        olvidar = cargar_olvido()
        p = {'viejo@x.invalid': {'historial': [], 'trabajo': 'albañil'}}
        self.assertEqual(olvidar(p, AHORA), 0,
                         'borró a alguien solo por no tener fecha')
        self.assertIn('viejo@x.invalid', p)

    def test_y_se_le_pone_la_de_hoy_para_que_empiece_a_contar(self):
        olvidar = cargar_olvido()
        p = {'viejo@x.invalid': {'historial': []}}
        olvidar(p, AHORA)
        self.assertEqual(p['viejo@x.invalid']['visto'], AHORA)

    def test_una_fecha_basura_tampoco_borra(self):
        """Un `visto` que no es un número —de una versión vieja, de un archivo
        editado a mano— no puede convertirse en «bórralo»."""
        olvidar = cargar_olvido()
        for basura in ['ayer', None, {}, []]:
            p = {'x@x.invalid': {'visto': basura, 'historial': []}}
            self.assertEqual(olvidar(p, AHORA), 0, f'borró con visto={basura!r}')


class NoSeBorraAQuienSeEstaAtendiendo(unittest.TestCase):

    def test_su_perfil_sobrevive_aunque_le_toque(self):
        """Su hilo tiene el perfil en la mano. Borrarlo por debajo lo deja
        escribiendo en un diccionario que ya no está, y la persona se queda sin
        respuesta a mitad."""
        olvidar = cargar_olvido(en_curso={'ana@x.invalid'})
        p = {'ana@x.invalid': perfil(90), 'otro@x.invalid': perfil(90)}
        self.assertEqual(olvidar(p, AHORA), 1)
        self.assertIn('ana@x.invalid', p, 'borró a alguien mientras le contestaba')
        self.assertNotIn('otro@x.invalid', p)


class SeBorraTODO(unittest.TestCase):

    def test_no_queda_media_ficha(self):
        """Lo que queda a medias no es privacidad: es un archivo con el nombre y
        el oficio de alguien y sin lo único que le daba sentido."""
        olvidar = cargar_olvido()
        p = {'ana@x.invalid': perfil(60, saludado=True, usadas=17,
                                     voz=True, tope=12345)}
        olvidar(p, AHORA)
        self.assertEqual(p, {})


class LoQueQuedaEscrito(unittest.TestCase):

    def test_se_guarda_en_disco_cuando_borra(self):
        hechos = []
        olvidar = cargar_olvido(guardados=hechos)
        olvidar({'ana@x.invalid': perfil(60)}, AHORA)
        self.assertTrue(any(not isinstance(h, tuple) for h in hechos),
                        'borró en memoria y no lo guardó: vuelve al reiniciar')

    def test_no_se_guarda_nada_si_no_borro_nada(self):
        """Reescribir el archivo cada veinte minutos sin motivo es trabajo de
        disco y una ventana más para corromperlo."""
        hechos = []
        olvidar = cargar_olvido(guardados=hechos)
        olvidar({'ana@x.invalid': perfil(0)}, AHORA)
        self.assertEqual(hechos, [])

    def test_EL_REGISTRO_NO_DICE_A_QUIEN(self):
        """Un registro que dice «se borró a fulano» es justo el dato que se
        acaba de decidir no guardar."""
        hechos = []
        olvidar = cargar_olvido(guardados=hechos)
        olvidar({'ana@x.invalid': perfil(60)}, AHORA)
        renglones = [h[1] for h in hechos if isinstance(h, tuple) and h[0] == 'log']
        self.assertTrue(renglones, 'no dejó ninguna nota')
        for r in renglones:
            self.assertNotIn('ana', r.lower(), f'nombró a la persona: «{r}»')
            self.assertIn('1', r, 'no dice cuántos')


class ElCodigoDeVerdad(unittest.TestCase):
    """Que lo que se probó arriba sea lo que corre, y no una copia que se
    quedó vieja."""

    def test_el_plazo_por_defecto_es_un_mes(self):
        fuente = (AQUI / 'asistente.py').read_text(encoding='utf8')
        m = re.search(r"PLAZO_DIAS = int\(os\.environ\.get\('AURA_PLAZO_DIAS', '(\d+)'\)\)",
                      fuente)
        self.assertIsNotNone(m, 'no encuentro el plazo')
        self.assertEqual(m.group(1), '30')

    def test_el_olvido_corre_en_el_latido(self):
        fuente = (AQUI / 'asistente.py').read_text(encoding='utf8')
        i = fuente.index('def latido_templado()')
        j = fuente.index('threading.Thread(target=latido_templado', i)
        self.assertIn('olvidar_inactivos(perfiles)', fuente[i:j],
                      'el olvido está escrito pero nadie lo llama')

    def test_la_actividad_se_refresca_al_contestar(self):
        fuente = (AQUI / 'asistente.py').read_text(encoding='utf8')
        self.assertIn("p['visto'] = int(time.time())", fuente,
                      'sin esto el reloj no vuelve a cero y se borra a quien sí escribe')


if __name__ == '__main__':
    unittest.main(verbosity=2)
