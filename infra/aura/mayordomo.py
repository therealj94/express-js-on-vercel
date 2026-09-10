# El mayordomo: el unico que ejecuta. No habla con nadie.
#
# ── POR QUE ESTE ARCHIVO EXISTE APARTE ─────────────────────────────────────
#
# Es la misma separacion que hay entre `premio.py` y `pagador.py`, y por la
# misma razon: el proceso que CONVERSA no puede ser el que EJECUTA.
#
# `asistente.py` habla con desconocidos, pegado a un modelo de lenguaje. Puede
# anotar un encargo y nada mas. Este modulo es lo contrario: no lee texto de
# nadie, no importa el motor, no tiene idea de que existe una conversacion. Lee
# el libro de encargos, hace lo que ya lleva firma, y avisa.
#
# Si algun dia alguien convence al modelo de escribir «reiniciá todo», lo unico
# que consigue es un encargo anotado esperando que un admin lo lea. Esa es toda
# la defensa, y por eso vive en dos archivos y no en un `if`.
#
# ── EL ORDEN, QUE ES SAGRADO ───────────────────────────────────────────────
#
#   1. tomar     → queda «haciendo» EN DISCO
#   2. hacer
#   3. terminar  → «hecho» o «fallido», con el resultado
#   4. avisar    → al que pidio y al que firmo
#
# Si el proceso muere entre 1 y 3, al volver el encargo esta en «haciendo» y
# NO se vuelve a tomar: se queda ahi para que lo mire una persona. Es a
# proposito. Reintentar solo algo que ya empezo es como se despliega dos veces
# o se reinicia un servicio en medio de otra cosa.
#
# ── LO QUE NO HACE ─────────────────────────────────────────────────────────
#
# No decide. La decision ya se tomo cuando un admin firmo. Aqui no hay ninguna
# rama que diga «si el encargo parece razonable»: o esta firmado o no esta.

import json
import os
import pathlib
import stat
import subprocess
import sys
import time
import urllib.error
import urllib.request

import catalogo
import encargos
import escalafon

DATOS = pathlib.Path(os.environ.get('AURA_DATOS', '/srv/aura'))

# Cuantos por vuelta. Pocos a proposito: un fallo raro avanza despacio, y
# despacio se nota. Misma idea que `pagador.POR_VUELTA`.
POR_VUELTA = 3

# A donde se entrega un encargo de Claude. Ver `_claude`.
GANCHO_CLAUDE = (os.environ.get('AURA_CLAUDE_GANCHO') or '').strip()
GANCHO_CLAVE = (os.environ.get('AURA_CLAUDE_CLAVE') or '').strip()


def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


# ── Las manos ───────────────────────────────────────────────────────────────
#
# Una funcion por encargo, y ninguna acepta texto libre que termine en un
# comando. Devuelven el texto que se le manda a la persona.

# TODOS los comandos que este nodo puede correr, escritos enteros aqui.
#
# No se pasa un comando: se pasa la LLAVE de uno de estos. La diferencia es
# todo: un comando que se recibe se puede armar, y lo que se puede armar lo
# puede armar otro. Una llave que no esta en la tabla revienta con KeyError —
# falla cerrado, que es como tiene que fallar esto.
#
# El catalogo ya acota lo que llega de la persona. Esto es el segundo cerrojo:
# el primero que falle no puede ser el ultimo.
ORDENES = {
    'desplegar': ['/usr/local/bin/aura-desplegar'],
    'reiniciar-aura': ['systemctl', 'restart', 'aura'],
    'reiniciar-ollama': ['systemctl', 'restart', 'ollama'],
    'estado-aura': ['systemctl', 'is-active', 'aura'],
    'estado-ollama': ['systemctl', 'is-active', 'ollama'],
}


def _correr(llave, segundos=180):
    """Corre UNO de `ORDENES`. `shell=False` y una lista: no hay ningún sitio
    por donde meter un `;`, porque no hay nada que armar."""
    orden = ORDENES[llave]
    r = subprocess.run(orden, capture_output=True, text=True, timeout=segundos)
    salida = (r.stdout or '') + (r.stderr or '')
    return r.returncode == 0, salida.strip()[-800:]


