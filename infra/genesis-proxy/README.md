# Puente a Genesis ID

> **RETIRADO (26-sep-2026, SFSP v0.3 §11, plan tarea 0.6).** Esta carpeta ya
> no tiene lógica propia. El puente es **uno solo**:
>
> | Dónde | Qué es |
> | --- | --- |
> | `infra/veta-wallet-backend/lib/genesisPuente.js` | **El canónico.** Se edita aquí y en ningún otro sitio |
> | `infra/mytokenpay-api/src/lib/genesisPuente.js` | Copia byte a byte (con `genesisPuente.d.ts`); `src/routes/genesis.ts` es un adaptador de sesión |
> | `infra/genesis-proxy/genesis.router.js` | Reexporta el canónico, para que las rutas antiguas sigan llevando al mismo código |
>
> `infra/veta-wallet-backend/pruebas/probar-puente-genesis.mjs` falla si las
> copias divergen y prueba el comportamiento sin red (Genesis de mentira).
> Nada se desplegaba desde esta carpeta, así que no hay despliegue que retirar.
>
> Cambios de comportamiento respecto de esta copia: la dirección de billetera
> es **obligatoria** en `/vincular` (422 `VINCULO_SIN_DIRECCION` /
> `VINCULO_DIRECCION_INVALIDA`); se suman `/gid`, `/documento-fotos` y
> `/billetera`; `/documento/leer` ya no manda `cara` (Genesis ID nunca la leyó).
> El resto de este documento se conserva como historia.

Router de Express que monta cada backend del ecosistema para hablar con
Genesis ID sin que la clave de API salga del servidor.

```
teléfono ──JWT──▶ backend de la app (/genesis/*) ──X-API-Key──▶ Genesis ID
```

## Por qué existe

Genesis ID exige `X-API-Key` en todas sus rutas. Esa clave **no puede viajar
dentro de la aplicación móvil**: un APK se descomprime con una orden y
cualquiera la extraería. Con ella podría crear identidades a nombre de otros y
consultar perfiles ajenos.

Así que la clave vive solo en el servidor de cada app, que ya autentica al
usuario con su propio JWT y responde por él.

## Cómo se monta

En el backend de Veta Wallet (`app.js`), y con el mismo código en el de
MyTokenPay:

```js
import { routerGenesis, parserRostro } from './genesis.router.js'
import { verificarToken } from './middleware/auth.js'   // el de la propia app

// ANTES del parser general de la app: los fotogramas del rostro no caben en su
// límite, y el cuerpo lo parsea el primero que lo alcanza.
app.use(['/genesis/biometria', '/genesis/documento/leer'], parserRostro)

// ... aquí va el bodyParser.json({ limit: '100kb' }) de siempre ...

// El middleware tiene que dejar en `req.usuario` al menos { id, email }.
// Si la app maneja dirección on-chain, añadir `address`: el puente la usa para
// atar la billetera al GID y que ordenscan pueda resolverla.
app.use('/genesis', routerGenesis({ exigirSesion: verificarToken }))
```

Si el parser general va primero, la verificación de identidad muere con un 413
y en el teléfono solo se ve "no se pudo enviar la foto".

Variables de entorno del backend:

```
GENESIS_URL      https://genesis-id.onrender.com
GENESIS_API_KEY  la clave de ESTA app, del panel de Genesis ID → Operadores y apps
```

`routerGenesis` **lanza al arrancar** si no se le pasa `exigirSesion`. Sin ese
middleware el puente sería una vía abierta para crear identidades a nombre de
cualquier correo, y es preferible que el servidor no arranque a que arranque
mal.

## Lo que hace y lo que no

| Ruta | Para qué |
| --- | --- |
| `GET /genesis/estado` (o `/status`) | Estado del trámite, con `hecho` y `documentoDatos`. Crea la identidad si no existe |
| `POST /genesis/datos` | Nombre, fecha de nacimiento, país |
| `POST /genesis/documento` | MRZ del documento, ya leída en el teléfono |
| `POST /genesis/documento/leer` | La FOTO del documento, para la web: Genesis la lee y la descarta. Montar `parserRostro` también en esta ruta |
| `POST /genesis/biometria` | Foto de rostro |
| `POST /genesis/vincular` | Ata la cuenta de la app al GID |
| `POST /genesis/sso/token` | Token para entrar en otra app del ecosistema |
| `GET /genesis/tamiz/:direccion` | ¿Está sancionada esta dirección? |
| `POST /genesis/movimientos` | Movimientos para el monitoreo AML |

**No hay ninguna ruta que apruebe nada.** Aprobar exige sesión de operador en
el panel de Genesis ID, y el puente no la tiene ni puede tenerla.

Dos detalles que importan:

- **La cuenta la fija el servidor** a partir de la sesión, nunca el cuerpo de la
  petición. Si viniera del cliente, alguien podría atar su GID a la cuenta de
  otro.
- **De `/movimientos` nunca se le dice al usuario si saltó una alerta.** Que
  sepa que disparó una regla de monitoreo le enseña a esquivarla, y en muchas
  jurisdicciones avisarle está expresamente prohibido.

## Pruebas

Con Genesis ID corriendo en local:

```sh
cd genesis-id && npm start &          # queda en el 4000
# copie la clave de veta-wallet que imprime al arrancar

cd ../infra/genesis-proxy/pruebas
GENESIS_URL=http://127.0.0.1:4000 GENESIS_API_KEY=gid_test_... node puente.test.mjs
node mrz-cliente.test.mjs
```

`puente.test.mjs` levanta un backend de mentira con este router y recorre el
flujo entero: sin sesión no pasa, la identidad nace sin GID, un documento
manipulado se rechaza explicando qué dígito falla, y tras mandarlo todo **sigue
sin GID** porque falta la decisión humana. Comprueba además que no exista
ninguna ruta de aprobación y que la cuenta se tome de la sesión.

`mrz-cliente.test.mjs` prueba los ayudantes de MRZ del cliente móvil, que son
los que habilitan el botón de enviar.

Ambas pasan: 26 y 10 comprobaciones. Si el entorno trae credenciales de AWS,
quitalas antes (`unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY`): la prueba
espera «sin lector» y no debe tocar Rekognition.
