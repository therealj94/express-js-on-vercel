#!/usr/bin/env python3
"""Borra la chispa de Gemini de los fotogramas de /historia.

Las secuencias hero, gold y blockchain (54 cuadros cada una, 880x495) salieron
de un generador que firma en la esquina inferior derecha con una estrellita
de cuatro puntas, en la caja x 792-852, y 398-458. La secuencia origen esta
limpia. José pidio que esa marca desapareciera (2-sep).

Se tapa la caja con el trozo vecino de la izquierda (x 722-782) apenas
desenfocado: en fondo negro o de estrellas no se nota, y en el suelo de la
mina tampoco, porque la pagina recorta con object-fit: cover. Se parchan los
162 sin detectar nada — detectar fallaba en los cuadros claros — y parchar un
cuadro ya parchado es inocuo.

Uso:  python3 limpiar-fotogramas.py [/tmp/ogsite]
"""
import glob
import os
import sys

from PIL import Image, ImageFilter

RAIZ = sys.argv[1] if len(sys.argv) > 1 else '/tmp/ogsite'
MARCA = (792, 398, 852, 458)
VECINO = (722, 398, 782, 458)

n = 0
for s in ('hero', 'gold', 'blockchain'):
    for f in sorted(glob.glob(os.path.join(RAIZ, 'seq', s, '*.jpg'))):
        im = Image.open(f).convert('RGB')
        if im.size != (880, 495):
            print('tamaño raro, no toco:', f, im.size)
            continue
        im.paste(im.crop(VECINO).filter(ImageFilter.GaussianBlur(0.6)), MARCA)
        im.save(f, quality=88, optimize=True)
        n += 1
print('fotogramas parchados:', n)