def _parte(e):
    """El parte DEL TRAMO de quien lo pidió, no el de todos.

    A quien lleva lo legal, «el disco al 71%» no le dice nada y le corre hacia
    abajo lo único que le importaba. Ver `miradas.py`.
    """
    import miradas
    import premio
    import registro
    suyos = e.get('tramos') or [e['tramo']]
    d = miradas.para(suyos, registro=registro, premio=premio,
                     clave_wa=os.environ.get('ZERNIO_CLAVE', ''),
                     cuenta_wa=os.environ.get('ZERNIO_CUENTA', ''),
                     encargos=encargos)
    return True, miradas.texto(suyos, d)


def _gente(e):
    import miradas
    import premio
    import registro
    d = miradas.para('mercadeo', registro=registro, premio=premio)
    return True, miradas.texto('mercadeo', d)


def _apunte(e):
    """Guarda el apunte del area Y lo deja en la cola de Claude.

    Los dos sitios importan y son distintos: el saber del area es lo que AU-RA
    va a leer manana cuando alguien de ahi le escriba; la cola es para que lo
    que se decidio en un WhatsApp no se quede en ese WhatsApp.

    Si el saber se guarda y la cola falla, el apunte NO se pierde — se dice
    que la mitad no salio. Al reves seria peor: dar por anotado algo que no
    quedo en ninguna parte.
    """
    import oficios
    tramo = e['tramo']
    texto = e['valores']['apunte']
    oficios.apuntar(DATOS, tramo, e['quien'], texto)

    aviso = ''
    try:
        _a_la_cola({'id': e['id'], 'trabajo': f'[apunte de {tramo}] {texto}',
                    'pidio': e['quien'], 'tramo': tramo,
                    'firmo': 'apunte', 'huella': e['huella'],
                    'cuando': int(time.time())})
    except Exception as err:
        aviso = ('\n\n(quedó en la memoria del área, pero NO llegó a la cola '
                 f'de Claude: {type(err).__name__})')
    n = len(oficios.apuntes(DATOS, tramo))
    return True, (f'Anotado en la memoria de {tramo}.\n\n'
                  f'«{texto[:120]}{"…" if len(texto) > 120 else ""}»\n\n'
                  f'Van {n} apunte(s) de tu área. AU-RA lo va a tener presente '
                  'la próxima vez que alguien de ahí le escriba.' + aviso)


def _cadena(e):
    import vistazo
    lineas, pend = vistazo._cadena()
    return True, '\n'.join(['La cadena'] + [f'• {x}' for x in lineas + pend])


def _saldos(e):
    import premio
    import vistazo
    # `_billetera` necesita la dirección y cuántos premios quedan: se le
    # preguntan al propio módulo en vez de repetirlos aquí. Dos sitios con la
    # misma dirección es un sitio donde queda la vieja — ya pasó el 30-ago,
    # cuando el parte vigilaba la billetera de marketing y no la que paga.
    p = premio.resumen()
    lineas, pend = vistazo._billetera(getattr(premio, 'BILLETERA_PREMIOS', ''),
                                      p.get('quedan') or 0)
    return True, '\n'.join(['La billetera de premios']
                           + [f'• {x}' for x in lineas + pend])


def _roles(e):
    """El equipo y lo que puede pedir cada uno. Sale del ESCALAFON.

    Jose lo pidio como «ver el rol de cada uno». Se lee de la unica fuente que
    hay: una segunda lista de roles seria una lista que se queda vieja, y ya
    vimos como acaba eso — `AURA_PARTE_PARA` llevaba semanas vacia y por eso la
    ficha del traspaso no le llegaba a nadie.
    """
    import catalogo
    import escalafon
    lineas = []
    for persona in escalafon.personas():
        formas = escalafon.formas_de(persona)
        tramos = []
        for d in formas:
            for t in escalafon.tramos_de(d):
                if t not in tramos:
                    tramos.append(t)
        nombre = escalafon.nombre_de(formas[0] if formas else '') or persona
        puede = [c for c, _f in catalogo.para(tramos)]
        marca = ' ⭐' if escalafon.es_admin(formas[0] if formas else '') else ''
        lineas.append(f'*{nombre}*{marca} · {escalafon.como_se_dicen(tramos)}')
        lineas.append(f'   puede: {", ".join(puede) if puede else "nada"}')
    if not lineas:
        return False, 'El escalafón está vacío: nadie puede pedirme nada.'
    return True, '\n'.join(['Quién es quién', '', '⭐ = firma lo de los demás',
                            ''] + lineas)


