# El sitio de ordenglobal.org

"El viaje del valor" es una sola pagina: `index.html`, sin dependencias ni
compilacion. Todo lo demas son medios (216 fotogramas y 9 imagenes) que la
pagina carga a mano.

## Donde vive

| Cosa | Donde |
|---|---|
| App de Amplify | `d2rweubccyt73x`, rama `main`, region `us-east-1` |
| Dominio | `www.ordenglobal.org` (CloudFront `d10i3mbvr3opn0`) |
| Espejo | el servidor cPanel viejo, `50.31.177.35`, en `public_html/` |

El espejo existe porque los servidores de nombres del dominio (`ns1`/`ns2.nivapixel.com`)
estuvieron un tiempo dando respuestas distintas: parte del mundo llegaba al
servidor viejo y veia la pagina anterior. Mientras el dominio no se mueva a
Route 53, **todo cambio va a los dos lados** o media internet ve una version y
media otra.

## Reconstruir la copia de trabajo

Los medios no estan en el repositorio: son 11 MB de JPEG que ya viven en
produccion y se bajan de ahi.

```sh
mkdir -p /tmp/ogsite/assets /tmp/ogsite/audio
cd /tmp/ogsite
cp <repo>/sitio-ordenglobal/index.html .
for a in og veta veta-mark veta-icon origen origen-mark genesis-mark favicon-og; do
  curl -sO https://www.ordenglobal.org/assets/$a.png
done
curl -so assets/genesis.ico https://www.ordenglobal.org/assets/genesis.ico
for s in hero gold blockchain origen; do
  mkdir -p seq/$s
  for i in $(seq -w 0 53); do
    curl -so seq/$s/$i.jpg https://www.ordenglobal.org/seq/$s/$i.jpg
  done
done
python3 <repo>/sitio-ordenglobal/musica/componer.py   # deja ambiente.wav
```

Al terminar tienen que ser 227 archivos y ~11 MB.

## Publicar

```sh
AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... python3 desplegar.py /tmp/ogsite
```

Amplify **reemplaza el manifiesto entero** en cada despliegue: lo que no va en
la subida desaparece del sitio. Por eso el script recorre el arbol completo y
sube los 227 archivos aunque solo haya cambiado uno. Nunca subir un archivo
suelto.

Despues, el espejo: subir lo mismo a `public_html/` del servidor cPanel. El
`.htaccess` de ahi tiene un `DirectoryIndex index.html index.php` que hace que
la pagina nueva gane sobre el WordPress viejo. **El WordPress sigue instalado y
no se toca** — solo queda tapado.

## La musica

`musica/componer.py` sintetiza los 60 segundos de ambiente que suenan de fondo.
Es una obra propia, no una pista con dueño: el sitio es publico y comercial, y
una licencia ajena es un problema esperando a pasar.

Progresion en re menor (Dm - Bb - F - C), dos vueltas de cuatro acordes. El
final se funde con el principio con tres segundos de cruce, asi que el bucle no
tiene costura audible — el ultimo instante y el primero coinciden en energia
(0,180 contra 0,174) y todo lo que crece a lo largo de la pieza vuelve a su
punto de partida antes de cerrar.

El `.wav` que sale hay que convertirlo a MP3 y dejarlo en `audio/ambiente.mp3`.
