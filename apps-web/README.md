# Veta Wallet y MyTokenPay · versiones web

Las dos aplicaciones del telefono, llevadas al navegador. Cada una es un
archivo HTML con su hoja de estilos dentro, mas dos o tres scripts sueltos: sin
compilacion, sin dependencias, sin nada que descargar de un CDN. Se abren
poniendo la carpeta detras de cualquier servidor estatico.

## Donde vive cada una

| | dominio | app de Amplify | ensayo |
|---|---|---|---|
| Veta Wallet | `app.vetawallet.com` y `legal.vetawallet.com` | `d264zjawew1yea` | `main.d289v5ffkexk23.amplifyapp.com` |
| Veta Wallet · un solo archivo | `www.vetawallet.com` y el apex | `d7ofsbyqsj3d9` | — |
| MyTokenPay | sin desplegar | `dd486t2t5w516` | `main.d2dr8sh34hni4c.amplifyapp.com` |

Las de ensayo no tienen dominio propio y sirven para mirar los cambios antes de
tocar los reales. **Se despliega ahi primero, siempre.**

`www` va por un CDN ajeno que solo sabe entregar un documento, asi que se sirve
una version distinta — el mismo sitio, generado de las mismas fuentes, metido en
un solo archivo. Se explica abajo. **Un cambio en Veta Wallet son dos
despliegues**:

```sh
python3 subir.py veta-wallet d264zjawew1yea            # app. y legal.
python3 unificar.py veta-wallet /tmp/veta-uno          # y para www:
node probar-uno.mjs /tmp/veta-uno
python3 subir.py /tmp/veta-uno d7ofsbyqsj3d9
```

### Como se recupero `vetawallet.com`

El dominio estaba muerto, y no por falta de contenido. `vetawallet.com` era un
registro A hacia la distribucion de CloudFront `d1ceoywtt4iywx.cloudfront.net`,
que **no esta en esta cuenta de AWS**; esa distribucion contesta un 302 hacia
`www.vetawallet.com`, y `www` **no tenia ningun registro en la zona**. Quien
escribia el nombre del dominio terminaba en un nombre que no resuelve.

Amplify no podia quedarse con `www`: responde *"One or more of the CNAMEs you
provided are already associated"*, porque el alias lo tiene tomado esa
distribucion ajena. Y servir el sitio a traves de ella tampoco era opcion —
reescribe cualquier ruta al index, asi que `/app.js` devolvia la portada y la
pagina cargaba sin su codigo.

**El nombre no se pudo recuperar; el contenido si.** Son dos cosas distintas y
conviene no confundirlas, porque la primera esta cerrada y la segunda nunca lo
estuvo: el **origen de esa distribucion es una app de Amplify de esta cuenta**
(`d7ofsbyqsj3d9`). Lo que sirve lo decidimos aqui.

Quitarle el alias es imposible, y queda escrito para que nadie lo reintente
creyendo que le falto un paso:

| intento | respuesta de AWS |
|---|---|
| `AssociateAlias` de `www` con el TXT `_www.vetawallet.com` | `IllegalUpdate: Alias move is not allowed since the source distribution is enabled` |
| `AssociateAlias` del apex | `IllegalUpdate: Invalid or missing alias DNS TXT records` |
| Alias explicito `www` en una distribucion propia | `CNAMEAlreadyExists` |

El procedimiento de AWS para mover un alias entre cuentas exige que la
distribucion de origen este **apagada**, y la ajena esta encendida. El tercer
intento descarta ademas que su reclamo sea un comodin `*.vetawallet.com`: si lo
fuera, un alias explicito le ganaria. Lo tiene tomado exacto. Con el apex el
bloqueo es anterior: su TXT tendria que llamarse `_vetawallet.com`, que no es
hijo de la zona sino hermano, y vive en la de `.com`.

Asi que en vez de pelear por el nombre se cambio lo que el nombre entrega. Ese
CDN devuelve **el mismo documento para cualquier ruta** — `/app.js`, `/qr.js` y
hasta las imagenes contestan el index — de modo que se genera una version en la
que ese unico documento se basta solo: `unificar.py` mete dentro del HTML los
tres scripts, el icono y las dos paginas legales, y un arranque de tres lineas
decide por `location.pathname` si toca la aplicacion o un texto legal. Con eso
`/privacidad` y `/terminos` siguen existiendo aunque el servidor entregue
siempre lo mismo.

