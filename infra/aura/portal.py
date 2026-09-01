# El portal: la burbuja del ecosistema hablando con la AU-RA DE VERDAD.
#
# ── POR QUE HACIA FALTA ─────────────────────────────────────────────────────
#
# Habia dos AU-RA y no se hablaban:
#
#   · la de WhatsApp — el nodo, el modelo, la memoria, el embudo entero
#   · la de la burbuja y PULSE2CHAT — `auraSeso` en `app.js`, 269 lineas de
#     guion fijo que corren en el telefono y no llaman a ningun servidor
#
# La segunda no aprende y NO PUEDE aprender: no hay a donde mandar lo que
# aprendio. Y es justamente la que usa la gente, porque el numero de WhatsApp
# no esta publicado en ninguna parte. O sea que todo lo que se le enseño a
# AU-RA este mes vive del lado por donde no entra nadie.
#
# ── POR QUE ESTO NO REIMPLEMENTA EL EMBUDO ──────────────────────────────────
#
# La tentacion es escribir aqui un embudo para la web. Eso es exactamente como
# aparecieron las dos AU-RA: dos implementaciones del mismo camino que empiezan
# iguales y a los dos meses contestan distinto, y nadie sabe cual es la buena.
#
# Asi que el portal NO decide que contestar. Llama a `asistente.atender`, el
# mismo de WhatsApp, con el mismo guion y la misma memoria. Lo unico que hace
# es DECIDIR QUIEN ES EL QUE HABLA, y hacerlo de manera que no pueda ser nadie
# con permisos.
#
# ── EL UNICO RIESGO QUE IMPORTA ─────────────────────────────────────────────
#
# En `asistente.atender` los permisos se deciden por el `de`:
#
#     vistazo.puede_pedirlo(de)      → el parte
#     escalafon.es_admin(de)         → el espejo, las charlas de la gente
#     escalafon.tramo_de(de)         → la puerta de los encargos
#
# Si el visitante pudiera elegir su `de`, manda el telefono de Jose y ya es
# admin: le pide el parte, le abre el espejo —conversaciones privadas de gente
# real— y firma encargos. Todo el portal se reduce a impedir eso.
#
# La defensa NO es una lista de cosas prohibidas, porque esa lista se queda
# vieja en cuanto alguien agrega una funcion nueva al asistente y no se acuerda
# de venir aqui. La defensa es que el nombre del visitante SEA IMPOSIBLE de
# poner en el escalafon:
#
#     web:Ux7dK2… ← lleva dos puntos, y el escalafon usa los dos puntos de
#                    separador. Una linea con ese nombre no se puede escribir.
#
# Y se comprueba de las dos maneras: por la forma (solo se acepta `web:` mas
# letras) y preguntandole al escalafon de verdad que no conoce a nadie asi. La
# segunda es la que sigue avisando si algun dia cambia el formato del fichero.

import re
import secrets
import time

import escalafon

# ── Quien habla ─────────────────────────────────────────────────────────────

MARCA = 'web:'
_LARGO = 22                       # `secrets.token_urlsafe(16)`
_FORMA = re.compile(r'^web:[A-Za-z0-9_-]{22}$')


def nueva_sesion():
    """Un nombre para un visitante. Lo guarda el navegador y lo devuelve.

    No lleva nada de la persona dentro: ni correo, ni IP, ni la hora. Es un
    numero al azar y nada mas, porque el portal es lo unico del sistema que
    habla con desconocidos y lo que no se guarda no se puede filtrar.
    """
    return MARCA + secrets.token_urlsafe(16)[:_LARGO]


def es_de_la_web(quien):
    return bool(_FORMA.match(str(quien or '')))


def valida(quien):
    """El nombre que mando el navegador, o `None`.

    Devolver `None` y abrir una sesion nueva es SIEMPRE mejor que aceptar algo
    raro: lo peor que pasa es que alguien pierda el hilo de su charla; lo peor
    del otro camino es que un desconocido sea admin.
    """
    q = str(quien or '')
    if not es_de_la_web(q):
        return None
    # Cinturon y tirantes. La forma ya lo garantiza, pero si algun dia cambia
    # el fichero del escalafon —o alguien le mete una linea a mano— esto sigue
    # avisando en vez de dejar pasar.
    if escalafon.tramos_de(q) or escalafon.persona_de(q):
        return None
    return q


# ── Cuanto se le deja hablar ────────────────────────────────────────────────
#
# La tarjeta atiende tres a la vez (`OLLAMA_NUM_PARALLEL=3`) y esa misma
# tarjeta es la que le contesta a la gente por WhatsApp. Una puerta publica sin
# freno no es «lento a veces»: es que las conversaciones de WhatsApp se quedan
# esperando detras de quien quiera gastarnos la GPU gratis.
#
# Los dos frenos hacen falta y frenan cosas distintas: el de la sesion frena a
# uno pesado, el de la casa frena a mil a la vez. Con solo el primero, mil
# sesiones nuevas pasan todas.

POR_SESION = 12                   # mensajes
EN = 300                          # segundos
A_LA_VEZ = 2                      # sitios ocupados como mucho, de los 3

_visto = {}                       # sesion → [cuando, …]
_dentro = 0


def _limpiar(ahora):
    for s in [s for s, v in _visto.items() if not v or ahora - v[-1] > EN * 4]:
        _visto.pop(s, None)


