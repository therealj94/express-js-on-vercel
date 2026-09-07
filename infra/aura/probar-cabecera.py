#!/usr/bin/env python3
# LAS DOS COPIAS DE LA CABECERA TIENEN QUE SER LA MISMA, BYTE POR BYTE.
#
# ULTRON corre en Heroku y AU-RA en el nodo: son dos despliegues distintos, asi
# que el mismo texto tiene que existir en dos sitios. Eso es una duplicacion
# inevitable — pero VIGILADA. Si alguien edita una y se olvida de la otra:
#
#   · se separa la verdad de la casa, y la copia vieja es la que un dia le
#     habla a alguien sobre su dinero;
#   · y se rompe el prefijo compartido, que es lo que hace que cambiar de AU-RA
#     a ULTRON cueste 1 segundo y no 6,5. Sin esta prueba, eso se rompe EN
#     SILENCIO: nada falla, solo se pone lento y nadie sabe por que.
import hashlib, os, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
COPIAS = {
    'AU-RA': os.path.join(AQUI, 'cabecera-de-la-casa.md'),
    'ULTRON': os.path.abspath(os.path.join(AQUI, '..', 'ultron', 'lib', 'cabecera-de-la-casa.md')),
}

fallos = 0


def decir(ok, que, extra=''):
    global fallos
    print(f"  {'ok   ' if ok else 'FALLA'} {que}" + (f"\n           {extra}" if extra else ''))
    if not ok:
        fallos += 1


huellas = {}
for quien, ruta in COPIAS.items():
    existe = os.path.exists(ruta)
    decir(existe, f'la copia de {quien} esta en su sitio', ruta if not existe else '')
    if existe:
        huellas[quien] = hashlib.sha256(open(ruta, 'rb').read()).hexdigest()

if len(huellas) == 2:
    a, b = huellas['AU-RA'], huellas['ULTRON']
    decir(a == b, 'las dos copias son IDENTICAS byte por byte',
          '' if a == b else f'AU-RA {a[:16]} · ULTRON {b[:16]} — copiar una sobre la otra')

    texto = open(COPIAS['AU-RA'], encoding='utf-8').read()
    # Y que lo que protege a la gente siga escrito. Una cabecera que se quedo
    # sin sus reglas sigue compartiendo prefijo igual de bien, asi que la
    # prueba de arriba no se enteraria.
    for palabras, que in [
        ('REFERENCIADOS al', 'dice «referenciados»'),
        ('Nunca se dice «respaldados»', 'y que nunca se dice «respaldados»'),
        ('no está «regulada» ni «registrada»', 'que no esta regulada ni registrada'),
        ('AuCorp NO ES UN BANCO', 'que AuCorp no es un banco'),
        ('SEC', 'y lleva el incidente de la SEC, que es por que existe la regla'),
        ('LA CADENA 5550', 'que la cadena viva es la 5550'),
        ('NO SE MUEVE DINERO', 'y que no se mueve dinero'),
    ]:
        decir(palabras.replace(' ', ' ') in texto.replace('\n', ' ').replace('  ', ' ') or palabras in texto, que)

print('\nTodo en verde' if not fallos else f'\n{fallos} fallo(s)')
sys.exit(1 if fallos else 0)
