#!/usr/bin/env python3
# El vigilante: mira el latido de AU-RA y avisa a los admin por WhatsApp.
#
# Corre desde un temporizador de systemd, cada cinco minutos, en su PROPIO
# proceso. La razon esta en la cabecera de `latido.py`: un vigilante que vive
# dentro de lo vigilado se muere con ello.
#
# Es deliberadamente tonto. Lee un archivo, decide con `latido.revisar` —que se
# prueba sin red ni telefono— y manda un mensaje. Toda la logica que puede
# equivocarse esta en el otro archivo, donde hay pruebas.

import os
import pathlib
import sys
import time

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import escalafon   # noqa: E402
import latido      # noqa: E402
import whatsapp as wa   # noqa: E402

DATOS = pathlib.Path(os.environ.get('AURA_DATOS', '/srv/aura'))
MEMORIA = DATOS / 'vigilante.txt'      # cuando se aviso de cada motivo


def _ultimo(motivo):
    try:
        for linea in MEMORIA.read_text().splitlines():
            m, _, t = linea.partition(' ')
            if m == motivo:
                return float(t)
    except Exception:
        pass
    return 0.0


def _apuntar(motivo, cuando):
    try:
        filas = {}
        if MEMORIA.exists():
            for linea in MEMORIA.read_text().splitlines():
                m, _, t = linea.partition(' ')
                if m:
                    filas[m] = t
        filas[motivo] = str(cuando)
        MEMORIA.write_text(''.join(f'{m} {t}\n' for m, t in filas.items()))
        MEMORIA.chmod(0o600)
    except Exception:
        pass


def main():
    motivo, texto = latido.revisar(DATOS)
    if not motivo:
        return 0

    ahora = time.time()
    if ahora - _ultimo(motivo) < latido.FRENO:
        # Ya se aviso hace poco de esto mismo. Callarse aqui es lo que hace que
        # el aviso siguiente se lea.
        return 0
    _apuntar(motivo, ahora)

    if not wa.encendido():
        print(f'{motivo}: {texto}', file=sys.stderr)
        return 1

    rel = wa.RelevoWhatsApp()
    aviso = ('🔴 *AU-RA*\n\n' + texto + '\n\n'
             'Lo estoy mirando yo desde afuera; el asistente no se entera de '
             'esto solo.')
    n = 0
    for persona in escalafon.admins():
        for donde in escalafon.formas_de(persona):
            if not donde.isdigit():
                continue
            try:
                rel.enviar(donde, aviso)
                n += 1
            except Exception as e:
                print(f'no le llegó a …{donde[-4:]}: {type(e).__name__}',
                      file=sys.stderr)
            break        # un aviso por persona, no por buzón
    print(f'{motivo}: avisados {n} admin', file=sys.stderr)
    return 1


if __name__ == '__main__':
    sys.exit(main())