Despues, el registro que faltaba: `www.vetawallet.com` CNAME a
`d1ceoywtt4iywx.cloudfront.net`. Su certificado es comodin, asi que cubre el
nombre. El apex sigue de rebote por el 302, que conserva la ruta entera.

Queda tambien montada una **distribucion propia** (`E3N96U0LYGO5S3`,
`d3vq91ahiny6zl.cloudfront.net`) con certificado para `vetawallet.com` y
`www.vetawallet.com`, desplegada y sin alias. Hoy no sirve trafico: esta ahi
para el dia que la otra cuenta suelte el nombre, y ese dia el cambio es repuntar
un registro.

**Lo que esto deja debiendo.** `www` y el apex dependen de una distribucion que
no controlamos: si su dueño la apaga, los dos caen y hay que repuntar a la
propia. Y su cache tampoco es nuestra, asi que un despliegue tarda en verse lo
que ella quiera. `app.vetawallet.com` y `legal.vetawallet.com` van directo a
Amplify y no dependen de nadie: son las que hay que usar en las tiendas y en
cualquier enlace que tenga que durar.

### Amplify no sirve la extension `.html`

Un `privacidad.html` desplegado queda publicado en `/privacidad`, a secas. La
URL con extension no corresponde a ningun objeto, asi que cae en la regla
comodin y devuelve la portada — y no hay reescritura que lo arregle, porque el
destino se normaliza igual. Los enlaces internos apuntan a `/privacidad` y
`/terminos`; escribirlos con `.html` es publicar un enlace roto que responde 200
y por eso no lo delata ninguna prueba de enlaces.

### Al desplegar

Las credenciales van delante de cada orden:
`AWS_ACCESS_KEY_ID=… AWS_SECRET_ACCESS_KEY=… python3 subir.py …`

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

Tiene **las mismas cinco pestañas que el telefono** — billetera, tarjeta,
cambiar, actividad y ajustes — y por el mismo motivo: quien usa la app en el
bolsillo no tiene que volver a aprenderse donde esta cada cosa al abrirla en una
pantalla grande. Enviar, recibir, comprar, depositar, la ficha de una moneda y
Genesis ID no son pestañas: se entra y se vuelve, igual que alla.

### Los saldos salen de la cadena, no de un resumen

`cadena.js` lee los **quince tokens** de la red 8532 por RPC, uno por uno, con
los mismos contratos que usa el telefono, y saca los precios de las mismas
fuentes: el oro y la plata de CoinGecko (AUKA sigue la onza de oro, AGKA la de
plata, ORIGEN es un gramin — 1/55 de gramo), el precio de ONDK del backend, y
una tabla de referencia para los tokens de sector, que no cotizan en ningun
mercado publico.

Que esto se pueda hacer desde un navegador no era obvio y se comprobo: el RPC de
la cadena responde `access-control-allow-origin: *`, y CoinGecko tambien. Si
algun dia dejaran de hacerlo, esta pantalla se queda sin saldos y hay que mover
la lectura al backend.

Antes esta pagina pedia `/wallet/origen-balance`: **una sola moneda**, y un
precio de respaldo de `2.35` escrito en el codigo para cuando el servidor no
mandaba ninguno. Ese numero entraba al patrimonio sin ninguna marca, asi que se
podia estar mirando un valor inventado creyendo que era el de mercado. Ya no
existe: **sin precio real se pinta un guion**, el total solo suma lo que tiene
precio, y se avisa abajo de la lista. Un feed caido no puede parecerse a una
perdida.

### La sesion se renueva sola

Esto es lo que hacia que la tarjeta dijera **"invalid token"**. El JWT del
backend dura poco, y esta pagina guardaba solo el token del login: no lo
renovaba nunca. Al vencer, *toda* llamada con sesion empezaba a fallar — la
tarjeta, los depositos, Genesis — y desde afuera parecia un problema de la
tarjeta nada mas porque es lo que se abre despues de un rato.

