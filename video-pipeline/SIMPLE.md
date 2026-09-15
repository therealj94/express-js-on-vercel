# El modo simple: tú nunca abres ComfyUI

La primera sesión falló en lo humano, no en lo técnico: se dejó a José delante de
un editor de nodos en un iPad. ComfyUI es una herramienta para ingenieros, y no
tiene por qué aparecer en su vida.

Este es el diseño correcto.

## Lo que hace José

**Escribir lo que quiere ver.** En español, en lenguaje normal:

> Plano 1: vista aérea de la mina al atardecer, la cámara baja despacio.
> Plano 2: primer plano del geólogo mirando una muestra, gira hacia cámara.

Y más tarde, **elegir**: mirar una hoja de contactos y decir *"el 3 y el 5"*.

Nada más. Ni nodos, ni plantillas, ni carpetas, ni subir ficheros a ningún sitio.

## Lo que pasa por dentro

```
1. Con la GPU APAGADA (gratis)
   - la descripción se convierte en shotlist.json
   - se aplica el look para que los planos parezcan una sola pieza
   - se preparan los workflows en formato API, ya probados
   - se le enseñan los prompts a José por si quiere corregir algo

2. Se enciende el pod con el trabajo YA DENTRO
   python3 tools/vast_api.py create --offer <id> --disk 400 \
     --onstart cloud/onstart.sh \
     --job prompts/q_stills.json --workflows prompts/workflows \
     --env RCLONE_CONF_B64=... --env RCLONE_REMOTE=b2:bucket/fecha

3. El pod, solo:
   - se instala
   - genera toda la cola
   - sube los resultados al bucket según los va haciendo
   - escribe "TRABAJO COMPLETO" en su log

4. El guardián ve ese mensaje y destruye la instancia.
   ID=<id> HORAS=8 PISO=15 ./guardian.sh
```

Nadie abre un navegador en ningún momento. La instancia vive exactamente lo que
dura el trabajo.

## Dónde sube José sus fotos

**A ningún sitio.** Si quiere usar una foto suya como primer fotograma, la manda
por el chat. Va al bucket y el pod la recoge. La pregunta "¿dónde subo esto?" no
debería existir.

## Las dos cosas que faltan para que esto funcione

1. **Los workflows en formato API dentro del repo.** Es la pieza que faltó y la
   que obligó a José a montar nodos a mano. La autoprueba ya vuelca al log el
   esquema de los nodos de H3 y el inventario de plantillas, así que se pueden
   construir con la GPU apagada.

2. **El bucket** (`ALMACENAMIENTO.md`, ~10 min de alta, ~$1.20/mes). Sin él los
   resultados solo salen por el navegador, que es justo lo que queremos evitar.

## Primera sesión del modo simple

Una tirada de reconocimiento, barata y sin interacción: el pod se instala, vuelca
al log el esquema de los nodos y las plantillas convertidas, y se destruye solo.
Con eso se construyen los workflows definitivos sin gastar más.

Coste estimado: **~$1**. Después de eso, cada sesión es: José describe, elige, y
recibe los clips terminados.
