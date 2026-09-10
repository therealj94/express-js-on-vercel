# La puerta: pedir desde el telefono, y firmar desde el telefono.
#
# ── POR QUE ESTA APARTE DE `asistente.py` ──────────────────────────────────
#
# Porque el asistente ya tiene 2700 lineas y porque esto es lo unico del
# sistema que convierte un mensaje de WhatsApp en algo que puede terminar
# ejecutandose. Vive solo para poder leerse solo.
#
# Y sigue sin ejecutar nada: llama a `encargos`, que ANOTA. Quien ejecuta es
# el mayordomo, en otro proceso. Aqui solo se dibuja la puerta.
#
# ── LAS DOS COSAS QUE HACE ─────────────────────────────────────────────────
#
#   1 · PEDIR.  «encargos» abre la lista de lo que TU TRAMO puede pedir. Lo
#       que sale solo se hace ahi mismo; lo que necesita firma se anota y se
#       les avisa a los admin.
#
#   2 · FIRMAR. Al admin le llega el encargo ENTERO —con el texto completo,
#       no un resumen— y dos botones. El boton lleva el numero del encargo y
#       LA HUELLA de lo que se le mostro: si el encargo cambio entre el aviso
#       y el toque, la firma no vale. Ver la regla 2 de `encargos.py`.
#
# ── POR QUE EL BOTON LLEVA LA HUELLA Y NO SOLO EL NUMERO ───────────────────
#
# Un boton con solo el numero es una firma en blanco: dice «si» a lo que sea
# que haya en el libro con ese numero en el momento del toque, que no tiene
# por que ser lo que la persona leyo. Con la huella pegada, el «si» solo vale
# para el texto exacto que estaba en la pantalla.

import re
import unicodedata

import escalafon
import catalogo
import encargos

# Lo que abre la puerta. Anclado de punta a punta como los demas atajos de la
# casa: «encargos» a secas, no «cuando pueda mandame los encargos» — que es
# una frase de conversacion y no una orden.
# «mis encargos» NO está aquí a propósito: tiene su propia puerta, la que
# enseña CÓMO QUEDÓ lo que pediste. Estaba en las dos, y como esta se mira
# primero, quien escribía «mis encargos» recibía el menú — la lista de lo que
# PUEDE pedir en vez de lo que YA pidió. Dos palabras casi iguales que hacen
# cosas distintas: la que es más específica manda.
PALABRAS = ('encargos', 'encargo', 'pedir', 'menu', 'menú', 'que puedo pedir',
            'qué puedo pedir')

# Como se marcan los toques. El prefijo evita chocar con los del guion.
TOCO_PEDIR = 'enc:'          # enc:<clave>
TOCO_SI = 'ok:'              # ok:<id>:<huella>
TOCO_NO = 'no:'              # no:<id>:<huella>

RIESGO = {'mira': '👁', 'toca': '⚠️', 'ejecuta': '🔧'}


def le_abre(dicho):
    """¿Este mensaje abre la puerta? Anclado, no «contiene»."""
    return (dicho or '').strip().strip('.!¡¿?').lower() in PALABRAS


# ── ADIVINAR, PERO SOLO PARA MIRAR ──────────────────────────────────────────
#
# El menu resuelve el problema de quien SE SABE la palabra magica. Nadie mas.
# Jose, 1-sep: «queria saber a quien se le envio 1 ORIGEN... pregunte y no supo
# contestar». Y era verdad: escribio la pregunta como la escribiria cualquiera
# y eso no abria ninguna puerta, asi que caia en el motor —que no tiene ese
# dato y contesta lo que puede—. El dato estaba a un toque de distancia, en un
# menu que hay que saber pedir.
#
# Tres reglas, y las tres son la misma idea: adivinar esta bien para LEER.
#
#   1 · Solo encargos de `riesgo: 'mira'`, y solo los que la persona ya podia
#       pedir por el menu. Nada que toque o ejecute sale de una frase.
#   2 · Solo los que no piden nada mas (`pide` vacio): adivinar el encargo es
#       una cosa, adivinar lo que va DENTRO es otra.
#   3 · Si dos encargos encajan, no se elige ninguno. Ensenarle a un admin lo
#       que no pidio es peor que preguntarle: sigue de largo y contesta el
#       motor, que es lo que pasaba antes.
# Lo que puede salir de una frase adivinada. Es el mismo 'mira' de
# `catalogo.SALEN_SOLOS`, con nombre propio para que cambiar uno no cambie el
# otro sin querer: que algo salga sin firma no quiere decir que se pueda
# adivinar.
SALEN_SOLOS_ADIVINANDO = ('mira',)

