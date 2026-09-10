#!/usr/bin/env python3
"""Cómo se DICEN las cosas. Números y nombres propios, antes de la voz.

    ── POR QUE EXISTE ───────────────────────────────────────────────────────

Se probo la voz en produccion y salieron dos quejas, textuales:

    «los números los lee tan rápido que ni se entiende lo que dice»
    «los nombres del ecosistema algunos están en inglés y los lee super mal»

Las dos son la misma falla de fondo: al motor de voz se le estaba dando el
texto TAL COMO SE ESCRIBE, y hablar no es leer. Nadie dice «cero coma cero
cero uno» mirando «0,001» — lo dice porque ya lo tradujo en la cabeza. Un
modelo de voz no traduce: ve los caracteres «0», «,», «0», «0», «1» y los
atropella en medio segundo. Y con «MyTokenPay» hace lo unico que puede hacer
un modelo entrenado en español: leerlo en español, «mi-to-ken-pai» con la
tonica donde no va.

Asi que la traduccion la hacemos nosotros ANTES. Este archivo no genera
audio: reescribe el texto para que la voz lo lea como lo diria una persona.

    ── LO QUE NO SE HACE ────────────────────────────────────────────────────

No se usa SSML ni etiquetas de fonemas. El motor no las entiende: recibe
texto y nada mas. Todo lo de aca es texto que sigue siendo texto — se puede
leer, comparar y probar sin encender una GPU, que es justamente por que se
puede probar de verdad.

Tampoco se toca el texto que se ESCRIBE en el chat. En la pantalla «0,001
ORIGEN» esta perfecto y «doce dólares con cincuenta centavos» seria ridiculo.
Esto es solo para el camino de la voz.
"""

import re

# ── NUMEROS ───────────────────────────────────────────────────────────────

UNO_A_QUINCE = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis',
                'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece',
                'catorce', 'quince']
DECENAS = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta',
           'setenta', 'ochenta', 'noventa']
CIENTOS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos',
           'quinientos', 'seiscientos', 'setecientos', 'ochocientos',
           'novecientos']


def _hasta_cien(n):
    if n < 16:
        return UNO_A_QUINCE[n]
    if n < 20:
        return 'died' + UNO_A_QUINCE[n - 10] if False else {
            16: 'dieciséis', 17: 'diecisiete', 18: 'dieciocho', 19: 'diecinueve'}[n]
    if n < 30:
        return {20: 'veinte', 21: 'veintiuno', 22: 'veintidós', 23: 'veintitrés',
                24: 'veinticuatro', 25: 'veinticinco', 26: 'veintiséis',
                27: 'veintisiete', 28: 'veintiocho', 29: 'veintinueve'}[n]
    d, u = divmod(n, 10)
    return DECENAS[d] + (f' y {UNO_A_QUINCE[u]}' if u else '')


def _hasta_mil(n):
    if n == 100:
        return 'cien'          # cien a secas; «ciento» solo si le sigue algo
    c, r = divmod(n, 100)
    return (CIENTOS[c] + (' ' + _hasta_cien(r) if r else '')) if c else _hasta_cien(r)


def _apocopar(palabras):
    """«veintiuno» → «veintiún», «treinta y uno» → «treinta y un».

    En español el uno se acorta delante del sustantivo que cuenta. Se dice
    «veintiún mil», nunca «veintiuno mil». Es la clase de detalle que en texto
    nadie nota y en voz alta delata a una máquina en la primera frase.
    """
    if palabras.endswith('veintiuno'):
        return palabras[:-len('veintiuno')] + 'veintiún'
    if palabras.endswith(' y uno'):
        return palabras[:-len(' y uno')] + ' y un'
    if palabras == 'uno':
        return 'un'
    return palabras


