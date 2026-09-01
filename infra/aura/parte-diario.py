#!/usr/bin/env python3
"""Manda el parte por WhatsApp. Lo dispara el temporizador, 7:30 y 19:30.

── POR QUE HAY DOS CAMINOS ─────────────────────────────────────────────────

WhatsApp solo deja escribir libremente durante 24h desde el ultimo mensaje de
la persona. Fuera de esa ventana solo pasan las plantillas aprobadas. El parte
de las 7:30 casi siempre cae fuera —Jose duerme—, asi que la plantilla no es el
respaldo: es el camino normal, y el libre es el que se aprovecha cuando toca.

Se intenta el libre PRIMERO porque es gratis, no gasta cupo de plantilla, y
conserva los saltos de linea: el parte se lee mucho mejor en varias lineas que
en un renglon. Si no hay ventana, el proveedor contesta 400 y se cae a la
plantilla, que lleva el mismo parte aplanado (ver `vistazo.para_plantilla`).

── QUE PASA SI FALLA ───────────────────────────────────────────────────────

Sale con codigo distinto de cero y lo dice en el journal. No reintenta por su
cuenta: el temporizador vuelve en doce horas y un parte viejo insistiendo a
media noche es peor que un parte que falto. Lo que NO hace nunca es fallar en
silencio — un parte que dejo de llegar sin avisar se confunde con «no hubo
nada que contar», que es justo la confusion que este modulo existe para evitar.
"""

import os
import pathlib
import sys
import time

import encargos
import escalafon
import miradas
import registro
import premio
import vistazo
import whatsapp

# A quien va. Es el mismo AURA_PARTE_PARA que decide quien puede pedirlo
# escribiendo «actualizar»: una sola lista, para que no haya un sitio donde
# agregar a alguien y otro donde olvidarse.
#
# ── Y ADEMAS, EL ESCALAFON ─────────────────────────────────────────────────
#
# Desde el 1-sep el parte no es uno: es el de CADA TRAMO, y va a la persona
# que lleva ese tramo. Nicole recibe el de mercadeo, Carlos el de tecnologia,
# Melany el suyo con las tres cosas juntas.
#
# `AURA_PARTE_PARA` se queda para quien no esta en el escalafon —un buzon de
# copia, un correo— y para no romper lo que ya funcionaba. Quien este en las
# dos listas recibe UNA vez: se junta por persona antes de mandar, que es la
# diferencia entre un parte y dos partes iguales seguidos.
PARA = [x.strip() for x in (os.environ.get('AURA_PARTE_PARA') or '').split(',')
        if x.strip()]

# La misma carpeta que usa el asistente. El parte corre en otro proceso, asi
# que aqui se vuelve a decir cual es.
DATOS = pathlib.Path(os.environ.get('AURA_DATOS', '/srv/aura'))

PLANTILLA = os.environ.get('AURA_PARTE_PLANTILLA', 'og_parte_del_dia')
IDIOMA = os.environ.get('AURA_PARTE_IDIOMA', 'es')


class NoLlego(Exception):
    """Se dio por enviado sin que saliera nada."""


def _libre(rel, para, cuando_, cuerpo):
    """Dentro de la ventana de 24h. Conserva los saltos de linea.

    OJO CON EL SILENCIO: `_soltar` devuelve `{}` —sin lanzar— cuando todavia no
    existe la charla con esa persona, que es exactamente el caso la primera vez
    que se manda un parte. Dar eso por enviado saltaria la plantilla y el parte
    desapareceria sin una linea en el journal.

    LO QUE NO SIRVE PARA DETECTARLO es mirar el `id` de la respuesta. La
    respuesta del proveedor a un envio bueno NO SIEMPRE LO TRAE —comprobado
    contra la API el 30-ago: el parte llego a WhatsApp y aqui figuraba como
    fallido—, asi que esa comprobacion daba por caido lo que si salio y mandaba
    ADEMAS la plantilla: parte duplicado y cupo de plantilla quemado dos veces
    al dia.

    El unico caso mudo de verdad es la charla que no existe, y eso se pregunta
    directamente. Lo demas ya lanza solo: `_soltar` levanta `NoSalio` cuando el
    envio falla.
    """
    if not any(c.get('correo') == para for c in rel.conversaciones()):
        raise NoLlego('no hay charla abierta con esa persona')
    rel.enviar(para, f'Parte de {cuando_}\n\n{cuerpo}')


def _plantilla(cuenta, para, cuando_, plano):
    """Fuera de la ventana. El hueco va aplanado o Meta rechaza el envio."""
    # La ruta es la de ABRIR CONVERSACION, no una de «mandar mensaje»: a quien
    # nunca escribio no hay hilo al que contestar, asi que empezar uno con una
    # plantilla aprobada ES el envio. Mismo cuerpo exacto que usa Genesis ID.
    whatsapp._pedir('POST', '/inbox/conversations', {
        'accountId': cuenta,
        'participantId': para,
        'templateName': PLANTILLA,
        'templateLanguage': IDIOMA,
        'templateParams': [cuando_, plano],
    })


