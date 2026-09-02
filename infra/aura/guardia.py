# El guardia de lo que sale.
#
# ── POR QUE EXISTE, Y POR QUE NO BASTABA EL PROMPT ───────────────────────────
#
# El 30-ago AU-RA dijo que Orden Global «se constituyo bajo la Regulacion A de
# la SEC de los Estados Unidos». Es falso —el expediente dice que no hay NINGUNA
# licencia emitida— y es de las peores mentiras posibles: nombrar al regulador
# de valores de EE.UU. le promete a quien escucha una proteccion que no existe.
#
# Se arreglo con una regla en el prompt y una ficha que gana sobre las demas. Se
# probo contra el modelo: cuatro preguntas, cuatro respuestas correctas.
#
# Y VOLVIO A DECIRLO ESA MISMA NOCHE, a las 23:42.
#
# La diferencia entre la prueba y la realidad era el HISTORIAL. En la prueba la
# pregunta llegaba sola; en una charla de veinte turnos las fichas quedan lejos
# y el modelo se suelta. Un modelo de 7B obedece una regla categorica casi
# siempre, y «casi siempre» no es un nivel aceptable para una afirmacion sobre
# valores.
#
# Asi que se deja de pedirle al modelo que se porte bien y se comprueba lo que
# SALE. Esto no adivina: mira el texto ya escrito y decide. Es la misma division
# que la casa ya tiene entre lo determinista y lo que adivina — la firma de una
# transaccion no se le pide a un modelo, y esto tampoco.
#
# ── LO QUE CUESTA EQUIVOCARSE, EN CADA DIRECCION ────────────────────────────
#
# Si el guardia salta de mas, alguien recibe «eso lo contesta una persona»
# cuando podia haberle contestado. Molesto y reparable.
# Si no salta, una persona decide sobre su dinero con una mentira sobre la SEC.
#
# No se parecen. Por eso el filtro es AMPLIO a proposito y salta ante la duda.

import re
import unicodedata

# Lo que se dice cuando el guardia salta por tema. Es la misma frase que la
# ficha, para que la persona reciba siempre lo mismo venga de donde venga.
RESPUESTA_SEGURA = ('Eso lo contesta una persona, no yo. '
                    'Escribile a info@ordenglobal.org.')

# Lo que se dice cuando la respuesta salio rota. No se disimula: pedir que lo
# repita es honesto y ademas funciona, porque la vuelta siguiente arranca
# limpia.
RESPUESTA_ROTA = ('Perdon, se me enredo la respuesta a mitad de camino. '
                  '¿Me lo volves a preguntar?')

# ── El tema del que no se habla ──────────────────────────────────────────────
#
# Cada patron esta aqui porque salio de verdad o porque es la forma obvia de
# decir lo mismo. Se mira sobre el texto SIN TILDES y en minusculas, asi que
# «Regulación» y «regulacion» son lo mismo y no hay que escribir las dos.
PROHIBIDO = re.compile(
    r'''(?x)
    \bsec\b                              # la sigla suelta
  | securities\s+and\s+exchange
  | comision\s+de\s+bolsa
  | \bregulacion\s+a\b | \bregulation\s+a\b
  | valores\s+no\s+registrados
  | inversor(?:es)?\s+no\s+acreditad
  | \bfinra\b | \bcnmv\b | \bcnv\b | \bsib\b | \bcnbs\b
  | se\s+constituyo\s+bajo
  | (?:esta|estamos|estan)\s+regulad
  | regulad[oa]s?\s+por
  | bajo\s+la\s+regulacion
  | licencia(?:s)?\s+(?:de|para|emitida|bancaria|vigente)
  | tenemos\s+licencia | con\s+licencia
  | (?:somos|es)\s+una\s+entidad\s+(?:regulada|financiera|supervisada)
  | supervisad[oa]s?\s+por
  | \bsecurity\s+token\b | valor\s+negociable
  | oferta\s+publica | prospecto

    # ── Lo que se colo el 30-ago a las 04:28 ────────────────────────────────
    #
    # Lo de arriba caza «la Regulacion A de la SEC» y no cazaba NADA de esto,
    # que es el mismo invento con otras palabras y le llego a una persona real:
    #
    #   «Orden Global se ha registrado y opera bajo el marco legal de varios
    #    paises» · «opera en varios paises de America Latina y Europa» · «en
    #    Brasil la regulacion es permisiva, en Argentina mas restrictiva» ·
    #    «tokens no regulados (no valores)»
    #
    # Se puede cortar ancho SIN MIEDO A PASARSE porque la ficha no deja matiz:
    # ante cualquier cosa legal la respuesta aprobada es una sola frase, y esa
    # frase no contiene ni una de estas palabras. Cortar de mas aqui cuesta que
    # alguien lea «eso lo contesta una persona»; cortar de menos cuesta que una
    # empresa afirme por escrito un estatus legal que no tiene.
  | (?:se\s+ha|nos\s+hemos|estamos|esta|estan)\s+registrad
  | registrad[oa]s?\s+(?:en|ante|bajo)
  | marco\s+legal | espacio\s+legal | marco\s+(?:legal|regulatorio)
  | oper(?:a|amos|an)\s+(?:legalmente|bajo|en\s+(?:varios|un\s+(?:marco|espacio)))
  | no\s+regulad
  | no\s+(?:es|son)\s+(?:un\s+)?valor(?:es)?\b
  | la\s+regulacion\s+(?:es|varia|en\s)
  | regulacion\s+(?:especifica|permisiva|restrictiva)
  | \bpermisiv | \brestrictiv
  | (?:leyes|normativas?)\s+locales
  | \bjurisdiccion
  | autorizad[oa]s?\s+(?:por|en|para)
  | \bcompliance\b
    ''')


