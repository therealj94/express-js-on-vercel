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
