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
  curl -so assets/$a.png https://www.ordenglobal.org/assets/$a.png
done
curl -so assets/genesis.ico https://www.ordenglobal.org/assets/genesis.ico
for s in hero gold blockchain origen; do
  mkdir -p seq/$s
  for i in $(seq -w 0 53); do
    curl -so seq/$s/$i.jpg https://www.ordenglobal.org/seq/$s/$i.jpg
  done
done
python3 <repo>/sitio-ordenglobal/musica/componer.py   # capas/*.wav y mezcla.wav
python3 <repo>/sitio-ordenglobal/musica/efectos.py    # efectos/*.wav
# a MP3: capas a 72k, efectos a 64k, la mezcla plana a 96k (ver "La musica")
```

Al terminar tienen que ser 237 archivos y ~16 MB.

## Publicar

```sh
AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... python3 desplegar.py /tmp/ogsite
node probar-bso.mjs                # comprueba la banda sonora en un navegador
```

Amplify **reemplaza el manifiesto entero** en cada despliegue: lo que no va en
la subida desaparece del sitio. Por eso el script recorre el arbol completo y
sube los 237 archivos aunque solo haya cambiado uno. Nunca subir un archivo
suelto.

El espejo del servidor viejo ya **no recibe trafico**: `www` resuelve a
CloudFront en todos los resolutores que se probaron, y el apex (`ordenglobal.org`
a secas, que sigue apuntando a `50.31.177.40`) solo hace el 301 hacia `www`. Su
copia esta vieja y no importa mientras ese redirect siga en pie. El `.htaccess`
que lo sostiene tiene tambien un `DirectoryIndex index.html index.php`; **el
WordPress sigue instalado y no se toca**, solo queda tapado.

## La musica

No es una pista de fondo: es una banda sonora que sigue al lector.

`musica/componer.py` compone minuto y medio en mi menor a 86 pulsos por minuto
y lo exporta en **cinco capas** del mismo compas y la misma duracion. El
navegador las arranca todas a la vez y solo mueve sus volumenes segun el
capitulo: en el prologo suena una, en el final las cinco. Como comparten reloj,
entran y salen sin desfase por mas que el lector suba, baje o se detenga — que
es la unica forma de que la musica acompañe a alguien que maneja el tiempo con
el dedo.

| capa | que es | desde donde suena |
|---|---|---|
| `fondo` | colchon de cuerdas y aire | siempre |
| `pulso` | bajo y bateria | la tierra |
| `alma` | la melodia | la boveda |
| `senal` | campanas y datos | la cadena |
| `cumbre` | octava alta, pedal, timbales | ORIGEN |

`musica/efectos.py` hace los trece efectos de escena, y estan afinados en la
misma tonalidad que la pieza — que es la diferencia entre un efecto pegado
encima y uno que pertenece a la obra.

Lo importante no es que existan, sino **cuando suenan**. Un efecto disparado al
entrar al capitulo cae donde cae, y casi nunca donde pasa algo. Estos van atados
al fotograma, y los numeros de la tabla `CUES` en `index.html` salen de mirar las
cuatro secuencias una por una:

| momento | fotograma | p | suena |
|---|---|---|---|
| el cucharon muerde la roca | 32 de 54 | 0,58 | `pala` |
| la barra de oro se agrieta | 12 de 54 | 0,17 | `desmorona` |
| la moneda queda de frente | 24 de 54 | 0,42 | `moneda` (con `particula` desde el 1) |
| el capital cruza el puente | — | 0,30 | `puente` |

Hay tres familias:

- **Golpes** (`CUES`): suenan una vez al cruzar su punto, en cualquiera de los
  dos sentidos. Quien sube a mirar otra vez la moneda vuelve a oirla. Saltar al
  medio de un capitulo con el riel **no** los dispara, y es correcto: si uno cae
  con la moneda ya hecha en pantalla, no tiene por que oirla acuñarse.
- **Bucles** (`MAQUINAS`): el motor y los hidraulicos de la excavadora giran sin
  parar mientras dura el capitulo, y su volumen **y su tono** siguen la velocidad
  de la mano. Es lo que convierte la maquina de un video en algo que obedece.
- **Goteos** (`GOTEOS`): un mismo sonido repetido a lo largo de un tramo, con la
  cadencia acelerando. El contador del prologo marca el paso; los rayos de la
  cadena saltan entre nodos. Cada repeticion sale a un tono y un lugar del
  estereo distintos — sin eso son treinta copias del mismo archivo y el oido lo
  detecta enseguida.

Tres decisiones que no son obvias y conviene no deshacer:

- **El limitador vive en el navegador, no en los archivos.** Grabarlo dejaria la
  reduccion marcada en las cinco capas, y en el prologo suena el colchon solo:
  se oiria latiendo al ritmo de una bateria que no esta sonando.
- **72 kbps, no 56.** A 56 el codificador se queda sin bits y *inventa* dos
  decibelios y medio de agudos que no estaban. A 72 los conserva intactos y pesa
  un cuarto menos que 96.
- **El filtro de retumbe se aplica sobre el largo exacto, sin relleno.** Rellenar
  con ceros mete un escalon al final, el filtro lo vuelve repique y ese repique
  ensucia los dos bordes que tienen que empalmar: se probo, y el salto del bucle
  paso de 0,0001 a 0,59.

La musica es obra propia y no una licencia. La referencia era *Bitter Sweet
Symphony*, que es el caso de manual de lo que no hay que hacer: The Verve
grabaron su propia orquesta y aun asi perdieron el cien por ciento de las
regalias, porque lo que se protege es la melodia y no la grabacion. Se tomo lo
que no tiene dueño — el tempo, el bucle de cuatro acordes, la orquesta sobre el
ritmo — y la melodia se escribio aqui.

`probar-bso.mjs` verifica todo eso en un navegador de verdad: que las cinco
capas arranquen al mismo sample, que la mezcla cambie con el capitulo, que el
filtro se abra, que los efectos suenen una sola vez, que apagar el sonido lo
apague — y, con un analizador conectado a la salida, que de verdad salga señal.
Eso ultimo es lo que separa "el cableado esta bien" de "se oye".

Progresion en re menor (Dm - Bb - F - C), dos vueltas de cuatro acordes. El
final se funde con el principio con tres segundos de cruce, asi que el bucle no
tiene costura audible — el ultimo instante y el primero coinciden en energia
(0,180 contra 0,174) y todo lo que crece a lo largo de la pieza vuelve a su
punto de partida antes de cerrar.

El `.wav` que sale hay que convertirlo a MP3 y dejarlo en `audio/ambiente.mp3`.
