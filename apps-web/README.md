# Veta Wallet y MyTokenPay · versiones web

Las dos aplicaciones del telefono, llevadas al navegador. Cada una es un
archivo HTML con su hoja de estilos dentro, mas dos o tres scripts sueltos: sin
compilacion, sin dependencias, sin nada que descargar de un CDN. Se abren
poniendo la carpeta detras de cualquier servidor estatico.

## Donde vive cada una

| | dominio | app de Amplify | ensayo |
|---|---|---|---|
| Veta Wallet | `app.vetawallet.com` y `legal.vetawallet.com` | `d264zjawew1yea` | `main.d289v5ffkexk23.amplifyapp.com` |
| MyTokenPay | sin desplegar | `dd486t2t5w516` | `main.d2dr8sh34hni4c.amplifyapp.com` |

Las de ensayo no tienen dominio propio y sirven para mirar los cambios antes de
tocar los reales. **Se despliega ahi primero, siempre.**

### Por que `app.` y no `www.`

`www.vetawallet.com` y el apex no apuntan a Amplify: apuntan a la distribucion
de CloudFront `d1ceoywtt4iywx.cloudfront.net`, que **no esta en esta cuenta de
AWS**. Su origen es la app de Amplify `d7ofsbyqsj3d9` (por eso se despliega
tambien ahi: es lo unico que se puede alimentar de ese lado), pero la cache la
controla otro.

Reclamar el nombre desde aqui no se puede. Amplify responde *"One or more of the
CNAMEs you provided are already associated"*, y el procedimiento de AWS para
mover un alias — el TXT `_www.vetawallet.com` mas `AssociateAlias`, que ya se
creo en Route 53 (`Z05028253J23E6DVECFZA`) — solo funciona entre distribuciones
de la **misma** cuenta. Versionar rutas (`app.js?v=…`) tampoco sirve: ese CDN
ignora la cadena de consulta.

Quedan dos salidas, las dos en manos de quien sea dueño de esa distribucion:
soltar el alias, o correr una invalidacion. Mientras tanto `app.vetawallet.com`
es la direccion buena y esta enteramente bajo control de esta cuenta.

### Amplify no sirve la extension `.html`

Un `privacidad.html` desplegado queda publicado en `/privacidad`, a secas. La
URL con extension no corresponde a ningun objeto, asi que cae en la regla
comodin y devuelve la portada — y no hay reescritura que lo arregle, porque el
destino se normaliza igual. Los enlaces internos apuntan a `/privacidad` y
`/terminos`; escribirlos con `.html` es publicar un enlace roto que responde 200
y por eso no lo delata ninguna prueba de enlaces.

```sh
AWS_ACCESS_KEY_ID=… AWS_SECRET_ACCESS_KEY=… python3 subir.py veta-wallet  d289v5ffkexk23   # ensayo
AWS_ACCESS_KEY_ID=… AWS_SECRET_ACCESS_KEY=… python3 subir.py veta-wallet  d264zjawew1yea   # de verdad
```

**Amplify reemplaza el manifiesto entero en cada despliegue.** En
`vetawallet.com` esto no es un detalle: ahi viven las paginas de privacidad y
terminos, las tiendas de aplicaciones las exigen, y ya se cayeron una vez
cuando una pagina de "proximamente" se subio sin ellas. Subir siempre la carpeta
completa, nunca un archivo suelto.

## Veta Wallet

Habla con el backend de produccion (`vetawallet-1a2e38ac52b1.herokuapp.com`) con
las mismas rutas y el mismo contrato que la app del telefono. No hay una version
web de los datos: es la misma cuenta, el mismo saldo y la misma identidad vistos
desde otra pantalla. El backend ya trae las cabeceras CORS para el dominio.

Pantallas: bienvenida, entrar/crear cuenta, inicio con saldo, enviar, recibir
con codigo QR, actividad, Genesis ID y cuenta.