def a_quien_le_toca():
    """`[(donde, tramos)]` — sin repetir persona, y solo telefonos.

    El escalafon primero: quien esta ahi recibe EL SUYO. Los de
    `AURA_PARTE_PARA` que no esten en el escalafon reciben el de admin, que es
    el que llevaba el parte antes de que hubiera tramos.
    """
    fuera, vistos = [], set()
    for persona in escalafon.GENTE:
        tramos = escalafon.tramos_de(persona)
        donde = next((f for f in escalafon.formas_de(persona) if f.isdigit()), None)
        if not donde:
            continue          # a quien no tiene telefono no se le manda por aqui
        fuera.append((donde, list(tramos)))
        vistos.add(escalafon.normal_persona(donde))
    for quien in PARA:
        # `persona_de` devuelve `None` a quien no esta en el escalafon: se le
        # manda el de admin, como siempre.
        if escalafon.normal_persona(quien) in vistos:
            continue
        fuera.append((quien, ['admin']))
        vistos.add(escalafon.normal_persona(quien))
    return fuera


def main():
    gente = a_quien_le_toca()
    if not gente:
        print('nadie en el escalafon ni en AURA_PARTE_PARA: no hay a quien '
              'mandarle el parte')
        return 1

    # SIN ESTO EL PARTE MIENTE, Y MIENTE TRANQUILIZANDO.
    #
    # `registro` y `premio` guardan la carpeta en una global que pone
    # `preparar()`. Dentro de `asistente.py` la pone el arranque, pero el parte
    # corre como servicio SUELTO —otro proceso, otra memoria— y ahi nadie la
    # habia puesto. Sin carpeta los dos modulos no leen nada y no lanzan:
    # `premio.resumen()` contesta «quedan 200 de 200» y `registro.resumen()`
    # contesta cero.
    #
    # O sea que con 40 premios entregados el parte habria seguido diciendo 200,
    # y `anotar('parte')` no habria dejado ni rastro. Un parte que se calla una
    # fuente rota es el fallo que este modulo existe para evitar; uno que
    # informa ceros de una fuente que no abrio es el mismo fallo, peor, porque
    # ni siquiera se ve raro.
    registro.preparar(DATOS)
    premio.preparar(DATOS)
    encargos.preparar(DATOS)

    cuenta = os.environ.get('ZERNIO_CUENTA', '')
    clave = os.environ.get('ZERNIO_CLAVE', '')
    cuando_ = vistazo.cuando()

    # Una mirada por COMBINACION de tramos, no una por persona: Nicole y otra
    # de mercadeo comparten la misma, y armarla dos veces seria preguntarle a
    # la cadena y a Meta el doble de veces por el mismo parte.
    armados = {}

    def parte_de(tramos):
        llave = tuple(tramos)
        if llave not in armados:
            d = miradas.para(list(llave), registro=registro, premio=premio,
                             clave_wa=clave, cuenta_wa=cuenta,
                             encargos=encargos)
            armados[llave] = (miradas.texto(list(llave), d),
                              vistazo.para_plantilla(d),
                              len(d['pendientes']), len(d['rotas']))
        return armados[llave]

    rel = whatsapp.RelevoWhatsApp(cuenta=cuenta)
    malos = 0
    for para, tramos in gente:
        cuerpo, plano, n_pend, n_rotas = parte_de(tramos)
        # Se anota ANTES de mandar. Si el envio revienta a mitad, el registro ya
        # sabe que el parte se armo y con que — si no, un fallo de red borraria
        # tambien la unica huella de que hubo algo que contar.
        registro.anotar('parte', quien='programado', tramo='+'.join(tramos),
                        pendientes=n_pend, rotas=n_rotas)
        for intento, camino in enumerate((_libre, _plantilla)):
            try:
                if camino is _libre:
                    _libre(rel, para, cuando_, cuerpo)
                else:
                    _plantilla(cuenta, para, cuando_, plano)
                print(f'parte de {"+".join(tramos)} enviado a {para[-4:]} por '
                      + ('la ventana libre' if intento == 0 else 'plantilla'))
                break
            except Exception as e:
                if intento == 0:
                    # Lo normal a las 7:30: no hay ventana. No es un error.
                    print(f'sin ventana libre ({type(e).__name__}), voy por plantilla')
                    time.sleep(1)
                    continue
                malos += 1
                print(f'NO SALIO el parte a {para[-4:]}: {type(e).__name__}: {e}',
                      file=sys.stderr)
    return 1 if malos else 0


if __name__ == '__main__':
    sys.exit(main())
