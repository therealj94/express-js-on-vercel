#!/usr/bin/env python3
"""La capa que hace que la voz respire, comprobada sin GPU.

El motor no se prueba aca: el motor es de otros y se prueba escuchandolo. Lo
que se prueba aca es TODO lo nuestro — el troceado, los silencios, las dudas,
el pegado y el ruido de sala— porque es logica pura y una regresion ahi no
suena mal, suena RARA, y lo raro en una voz es peor que lo feo.

La prueba que mas me importa es la de la cifra partida. «Son 12,50 dólares»
cortado en «Son 12,» + «50 dólares» se oye como dos montos distintos, y en
una aplicacion de plata eso no es un detalle de estilo.
"""

import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import voz  # noqa: E402

fallos = 0


def ok(cond, que, detalle=''):
    global fallos
    print(f"  {'ok   ' if cond else 'FALLA'} {que}"
          + (f'\n           {detalle}' if detalle and not cond else ''))
    if not cond:
        fallos += 1


print('\nEl troceado por unidad de aliento\n')

t = voz.trozos('Hola. Soy AU-RA, la inteligencia de Orden Global. ¿En qué te ayudo?')
ok(len(t) == 3, 'una oración, un trozo', f'salieron {len(t)}: {[x[0] for x in t]}')
ok(t[0][1] == voz.SILENCIOS['punto'], 'tras un punto, la pausa de punto')
ok(t[2][1] == voz.SILENCIOS['aparte'],
   'el último trozo descansa más: la nota termina, no se corta')

largo = ('El precio de ORIGEN sale de una fórmula pública que divide el precio '
         'del oro entre cincuenta y cinco, así que lo podés rehacer con una '
         'calculadora cuando quieras, sin pedirle permiso a nadie ni creerle '
         'nada a nadie, que es justamente la idea de todo esto.')
t = voz.trozos(largo)
ok(len(t) > 1, 'una oración muy larga se parte igual')
ok(all(len(x[0]) <= voz.TOPE_TROZO for x in t),
   'y ningún trozo pasa del techo del motor',
   f'el más largo tiene {max(len(x[0]) for x in t)}')
ok(' '.join(x[0] for x in t).replace('  ', ' ').count('cincuenta y cinco') == 1,
   'no se pierde ni se duplica texto al partir')

print('\nLa regla dura: una cifra no se parte jamás\n')

for frase in ('Te quedan 12,50 dólares en la tarjeta y el cargo fue de 3,20 más comisión.',
              'La comisión de la casa es de 0,001 ORIGEN por cada cobro que hagas hoy.',
              'El corte fue el 26,08 y el saldo quedó en 1.234,56 según la cadena.'):
    t = voz.trozos(frase)
    partido = [x[0] for x in t if voz.CIFRA_PARTIDA.search(x[0].rstrip())]
    ok(not partido, f'«{frase[:42]}…» no queda una cifra colgando',
       f'trozos que terminan en cifra rota: {partido}')

t = voz.trozos('Mirá el saldo. 1.234,56 ORIGEN tenés disponibles ahora mismo.')
respiros = [x for x in t if x[2]]
ok(respiros, 'un trozo que empieza con número pide su respiro antes',
   f'trozos: {[(x[0][:30], x[2]) for x in t]}')

print('\nLa duda: una sola, al principio, y nunca en la mala noticia\n')

h = voz.humanizar('El Genesis ID es tu identidad dentro del ecosistema y sirve para '
                  'entrar a todo sin repetir papeles en cada lugar.')
ok(any(h.startswith(d) for d in voz.DUDAS),
   'una respuesta larga y tranquila arranca con un titubeo humano', h[:60])
ok(sum(h.count(d) for d in voz.DUDAS) == 1,
   'y solo UNO: dos titubeos son un modelo inseguro, no una persona')

mala = ('No se puede completar el fondeo porque la tarjeta quedó con saldo '
        'insuficiente para cubrir el cargo de este mes.')
ok(not any(voz.humanizar(mala).startswith(d) for d in voz.DUDAS),
   'ante una mala noticia NO titubea: dice la cosa derecho',
   voz.humanizar(mala)[:70])

seg = ('Nadie de Orden Global te va a pedir jamás tu contraseña ni tus doce '
       'palabras. Quien te las pida te está estafando.')
ok(not any(voz.humanizar(seg).startswith(d) for d in voz.DUDAS),
   'y en un aviso de seguridad tampoco: ahí se contesta sin adornos')

