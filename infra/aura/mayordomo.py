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
    import registro
    import premio
    import vistazo
    d = vistazo.juntar(registro=registro, premio=premio,
                       clave_wa=os.environ.get('ZERNIO_CLAVE', ''),
                       cuenta_wa=os.environ.get('ZERNIO_CUENTA', ''))
    return True, f'Parte de {vistazo.cuando()}\n\n' + vistazo.texto(d)


def _cadena(e):
    import vistazo
    lineas, pend = vistazo._cadena()
    return True, '\n'.join(['La cadena'] + [f'• {x}' for x in lineas + pend])


def _saldos(e):
    import vistazo
    lineas, pend = vistazo._billetera()
    return True, '\n'.join(['La billetera de premios']
                           + [f'• {x}' for x in lineas + pend])


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


def _claude(e):
    """El puente: le pasa el encargo a Claude, que trabaja en el repositorio.

    NO corre nada aquí. Entrega el texto —ya firmado por un admin— a un gancho
    HTTPS, y ahí termina la responsabilidad de este nodo. Lo que Claude puede
    hacer lo decide Claude con sus propios permisos, no nosotros con los
    nuestros: son dos cercos, no uno.

    Sin gancho puesto, el encargo NO se pierde: queda escrito en el libro, en
    «fallido», diciendo exactamente qué falta. Un puente a medias que se traga
    encargos en silencio es peor que no tener puente.
    """
    if not GANCHO_CLAUDE:
        return False, ('el puente con Claude todavía no está conectado '
                       '(falta AURA_CLAUDE_GANCHO). El encargo quedó escrito '
                       f'con el número {e["id"]}: no se perdió')
    cuerpo = json.dumps({
        'id': e['id'],
        'trabajo': e['valores']['trabajo'],
        'pidio': e['quien'],
        'tramo': e['tramo'],
        'firmo': e['firma'],
        'huella': e['huella'],
    }).encode()
    req = urllib.request.Request(
        GANCHO_CLAUDE, data=cuerpo,
        headers={'Content-Type': 'application/json',
                 **({'Authorization': 'Bearer ' + GANCHO_CLAVE} if GANCHO_CLAVE else {})})
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            respuesta = (r.read() or b'')[:300].decode('utf8', 'replace')
    except urllib.error.HTTPError as err:
        return False, f'el puente contestó {err.code}'
    except Exception as err:
        return False, f'no se pudo llegar al puente: {type(err).__name__}'
    return True, ('Encargo entregado a Claude.\n\n'
                  'Cuando termine vas a ver los cambios en el repositorio.\n\n'
                  + respuesta[:200])


MANOS = {
    'parte': _parte,
    'cadena': _cadena,
    'saldos': _saldos,
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
