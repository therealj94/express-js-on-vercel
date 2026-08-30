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
import sys
import time

import registro
import premio
import vistazo
import whatsapp

# A quien va. Es el mismo AURA_PARTE_PARA que decide quien puede pedirlo
# escribiendo «actualizar»: una sola lista, para que no haya un sitio donde
# agregar a alguien y otro donde olvidarse.
PARA = [x.strip() for x in (os.environ.get('AURA_PARTE_PARA') or '').split(',')
        if x.strip()]

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


def main():
    if not PARA:
        print('AURA_PARTE_PARA vacio: no hay a quien mandarle el parte')
        return 1

    cuenta = os.environ.get('ZERNIO_CUENTA', '')
    datos = vistazo.juntar(registro=registro, premio=premio,
                           clave_wa=os.environ.get('ZERNIO_CLAVE', ''),
                           cuenta_wa=cuenta)
    cuando_ = vistazo.cuando()
    cuerpo = vistazo.texto(datos)
    plano = vistazo.para_plantilla(datos)

    # Se anota ANTES de mandar. Si el envio revienta a mitad, el registro ya
    # sabe que el parte se armo y con que — si no, un fallo de red borraria
    # tambien la unica huella de que hubo algo que contar.
    registro.anotar('parte', quien='programado',
                    pendientes=len(datos['pendientes']), rotas=len(datos['rotas']))

    rel = whatsapp.RelevoWhatsApp(cuenta=cuenta)
    malos = 0
    for para in PARA:
        for intento, camino in enumerate((_libre, _plantilla)):
            try:
                if camino is _libre:
                    _libre(rel, para, cuando_, cuerpo)
                else:
                    _plantilla(cuenta, para, cuando_, plano)
                print(f'parte enviado a {para[-4:]} por '
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