def entero_en_palabras(n):
    """Un entero como lo diria una persona. Solo hasta los miles de millones:
    mas alla no hay montos en esta aplicacion y un numero larguisimo dicho en
    voz alta no se entiende de todos modos."""
    n = int(n)
    if n < 0:
        return 'menos ' + entero_en_palabras(-n)
    if n < 1000:
        return _hasta_mil(n)
    if n < 1_000_000:
        miles, r = divmod(n, 1000)
        # «mil», no «un mil»: en español el uno delante de mil no se dice.
        # Y el uno FINAL se apocopa delante de mil: veintiún mil, treinta y
        # un mil. «Veintiuno mil» no lo dice nadie.
        cabeza = 'mil' if miles == 1 else f'{_apocopar(_hasta_mil(miles))} mil'
        return cabeza + (' ' + _hasta_mil(r) if r else '')
    if n < 1_000_000_000:
        mill, r = divmod(n, 1_000_000)
        cabeza = 'un millón' if mill == 1 else f'{entero_en_palabras(mill)} millones'
        return cabeza + (' ' + entero_en_palabras(r) if r else '')
    mil_mill, r = divmod(n, 1_000_000_000)
    cabeza = ('mil millones' if mil_mill == 1
              else f'{entero_en_palabras(mil_mill)} mil millones')
    return cabeza + (' ' + entero_en_palabras(r) if r else '')


def _decimales_en_palabras(dec):
    """Los decimales, y aca hay una decision que importa.

    Con DOS decimales se dicen como numero —«cincuenta y seis»— porque son
    centavos y asi los dice todo el mundo: «doce con cincuenta».

    Con mas de dos se dicen DIGITO POR DIGITO: «cero cero uno». «0,001» leido
    como «una milesima» es correcto y nadie lo entiende; leido «cero coma cero
    cero uno» lo entiende cualquiera. En una aplicacion de plata, que se
    entienda gana sobre que sea elegante.
    """
    # EL CERO DE LOS CENTAVOS. `int('05')` es 5, y «cinco» dicho detras de la
    # coma es CINCUENTA centavos: diez veces el monto real, en voz alta, en
    # una aplicacion de plata. «12,05» se decia «doce coma cinco».
    # Con cero delante se dice digito por digito: «doce coma cero cinco».
    if len(dec) == 2 and dec != '00' and dec[0] != '0':
        return _hasta_cien(int(dec))
    return ' '.join(UNO_A_QUINCE[int(d)] for d in dec)


# ── LA PUNTUACION DE UN NUMERO NO ES UNA SOLA ─────────────────────────────
#
# Esto asumia la puntuacion latinoamericana —punto para los miles, coma para
# los decimales— y con eso bastaba mientras los numeros los escribiera AU-RA.
# Pero le llegan de todas partes: de ULTRON, de la API de Ordenex, de un
# panel. Y casi todo el ecosistema escribe al reves: coma para los miles,
# punto para los decimales.
#
# El resultado en produccion, textual:
#
#     «L. 25,000 de comision»   se decia   «veinticinco coma cero cero cero»
#     «2,411,900 ORIGEN»        se decia   «dos coma cuatro uno uno, 900»
#     «$1,250.50»               se decia   «dolares uno coma dos cinco cero.50»
#
# Veinticinco mil dicho como veinticinco. En una aplicacion de plata eso no es
# un detalle de estilo.
#
# Asi que no se asume: se MIRA cada numero y se decide cual de los dos
# separadores es el decimal. Las reglas, en orden:
#
#   1. Si estan los dos, el ULTIMO es el decimal. «1.234,56» y «1,234.56»
#      quedan los dos bien sin saber de que pais vino el texto.
#   2. Si solo hay uno y aparece varias veces, es de miles. «2,411,900».
#   3. Si solo hay uno y una vez: con tres cifras detras es de MILES
#      («25,000», «1.500»), salvo que el entero sea «0» —«0,001» es un
#      decimal, no mil— o que el entero tenga mas de tres cifras.
#   4. Con una, dos, o cuatro o mas cifras detras, es decimal. «12,50»,
#      «2.5905».
NUMERO = re.compile(r'(?<![\w.,])(\d[\d.,]*\d|\d)(?![\w])')


def _partir(crudo, porcentaje=False):
    """Un numero escrito, partido en (entero, decimales) sin suponer el pais.

    `porcentaje` desempata el caso de tres cifras: «99,999%» es noventa y
    nueve coma novecientos noventa y nueve por ciento, no noventa y nueve mil
    por ciento. Un porcentaje con separador de miles no existe en esta casa —
    nada aqui se mide en miles por ciento — y decirlo asi es lo que
    convirtio la comision de AU-RA en una cifra absurda dicha en voz alta.
    """
    puntos, comas = crudo.count('.'), crudo.count(',')
    if puntos and comas:
        dec = '.' if crudo.rfind('.') > crudo.rfind(',') else ','
        mil = ',' if dec == '.' else '.'
        ent, _, res = crudo.rpartition(dec)
        return ent.replace(mil, ''), res
    sep = '.' if puntos else (',' if comas else '')
    if not sep:
        return crudo, ''
    trozos = crudo.split(sep)
    if len(trozos) > 2:                      # 2,411,900 — miles, seguro
        return ''.join(trozos), ''
    ent, cola = trozos[0], trozos[1]
    if len(cola) == 3 and ent != '0' and len(ent) <= 3 and not porcentaje:
        return ent + cola, ''                # 25,000 · 1.500
    return ent, cola                         # 12,50 · 2.5905 · 0,001