def deja_hablar(quien, ahora=None):
    """`(True, None)` o `(False, motivo)`. El motivo se le dice a la persona.

    Un «no» sin explicacion se lee como que se rompio, y quien cree que se
    rompio recarga y vuelve a pedir — que es justo lo que no queremos.
    """
    ahora = ahora if ahora is not None else time.time()
    _limpiar(ahora)
    if _dentro >= A_LA_VEZ:
        return False, 'ocupado'
    v = [t for t in _visto.get(quien, []) if ahora - t <= EN]
    _visto[quien] = v
    if len(v) >= POR_SESION:
        return False, 'muchas'
    return True, None


def apuntar(quien, ahora=None):
    _visto.setdefault(quien, []).append(
        ahora if ahora is not None else time.time())


class enCurso:
    """Cuenta los que estan hablando ahora mismo, pase lo que pase adentro."""

    def __enter__(self):
        global _dentro
        _dentro += 1
        return self

    def __exit__(self, *_):
        global _dentro
        _dentro = max(0, _dentro - 1)
        return False


ESPERA = {
    'muchas': {
        'es': ('Vamos muy rapido y prefiero contestarte bien. Dame un minuto '
               'y seguimos.\n\nSi es algo urgente, escribile al equipo: '
               'wa.me/50432136457'),
        'en': ('We are going fast and I would rather answer you properly. '
               'Give me a minute and we continue.\n\nIf it is urgent, message '
               'the team: wa.me/50432136457'),
    },
    'ocupado': {
        'es': ('Estoy atendiendo a varias personas a la vez. Probá en unos '
               'segundos.'),
        'en': 'I am with several people right now. Try again in a few seconds.',
    },
}


# ── El recado ───────────────────────────────────────────────────────────────

class Recado:
    """Junta lo que AU-RA contesta en vez de mandarlo por WhatsApp.

    Tiene la misma forma que el relevo de verdad porque `asistente.atender`
    llama a estos metodos sin preguntar de donde viene el mensaje. Los que
    tocan la agenda —`conversaciones`, `bandeja`— devuelven vacio a proposito:
    son los del espejo, y el espejo no se asoma a la web ni por accidente.
    """

    def __init__(self):
        self.textos = []
        self.botones = []

    def enviar(self, _para, texto, parcial=False):
        if texto:
            self.textos.append(texto)

    def con_botones(self, _para, texto, botones):
        if texto:
            self.textos.append(texto)
        self.botones = [{'texto': t, 'id': i} for t, i in (botones or [])]

    def con_lista(self, _para, texto, _boton, filas):
        if texto:
            self.textos.append(texto)
        self.botones = [{'texto': t, 'id': i} for i, t, _d in (filas or [])]

    def escribiendo(self, _para):
        pass

    def ficha(self, _de):
        return {}

    def conversaciones(self):
        return []

    def bandeja(self, _desde):
        return []

    def como_json(self):
        return {'texto': '\n\n'.join(self.textos).strip(),
                'botones': self.botones[:3]}


# ── Hablar ──────────────────────────────────────────────────────────────────

# Cuanto se guarda de un visitante. Pasado eso su perfil se borra: vuelve a ser
# alguien nuevo y su charla deja de existir.
#
# No es solo por el disco. Es lo unico del sistema que guarda conversaciones de
# gente que nunca nos dio ni el telefono, y guardarlas para siempre seria
# quedarnos con algo que nadie nos dio. Quien quiera que AU-RA lo recuerde de
# verdad tiene el camino de siempre: WhatsApp, con su numero.
DIAS_QUE_SE_GUARDA = 30


def caducar(perfiles, ahora=None):
    """Saca los visitantes de la web que ya no volvieron. Devuelve cuantos.

    Solo toca los `web:`. Un fallo aqui no puede llevarse por delante el perfil
    de nadie de WhatsApp, que es el que si tiene que durar.
    """
    ahora = ahora if ahora is not None else time.time()
    tope = DIAS_QUE_SE_GUARDA * 86400
    fuera = [q for q, p in perfiles.items()
             if es_de_la_web(q) and ahora - (p.get('visto') or 0) > tope]
    for q in fuera:
        perfiles.pop(q, None)
    return len(fuera)


def hablar(sistema, perfiles, sesion, dicho, toco=None, ahora=None):
    """Un mensaje de la web. Devuelve `(respuesta, sesion)`.

    `perfiles` es el mismo diccionario de WhatsApp, y eso es a proposito: la
    memoria, el idioma y el embudo son los mismos. Lo unico distinto es quien
    habla y lo que por eso NO puede alcanzar.
    """
    import asistente

    ahora = ahora if ahora is not None else time.time()
    quien = valida(sesion) or nueva_sesion()

    p = asistente.perfil_de(perfiles, quien)
    idi = p.get('idioma') or 'es'

    bien, motivo = deja_hablar(quien, ahora)
    if not bien:
        return {'texto': ESPERA[motivo][idi if idi in ('es', 'en') else 'es'],
                'botones': [], 'espera': True}, quien

    apuntar(quien, ahora)
    p['visto'] = ahora
    rec = Recado()
    with enCurso():
        asistente.atender(rec, sistema, p, quien, dicho,
                          {'toco': toco} if toco else {})
    return rec.como_json(), quien
