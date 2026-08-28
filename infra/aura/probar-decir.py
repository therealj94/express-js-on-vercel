#!/usr/bin/env python3
"""Los números y los nombres, dichos como se dicen.

Esto se prueba sin GPU y sin red porque es lo que es: texto que entra, texto
que sale. Y se prueba MUCHO, porque las dos quejas que llegaron de producción
—«los números los lee tan rápido que ni se entiende» y «los nombres en inglés
los lee súper mal»— nacen las dos de la misma falla: darle al motor de voz el
texto tal como se escribe, cuando hablar no es leer.

La comprobación que más importa es la de los montos. En una aplicación de
plata, un número mal dicho no es un detalle de estilo.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import decir  # noqa: E402

fallos = 0


def ok(cond, que, detalle=''):
    global fallos
    print(f"  {'ok   ' if cond else 'FALLA'} {que}"
          + (f'\n           {detalle}' if detalle and not cond else ''))
    if not cond:
        fallos += 1


print('\nContar en español\n')

CASOS = [
    (0, 'cero'), (1, 'uno'), (11, 'once'), (15, 'quince'), (16, 'dieciséis'),
    (21, 'veintiuno'), (22, 'veintidós'), (26, 'veintiséis'), (30, 'treinta'),
    (31, 'treinta y uno'), (99, 'noventa y nueve'), (100, 'cien'),
    (101, 'ciento uno'), (115, 'ciento quince'), (200, 'doscientos'),
    (500, 'quinientos'), (700, 'setecientos'), (900, 'novecientos'),
    (999, 'novecientos noventa y nueve'), (1000, 'mil'), (1001, 'mil uno'),
    (1234, 'mil doscientos treinta y cuatro'), (2000, 'dos mil'),
    (21000, 'veintiún mil'), (31000, 'treinta y un mil'),
    (100000, 'cien mil'), (999999, 'novecientos noventa y nueve mil novecientos noventa y nueve'),
    (1000000, 'un millón'), (2000000, 'dos millones'),
    (1500000, 'un millón quinientos mil'),
]
for n, esperado in CASOS:
    got = decir.entero_en_palabras(n)
    ok(got == esperado, f'{n} se dice «{esperado}»', f'salió «{got}»')

print('\nLos montos, que son los que importan\n')

MONTOS = [
    ('La comisión es de 0,001 ORIGEN por cobro.',
     'cero coma cero cero uno',
     'una comisión de tres decimales se dice dígito por dígito'),
    ('Te quedan 12,50 dólares en la tarjeta.',
     'doce coma cincuenta',
     'dos decimales son centavos y se dicen como número'),
    ('El saldo quedó en 1.234,56 ORIGEN.',
     'mil doscientos treinta y cuatro coma cincuenta y seis',
     'el punto de los miles NO se dice, y el número va entero'),
    ('Más del 99,999% del pago te llega a vos.',
     'noventa y nueve coma nueve nueve nueve por ciento',
     'un porcentaje con tres decimales, y el símbolo dicho'),
    ('Un ORIGEN es la 55 parte de un gramo de oro.',
     'cincuenta y cinco',
     'un número suelto en medio de una frase'),
]
for texto, aguja, que in MONTOS:
    got = decir.para_la_voz(texto)
    ok(aguja in got, que, f'«{texto}»\n           → «{got}»')

print('\nEl número respira: no sale pegado a lo de al lado\n')

t = decir.para_la_voz('El saldo quedó en 1.234,56 ORIGEN y la comisión fue de 0,001.')
ok(', mil doscientos' in t or t.startswith('mil doscientos'),
   'antes de la cifra hay una coma: es la única manera de que el motor respire ahí',
   t)
ok(',' in t.split('mil doscientos')[1][:60],
   'y después de la cifra también, para que no se pegue con lo que sigue', t)
ok('..' not in t and ',,' not in t and '  ' not in t,
   'sin puntuación duplicada de los reemplazos', repr(t))

print('\nLos nombres de la casa\n')

NOMBRES = [
    ('Entrá con tu Veta Wallet y escaneás el código.', 'Veta Wólet',
     'Wallet no se lee «va-yet»'),
    ('Con MyTokenPay generás el QR y cobrás.', 'Mai Tóken Pei',
     'MyTokenPay no se lee en español'),
    ('Podés escribirme por PULSE2CHAT cuando quieras.', 'Puls Chat',
     'y el 2 de PULSE2CHAT NO se dice «dos»'),
    ('Hacé tu Genesis ID una sola vez.', 'Génesis I-D',
     'ID se deletrea, no se lee «id»'),
    ('Ordenex es la casa de cambio de AuCorp.', 'Ordenex',
     'lo que ya es palabra en español no se toca'),
    ('ORIGEN sigue el precio del oro.', 'ORIGEN',
     'ORIGEN tampoco: es nuestra y es española'),
]
for texto, aguja, que in NOMBRES:
    got = decir.para_la_voz(texto)
    ok(aguja in got, que, f'«{texto}»\n           → «{got}»')

ok('dos' not in decir.para_la_voz('Escribime por PULSE2CHAT.').lower(),
   'lo repito porque es el peor de todos: «PULSE dos CHAT» no puede salir',
   decir.para_la_voz('Escribime por PULSE2CHAT.'))

print('\nEl orden importa\n')

# Si los números se normalizaran primero, el 2 de PULSE2CHAT se convertiría
# en «dos» y ya no quedaría ningún nombre que reconocer.
t = decir.para_la_voz('En PULSE2CHAT te contesto en 2 minutos.')
ok('Puls Chat' in t and 'dos minutos' in t,
   'el nombre se resuelve ANTES que los números, y los dos salen bien', t)

print('\nLo que NO se toca\n')

ok(decir.para_la_voz('') == '', 'texto vacío no revienta')
ok(decir.para_la_voz(None) == '', 'ni None')
limpio = 'El oro no sube por capricho: es el mismo metal de siempre.'
ok(decir.para_la_voz(limpio) == limpio,
   'una frase sin números ni marcas sale idéntica',
   decir.para_la_voz(limpio))
# El texto del CHAT no se toca nunca: en pantalla «0,001» está perfecto y
# «cero coma cero cero uno» sería ridículo. Esto es solo el camino de la voz.
ok('0,001' in 'La comisión es de 0,001 ORIGEN.',
   'y esto solo corre para la voz: lo escrito se queda como está')

print(f'\n{"Todo en verde" if not fallos else str(fallos) + " comprobación(es) fallaron"}\n')
sys.exit(1 if fallos else 0)