Enviar dinero pide **dos toques**: el primero enseña a donde va y cuanto, el
segundo manda. Un solo boton convierte un dedo torpe en una transferencia que no
vuelve. Cada envio lleva un sello de idempotencia, y si falla no se ofrece
reintentar — la transferencia pudo haber salido, y volver a pulsar seria
mandarla de nuevo.

**La firma del diseño es la veta**: una franja de mineral dentro de la roca es
el camino por el que el oro llega a la superficie, es el nombre de la marca, y es
la linea dorada que atraviesa la pantalla, se abre donde hay que decidir y se
ensancha justo donde esta el saldo.

## MyTokenPay

Sale de la aplicacion del telefono (`mytokenpay-app/mobile`), no del sitio que
habia antes. Mismo directorio de comercios, mismas categorias, mismos paises:
`datos.js` se genero leyendo `src/lib/mockData.ts`, asi que son los treinta
negocios reales, no una copia hecha para la web.

Pantallas: bienvenida, entrar/crear, inicio, explorar con buscador y filtros,
ficha de comercio, pagar con teclado numerico y QR, conectar Veta Wallet,
Genesis ID y cuenta.

La aplicacion del telefono corre hoy con `USE_MOCK_API = true` y su backend
publicado (`pos-wallet-…herokuapp.com`, el del sitio viejo) **esta caido**:
devuelve 503. La web hace lo mismo que la app — cuenta, billetera conectada y
pagos viven en el navegador. La constante `API` al principio de `app.js` es el
unico sitio que hay que tocar cuando haya un servidor: el resto del archivo no
distingue de donde salen los datos.

**La firma del diseño es el rotulo encendido**: un negocio de barrio se reconoce
de noche por su letrero, asi que cada comercio es un rotulo, su categoria le da
el color del neon y la lista se lee como una calle.

## Genesis ID

Las dos enlazan al portal (`genesis-id.onrender.com`) y las dos dicen lo mismo,
que es lo que hace valiosa a Genesis ID: **una sola verificacion sirve en Veta
Wallet, en MyTokenPay y en el resto del ecosistema**. Veta Wallet ademas lee el
estado real desde `/genesis/status` de su backend.

La verificacion la decide una persona del equipo de cumplimiento, no la
aplicacion. Hasta entonces el estado es "en revision", y las dos pantallas lo
dicen con esas palabras.

## El codigo QR

`qr.js` es el mismo archivo en las dos carpetas y esta escrito a mano: un
`<script src>` a un CDN es una peticion mas que puede fallar, y una billetera
que no puede enseñar su direccion de cobro no sirve de nada.

```sh
node qr.prueba.mjs
```

Compara modulo a modulo contra una implementacion de referencia, en las quince
versiones y en las cargas que de verdad generan las dos aplicaciones. Tres cosas
que aparecieron escribiendolo y conviene no volver a romper:

- **La informacion de version.** De la version 1 a la 6 todo coincidia y de la 7
  en adelante nada, en bloque. La 7 es donde el estandar añade un bloque con el
  numero de version escrito dos veces; sin reservarle sitio, los datos se metian
  dentro.
- **El orden de los bits del formato.** Ocho modulos mal, siempre los mismos.
  La segunda copia lleva siete modulos en vertical y ocho en horizontal, no ocho
  y siete: el de la esquina es el modulo que siempre esta oscuro.
- **La referencia optimiza segmentos.** Sin forzarla a modo byte parte el texto
  en tramos numericos y alfanumericos para ahorrar espacio, y produce un codigo
  distinto pero igual de valido. La comparacion fallaba sin que hubiera nada
  roto.

La prueba no exige que la matriz salga identica: exige que exista una de las
ocho mascaras con la que salga identica. Cual se uso va escrita dentro del
codigo y cualquier lector la deshace, asi que la eleccion de mascara es
cosmetica — en un caso las dos puntuaron 466 contra 467 y cada libreria eligio
una.
