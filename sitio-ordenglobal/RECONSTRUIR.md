# El sitio de ordenglobal.org

| Ruta | Archivo | Qué es |
|---|---|---|
| `/` | `index.html` | La portada (septiembre de 2026) |
| `/en/` | `en/index.html` | La misma portada en inglés |
| `/historia/` | `historia/index.html` | "El viaje del valor": un solo desplazamiento con sonido |
| cualquier otra | `404.html` | La página que no existe (Amplify la sirve con estado 404) |

## La portada

**No se edita `index.html` a mano.** Sale de la plantilla y de los datos:

```sh
python3 construir-portada.py      # escribe index.html y en/index.html
sh reconstruir.sh /tmp/ogsite     # arma la copia completa
python3 desplegar.py /tmp/ogsite  # la sube a Amplify
```

- `portada.plantilla.html` y `portada.plantilla.en.html`: el texto de cada idioma.
- `construir-portada.py`: las siete casas, las cinco pruebas y el disco de las
  55 porciones, en los dos idiomas. Una casa nueva es una fila más ahí.
- `assets/og26.css` y `assets/og26.js`: todo el estilo y todo el código.
  El JS hace cuatro cosas: el logo que se ordena solo (sobre el trazado de
  `assets/og-vector.js`), el precio del ORIGEN y el último bloque en vivo,
  copiar los códigos, y el botón propio de los videos.
- `assets/medios/`: el tráiler de ORIGEN y el spot de Ordenex con sus pósteres.

Tres reglas que conviene no romper:

- **Un solo ornamento**: la regla de seis líneas, y una sola vez, justo donde
  la página pasa del desorden al orden. Entre secciones hay aire, no adornos.
- **Nada inventado se mueve.** Si el precio o la cadena no contestan, el dato
  no aparece (arriba) o queda su guion (en la fórmula). Nunca un número de
  relleno.
- **SFSP se presenta como lo que es**: en construcción y sin nada encendido.
  El día que se encienda, se cambia el sello y se añade su fila de prueba.

Los planetas en WebGL de la portada anterior siguen en `assets/` y en el
historial de git (`sistema.js`, `constelacion.js`, `portada.css`, `portada.js`),
por si se quieren recuperar; la portada nueva no los carga.

---

## La portada anterior (hasta septiembre de 2026)

## El ecosistema: siete mundos y una estrella

`sistema.js` dibuja la constelación de la portada en WebGL2, sin ninguna
dependencia: las superficies no se descargan, las calcula la tarjeta gráfica
con ruido simplex. Cada casa es un tipo de mundo (roca con filones de oro,
mundo vivo con océanos y luces de ciudad, hielo, cristal, gigante gaseoso con
anillos, bronce craterizado) y las órbitas son keplerianas de verdad —
elipses con su excentricidad e inclinación, y periodos sacados de la tercera
ley, así que la casa de fuera tarda unas cuatro veces más que la de dentro.

Tres cosas que conviene no deshacer:

- **La decisión de qué motor dibuja vive en `portada.js`**, que es el archivo
  pequeño que se carga siempre, y no dentro de `sistema.js`. Si viviera dentro
  del motor de WebGL, un fallo al descargar ESE archivo dejaría la sección
  vacía sin que nadie se enterara. `constelacion.js` se pide solo cuando hace
  falta, así que sus ocho kilobytes los paga quien los usa.
- **La página se mide a sí misma.** No hay lista de tarjetas gráficas buenas y
  malas —esa lista envejece mal—: el motor cuenta cuántos cuadros tardan más de
  lo que deberían y, si va justo, apaga el brillo, luego el relieve, y si aun
  así no llega se retira y entra el dibujo plano. Al retirarse cambia el
  `<canvas>` por uno nuevo: uno que ya dio contexto WebGL no devuelve nunca un
  contexto 2D.
- **Los rótulos son botones del documento**, no texto pintado en el lienzo; se
  proyectan con la misma matriz que dibujó la escena. Un planeta que no se
  puede tocar con el teclado ni leer con un lector de pantalla es una
  decoración, no un menú.

La cámara se calcula, no se pone a ojo: la elevación sale de la proporción del
lienzo (casi rasante en un monitor ancho, casi cenital en un teléfono de pie) y
la distancia por bisección, proyectando la órbita exterior hasta dar con la
mínima en la que cabe entera. Cambiar el alto de `#constelacion` en el CSS
reencuadra la escena sola.

Los medios no están en el repositorio: 216 fotogramas WebP (`seq/`), 19 MP3
(`audio/`) y las imágenes de `assets/`. Viven en producción y `reconstruir.sh`
los baja de ahí.

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

```sh
sh reconstruir.sh /tmp/ogsite     # código de aquí + medios de producción
```

Al terminar tienen que ser 272 archivos y ~14 MB. Si hay que rehacer la
música desde cero (ver "La musica"):

```sh
python3 musica/componer.py        # /tmp/musica/capas/*.wav y mezcla.wav
python3 musica/efectos.py         # /tmp/musica/efectos/*.wav
python3 musica/mp3.py /tmp/musica /tmp/ogsite/audio   # pip install lameenc
```

Los fotogramas se sirven en WebP (calidad 76, un tercio menos que los JPEG
originales sin diferencia a la vista). Si aparecen fotogramas nuevos en JPEG:

```python
from PIL import Image; Image.open("00.jpg").save("00.webp", "WEBP", quality=76, method=6)
```

## Versiones y caché

Amplify manda `Cache-Control` por patrón (`configurar-amplify.py`): los
fotogramas, el audio, las fuentes y las imágenes son inmutables por un año;
CSS y JS duran una semana en el navegador. Por eso el HTML los pide con
`?v=AAAAMMDD`: **al tocar `portada.css` o cualquier `.js`, cambiá la fecha en
las tres páginas y en `404.html`**, o media gente seguirá con la versión vieja
hasta una semana. El HTML no se cachea en el navegador.

`configurar-amplify.py` también fija la CSP y la regla del 404. Se corre una
vez cuando cambia algo de eso, con las mismas credenciales que el despliegue.

## Publicar

```sh
AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... python3 desplegar.py /tmp/ogsite
node probar-bso.mjs                # comprueba la banda sonora de /historia/ en un navegador
SITIO=https://www.ordenglobal.org node probar-bso.mjs   # lo mismo, contra producción
```

Amplify **reemplaza el manifiesto entero** en cada despliegue: lo que no va en
la subida desaparece del sitio. Por eso el script recorre el arbol completo y
sube los 272 archivos aunque solo haya cambiado uno. Nunca subir un archivo
suelto. (Así se perdieron una vez las cuatro capas y los trece efectos de la
banda sonora: un despliegue hecho desde una copia sin `audio/` completo dejó
/historia/ sonando con una sola capa durante semanas.)

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

El `.wav` que sale se convierte con `musica/mp3.py` y queda en `audio/ambiente.mp3`.
