#!/usr/bin/env python3
"""¿QUÉ VERSIÓN DE AU-RA ESTÁ CORRIENDO? Contestado con un GET.

El relevo ya lo tenía (version_servida) y se inventó por un caso concreto: un
arreglo estuvo diez días en el repositorio sin estar en la máquina, y desde
fuera no había forma de notarlo — /salud contestaba «vivo: true» con la misma
alegría sirviendo cualquier versión. Averiguarlo costó medir tiempos de
respuesta, que no es manera de trabajar.

AU-RA se había quedado sin esa cura, y es donde más se nota: el prompt es lo
que decide CÓMO contesta. «¿Está desplegado el prompt nuevo?» no tenía
respuesta que no fuera entrar a la máquina, o preguntarle a ella y adivinar
por el tono.

Se prueba corriendo las funciones de verdad, no leyendo el archivo.
"""
import ast
import hashlib
import json
import os
import pathlib
import tempfile
import time

RAIZ = pathlib.Path(__file__).resolve().parent
RELEVO = RAIZ.parent / 'mensajes' / 'servidor.py'
mal = 0


def prueba(nombre, fn):
    global mal
    try:
        fn()
        print('  ok  ' + nombre)
    except Exception as e:
        mal += 1
        print('  MAL ' + nombre + '\n      ' + str(e))


def cargar(ruta, nombres, extra):
    """Saca unas funciones del archivo y las corre solas, con lo que necesiten
    puesto a mano. Así se prueba el comportamiento sin arrancar el servicio
    entero ni hablarle a Ollama."""
    arbol = ast.parse(pathlib.Path(ruta).read_text())
    trozos = [n for n in arbol.body
              if isinstance(n, ast.FunctionDef) and n.name in nombres]
    faltan = set(nombres) - {n.name for n in trozos}
    if faltan:
        raise AssertionError('faltan funciones en ' + str(ruta) + ': ' + str(faltan))
    g = dict(extra)
    exec(compile(ast.Module(body=trozos, type_ignores=[]), str(ruta), 'exec'), g)
    return g


def casa():
    """Una casa de mentira con un prompt y un asistente dentro."""
    d = pathlib.Path(tempfile.mkdtemp())
    (d / 'PROMPT-AURA.md').write_text('```\nsoy el prompt\n```')
    mio = d / 'asistente-falso.py'
    mio.write_text('cuerpo del asistente')
    g = cargar(RAIZ / 'asistente.py', ('huella_viva', 'dejar_huella'), {
        'os': os, 'time': time, 'json': json,
        'DATOS': d, 'RUTA_PROMPT': d / 'PROMPT-AURA.md',
        'MODELO_RAPIDA': 'qwen2.5:7b', 'MODELO_PENSADORA': 'gemma2:9b',
        'probadores': lambda: None, 'log': lambda *a: None,
        '__file__': str(mio),
    })
    return d, mio, g


def sha(p):
    return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()[:10]


def afirmar(cierto, motivo):
    if not cierto:
        raise AssertionError(motivo)


print('\nla huella dice qué está corriendo')


def es_la_del_archivo():
    d, mio, g = casa()
    h = g['huella_viva']()
    afirmar(h['prompt'] == sha(d / 'PROMPT-AURA.md'),
            'la huella del prompt no es la del prompt')
    afirmar(h['asistente'] == sha(mio),
            'la huella del asistente no es la del asistente')


def distingue_dos_prompts():
    d, mio, g = casa()
    antes = g['huella_viva']()['prompt']
    (d / 'PROMPT-AURA.md').write_text('```\notro prompt\n```')
    afirmar(g['huella_viva']()['prompt'] != antes,
            'cambia el prompt y la huella no se entera: entonces no sirve de nada')


def dice_si_esta_abierta():
    d, mio, g = casa()
    afirmar(g['huella_viva']()['abierta'] is True,
            'no informa de si le contesta a todo el mundo o solo a una lista')


def la_deja_de_una_pieza():
    d, mio, g = casa()
    g['dejar_huella']()
    afirmar((d / 'version.json').exists(), 'no escribió nada')
    afirmar(json.loads((d / 'version.json').read_text())['prompt']
            == sha(d / 'PROMPT-AURA.md'), 'escribió otra cosa')
    afirmar(not (d / 'version.json.tmp').exists(),
            'quedó el temporal: el relevo puede leerlo a medias')


def no_poder_escribirla_no_la_tumba():
    d, mio, g = casa()
    g['DATOS'] = pathlib.Path('/no/existe/por/aqui')
    g['dejar_huella']()   # saber la versión es comodidad, no condición


prueba('es la del archivo de verdad, no un número puesto a mano', es_la_del_archivo)
prueba('distingue un prompt de otro, que es para lo que existe', distingue_dos_prompts)
prueba('dice si está abierta a todos', dice_si_esta_abierta)
prueba('la deja escrita, y de una sola pieza', la_deja_de_una_pieza)
prueba('no poder escribirla no tumba a AU-RA', no_poder_escribirla_no_la_tumba)


print('\ny el relevo la sirve')


def el_relevo_la_publica():
    txt = RELEVO.read_text()
    afirmar("'aura': version_de_aura()" in txt, '/salud no publica la huella')
    g = cargar(RELEVO, ('version_de_aura',), {'json': json})
    r = g['version_de_aura']()
    afirmar(isinstance(r, dict), 'no devuelve un objeto')
    # en esta máquina no hay /srv/aura, así que tiene que decir que no la sabe
    afirmar('estado' in r or 'prompt' in r,
            'devuelve algo que no dice ni la versión ni que no la sabe: '
            '«no está desplegado» y «este relevo no se enteró» quedan con la '
            'misma cara, que es el fallo que esto viene a arreglar')


def no_la_cachea():
    cuerpo = RELEVO.read_text().split('def version_de_aura')[1].split('\ndef ')[0]
    afirmar('global _version' not in cuerpo,
            'la cachea: AU-RA se reinicia sola y este relevo serviría la de '
            'antes justo cuando importa saberlo')


prueba('lo publica en /salud, y sin fichero dice que no lo hay', el_relevo_la_publica)
prueba('la lee en cada petición, no una vez y para siempre', no_la_cachea)

print(f'\n{mal} mal\n' if mal else '\ntodo bien\n')
raise SystemExit(1 if mal else 0)
