#!/usr/bin/env python3
"""Las plantillas de WhatsApp de Orden Global, y su envio a aprobacion.

── POR QUE HACEN FALTA ─────────────────────────────────────────────────────

Fuera de las 24 horas desde el ultimo mensaje de la persona, Meta NO deja
mandar texto libre. Solo plantillas que aprobo antes, una por una. Asi que sin
esto AU-RA puede contestar, pero Genesis ID no puede AVISAR — y avisar es todo
el sentido de conectar Genesis ID: que a quien se verifico se le diga, en vez
de que vuelva a mirar por su cuenta.

── POR QUE UTILITY Y NO MARKETING ──────────────────────────────────────────

Son avisos de un tramite que la persona empezo, no promocion. Esa es la
definicion de UTILITY, y ademas se aprueba mas facil y cuesta menos por envio.
Mandar esto como MARKETING seria pedir un rechazo y pagar de mas.

── LO QUE NO DICEN, Y ES A PROPOSITO ───────────────────────────────────────

Ni una palabra sobre regulacion, licencias, respaldo, ni si algo es un valor o
una inversion. Un texto de plantilla es la voz oficial de la empresa, aprobada
por Meta, mandada a gente que no la pidio y guardada en su telefono para
siempre. Es el peor sitio del ecosistema para una afirmacion que despues haya
que corregir — y el 30-ago-2026 ya tuvimos una (AU-RA se invento que Orden
Global estaba bajo la Regulacion A de la SEC).

── ES IDEMPOTENTE ──────────────────────────────────────────────────────────

Correrlo dos veces no crea nada dos veces: primero pregunta que hay. Una
plantilla rechazada por Meta hay que BORRARLA y volver a crearla con otro
texto; no se edita en el sitio.

    ZERNIO_CLAVE=sk_... ZERNIO_CUENTA=... python3 plantillas-whatsapp.py
    ... --enviar     para crearlas de verdad (sin esto solo las enseña)
"""
import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get('ZERNIO_BASE', 'https://zernio.com/api/v1')
CLAVE = (os.environ.get('ZERNIO_CLAVE') or '').strip()
CUENTA = (os.environ.get('ZERNIO_CUENTA') or '').strip()

IDIOMA = 'es'


def cuerpo(texto, ejemplos):
    """Un cuerpo con sus variables y un ejemplo de cada una.

    Los ejemplos NO son decorativos: Meta rechaza la plantilla sin ellos, y
    ademas es lo que mira el revisor humano para entender que va en cada
    hueco. Un ejemplo malo es media plantilla rechazada.
    """
    return {'type': 'body', 'text': texto,
            'example': {'body_text': [ejemplos]}}


PIE = {'type': 'footer', 'text': 'Orden Global · Genesis ID'}

