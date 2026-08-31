# El libro de encargos: se pide, un admin dice que si, y recien ahi se hace.
#
# ── POR QUE EXISTE ─────────────────────────────────────────────────────────
#
# Porque AU-RA va a poder EJECUTAR, y lo que la separa de ser un agujero es
# esta pieza. Sin ella, cualquiera que le escriba y suene convincente le esta
# dando ordenes a la casa por WhatsApp.
#
# La regla es la misma que la del pagador: EL QUE CONVERSA NO EJECUTA. AU-RA
# habla con desconocidos, pegada a un modelo de lenguaje; lo unico que puede
# hacer es ANOTAR un encargo. Quien lo ejecuta —`mayordomo.py`— no conversa
# con nadie, no importa el motor, y solo lee encargos que ya llevan una firma.
#
# ── LAS CINCO REGLAS, Y POR QUE CADA UNA ───────────────────────────────────
#
# 1 · NADIE SE APRUEBA A SI MISMO. Ni Jose. Una firma que uno se puede poner
#     solo no es una firma: si un dia alguien entra en un telefono de admin, la
#     aprobacion deja de existir como control. Con dos personas hay que entrar
#     en dos telefonos.
#
# 2 · LA FIRMA VA ATADA AL TEXTO. Se aprueba un encargo CONCRETO, con su huella
#     calculada sobre lo que el admin leyo. Si algo cambia entre el «¿apruebo?»
#     y el «si» —una palabra, un caracter invisible— la huella no cuadra y la
#     firma no vale. Sin esto, aprobar seria firmar en blanco.
#
# 3 · CADUCA. Un encargo sin contestar a las veinticuatro horas se muere solo.
#     Un «si» de la semana pasada sobre algo que ya nadie recuerda es peor que
#     un «no»: es una orden dormida esperando el peor momento.
#
# 4 · SE HACE UNA VEZ. Se anota EN DISCO que se empezo, ANTES de empezar. Si el
#     proceso se cae en la mitad, al volver ve que ese encargo ya salio y no lo
#     repite. Es la misma leccion del pagador, y ahi costo dinero aprenderla.
#
# 5 · TODO QUEDA ESCRITO. Quien pidio, que pidio, quien firmo, cuando, y como
#     salio. Un permiso sin rastro es un permiso que nadie puede revisar
#     despues, y despues es cuando se revisa.
#
# ── LO QUE ESTE ARCHIVO NO HACE ────────────────────────────────────────────
#
# No ejecuta. No manda mensajes. No sabe de WhatsApp. Lleva el libro y nada
# mas — y hay una prueba que lo vigila, igual que con `premio.py`.

import hashlib
import json
import os
import random
import stat
import threading
import time

import catalogo
import escalafon

DATOS = None            # lo pone `preparar()`

# Veinticuatro horas para contestar. Ver la regla 3.
CADUCA = float(os.environ.get('AURA_ENCARGO_CADUCA', str(24 * 3600)))

# Cuantos encargos sin contestar puede tener una persona a la vez. Sin tope,
# quien quiera puede llenar el telefono de los admin de avisos hasta que dejen
# de mirarlos — y un aviso que no se mira es lo mismo que no tenerlo.
TOPE_ABIERTOS = int(os.environ.get('AURA_ENCARGOS_ABIERTOS', '5'))

# Cuantos se guardan. Los viejos se van por abajo.
TOPE_LIBRO = 500

ESTADOS = ('pedido', 'aprobado', 'rechazado', 'caducado', 'haciendo',
           'hecho', 'fallido')


class _CandadoDoble:
    """Dentro del proceso y entre procesos.

    El asistente escribe cuando alguien pide; el mayordomo escribe cuando
    termina. Son dos procesos distintos sobre el mismo archivo, asi que el
    `Lock` de Python no alcanza: hace falta el del sistema.
    """

    def __init__(self):
        self._hilo = threading.Lock()

    def __enter__(self):
        self._hilo.acquire()
        try:
            import fcntl
            self._f = open(_ruta_candado(), 'a+')
            fcntl.flock(self._f, fcntl.LOCK_EX)
        except Exception:
            self._f = None
        return self

    def __exit__(self, *a):
        try:
            if self._f:
                import fcntl
                fcntl.flock(self._f, fcntl.LOCK_UN)
                self._f.close()
        finally:
            self._hilo.release()


def _ruta_candado():
    return str(DATOS / 'encargos.candado')


def _ruta():
    return DATOS / 'encargos.json'


CANDADO = _CandadoDoble()


def preparar(carpeta):
    global DATOS
    DATOS = carpeta


def _leer():
    try:
        return json.loads(_ruta().read_text(encoding='utf8'))
    except Exception:
        return {'encargos': []}


def _escribir(libro):
    libro['encargos'] = libro['encargos'][-TOPE_LIBRO:]
    f = _ruta()
    tmp = f.with_suffix('.tmp')
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC,
                 stat.S_IRUSR | stat.S_IWUSR)
    with os.fdopen(fd, 'w', encoding='utf8') as fh:
        json.dump(libro, fh, ensure_ascii=False)
    os.replace(tmp, f)