# ── LA MONEDA VA DETRAS ───────────────────────────────────────────────────
#
# «$1,250» se lee donde esta escrito: «dolares mil doscientos cincuenta». En
# español la moneda va detras del numero y por eso se mueve antes de decir
# nada. Lo mismo con la ele de los lempiras y la cu de los quetzales, que
# ademas sueltas se deletrean.
_MONEDA_DELANTE = [
    (re.compile(r'\bUS\s?\$\s?(\d[\d.,]*\d|\d)'), 'dólares'),
    (re.compile(r'\$\s?(\d[\d.,]*\d|\d)'), 'dólares'),
    (re.compile(r'\bL\.?\s?(\d[\d.,]*\d|\d)'), 'lempiras'),
    (re.compile(r'\bQ\.?\s?(\d[\d.,]*\d|\d)'), 'quetzales'),
    (re.compile(r'€\s?(\d[\d.,]*\d|\d)'), 'euros'),
]


def moneda_detras(texto):
    t = str(texto or '')
    for regla, palabra in _MONEDA_DELANTE:
        t = regla.sub(lambda m, p=palabra: f'{m.group(1)} {p}', t)
    return t


# ── LAS LISTAS NUMERADAS ──────────────────────────────────────────────────
#
# «1.» termina en punto, asi que el motor lo lee como el final de la frase
# anterior y arranca la siguiente con un numero suelto: «…y eso es todo. Uno.
# Fondear la caja». Se dice como lo diria una persona leyendo una lista.
ORDINALES = ['', 'Primero', 'Segundo', 'Tercero', 'Cuarto', 'Quinto', 'Sexto',
             'Séptimo', 'Octavo', 'Noveno', 'Décimo']
_LISTA = re.compile(r'^(\s{0,6})(\d{1,2})[.)]\s+', re.M)


def listas_en_palabras(texto):
    def cambio(m):
        i = int(m.group(2))
        return f'{m.group(1)}{ORDINALES[i] if 1 <= i <= 10 else f"Punto {i}"}. '
    return _LISTA.sub(cambio, str(texto or ''))

# Moneda pegada al numero. Se mira DESPUES del numero porque asi se escribe.
MONEDAS = {
    'dólares': ('dólares', 'centavos'), 'dolares': ('dólares', 'centavos'),
    'dólar': ('dólares', 'centavos'), 'usd': ('dólares', 'centavos'),
    'quetzales': ('quetzales', 'centavos'), 'lempiras': ('lempiras', 'centavos'),
    'pesos': ('pesos', 'centavos'), 'soles': ('soles', 'céntimos'),
}


def numeros_en_palabras(texto):
    """Reescribe cada numero del texto como se dice.

    Ademas mete una coma antes y despues. La coma no es adorno: es la unica
    manera que tiene el motor de saber que ahi hay que respirar. Sin ella,
    una cifra larga sale pegada a lo anterior y se atropella — que es
    exactamente la queja que llego de produccion.
    """
    def cambio(m):
        crudo = m.group(1)
        # Lo que viene justo detras decide un caso: el porcentaje.
        detras = m.string[m.end():m.end() + 2].lstrip()
        entero, dec = _partir(crudo, porcentaje=detras.startswith('%'))
        palabras = entero_en_palabras(entero)
        if dec:
            palabras += ' coma ' + _decimales_en_palabras(dec)
        # La coma de respiro SOLO cuando hay algo que respirar: un monto, un
        # decimal, una cifra grande. «Te contesto en 2 minutos» no necesita
        # pausa y con ella queda «en, dos, minutos», que suena peor que el
        # problema que veniamos a arreglar.
        grande = bool(dec) or len(entero) > 3 or int(entero) >= 100
        return f', {palabras}, ' if grande else palabras

    t = NUMERO.sub(cambio, str(texto or ''))
    # el porcentaje pegado al numero queda suelto tras el cambio
    t = re.sub(r',\s*%', ' por ciento,', t)
    t = re.sub(r'\s*%', ' por ciento', t)
    # dos comas seguidas y comas antes de punto: quedan de los reemplazos
    t = re.sub(r',\s*,', ',', t)
    t = re.sub(r',\s*([.;:!?])', r'\1', t)
    t = re.sub(r'\s{2,}', ' ', t)
    return t.strip().strip(',').strip()