PLANTILLAS = [
    {
        # El nombre lleva `_v2` porque el primero se creo, Meta lo rechazo por
        # categoria, y al borrarlo dejo el nombre bloqueado. Meta no libera un
        # nombre borrado enseguida —su propio error dice «menos de un minuto» y
        # no es cierto—, asi que renombrar es la salida limpia en vez de esperar
        # un plazo que nadie sabe.
        'name': 'genesisid_identidad_verificada_v3',
        'category': 'UTILITY',
        'components': [
            # SIN LA COLA QUE INVITABA A USAR LAS APLICACIONES.
            #
            # La primera version terminaba con «ya lo podés usar en las
            # aplicaciones de Orden Global sin volver a mandar tus documentos»,
            # y Meta la rechazo en el acto con INCORRECT_CATEGORY: esa frase
            # invita a usar un producto, y eso es MARKETING por definicion, no
            # el aviso de un tramite.
            #
            # Se podria haber mandado como MARKETING. No se hace: MARKETING
            # cuesta mas por envio, se aprueba peor, y sobre todo la persona lo
            # puede silenciar entero — y entonces dejaria de recibir tambien el
            # aviso de que su identidad quedo lista, que es lo unico que de
            # verdad necesita saber.
            cuerpo(
                # SIN EL IDENTIFICADOR DENTRO, y por eso esta es la v3.
                #
                # Las otras tres plantillas pasaron a revision a la primera. Lo
                # unico que distinguia a esta es que ENTREGABA un identificador,
                # y eso Meta lo clasifica como AUTHENTICATION —la categoria de
                # los codigos de un solo uso—, no como el aviso de un tramite.
                # Dos rechazos seguidos con INCORRECT_CATEGORY.
                #
                # AUTHENTICATION tampoco servia: tiene formato fijo y no admite
                # un cuerpo libre. Asi que el GID sale del mensaje. No se pierde
                # nada: la persona necesita saber QUE YA ESTA, y su GID lo ve en
                # la aplicacion cuando entra.
                #
                # Ojo con la variable al final: Meta tambien rechaza eso, y un
                # punto detras no cuenta como texto.
                'Hola {{1}}. Tu solicitud de verificación en Genesis ID quedó '
                'aprobada.\n\nNo hace falta que envíes nada más.',
                ['Ana']),
            PIE,
        ],
    },
    {
        # ── EL PARTE DE JOSE, DOS VECES AL DIA ─────────────────────────────
        #
        # Hace falta plantilla y no se puede evitar: se comprobo el 30-ago que
        # «Direct Send» —el modo de Meta que manda un mensaje de utilidad sin
        # plantilla— NO esta habilitado en esta cuenta. La respuesta fue
        # literal: «Direct Send is not enabled for this WhatsApp account. Use an
        # approved message template instead.»
        #
        # Y hace falta porque un parte a las ocho de la mañana cae SIEMPRE
        # fuera de las 24 horas desde el ultimo mensaje: si dependiera de que
        # Jose escriba primero, no seria un parte, seria una respuesta.
        #
        # El resumen entero viaja en {{2}}. Un hueco de plantilla admite hasta
        # unos mil caracteres, que es de sobra para un parte que se lee de pie.
        # Y {{2}} NO puede ser lo ultimo del texto —Meta rechaza una variable al
        # final—, por eso la linea de cierre.
        'name': 'og_parte_del_dia',
        'category': 'UTILITY',
        'components': [
            cuerpo(
                'Parte de Orden Global — {{1}}\n\n'
                '{{2}}\n\n'
                'Escribime si querés que profundice en algo.',
                ['jueves 8:00',
                 '3 identidades esperando revisión · 12 premios por pagar · '
                 'todo lo demás en orden']),
            PIE,
        ],
    },
    {
        'name': 'genesisid_identidad_rechazada',
        'category': 'UTILITY',
        'components': [
            # El motivo va DENTRO del aviso. Un «no se pudo» sin motivo obliga a
            # la persona a escribir para preguntar que paso, y la deja pensando
            # que hizo algo mal cuando casi siempre es una foto movida.
            cuerpo(
                'Hola {{1}}. Revisamos tu solicitud de verificación en Genesis ID '
                'y no la pudimos aprobar.\n\n'
                'Motivo: {{2}}\n\n'
                'Podés volver a intentarlo desde la aplicación cuando quieras.',
                ['Ana', 'la foto del documento salió borrosa']),
            PIE,
        ],
    },
    {
        'name': 'genesisid_identidad_en_revision',
        'category': 'UTILITY',
        'components': [
            cuerpo(
                'Hola {{1}}. Recibimos tus datos y tu verificación quedó en '
                'revisión.\n\n'
                'Te avisamos por aquí apenas haya respuesta. No hace falta que '
                'mandes nada más.',
                ['Ana']),
            PIE,
        ],
    },
    {
        'name': 'genesisid_identidad_suspendida',
        'category': 'UTILITY',
        'components': [
            cuerpo(
                'Hola {{1}}. Tu identidad {{2}} quedó suspendida en Genesis ID.\n\n'
                'Escribinos a info@ordenglobal.org y una persona te explica el '
                'motivo y cómo resolverlo.',
                ['Ana', 'GEN-4K7P-9XQ2-M']),
            PIE,
        ],
    },
]


def pedir(metodo, ruta, cuerpo_json=None):
    datos = json.dumps(cuerpo_json).encode() if cuerpo_json is not None else None
    req = urllib.request.Request(
        BASE + ruta, method=metodo, data=datos,
        headers={'Authorization': 'Bearer ' + CLAVE,
                 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return {'_error': e.code, '_detalle': e.read().decode()[:400]}


def main():
    if not (CLAVE and CUENTA):
        raise SystemExit('Faltan ZERNIO_CLAVE y ZERNIO_CUENTA en el entorno.')
    enviar = '--enviar' in sys.argv

    d = pedir('GET', f'/whatsapp/templates?accountId={CUENTA}')
    ya = {t.get('name'): t for t in (d.get('templates') or [])}
    print(f'plantillas que ya existen: {len(ya)}')
    for n, t in ya.items():
        print(f'  · {n} — {t.get("status")}')
    print()

    for p in PLANTILLAS:
        if p['name'] in ya:
            print(f'= {p["name"]}: ya está ({ya[p["name"]].get("status")}), no se toca')
            continue
        texto = next(c['text'] for c in p['components'] if c['type'] == 'body')
        print(f'+ {p["name"]}  [{p["category"]}]')
        for linea in texto.split('\n'):
            print(f'    {linea}')
        if not enviar:
            print('    (no se mandó: falta --enviar)')
            continue
        r = pedir('POST', '/whatsapp/templates',
                  {'accountId': CUENTA, 'language': IDIOMA, **p})
        if r.get('_error'):
            print(f'    ERROR {r["_error"]}: {r["_detalle"]}')
        else:
            print(f'    mandada · estado: {r.get("status") or r.get("template", {}).get("status") or r}')
        print()

    if not enviar:
        print('\nNada se mandó. Con --enviar se crean en Meta y empieza la revisión.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