def _premios(e):
    """A quien se le pago, con nombre. Ver `catalogo.ENCARGOS['premios']`.

    Se ensena el nombre si esa persona esta en el escalafon, y si no, las
    cuatro ultimas cifras — igual que hace el espejo. Son telefonos de gente,
    y el numero entero no hace falta para saber a quien se le pago.
    """
    import escalafon
    import premio
    import time
    filas = premio.quienes(10)
    if filas is None:
        return False, 'No pude leer el archivo de premios.'
    if not filas:
        return True, 'Todavía no reclamó el premio nadie.'
    lineas = []
    for r in filas:
        q = r['quien']
        nombre = escalafon.nombre_de(q) or f'…{str(q)[-4:]}'
        cuando = (time.strftime('%d-%b %H:%M', time.localtime(r['cuando']))
                  if r['cuando'] else '')
        estado = '✅ pagado' if r['pagado'] else '⏳ sin pagar'
        lineas.append(f'{nombre} · {estado} · {cuando}')
        if r['tx']:
            lineas.append(f'   {r["tx"]}')
    p = premio.resumen()
    return True, '\n'.join(
        [f'Premios · {p.get("pagados") or 0} pagados, '
         f'{p.get("por_pagar") or 0} sin pagar, {p.get("quedan") or 0} quedan',
         ''] + lineas)


def _papeles(e):
    import vistazo
    lineas, pend = vistazo._genesis()
    return True, '\n'.join(['Papeles y plazos'] + [f'• {x}' for x in lineas + pend])


def _desplegar(e):
    ok, salida = _correr('desplegar', segundos=300)
    return ok, ('Nodo al día.\n\n' if ok else 'El despliegue falló.\n\n') + salida


# Qué llaves usa cada servicio. Se elige una FILA de esta tabla; el nombre que
# viene de fuera nunca llega a formar parte de un comando.
_SERVICIOS = {
    'aura': ('reiniciar-aura', 'estado-aura'),
    'ollama': ('reiniciar-ollama', 'estado-ollama'),
}


def _reiniciar(e):
    servicio = e['valores']['servicio']
    # El catálogo ya lo acotó; se vuelve a mirar aquí porque este archivo es el
    # que ejecuta y no puede confiar en que lo llamen bien.
    if servicio not in _SERVICIOS:
        return False, f'«{servicio}» no es un servicio que se pueda tocar'
    reinicio, estado_de = _SERVICIOS[servicio]
    ok, salida = _correr(reinicio, segundos=90)
    if ok:
        time.sleep(5)
        _, estado = _correr(estado_de, segundos=15)
        return True, f'{servicio} reiniciado · ahora está «{estado}»'
    return False, f'no se pudo reiniciar {servicio}:\n{salida}'


def _a_la_cola(fila):
    """Una línea en la cola de Claude. Devuelve lo escrito.

    En modo «agregar» y 0600: un encargo no puede pisar a otro ni aunque dos
    lleguen en el mismo segundo, y el archivo lleva quién pidió qué.
    """
    linea = json.dumps(fila, ensure_ascii=False)
    fd = os.open(DATOS / 'para-claude.jsonl',
                 os.O_WRONLY | os.O_CREAT | os.O_APPEND,
                 stat.S_IRUSR | stat.S_IWUSR)
    with os.fdopen(fd, 'a', encoding='utf8') as fh:
        fh.write(linea + '\n')
    return linea


def _claude(e):
    """El puente con Claude: se deja en la COLA, y Claude la lee.

    ── POR QUE UNA COLA Y NO UNA LLAVE EN EL NODO ─────────────────────────

    La otra forma era guardar una llave de Claude en el nodo para que abriera
    sesiones solo. Funciona y es automática — y pone en esta máquina el
    secreto que más puede hacer si se filtra: uno que abre sesiones con
    permiso de escribir en el repositorio.

    Con la cola, el nodo no guarda ninguna llave nueva y no puede empezar
    nada por su cuenta. Escribe el encargo firmado en un archivo; cuando José
    abre una sesión, Claude la lee y hace lo que ya está aprobado. Es un paso
    más lento y un secreto menos — y el paso lo da una persona.

    Se escribe en modo «agregar»: un encargo no puede pisar a otro, ni
    siquiera si dos llegan en el mismo segundo.
    """
    linea = _a_la_cola({
        'id': e['id'],
        'trabajo': e['valores']['trabajo'],
        'pidio': e['quien'],
        'tramo': e['tramo'],
        'firmo': e['firma'],
        'huella': e['huella'],
        'cuando': int(time.time()),
    })

    # Y si algún día hay un gancho puesto, además se avisa por ahí. La cola
    # sigue siendo la verdad: el gancho es un aviso, no el canal.
    aviso = ''
    if GANCHO_CLAUDE:
        try:
            req = urllib.request.Request(
                GANCHO_CLAUDE, data=linea.encode(),
                headers={'Content-Type': 'application/json',
                         **({'Authorization': 'Bearer ' + GANCHO_CLAVE}
                            if GANCHO_CLAVE else {})})
            with urllib.request.urlopen(req, timeout=45):
                aviso = '\n\nY se avisó por el gancho.'
        except Exception as err:
            # El encargo YA está en la cola: el aviso caído no lo pierde.
            aviso = f'\n\n(el aviso al gancho no salió: {type(err).__name__})'

    return True, (f'Encargo {e["id"]} anotado para Claude.\n\n'
                  'Queda en la cola con tu nombre y el de quien lo firmó. '
                  'La próxima vez que José abra una sesión, Claude lo lee y '
                  'lo hace.' + aviso)