# Se mira sobre el texto YA LLANO, no sobre el crudo: con tildes, «quién es
# quién en el equipo» no arrancaba con ninguna de estas palabras y la puerta
# se quedaba cerrada justo para la forma mas natural de preguntar. Los signos
# de pregunta se miran aparte, porque `_llano` se los come.
_ARRANQUE_PIDE = re.compile(
    r'^(ver|vemos|dame|damelo|mostra|mostrame|muestrame|decime|dime|'
    r'cuanto|cuantos|cuanta|cuantas|quien|quienes|como|cual|cuales|que|'
    r'necesito|quiero|pasame|mandame|revisa|revisemos|chequea|a quien)\b')


def _llano(t):
    """Sin tildes, en minusculas y con un solo espacio entre palabras."""
    t = unicodedata.normalize('NFD', (t or '').lower())
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9ñ ]+', ' ', t)).strip()


def adivina(dicho, tramos):
    """La clave del encargo que pide esta frase, o `None`.

    `None` no es un fallo: es lo normal. Casi todo lo que escribe una persona
    no es un encargo, y la puerta que adivina tiene que dejar pasar de largo
    sin hacer ruido.
    """
    t = _llano(dicho)
    pregunta = '?' in (dicho or '') or '¿' in (dicho or '')
    if not t or not (pregunta or _ARRANQUE_PIDE.match(t)):
        return None
    encajan = []
    for clave, ficha in catalogo.para(tramos):
        if ficha['riesgo'] not in SALEN_SOLOS_ADIVINANDO or ficha['pide']:
            continue
        for frase in ficha.get('palabras', ()):
            # Una tupla son varias piezas que tienen que estar TODAS. Hace
            # falta porque «quién ganó» solo no dice de qué se habla: con esa
            # frase suelta, «¿quién ganó el mundial?» abria la lista de
            # premios de gente real. Pidiendo tambien el tema, no.
            piezas = [frase] if isinstance(frase, str) else list(frase)
            largo = 0
            for pieza in piezas:
                f = _llano(pieza)
                # Una palabra suelta se busca entera —«gas» no puede saltar
                # dentro de «gasté»— y con su plural: nadie escribe «cuántos
                # premio quedan». Una frase se busca tal cual.
                cabe = (re.search(rf'\b{re.escape(f)}s?\b', t) if ' ' not in f
                        else f in t)
                if not cabe:
                    largo = 0
                    break
                largo += len(f)
            if largo:
                encajan.append((largo, clave))
                break
    if not encajan:
        return None
    encajan.sort(reverse=True)
    # Empate de longitud entre dos encargos distintos: no se adivina.
    if len(encajan) > 1 and encajan[0][0] == encajan[1][0]:
        return None
    return encajan[0][1]


# ── 1 · Pedir ───────────────────────────────────────────────────────────────

# ── EL TECHO DE DIEZ FILAS ──────────────────────────────────────────────────
#
# Meta admite DIEZ filas en una lista y no recorta: rechaza el mensaje ENTERO.
# Un menu de once filas no es un menu con una fila de mas — es un menu que no
# aparece, y una persona mirando un chat mudo.
#
# El admin llego a once el 1-sep al agregar «roles» y «premios». Lo cazo la
# prueba que existe justo para eso, antes de que lo viera nadie.
#
# Se pagina en vez de recortar. Recortar seria esconderle a un admin cosas que
# puede pedir, sin decirselo — y ese es el fallo que no se descubre: no falla
# nada, simplemente hay una funcion que nadie usa nunca porque nadie sabe que
# esta. La ultima fila abre el resto.
TOPE_FILAS = 10
TOCO_MAS = 'enc:+mas'
TOCO_MENOS = 'enc:+menos'


