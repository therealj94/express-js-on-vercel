#!/usr/bin/env python3
"""Arma `genesis-id/public/fichas-core.js` desde las fuentes de verdad.

POR QUE UN GENERADOR Y NO ESCRIBIRLO A MANO
===========================================

Las fichas que Genesis Core enseña al tocar una pieza son el expediente de la
casa: los 11 bloques legales que firmo la Secretaria, las 31 fichas de saber
revisadas y el portafolio minero. Son cientos de datos.

Copiarlos a mano al fichero del navegador tiene un problema que no se ve el
primer dia y se paga el segundo: el dia que alguien corrija una cifra en
`legal.json` --porque la Junta aprobo otra cosa-- la copia del cerebro sigue
diciendo la vieja, y NADIE se entera hasta que alguien la lee en voz alta
delante de un inversionista. Ya paso con las frases de la voz, y por eso
`sacar-frases.cjs` existe.

Aqui igual: se genera. Cambia la fuente, se vuelve a correr, y el cerebro dice
lo que dice el expediente.

    python3 infra/cerebro/armar-fichas-core.py

QUE SE PUBLICA Y QUE NO
=======================

`saber.json` marca cada ficha con `publico`. Las 16 internas NO salen de aqui:
Genesis Core es la pantalla que se proyecta delante de gente de fuera, y el
detalle interno --la contradiccion del respaldo, las cuatro billeteras del
tesoro-- no es para esa sala. Se cuentan, se dice cuantas hay y se dice que
estan; el contenido se queda.

Los bloques de `legal.json` SI salen: son el expediente que la propia
Secretaria preparo para la Junta, y la Junta es justo quien va a entrar aqui a
buscarlos.
"""

import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SABER = os.path.join(RAIZ, 'infra/cerebro/conocimiento')
SALIDA = os.path.join(RAIZ, 'genesis-id/public/fichas-core.js')

# ── de que pieza del mapa es cada bloque legal ──────────────────────────────
# La clave es el id del nodo en `cerebro-datos.js`. Si un bloque no tiene
# pieza, no se pierde: se queda sin ancla y no se publica, y el recuento del
# final lo dice para que se note.
DE_BLOQUE = {
    'sociedades': 'l-sociedad',
    'licencias': 'l-licencias',
    'tokenNaturaleza': 'l-tokens',
    'tesoreria': 'l-tesoreria',
    'cumplimiento': 'l-cumplimiento',
    'contratosUsuarios': 'l-contratos',
    'propiedadIntelectual': 'l-pi',
    'gobernanza': 'l-gobernanza',
    'fiscalidad': 'l-fiscal',
    'respaldoOro': 'ORIGEN',
    'riesgos': 'a-validador',
}

# ── de que pieza es cada ficha publica del saber ────────────────────────────
DE_SABER = {
    'origen': 'ORIGEN',
    'cadena': 'cadena5550',
    'gid': 'genesis',
    'chat': 'pulsechat',
    'pay': 'mtp-app',
    'aura': 'aura',
    'og': 'l-sociedad',
    'comision': 'ORIGEN',
    'remesas': 'dec-remesas',
    'auka': 'AUKA',
    'agka': 'AGKA',
    'ondk': 'ONDK',
    'referencia': 'ORIGEN',
    'seguridad-llaves': 's-seed',
    'pronto': 'j-licencias',
}


def texto_js(x):
    """Una cadena de JavaScript, con las comillas y los saltos escapados."""
    return json.dumps(x, ensure_ascii=False)


def leer(nombre):
    with open(os.path.join(SABER, nombre), encoding='utf-8') as f:
        return f.read()


def tabla_minera(md):
    """Saca del portafolio la tabla de proyectos: nombre, sitio, etapa, oz.

    Se lee la tabla en vez de copiar las cifras porque el documento lo
    mantiene otra persona y sus numeros mandan sobre cualquier apunte nuestro.
    """
    filas = []
    dentro = False
    for linea in md.splitlines():
        if linea.startswith('| Proyecto | Ubicación |'):
            dentro = True
            continue
        if dentro:
            if not linea.startswith('|'):
                break
            if set(linea) <= set('|- '):
                continue
            partes = [c.strip() for c in linea.strip('|').split('|')]
            if len(partes) >= 5:
                filas.append(partes)
    return filas