def en_cola():
    """Cuántos encargos esperan a que Claude los lea. Para el parte: una cola
    que crece sin que nadie la mire es una cola que no sirve."""
    cola = DATOS / 'para-claude.jsonl'
    try:
        return sum(1 for x in cola.read_text(encoding='utf8').splitlines() if x.strip())
    except Exception:
        return 0


MANOS = {
    'parte': _parte,
    'apunte': _apunte,
    'gente': _gente,
    'cadena': _cadena,
    'saldos': _saldos,
    'premios': _premios,
    'roles': _roles,
    'papeles': _papeles,
    'desplegar': _desplegar,
    'reiniciar': _reiniciar,
    'claude': _claude,
}


# ── La vuelta ───────────────────────────────────────────────────────────────

def _avisar(rel, quien, texto):
    if not rel or not quien:
        return
    try:
        rel.enviar(quien, texto)
    except Exception as err:
        # El encargo YA se hizo y está anotado: el aviso caído no lo deshace.
        log(f'aviso no salió a …{str(quien)[-4:]}:', type(err).__name__)


def una_vuelta(rel=None):
    """Hace lo que esté firmado y sin hacer. Devuelve cuántos hizo."""
    encargos.caducar()
    pendientes = encargos.listos()[:POR_VUELTA]
    hechos = 0
    for pedido in pendientes:
        e = encargos.tomar(pedido['id'])
        if not e:
            continue          # otro proceso llegó primero, o ya estaba tomado
        mano = MANOS.get(e['clave'])
        if not mano:
            # Un encargo del catálogo sin mano es un error NUESTRO, y se dice:
            # dejarlo girando en la cola lo escondería.
            encargos.terminar(e['id'], False, 'no hay quien lo haga')
            log(f'{e["id"]}: «{e["clave"]}» está en el catálogo y no tiene mano')
            continue
        log(f'{e["id"]}: {e["clave"]} · pidió {e["quien"]} · firmó {e["firma"]}')
        try:
            bien, texto = mano(e)
        except Exception as err:
            bien, texto = False, f'{type(err).__name__}: {str(err)[:200]}'
        encargos.terminar(e['id'], bien, texto)
        hechos += 1
        marca = '✅' if bien else '⚠️'
        _avisar(rel, e['quien'], f'{marca} {e["id"]} · '
                f'{catalogo.ENCARGOS[e["clave"]]["titulo"]}\n\n{texto}')
        # Al que firmó también, pero solo si no es el mismo y solo cuando
        # hubo que firmarlo: nadie quiere un aviso por cada parte que alguien
        # se manda a sí mismo.
        if e['firma'] and e['firma'] != 'sale solo' and e['firma'] != e['quien']:
            _avisar(rel, e['firma'],
                    f'{marca} {e["id"]} — el que firmaste — quedó '
                    f'«{"hecho" if bien else "fallido"}»')
    return hechos


def main():
    import whatsapp
    encargos.preparar(DATOS)
    try:
        rel = whatsapp.RelevoWhatsApp()
    except Exception as err:
        # Sin WhatsApp se ejecuta igual y se dice: no avisar es malo, no hacer
        # lo que ya está firmado es peor.
        log('sin WhatsApp, se ejecuta sin avisar:', type(err).__name__)
        rel = None
    n = una_vuelta(rel)
    log(f'{n} encargo(s) hechos')
    return 0


if __name__ == '__main__':
    sys.exit(main())