Ahora se guarda tambien el `refreshToken` y se llama a `/auth/refresh` antes de
que venza o al recibir un 401, con un solo reintento. Dos detalles que no son
adorno: si llegan varias llamadas a la vez con el token vencido **una sola
renueva** y las demas esperan a esa — el servidor rota el refreshToken, y cinco
en paralelo dejarian cuatro con uno muerto; y `/transaction/send` va con
`sinReintento`, porque repetir un envio que quiza ya salio es mandar el dinero
dos veces.

### La frase y la llave

Se piden con la contraseña cada vez y **no se guardan en ningun lado**: se
pintan y se van con la pantalla. Las rutas del backend son `/users/decriptSeed`
y `/users/decriptPrivate` — con "decript" mal escrito, asi se llaman del otro
lado. Las que parecian obvias (`/user/seed`) nunca existieron, y por eso esto
devolvia "no disponible" siempre.

La frase sale en doce casillas numeradas, no de corrido: hay que copiarla a mano
en un papel, y de corrido es imposible hacerlo sin equivocarse.

### La tarjeta

Es la del telefono: negra con el circuito grabado, el monograma de Orden Global
grande arriba, chip, numero en relieve, VALID THRU y titular. **Se da vuelta** —
el CVV vive atras, sobre la banda de firma, como en una tarjeta de verdad. El
giro es una transformacion de CSS sobre la escena, asi que voltear no vuelve a
generar el HTML: si lo hiciera, cortaria la animacion en seco.

El numero y el CVV solo aparecen despues de escribir la contraseña, viven en
memoria mientras dura la pantalla y se borran al salir. Salir de la tarjeta la
deja de frente otra vez: nadie tiene por que volver y encontrarselos puestos.

### El lector de codigos

Usa `BarcodeDetector`, que trae el propio navegador. No se incrusta una
biblioteca de terceros para decodificar: serian cien kilobytes de codigo ajeno
leyendo la camara de alguien, en la pantalla donde se escribe una direccion a la
que se le va a mandar dinero. Donde no existe — Safari, Firefox — se dice y se
ofrece pegar a mano, que es lo que se haria igual.

Al salir de la pantalla la camara se apaga de verdad. Una pestaña que deja el
piloto encendido asusta, y con razon.

### Lo que vive solo en este navegador

Los **contactos**, el registro de **sesiones** y el **nombre** que se muestra. En
el telefono tambien son locales — `updateAccount` escribe en el almacenamiento
del propio aparato, no en el servidor — asi que la web hace lo mismo y lo dice
en pantalla. El registro de sesiones solo ve lo que paso en este navegador: si
alguien entra desde otro aparato, aqui no aparece, y decir lo contrario seria
vender una seguridad que no existe.

### Lo que esta abierto y lo que no

`cambiar` calcula la tasa y **no ejecuta**, igual que en el telefono: dentro de
la red todo se liquida contra ORIGEN y el motor de cambio no esta abierto.
`comprar` esta en obra, tambien igual. Los dos lo dicen en pantalla. Un boton
que parece funcionar y no hace nada es peor que no tener la pantalla.

La tarjeta si es real: estado, congelar y descongelar, ver el numero y el PIN
—cada uno pide la contraseña y no se guarda en ningun lado— y los movimientos.
Emitirla exige Genesis ID verificado, y se dice antes de enseñar el formulario
para que nadie lo llene y se lo rechace el emisor.

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

### `unificar.py` y `probar-uno.mjs`

`unificar.py` no es un empaquetador ni el principio de uno: es un unico truco
contra una unica limitacion ajena. Mete `qr.js`, `i18n.js` y `app.js` dentro del
HTML, el icono como `data:`, y las dos paginas legales como `<template>`. Los
scripts van envueltos en `if (!window.__legal)` porque `app.js` se engancha a
`DOMContentLoaded` y en una pagina legal buscaria elementos que no existen;
`VETA` vuelve a `window` a mano porque los manejadores en linea del HTML lo
llaman por su nombre y dentro del bloque seria inalcanzable.

`probar-uno.mjs` levanta un servidor que **contesta el index a lo que sea**,
como el CDN de alla, y prueba la pagina ahi dentro. Servirla desde una carpeta
normal la aprobaria por el motivo equivocado, porque en una carpeta los archivos
sueltos si existen y la prueba no demostraria nada.