# ── La huella ───────────────────────────────────────────────────────────────

def huella(clave, valores, quien):
    """Lo que se firma. Ver la regla 2.

    Va sobre el encargo, sus huecos y QUIEN lo pidio. Que entre quien lo pidio
    importa: aprobar «reiniciar aura» no puede valer para el mismo encargo
    pedido por otra persona.
    """
    # Va contra la PERSONA, no contra el número: el mismo encargo pedido por
    # José desde su correo y desde su teléfono es el mismo encargo. Si fuera
    # por el número, aprobar uno no cubriría al otro y aparecerían encargos
    # gemelos que nadie entiende.
    crudo = json.dumps(
        {'clave': clave, 'valores': valores or {},
         'quien': escalafon.normal_persona(quien)},
        sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(crudo.encode('utf8')).hexdigest()[:16]


def _numero(libro):
    """Un numero corto que una persona pueda dictar por telefono.

    Al azar y no correlativo a proposito: con «E-1», «E-2», «E-3» se adivina
    el siguiente, y adivinar el numero de un encargo ajeno es la mitad del
    camino para contestar por otro.
    """
    usados = {e['id'] for e in libro['encargos']}
    for _ in range(200):
        n = f'E-{random.randint(1000, 9999)}'
        if n not in usados:
            return n
    return f'E-{int(time.time()) % 100000}'


# ── Pedir ───────────────────────────────────────────────────────────────────

def pedir(quien, clave, valores=None):
    """Anota un encargo. Devuelve `(encargo, motivo_del_no)`.

    No ejecuta nada, ni siquiera lo que sale solo: eso lo decide quien llama,
    mirando `sale_solo`.
    """
    tramo = escalafon.tramo_de(quien)
    if not tramo:
        return None, 'no estás en la lista: pedile a un admin que te sume'
    if not catalogo.existe(clave):
        return None, 'ese encargo no existe'
    if not catalogo.puede(tramo, clave):
        return None, (f'«{catalogo.ENCARGOS[clave]["titulo"]}» no es de '
                      f'{escalafon.como_se_dice(tramo)}')
    limpios, mal = catalogo.limpiar_todo(clave, valores)
    if mal:
        return None, mal

    necesita = catalogo.necesita_permiso(clave)
    # Un encargo que nadie puede aprobar no se anota: se dice ahora, no dentro
    # de un día cuando caduque sin que nadie sepa por qué.
    if necesita and not escalafon.hay_con_quien_aprobar(quien):
        return None, ('no hay otro admin que pueda aprobarlo. Nadie se aprueba '
                      'a sí mismo — hay que sumar un segundo admin')

    with CANDADO:
        libro = _leer()
        _caducar(libro)
        if necesita:
            mios = [e for e in libro['encargos']
                    if e['estado'] == 'pedido'
                    and escalafon.normal_persona(e['quien'])
                    == escalafon.normal_persona(quien)]
            if len(mios) >= TOPE_ABIERTOS:
                return None, (f'ya tenés {len(mios)} encargos esperando '
                              'respuesta. Esperá a que contesten esos')
        e = {
            'id': _numero(libro),
            'clave': clave,
            'valores': limpios,
            'quien': escalafon.normal(quien),
            # POR DONDE escribió arriba; QUIÉN es, aquí. La firma se compara
            # contra esto: sin ello, pedir desde el teléfono y aprobar desde
            # el correo sería aprobarse a sí mismo sin que nadie lo vea.
            'persona': escalafon.normal_persona(quien),
            'tramo': tramo,
            'riesgo': catalogo.ENCARGOS[clave]['riesgo'],
            'huella': huella(clave, limpios, quien),
            'estado': 'pedido' if necesita else 'aprobado',
            'pedido_en': int(time.time()),
            'firma': None,          # quién aprobó
            'firmado_en': None,
            'motivo': None,         # por qué se rechazó
            'resultado': None,
        }
        # Lo que sale solo nace aprobado, y se anota igual: que no necesite
        # permiso no quiere decir que no deje rastro.
        if not necesita:
            e['firma'] = 'sale solo'
            e['firmado_en'] = e['pedido_en']
        libro['encargos'].append(e)
        _escribir(libro)
        return dict(e), None


def sale_solo(e):
    return not catalogo.necesita_permiso(e['clave'])


# ── Firmar ──────────────────────────────────────────────────────────────────

def aprobar(quien, id_encargo, huella_vista=None):
    """Un admin dice que sí. `(encargo, motivo_del_no)`.

    `huella_vista` es la huella que llevaba el aviso que el admin leyó. Si no
    cuadra con la del libro, el encargo cambió después de mostrarse y la firma
    no vale — ver la regla 2.
    """
    return _firmar(quien, id_encargo, 'aprobado', huella_vista=huella_vista)


def rechazar(quien, id_encargo, motivo=None):
    return _firmar(quien, id_encargo, 'rechazado', motivo=motivo)


def _firmar(quien, id_encargo, nuevo, motivo=None, huella_vista=None):
    if not escalafon.es_admin(quien):
        return None, 'esto lo contesta un admin'
    with CANDADO:
        libro = _leer()
        _caducar(libro)
        e = next((x for x in libro['encargos'] if x['id'] == id_encargo), None)
        if not e:
            return None, f'no hay ningún encargo {id_encargo}'
        if e['estado'] != 'pedido':
            return None, _yaEsta(e)
        # REGLA 1. Va después de encontrarlo para poder decir por qué. Se
        # compara la PERSONA: José pidiendo desde el teléfono y firmando desde
        # el correo sigue siendo José firmándose solo.
        if (e.get('persona') or escalafon.normal(e['quien'])) \
                == escalafon.normal_persona(quien):
            return None, ('ese encargo lo pediste vos. Nadie se aprueba a sí '
                          'mismo — que lo mire otro admin')
        # REGLA 2.
        if huella_vista and huella_vista != e['huella']:
            return None, ('el encargo cambió después de mostrártelo: no se '
                          'firma. Pedilo de nuevo y volvé a leerlo')
        e['estado'] = nuevo
        e['firma'] = escalafon.normal(quien)
        e['firmo_persona'] = escalafon.normal_persona(quien)
        e['firmado_en'] = int(time.time())
        e['motivo'] = motivo
        _escribir(libro)
        return dict(e), None


def _yaEsta(e):
    d = {'aprobado': 'ya estaba aprobado', 'rechazado': 'ya estaba rechazado',
         'caducado': 'ya caducó: hay que pedirlo de nuevo',
         'haciendo': 'ya se está haciendo', 'hecho': 'ya se hizo',
         'fallido': 'ya se intentó y falló'}
    return d.get(e['estado'], f'está en «{e["estado"]}»')


# ── Caducar ─────────────────────────────────────────────────────────────────

def _caducar(libro):
    """Sobre el libro ya abierto: quien llama tiene el candado."""
    ahora = time.time()
    for e in libro['encargos']:
        if e['estado'] == 'pedido' and ahora - e['pedido_en'] > CADUCA:
            e['estado'] = 'caducado'


def caducar():
    """Para llamarla de fuera, cada tanto."""
    with CANDADO:
        libro = _leer()
        antes = [e['id'] for e in libro['encargos'] if e['estado'] == 'pedido']
        _caducar(libro)
        _escribir(libro)
        return [e['id'] for e in libro['encargos']
                if e['estado'] == 'caducado' and e['id'] in antes]


# ── Mirar ───────────────────────────────────────────────────────────────────

def ver(id_encargo):
    with CANDADO:
        libro = _leer()
        e = next((x for x in libro['encargos'] if x['id'] == id_encargo), None)
        return dict(e) if e else None


def esperando():
    """Lo que está pedido y sin contestar, del más viejo al más nuevo."""
    with CANDADO:
        libro = _leer()
        _caducar(libro)
        _escribir(libro)
        return [dict(e) for e in libro['encargos'] if e['estado'] == 'pedido']


def listos():
    """Aprobados y sin hacer todavía. Es lo que lee el mayordomo."""
    with CANDADO:
        libro = _leer()
        _caducar(libro)
        _escribir(libro)
        return [dict(e) for e in libro['encargos'] if e['estado'] == 'aprobado']


def mios(quien, cuantos=10):
    """Lo que pidió esa PERSONA, escriba desde donde escriba."""
    q = escalafon.normal_persona(quien)
    with CANDADO:
        libro = _leer()
        return [dict(e) for e in libro['encargos']
                if (e.get('persona') or escalafon.normal(e['quien'])) == q][-cuantos:]


# ── Hacer ───────────────────────────────────────────────────────────────────

def tomar(id_encargo):
    """Lo marca «haciendo» ANTES de empezar. Ver la regla 4.

    Devuelve el encargo si lo tomó, o `None` si ya lo había tomado alguien —
    incluido este mismo proceso antes de caerse. Que devuelva `None` es la
    protección: un encargo tomado no se vuelve a tomar solo.
    """
    with CANDADO:
        libro = _leer()
        e = next((x for x in libro['encargos'] if x['id'] == id_encargo), None)
        if not e or e['estado'] != 'aprobado':
            return None
        e['estado'] = 'haciendo'
        e['empezado_en'] = int(time.time())
        _escribir(libro)
        return dict(e)


def terminar(id_encargo, bien, resultado=None):
    with CANDADO:
        libro = _leer()
        e = next((x for x in libro['encargos'] if x['id'] == id_encargo), None)
        if not e:
            return None
        e['estado'] = 'hecho' if bien else 'fallido'
        e['resultado'] = (str(resultado)[:900] if resultado is not None else None)
        e['terminado_en'] = int(time.time())
        _escribir(libro)
        return dict(e)
