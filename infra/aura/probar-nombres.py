#!/usr/bin/env python3
"""NINGUNA funcion puede nombrar algo que no existe.

POR QUE ESTE ARCHIVO EXISTE

30-ago, 22:53. En el registro del nodo, una sola linea:

    motor caido: NameError name 'p' is not defined

`preguntar_motor` llama a su persona `perfil`, y una linea escribia `_idi(p)`.
La linea vivia detras de `if not de_la_casa and perfil:` — o sea que solo
corria en la PREGUNTA DE LA VIDA, la que no es de Orden Global. AU-RA
contestaba bien de la casa y se moria con «¿como esta el clima?».

Y se moria hacia afuera: quien preguntaba leia «mi motor esta apagado». Era
mentira. El motor estaba entero, templado, esperando. Lo unico roto eran tres
letras.

Python no avisa de esto al importar: un nombre malo dentro de una funcion no
existe hasta que esa linea corre. Si la linea esta en una rama que las pruebas
no pisan, el fallo espera —dias— a que lo pise una persona de verdad. Por eso
esta prueba no prueba comportamiento: lee el arbol de CADA fuente y exige que
todo nombre que se lee este definido en algun sitio desde donde se pueda ver.

Es la clase entera, no el caso. Un `perfil` mal escrito manana falla aqui, en
segundos, y no dentro de tres semanas en el telefono de alguien.
"""

import ast
import builtins
import pathlib
import sys
import unittest

AQUI = pathlib.Path(__file__).resolve().parent

# Todo lo que corre en el nodo. Un archivo que no este aqui no esta protegido.
FUENTES = ['asistente.py', 'guion.py', 'guardia.py', 'premio.py', 'pagador.py',
           'whatsapp.py', 'vistazo.py', 'espejo.py', 'registro.py', 'oido.py',
           'candado.py', 'parte-diario.py',
           # Los permisos. Un nombre mal escrito aquí no da un error bonito:
           # da una rama que no corre, y una rama de permiso que no corre es
           # una puerta abierta.
           'escalafon.py', 'catalogo.py', 'encargos.py', 'mayordomo.py']

INTEGRADOS = set(dir(builtins)) | {'__file__', '__name__', '__doc__',
                                   '__spec__', '__package__', '__builtins__'}

# En Python 3 una comprension tiene SU PROPIO ambito: `[x for p, r in L]` no
# deja ningun `p` detras. Contarlas como si atara el ambito de fuera fue lo
# que hizo que la primera version de esta prueba no viera el fallo del
# 30-ago: `_VOSEO = [... for p, r in _VOSEO]`, a nivel de modulo, hacia
# «existir» un `p` global que en tiempo de ejecucion no existe.
AMBITOS_POR_COMPRENSION = (ast.ListComp, ast.SetComp, ast.DictComp,
                           ast.GeneratorExp)


def _atados(nodo):
    """Los nombres que un ambito ATA: parametros, asignaciones, imports, for,
    with-as, except-as, comprensiones, global/nonlocal y las definiciones.

    No se entra en funciones ni clases de dentro: lo que ellas atan es suyo.
    """
    nombres = set()
    if isinstance(nodo, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)):
        a = nodo.args
        for x in a.posonlyargs + a.args + a.kwonlyargs:
            nombres.add(x.arg)
        for x in (a.vararg, a.kwarg):
            if x:
                nombres.add(x.arg)
    if isinstance(nodo, AMBITOS_POR_COMPRENSION):
        for gen in nodo.generators:
            for x in ast.walk(gen.target):
                if isinstance(x, ast.Name):
                    nombres.add(x.id)

    def recorrer(n):
        for hijo in ast.iter_child_nodes(n):
            if isinstance(hijo, (ast.FunctionDef, ast.AsyncFunctionDef,
                                 ast.ClassDef)):
                nombres.add(hijo.name)
                continue                      # su cuerpo es otro ambito
            if isinstance(hijo, (ast.Lambda,) + AMBITOS_POR_COMPRENSION):
                continue
            if isinstance(hijo, ast.Name) and isinstance(hijo.ctx,
                                                         (ast.Store, ast.Del)):
                nombres.add(hijo.id)
            elif isinstance(hijo, (ast.Import, ast.ImportFrom)):
                for al in hijo.names:
                    nombres.add((al.asname or al.name).split('.')[0])
            elif isinstance(hijo, (ast.Global, ast.Nonlocal)):
                nombres.update(hijo.names)
            elif isinstance(hijo, ast.ExceptHandler) and hijo.name:
                nombres.add(hijo.name)
            recorrer(hijo)

    recorrer(nodo)
    return nombres