def main():
    legal = json.loads(leer('legal.json'))
    saber = json.loads(leer('saber.json'))
    minero = leer('portafolio-minero.md')

    fichas = {}          # id de pieza -> lista de secciones
    def anota(pieza, seccion):
        fichas.setdefault(pieza, []).append(seccion)

    # ── los bloques legales ────────────────────────────────────────────────
    firma = f"{legal.get('porQuien','')} · {legal.get('actualizado','')}"
    for clave, bloque in legal.get('bloques', {}).items():
        pieza = DE_BLOQUE.get(clave)
        if not pieza:
            print(f'  aviso: el bloque legal «{clave}» no tiene pieza en el mapa', file=sys.stderr)
            continue
        anota(pieza, {
            'titulo': bloque.get('titulo', clave),
            # `estado` distingue lo CONFIRMADO de lo meramente DICHO, y esa
            # distincion es la mitad del valor del expediente: sale a la ficha.
            'estado': bloque.get('estado', ''),
            'parrafos': bloque.get('voz', []),
            'datos': bloque.get('datos', []),
            'fuente': f'Expediente legal · {firma}',
        })

    # ── lo que espera a la Junta ───────────────────────────────────────────
    if legal.get('paraLaJunta'):
        anota('j-licencias', {
            'titulo': 'Los puntos que la Secretaría dejó para la Junta',
            'estado': 'confirmado',
            'parrafos': legal['paraLaJunta'],
            'datos': [],
            'fuente': f'Expediente legal · {firma}',
        })

    # ── el saber publico ───────────────────────────────────────────────────
    internas = 0
    for f in saber.get('fichas', []):
        if not f.get('publico'):
            internas += 1
            continue
        pieza = DE_SABER.get(f['id'])
        if not pieza:
            print(f'  aviso: la ficha de saber «{f["id"]}» no tiene pieza', file=sys.stderr)
            continue
        anota(pieza, {
            'titulo': f.get('tema', f['id']),
            'estado': '',
            'parrafos': [p for p in re.split(r'\n\s*\n', f.get('es', '')) if p.strip()],
            'datos': [],
            'fuente': f'Saber de la casa · revisado por {f.get("revisadoPor","?")} · {f.get("revisadoEn","")}',
        })

    # ── la minería ─────────────────────────────────────────────────────────
    filas = tabla_minera(minero)
    de_proyecto = {
        'Pantaleona': 'm-pantaleona',
        'Buena Vista - Monarka': 'm-monarka',
        'Travesía': 'm-travesia',
        'Otros prospectos en generación': 'm-zonasur',
    }
    for fila in filas:
        nombre = re.sub(r'\*+', '', fila[0]).strip()
        pieza = de_proyecto.get(nombre)
        if not pieza:
            print(f'  aviso: el proyecto minero «{nombre}» no tiene pieza', file=sys.stderr)
            continue
        limpio = lambda t: re.sub(r'\*+', '', t).replace('*', '').strip()
        anota(pieza, {
            'titulo': nombre,
            'estado': '',
            'parrafos': [],
            'datos': [
                ['Ubicación', limpio(fila[1])],
                ['Etapa', limpio(fila[2])],
                ['Tipo de depósito', limpio(fila[3])],
                ['Potencial estimado', limpio(fila[4])],
            ],
            # El aviso del documento viaja con la cifra. Sin el, «655.000 oz»
            # dice algo que el informe no dice.
            'aviso': 'Estimación geológica conceptual o recurso Indicado/Inferido. '
                     'NO constituye reserva mineral certificada hasta demostrar '
                     'viabilidad económica (perforación, factibilidad, NI 43-101).',
            'fuente': 'Portafolio de inversiones mineras · Orden Global Corp · 14/08/2026',
        })

    # ── a fichero ──────────────────────────────────────────────────────────
    lineas = [
        '/* Las fichas de Genesis Core. GENERADO — no se edita a mano.',
        ' *',
        ' *   python3 infra/cerebro/armar-fichas-core.py',
        ' *',
        ' * Sale de las fuentes de verdad de la casa:',
        ' *   · infra/cerebro/conocimiento/legal.json',
        ' *   · infra/cerebro/conocimiento/saber.json',
        ' *   · infra/cerebro/conocimiento/portafolio-minero.md',
        ' *',
        ' * Editar este fichero a mano es garantizar que el día que la Junta',
        ' * apruebe otra cifra, el cerebro siga diciendo la vieja y nadie se',
        ' * entere hasta oírla en voz alta delante de alguien.',
        ' *',
        f' * Las {internas} fichas marcadas INTERNO en `saber.json` no se publican aquí:',
        ' * esta pantalla se proyecta delante de gente de fuera. Se dice cuántas',
        ' * hay y dónde viven; el contenido se queda dentro.',
        ' */',
        '',
        f'export const INTERNAS = {internas};',
        '',
        'export const FICHAS = {',
    ]
    for pieza in sorted(fichas):
        lineas.append(f'  {texto_js(pieza)}: [')
        for s in fichas[pieza]:
            lineas.append('    {')
            lineas.append(f'      titulo: {texto_js(s["titulo"])},')
            if s.get('estado'):
                lineas.append(f'      estado: {texto_js(s["estado"])},')
            if s.get('parrafos'):
                lineas.append('      parrafos: [')
                for p in s['parrafos']:
                    lineas.append(f'        {texto_js(p)},')
                lineas.append('      ],')
            if s.get('datos'):
                lineas.append('      datos: [')
                for k, v in s['datos']:
                    lineas.append(f'        [{texto_js(k)}, {texto_js(v)}],')
                lineas.append('      ],')
            if s.get('aviso'):
                lineas.append(f'      aviso: {texto_js(s["aviso"])},')
            lineas.append(f'      fuente: {texto_js(s["fuente"])},')
            lineas.append('    },')
        lineas.append('  ],')
    lineas.append('};')
    lineas.append('')

    with open(SALIDA, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lineas))

    secciones = sum(len(v) for v in fichas.values())
    datos = sum(len(x.get('datos', [])) for v in fichas.values() for x in v)
    parrafos = sum(len(x.get('parrafos', [])) for v in fichas.values() for x in v)
    print(f'{SALIDA}')
    print(f'  {len(fichas)} piezas con ficha · {secciones} secciones · '
          f'{parrafos} párrafos · {datos} datos')
    print(f'  {internas} fichas internas NO publicadas')


if __name__ == '__main__':
    main()
