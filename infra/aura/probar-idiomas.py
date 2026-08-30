#!/usr/bin/env python3
"""NADA que lea una persona puede existir en un solo idioma.

POR QUE ESTE ARCHIVO EXISTE

30-ago, 13:25. José jugaba en inglés —las tres preguntas, el premio, todo en
inglés— y de golpe leyó «Contame vos. Puedo hablar de lo que quieras». Era
`MODO_RETIRADO`, una constante de módulo en español.

Ya había una prueba de esto y no lo cazó: buscaba literales pegados a
`rel.enviar(`, y ésta era una CONSTANTE. Perseguir el patrón que falló la
última vez es cómo se llega a la tercera.

Así que esta prueba no busca patrones: recorre el árbol del fuente y exige que
CADA constante de texto largo esté clasificada a propósito — o es bilingüe, o
está en la lista de las que nunca lee una persona. Una constante nueva en
español falla aquí hasta que alguien decida cuál de las dos es.
"""

import ast
import pathlib
import re
import sys
import unittest

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import guion   # noqa: E402

# Marcas de que un texto está escrito en español. Con que aparezca una basta:
# lo que se busca es «esto está en UN idioma», no un análisis lingüístico.
ESPANOL = re.compile(
    r'[áéíóúñ¿¡]|\b(vos|acá|allá|querés|podés|tenés|sabés|contame|preguntame|'
    r'decime|tocá|probá|dale|nomás|pará)\b', re.I)

# Lo que NUNCA lee una persona. Cada entrada es una decisión, no un descarte:
# si mañana una de éstas se manda por WhatsApp, hay que sacarla de aquí y
# traducirla.
NO_LAS_LEE_NADIE = {
    'asistente.py': set(),
    'guardia.py': {
        # El guardia es un filtro determinista y no sabe de idiomas a
        # propósito: devuelve el MOTIVO del corte, y quien manda —el
        # asistente— pone la frase en el idioma de la persona
        # (`guion.frase('respuesta-rota', …)`). Esta constante queda como
        # respaldo para quien use `guardia.revisar` por su cuenta.
        'RESPUESTA_ROTA',
    },
    'premio.py': set(),
}


def constantes_de(arch):
    """(nombre, texto, linea) de cada constante de módulo con texto largo."""
    t = (AQUI / arch).read_text(encoding='utf8')
    for n in ast.walk(ast.parse(t)):
        if not isinstance(n, ast.Assign):
            continue
        nombre = getattr(n.targets[0], 'id', '')
        if not nombre or not nombre.isupper():
            continue
        v = n.value
        # Una cadena suelta: candidata a estar en un solo idioma.
        if isinstance(v, ast.Constant) and isinstance(v.value, str):
            yield nombre, v.value, n.lineno
        # Un diccionario: bilingüe si tiene las dos claves; si no, sus valores
        # son candidatos igual (el caso de VOCES, que es es/en por dentro no).
        elif isinstance(v, ast.Dict):
            claves = {k.value for k in v.keys
                      if isinstance(k, ast.Constant)}
            if set(guion.IDIOMAS) <= claves:
                continue                      # bilingüe: en paz
            for hijo in v.values:
                if isinstance(hijo, ast.Constant) and isinstance(hijo.value, str):
                    yield nombre, hijo.value, n.lineno
                elif isinstance(hijo, ast.Dict):
                    sub = {k.value for k in hijo.keys
                           if isinstance(k, ast.Constant)}
                    if set(guion.IDIOMAS) <= sub:
                        continue
                    for nieto in hijo.values:
                        if isinstance(nieto, ast.Constant) \
                                and isinstance(nieto.value, str):
                            yield nombre, nieto.value, n.lineno


class NingunTextoVIVEENUNSOLOIDIOMA(unittest.TestCase):

    def test_ni_una_constante_en_espanol_sin_clasificar(self):
        culpables = []
        for arch, permitidas in NO_LAS_LEE_NADIE.items():
            for nombre, texto, linea in constantes_de(arch):
                if len(texto) < 25 or not ESPANOL.search(texto):
                    continue
                if nombre in permitidas:
                    continue
                culpables.append(f'{arch}:{linea} {nombre} → {texto[:60]!r}')
        self.assertEqual(
            culpables, [],
            'texto en un solo idioma sin clasificar:\n  ' +
            '\n  '.join(culpables) +
            '\n\nO se hace bilingüe (guion.FRASES), o se declara en '
            'NO_LAS_LEE_NADIE porque nunca lo lee una persona.')

    def test_y_las_permitidas_existen_de_verdad(self):
        """Una lista blanca con nombres que ya no existen deja de proteger sin
        que se note: la prueba pasa porque no hay nada que mirar."""
        for arch, permitidas in NO_LAS_LEE_NADIE.items():
            hay = {n for n, _t, _l in constantes_de(arch)}
            fantasmas = permitidas - hay
            self.assertEqual(fantasmas, set(),
                             f'{arch}: en la lista blanca y ya no existen: '
                             f'{fantasmas}')


class LasFRASESSonElUnicoSitio(unittest.TestCase):
    """Un mensaje suelto en medio del código es un mensaje que nadie traduce."""

    def test_todas_tienen_los_dos_idiomas_y_no_son_copia(self):
        for clave, t in guion.FRASES.items():
            for idioma in guion.IDIOMAS:
                self.assertIn(idioma, t, clave)
                self.assertTrue(t[idioma].strip(), f'{clave}/{idioma}')
            self.assertNotEqual(t['es'], t['en'],
                                f'{clave}: el inglés es el español copiado')

    def test_el_hueco_de_una_frase_existe_en_los_dos(self):
        """Si `{e}` está en español y falta en inglés, la versión inglesa
        revienta al formatear — justo cuando algo ya salió mal."""
        for clave, t in guion.FRASES.items():
            huecos = {i: set(re.findall(r'\{(\w+)\}', t[i]))
                      for i in guion.IDIOMAS}
            self.assertEqual(huecos['es'], huecos['en'],
                             f'{clave}: huecos distintos {huecos}')

    def test_ninguna_frase_la_cortaria_el_guardia(self):
        import guardia
        for clave, t in guion.FRASES.items():
            for idioma in guion.IDIOMAS:
                self.assertIsNone(guardia.revisar(t[idioma])[1],
                                  f'{clave}/{idioma}: el guardia la corta')


if __name__ == '__main__':
    unittest.main(verbosity=2)