def _filas_de(tramos):
    filas = []
    for clave, ficha in catalogo.para(tramos):
        marca = RIESGO.get(ficha['riesgo'], '')
        cola = ' · necesita firma' if catalogo.necesita_permiso(clave) else ''
        # La descripción se recorta contando la cola, no antes. Meta corta la
        # fila en 72 y NO recorta: rechaza el mensaje ENTERO, así que el menú
        # no aparece y la conversación se queda muda. `_gente` y `claude` ya
        # se pasaban por cuatro caracteres — lo cazó su propia prueba.
        hueco = 72 - len(cola)
        que = ficha['que_hace']
        if len(que) > hueco:
            que = que[:hueco - 1].rsplit(' ', 1)[0] + '…'
        filas.append((TOCO_PEDIR + clave,
                      f'{marca} {ficha["titulo"]}'[:24],
                      que + cola))
    return filas


def menu(rel, quien, desde=0):
    """La lista de lo que puede pedir esa persona. `False` si no le toca.

    `desde` es la pagina: con mas de diez cosas, la ultima fila abre el resto.
    """
    tramos = escalafon.tramos_de(quien)
    if not tramos:
        return False
    todas = _filas_de(tramos)

    if len(todas) <= TOPE_FILAS:
        filas, cola_fila = todas, None
    elif not desde:
        filas = todas[:TOPE_FILAS - 1]
        cola_fila = (TOCO_MAS, '⋯ Ver el resto',
                     f'Las otras {len(todas) - (TOPE_FILAS - 1)} cosas que '
                     f'podés pedirme.')
    else:
        filas = todas[TOPE_FILAS - 1:][:TOPE_FILAS - 1]
        cola_fila = (TOCO_MENOS, '⋯ Volver al principio',
                     'Las primeras de la lista.')
    if cola_fila:
        filas = filas + [cola_fila]

    cabeza = (f'Sos {escalafon.como_se_dicen(tramos)}. Esto es lo que podés '
              f'pedirme.\n\n'
              '👁 sale al momento · ⚠️🔧 lo tiene que firmar otro admin')
    rel.con_lista(quien, cabeza, 'Ver', filas)
    return True


def pedir(rel, quien, clave, valores=None, hacer=None):
    """Anota un encargo y contesta lo que corresponda.

    `hacer` es lo que ejecuta un encargo que sale solo — se pasa desde fuera
    para que este modulo no importe al mayordomo: el que dibuja la puerta no
    tiene por que poder hacer nada.
    """
    e, mal = encargos.pedir(quien, clave, valores)
    if mal:
        rel.enviar(quien, f'No pude anotarlo: {mal}')
        return None

    if encargos.sale_solo(e):
        # Sale al momento y no molesta a nadie.
        if hacer:
            hacer(e)
        return e

    avisados = _avisar_a_los_admin(rel, e)
    if avisados:
        rel.enviar(quien,
                   f'Anotado con el número {e["id"]}.\n\n'
                   f'{catalogo.como_se_lee(clave, e["valores"])}\n\n'
                   f'Le avisé a {avisados} admin para que lo firme. '
                   'Te aviso apenas conteste.')
    else:
        # No debería pasar —`encargos.pedir` ya lo comprueba— pero si pasa, se
        # dice: un encargo anotado que nadie va a ver es peor que un «no».
        rel.enviar(quien, f'Anotado con el número {e["id"]}, pero NO pude '
                          'avisarle a ningún admin. Decíselo vos.')
    return e


def _avisar_a_los_admin(rel, e):
    """A todos los admin MENOS al que lo pidió. Devuelve a cuántos llegó."""
    yo = e.get('persona') or e['quien']
    n = 0
    for persona in escalafon.admins():
        if persona == yo:
            continue                      # regla 1: no se firma solo
        for donde in escalafon.formas_de(persona):
            if not donde.isdigit():
                continue                  # por aquí solo se manda a teléfonos
            try:
                rel.con_botones(donde, _como_se_lo_muestro(e), [
                    ('✅ Aprobar', f'{TOCO_SI}{e["id"]}:{e["huella"]}'),
                    ('❌ Rechazar', f'{TOCO_NO}{e["id"]}:{e["huella"]}'),
                ])
                n += 1
            except Exception:
                # Un admin sin WhatsApp no puede dejar sin avisar a los demás.
                pass
            break                         # un aviso por persona, no por buzón
    return n