corta = 'Sí, ya está abierto.'
ok(voz.humanizar(corta) == corta,
   'una respuesta corta no se disfraza con preámbulo')

ya = 'A ver, el oro no sube por capricho.'
ok(voz.humanizar(ya) == ya,
   'y si ya venía conversacional, no se le encima otro titubeo')

a = voz.humanizar('El Genesis ID es tu identidad dentro del ecosistema y sirve '
                  'para entrar a todo sin repetir papeles.')
b = voz.humanizar('El Genesis ID es tu identidad dentro del ecosistema y sirve '
                  'para entrar a todo sin repetir papeles.')
ok(a == b, 'la misma respuesta suena igual dos veces: la duda no es al azar')

print('\nEl pegado del audio\n')

sr = voz.MUESTREO
uno = (np.sin(np.linspace(0, 220 * 2 * np.pi, sr)) * 0.5).astype(np.float32)
dos = (np.sin(np.linspace(0, 180 * 2 * np.pi, sr)) * 0.5).astype(np.float32)
junto = voz.pegar([uno, dos], [400, 700])
esperado = len(uno) + len(dos) + int(sr * 0.4) + int(sr * 0.7)
ok(abs(len(junto) - esperado) < 10, 'el silencio pedido es el silencio que aparece',
   f'{len(junto)} contra {esperado}')

hueco = junto[len(uno):len(uno) + int(sr * 0.4)]
ok(float(np.max(np.abs(hueco))) > 0,
   'el hueco NO es silencio digital: lleva ruido de sala',
   'un tramo de ceros suena a corte de edición y delata el pegado')
ok(float(np.max(np.abs(hueco))) < 0.02,
   'pero el ruido de sala es inaudible como contenido',
   f'pico {float(np.max(np.abs(hueco))):.4f}')

junturas = junto[len(uno) - 3:len(uno) + 3]
ok(float(np.max(np.abs(junturas))) < 0.2,
   'en la juntura la onda baja a cero: sin chasquido',
   f'pico en la unión {float(np.max(np.abs(junturas))):.3f}')

print('\nEl envoltorio que viaja al chat\n')

w = voz.a_wav(np.concatenate([uno, dos]))
ok(w[:4] == b'RIFF' and b'WAVE' in w[:16], 'sale un WAV de verdad')

fuerte = (np.sin(np.linspace(0, 220 * 2 * np.pi, sr)) * 3.0).astype(np.float32)
w2 = voz.a_wav(fuerte)
import struct  # noqa: E402
muestras = struct.unpack(f'<{sr}h', w2[-sr * 2:])
ok(max(abs(m) for m in muestras) < 32767,
   'un audio que se pasa de volumen se baja, no se recorta',
   'recortar produce distorsión audible; bajar, no')

print('\nLas tres voces\n')

ok(len(voz.VOCES) == 3, 'son tres registros, como se pidió')
ok(len({v['semilla'] for v in voz.VOCES.values()}) == 3,
   'cada una con su semilla fija: el timbre no deriva a mitad de nota')
ok(len({(v['exageracion'], v['apego'], v['temperatura'])
        for v in voz.VOCES.values()}) == 3,
   'y con temperamentos distintos de verdad, no el mismo con otro nombre')
ok(voz.VOCES['sobria']['apego'] > voz.VOCES['agil']['apego'],
   'la sobria se pega más al texto que la ágil: es la que dice los montos')
ok(voz.VOCES['sobria']['aire'] > voz.VOCES['agil']['aire'],
   'y respira más largo, porque a un monto hay que darle lugar')
ok(voz.VOZ_POR_DEFECTO in voz.VOCES, 'la voz por defecto existe')

print('\nLo que NO puede pasar\n')

ok(voz.trozos('') == [] and voz.trozos(None) == [],
   'texto vacío no revienta: devuelve nada')
ok(voz.pegar([], []).size == 0, 'pegar nada devuelve nada, sin excepción')
ok(voz.humanizar('') == '', 'humanizar nada devuelve nada')
raro = voz.trozos('…' * 300)
ok(all(len(x[0]) <= voz.TOPE_TROZO for x in raro),
   'un texto absurdo tampoco pasa del techo del motor')

print(f'\n{"Todo en verde" if not fallos else str(fallos) + " comprobación(es) fallaron"}\n')
sys.exit(1 if fallos else 0)