# ── NOMBRES ───────────────────────────────────────────────────────────────
#
# La casa decide como se dice su propia marca. Lo de la izquierda es como se
# ESCRIBE; lo de la derecha, como se DICE — escrito de forma que una voz
# entrenada en español lo lea bien, que es todo lo que se puede hacer cuando
# el motor no acepta fonemas.
#
# Dos criterios, y valen para las once:
#   · Si el nombre existe en español, se dice en español. «Ordenex» y
#     «ORIGEN» ya son palabras nuestras: no se tocan.
#   · Si es inglés, se escribe como SUENA para un hispanohablante. No es
#     inglés perfecto y no pretende serlo: es la version que una vendedora en
#     Guatemala va a entender y repetir. Poner acento inglés impecable en una
#     voz que habla español suena peor, no mejor.
#
# Las siglas se deletrean con guiones, que es como el motor las separa.
LEXICO = {
    # el «2» de PULSE2CHAT se leia «dos»: «puls dos chat». Va primero porque
    # si no, el numero lo agarra la normalizacion de cifras y queda peor.
    'PULSE2CHAT': 'Puls Chat',
    'Pulse2Chat': 'Puls Chat',
    'PULSE CHAT': 'Puls Chat',
    'MyTokenPay': 'Mai Tóken Pei',
    'MyTokenpay': 'Mai Tóken Pei',
    'Veta Wallet': 'Veta Wólet',
    'VetaWallet': 'Veta Wólet',
    'AuCorp': 'Au Corp',
    # El «ID» va EN INGLES, confirmado por la casa: se dice «ai-di», no
    # «i-de». Es la unica parte del nombre que no se españoliza.
    'Genesis ID': 'Génesis Ai-Di',
    'GenesisID': 'Génesis Ai-Di',
    'Genesis Id': 'Génesis Ai-Di',
    # Los dos tokens del metal. AUKA es Gold Kapital y AGKA es Silver
    # Kapital, con K — el nombre esta armado con el simbolo quimico delante
    # (Au el oro, Ag la plata). Se dicen como PALABRA, no deletreados:
    # «áuka» y «ágka». Deletrear A-G-K-A en una nota de voz suena a numero de
    # serie, y esto es el nombre de una moneda.
    'AUKA': 'Áuka',
    'AGKA': 'Ágka',
    'ONDK': 'O-N-D-K',
    # sueltas, por si el modelo las escribe sin el compañero
    'Wallet': 'Wólet',
}
# Se aplica de mas largo a mas corto: si no, «Wallet» se comeria la mitad de
# «Veta Wallet» y quedaria «Veta Wólet» mal armado.
_ORDEN = sorted(LEXICO, key=len, reverse=True)
_LEXICO_RE = re.compile('|'.join(re.escape(k) for k in _ORDEN), re.IGNORECASE)
_POR_MINUSCULA = {k.lower(): v for k, v in LEXICO.items()}


def nombres_como_suenan(texto):
    return _LEXICO_RE.sub(lambda m: _POR_MINUSCULA[m.group(0).lower()],
                          str(texto or ''))


def para_la_voz(texto):
    """El texto listo para decirse.

    El orden no da igual, y cada paso esta donde esta por un motivo:

      1. Los NOMBRES primero: «PULSE2CHAT» lleva un 2 adentro, y si los
         numeros van antes queda «PULSE dos CHAT» y ya no hay nombre que
         reconocer.
      2. Las LISTAS antes que los numeros, por lo mismo: el «1.» de una lista
         es un numero que NO se dice como numero.
      3. La MONEDA antes que los numeros, porque mueve el simbolo de sitio y
         despues ya no hay simbolo que mover.
      4. Los NUMEROS al final, cuando lo demas ya esta en su sitio.
    """
    return numeros_en_palabras(moneda_detras(listas_en_palabras(nombres_como_suenan(texto))))
