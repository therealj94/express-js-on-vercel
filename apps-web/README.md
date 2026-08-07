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

La salida es montar **una distribucion propia** (`E3N96U0LYGO5S3`,
`d3vq91ahiny6zl.cloudfront.net`) con origen `main.d264zjawew1yea.amplifyapp.com`
y certificado propio, y reclamar el nombre con el procedimiento de AWS para
mover un alias entre cuentas: un TXT `_www.vetawallet.com` con el dominio de la
distribucion destino, y despues `AssociateAlias` sobre la distribucion propia.
Ese TXT cae dentro de la zona, asi que se puede crear — y es la razon por la que
esto se puede hacer sin la cuenta ajena.

Amplify no sirve para este paso aunque la distribucion de destino fuera suya: no
expone `AssociateAlias`, solo `create_domain_association`, que se planta en
*"One or more of the CNAMEs you provided are already associated"* y no tiene
manera de presentar la prueba de propiedad.

**Con el apex no se puede hacer lo mismo**: el TXT tendria que llamarse
`_vetawallet.com`, que no es hijo de `vetawallet.com` sino hermano, y vive en la
zona de `.com`. Route 53 rechaza crearlo y es correcto que lo haga. No hace
falta: el 302 de la distribucion ajena conserva la ruta entera
(`vetawallet.com/privacidad` → `www.vetawallet.com/privacidad`), asi que el apex
sigue funcionando de rebote. Si algun dia esa distribucion se apaga, el apex cae
con ella y hay que repuntar el registro A a la distribucion propia.

`app.vetawallet.com` y `legal.vetawallet.com` van directo a Amplify y siguen
siendo las direcciones que no dependen de nadie mas.

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