def _como_se_lo_muestro(e):
    """Lo que lee el admin antes de firmar. ENTERO, no resumido.

    Un texto recortado con «…» es una firma sobre algo que no se leyó, y lo
    que no se lee es justamente donde alguien escondería la parte fea.
    """
    ficha = catalogo.ENCARGOS[e['clave']]
    quien = e['quien']
    return (f'{RIESGO.get(e["riesgo"], "")} {e["id"]} · esperando tu firma\n\n'
            f'{ficha["titulo"]}\n'
            f'{ficha["que_hace"]}\n\n'
            + ''.join(f'{k}:\n{v}\n\n' for k, v in (e['valores'] or {}).items())
            + f'Lo pidió: {quien} '
              f'({escalafon.como_se_dicen(e.get("tramos") or [e["tramo"]])})\n'
              f'Caduca en 24 h.')


# ── 2 · Firmar ──────────────────────────────────────────────────────────────

def toque(rel, quien, payload, hacer=None):
    """Un botón tocado. `None` si no es de esta puerta.

    Devuelve `True` si lo atendió — quien llama no tiene que hacer nada más.
    """
    p = str(payload or '')

    if p in (TOCO_MAS, TOCO_MENOS):
        menu(rel, quien, desde=1 if p == TOCO_MAS else 0)
        return True

    if p.startswith(TOCO_PEDIR):
        clave = p[len(TOCO_PEDIR):]
        ficha = catalogo.ENCARGOS.get(clave)
        if not ficha:
            return None
        if ficha['pide']:
            # Falta un dato. Se pregunta y se espera la respuesta escrita.
            return ('espera', clave)
        pedir(rel, quien, clave, hacer=hacer)
        return True

    if p.startswith((TOCO_SI, TOCO_NO)):
        si = p.startswith(TOCO_SI)
        resto = p[len(TOCO_SI if si else TOCO_NO):]
        idd, _, huella = resto.partition(':')
        if si:
            e, mal = encargos.aprobar(quien, idd, huella_vista=huella or None)
        else:
            e, mal = encargos.rechazar(quien, idd, 'lo rechazó por WhatsApp')
        if mal:
            rel.enviar(quien, f'{idd}: {mal}')
            return True
        rel.enviar(quien, f'{"✅ Firmado" if si else "❌ Rechazado"} · {idd}\n\n'
                   + ('Se hace en la próxima vuelta y les aviso a los dos.'
                      if si else 'No se va a hacer. Le aviso al que lo pidió.'))
        # Al que lo pidió se le dice SIEMPRE, salga como salga: un encargo que
        # se muere en silencio es peor que uno rechazado.
        try:
            _decirle_al_que_pidio(rel, e, si)
        except Exception:
            pass
        return True

    return None


def _decirle_al_que_pidio(rel, e, si):
    for donde in escalafon.formas_de(e.get('persona') or e['quien']):
        if donde.isdigit():
            rel.enviar(donde,
                       f'{"✅" if si else "❌"} {e["id"]} · '
                       + ('aprobado: ya va en camino.'
                          if si else 'no se aprobó.'))
            return


# ── Lo mío ──────────────────────────────────────────────────────────────────

def mios(rel, quien):
    """Los últimos encargos de esa persona, con cómo quedaron."""
    lista = encargos.mios(quien, 8)
    if not lista:
        rel.enviar(quien, 'Todavía no me pediste nada.')
        return True
    comose = {'pedido': '⏳ esperando firma', 'aprobado': '✅ firmado',
              'rechazado': '❌ rechazado', 'caducado': '🕐 caducó',
              'haciendo': '⚙️ haciéndose', 'hecho': '✅ hecho',
              'fallido': '⚠️ falló'}
    filas = [f'{e["id"]} · {catalogo.ENCARGOS.get(e["clave"], {}).get("titulo", e["clave"])}'
             f'\n   {comose.get(e["estado"], e["estado"])}'
             for e in reversed(lista)]
    rel.enviar(quien, 'Lo último que me pediste:\n\n' + '\n'.join(filas))
    return True