def _leidos(nodo):
    """(nombre, linea) de cada nombre que este ambito LEE, sin entrar en los
    ambitos de dentro — ellos se revisan por su cuenta, con su propia pila."""
    salida = []

    def recorrer(n):
        for hijo in ast.iter_child_nodes(n):
            if isinstance(hijo, (ast.FunctionDef, ast.AsyncFunctionDef,
                                 ast.Lambda, ast.ClassDef)
                          + AMBITOS_POR_COMPRENSION):
                continue
            if isinstance(hijo, ast.Name) and isinstance(hijo.ctx, ast.Load):
                salida.append((hijo.id, hijo.lineno))
            recorrer(hijo)

    recorrer(nodo)
    return salida


def _ambitos_de_dentro(nodo):
    """Los ambitos hijos INMEDIATOS: los que estan dentro de otro ambito son
    de ese otro, no de este."""
    salida = []

    def recorrer(n):
        for hijo in ast.iter_child_nodes(n):
            if isinstance(hijo, (ast.FunctionDef, ast.AsyncFunctionDef,
                                 ast.Lambda, ast.ClassDef)
                          + AMBITOS_POR_COMPRENSION):
                salida.append(hijo)
                continue                      # lo suyo lo revisa el
            recorrer(hijo)

    recorrer(nodo)
    return salida


def nombres_huerfanos(arch):
    """Cada nombre leido que no esta atado en ningun ambito visible."""
    arbol = ast.parse((AQUI / arch).read_text(encoding='utf8'))
    fuera = []

    def revisar(nodo, pila):
        propios = _atados(nodo)
        visibles = set().union(*pila, propios, INTEGRADOS) if pila \
            else propios | INTEGRADOS
        for nombre, linea in _leidos(nodo):
            if nombre not in visibles:
                fuera.append(f'{arch}:{linea} lee `{nombre}` y no existe')
        # El cuerpo de una clase NO es visible desde sus metodos, asi que sus
        # hijos heredan la misma pila que la clase; lo que ata una funcion si
        # lo ven las de dentro.
        hereda = pila if isinstance(nodo, ast.ClassDef) else pila + [propios]
        for hijo in _ambitos_de_dentro(nodo):
            revisar(hijo, hereda)

    revisar(arbol, [])
    return fuera


class NingunNombreSEINVENTA(unittest.TestCase):

    def test_ninguna_fuente_lee_un_nombre_que_no_existe(self):
        culpables = []
        for arch in FUENTES:
            if not (AQUI / arch).exists():
                continue
            culpables += nombres_huerfanos(arch)
        self.assertEqual(
            culpables, [],
            'nombres que no existen (un NameError esperando a una persona):'
            '\n  ' + '\n  '.join(culpables))

    def test_y_las_fuentes_de_la_lista_estan_de_verdad(self):
        """Una lista con archivos renombrados deja de proteger sin que se
        note: la prueba pasa porque no hay nada que leer."""
        faltan = [a for a in FUENTES if not (AQUI / a).exists()]
        self.assertEqual(faltan, [], f'en la lista y ya no existen: {faltan}')

    def test_la_prueba_CAZA_el_fallo_que_la_hizo_nacer(self):
        """Sin esto no hay forma de saber si el lector funciona o si todo pasa
        porque no mira nada. Es el mismo caso del 30-ago, reducido."""
        import tempfile
        malo = ('def preguntar_motor(sistema, perfil):\n'
                '    if perfil:\n'
                '        return _idi(p)\n')
        d = pathlib.Path(tempfile.mkdtemp())
        (d / 'malo.py').write_text(malo, encoding='utf8')
        global AQUI
        antes, AQUI = AQUI, d
        try:
            fuera = nombres_huerfanos('malo.py')
        finally:
            AQUI = antes
        self.assertTrue(any('`p`' in f for f in fuera),
                        f'el lector no vio el NameError: {fuera}')


if __name__ == '__main__':
    unittest.main(verbosity=2)