def sin_tildes(texto):
    """Para que «Regulación» y «regulacion» sean la misma palabra."""
    n = unicodedata.normalize('NFD', texto.lower())
    return ''.join(c for c in n if unicodedata.category(c) != 'Mn')


def toca_lo_legal(texto):
    return bool(PROHIBIDO.search(sin_tildes(texto or '')))


# ── La respuesta que se rompio ───────────────────────────────────────────────
#
# El modelo es qwen2.5, entrenado en chino. En charlas largas se va al chino a
# mitad de frase — paso el 30-ago con una explicacion de AUKA que termino en
# caracteres han. Lo que llega al telefono de la persona es basura.
#
# No se arregla con un prompt: es deriva del modelo. Se detecta y no se manda.
def _es_de_otro_alfabeto(c):
    o = ord(c)
    return (0x3040 <= o <= 0x30ff        # kana
            or 0x3400 <= o <= 0x9fff     # han
            or 0xac00 <= o <= 0xd7af     # hangul
            or 0x0400 <= o <= 0x04ff     # cirilico
            or 0x0590 <= o <= 0x06ff)    # hebreo y arabe


def se_fue_de_idioma(texto, tope=0.02):
    """True si hay bastante texto de otro alfabeto como para que sea deriva.

    No basta con «hay un caracter raro»: un emoji o una comilla curva no son
    deriva. Se mide la PROPORCION, y un dos por ciento ya es una frase entera
    en otro idioma dentro de una respuesta normal.
    """
    t = texto or ''
    if len(t) < 40:
        return False
    raros = sum(1 for c in t if _es_de_otro_alfabeto(c))
    return raros / len(t) > tope


# ── EL PRECIO NO LO INVENTA NADIE ─────────────────────────────────────────
#
# Lo que le paso a Jose el 1-sep, copiado de su charla: pregunto «Whats the
# price of one origen to USD ?» y el modelo contesto «aproximadamente $1.18»
# mientras la billetera marcaba 2.56. Cuando se lo dijo, el modelo doblo la
# apuesta: «puede estar ajustado por tasas de cambio». Dos cifras distintas
# para la misma moneda, y la equivocada dicha con seguridad.
#
# El PROMPT ya prohibe dar cifras (linea 257) y el modelo no obedece. Asi que
# la regla vive aqui, donde no se puede desobedecer: si la pregunta es por el
# precio de ORIGEN y la respuesta trae una cifra en dolares, la respuesta
# entera se tira y sale la de `precio.py`, que lee la misma fuente que la
# billetera. Una cifra de dinero dicha por un modelo de lenguaje es una
# adivinanza con formato de dato.

PREGUNTA_PRECIO = re.compile(
    r'\b((precio|valor|cotizaci[oó]n|cu[aá]nto (vale|cuesta|est[aá]|es))\b.{0,40}'
    r'\b(origen|auka|agka|gramin)\b'
    r'|\b(origen|auka|agka|gramin)\b.{0,40}\b(precio|valor|d[oó]lar(es)?|usd|vale|cuesta)'
    r'|\b(price|value|worth|cost)\b.{0,40}\b(origen|auka|agka|gramin)\b'
    r'|\b(origen|auka|agka|gramin)\b.{0,40}\b(price|usd|dollars?|worth|cost)'
    # Y al reves: «sale 2.56 USD 1 origen». La persona no siempre pone la
    # moneda despues de ORIGEN, y el modelo contesta igual de seguro.
    r'|\b(usd|d[oó]lar(es)?|dollars?|price|precio)\b.{0,40}\b(origen|auka|agka|gramin)\b)',
    re.IGNORECASE | re.DOTALL)

CIFRA_DOLAR = re.compile(r'(\$\s?\d|\d[\d.,]*\s?(usd|d[oó]lares?|dollars?)\b)', re.IGNORECASE)


def precio_inventado(dicho, texto):
    """True si la persona pregunto el precio de ORIGEN y el modelo puso una
    cifra en dolares. La cifra no se comprueba contra el precio real a
    proposito: aunque acertara hoy, seria un acierto y no un dato."""
    return bool(PREGUNTA_PRECIO.search(dicho or '')
                and CIFRA_DOLAR.search(texto or ''))


def revisar(texto):
    """Mira lo que esta a punto de salir.

    Devuelve `(texto_a_mandar, motivo)`. `motivo` es None cuando pasa limpio;
    cuando no, dice por que, para que quede en el registro y se pueda mirar
    despues cuantas veces salto y con que.
    """
    t = texto or ''
    if toca_lo_legal(t):
        return RESPUESTA_SEGURA, 'legal'
    if se_fue_de_idioma(t):
        return RESPUESTA_ROTA, 'idioma'
    return t, None
