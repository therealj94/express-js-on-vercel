# EL CEREBRO · cerebro.ordenscan.com

El núcleo de control de Orden Global: un cerebro de partículas donde **cada
región es un sistema real con sus datos en vivo**, y una voz que da el parte
del día. Nada de lo que se ve es decorado.

## Las doce regiones · el ecosistema entero

| Región | Qué es | De dónde salen sus datos |
|---|---|---|
| NÚCLEO 5534 | la cadena de pruebas | `/rpc` → el nodo local · bloque, gas, edad |
| GÉNESIS 5550 | la cadena nueva | `informe.json` · juez 0 diferencias |
| MEMORIA 8532 | la cadena vieja | `/rpc-vieja` · **compara la raíz de estado con la del cierre**: si se moviera, la región entra en alarma |
| VETA WALLET | el backend | `/salud-wallet` → Heroku |
| ORDENSCAN | el explorador | `/explorador/block/totalBlock` |
| CHAINLIST | los PR #8593/#8594 | api.github.com (desde el navegador) |
| GENESIS ID | KYC/SSO | `/salud-genesis` → Render |
| TESORO | precio y comisión | `informe.json` |
| MYTOKENPAY | API de cobros y punto de venta | ficha fija |
| TARJETA | Visa virtual · CryptoMate | ficha fija |
| POLYGON | la red de salida · USDT | ficha fija |
| INFRAESTRUCTURA | las 10 máquinas de AWS | ficha fija |

**Toca cualquier región** —en el cerebro o en la lista— y se abre su ficha:
qué es, sus datos en vivo, y qué hay dentro.

Cuando llega un bloque nuevo, la región del NÚCLEO **dispara**: los impulsos
que viajan por los axones son actividad real, no animación al azar. Una región
en falla se pone roja y dispara en alarma.

## La voz

Botón **INFORME**: la voz del propio dispositivo (Web Speech, no sale nada a
ningún servicio) lee el parte **en orden**: saludo, estado general, las
cadenas, los productos, el dinero, lo hecho hoy y lo que falta.

Para que suene a asistente y no a robot:

- **Se elige la voz más natural que tenga el aparato** — primero las neurales
  de Microsoft y las de Google, después Mónica y Paulina de Apple — y hay un
  **selector** para cambiarla. La elección se recuerda.
- **Cada frase va suelta, con una pausa detrás.** Leer un párrafo de corrido
  es lo que hace que suene a máquina.
- Tono natural: `rate 0.97`, `pitch 1.0`. La versión anterior iba a `pitch
  0.85` y sonaba cavernosa.
- **`limpiar()` quita lo que se leería mal**: símbolos, direcciones, hashes,
  siglas. Un ejemplo real que había que arreglar: `gwei` se leía **«güey»** —
  ahora dice «gigawei». Los separadores de miles se quitan, porque «15,400» se
  leería «quince coma cuatrocientos».

**TEXTO** enseña el mismo parte escrito.

## Dónde vive

- Servidor: el nodo RPC de la 5534 (`i-0aff688efc52ab8c8`), Caddy en
  `/etc/caddy/Caddyfile`, archivos en `/srv/cerebro/`.
- Todo lo que la página consulta entra por su propio dominio vía proxies de
  Caddy — así no hay CORS que configurar en ningún sistema.
- DNS: `cerebro.ordenscan.com` → 18.234.39.26 (Route53, zona ordenscan.com).

## Cómo se actualiza el parte del día

Editar `informe.json` (aquí en el repositorio) y subirlo:

1. `aws s3 cp informe.json s3://og-5550-arranque-548380372606/cerebro/`
2. En el servidor: bajarlo a `/srv/cerebro/informe.json` (por SSM con un
   enlace firmado, como hace el guion de despliegue).

Los datos vivos (bloques, gas, raíz de estado, PRs) se actualizan solos.

## La contraseña · puesta el 13-ago-2026

El tablero **ya no está abierto a internet**. Lo señaló el Cerrajero en su
primera auditoría, y tenía razón: `partes.json` publicaba a quien lo pidiera
los hallazgos de los siete agentes —cuentas sin segundo factor, qué puertos
escuchan, qué secretos son cortos—. Eso es un mapa de por dónde entrar.

- Usuario **`jose`**. La contraseña **no está escrita en este repositorio, ni
  en el servidor, ni en S3**: en el `Caddyfile` sólo vive su hash bcrypt. Se le
  entregó a José directamente. Si se pierde se genera otra; la que había no se
  puede recuperar.
- Cubre **todo el sitio**, proxies incluidos (`/salud-wallet`, `/rpc`,
  `/explorador/*`…): filtran lo mismo que la página.
- **`pruebas.ordenglobal-rpc.com` sigue sin contraseña, a propósito.** Es otro
  bloque del `Caddyfile` y es el RPC público que usa MetaMask, que no sabe
  mandar credenciales. Comprobado tras el cambio: contesta 200.

Comprobado desde fuera: `/`, `/informe.json`, `/partes.json` y `/salud-wallet`
dan **401 sin clave y 200 con ella**.

Copia del archivo anterior en `/etc/caddy/Caddyfile.antes-de-la-clave`. Para
quitarla: borrar el bloque `basic_auth` y `systemctl reload caddy`.

## FLUX · la reescritura del 13-ago-2026

El dibujo anterior eran regiones sueltas y por eso se veía desordenado: no
había nada que las hiciera leerse como **un solo órgano**. Ahora hay tres
capas, y las tres hacen falta:

- **la corteza** — 560 neuronas sobre una superficie de dos lóbulos con su
  fisura y sus surcos, cosidas a sus tres vecinas más cercanas. Sin este
  cosido la corteza es confeti; con él, es una piel.
- **los racimos** — cada sistema es un núcleo con sus neuronas alrededor. El
  número de neuronas dice cuánto hace ese sistema: no es decorativo.
- **los axones** — dependencias reales entre sistemas, no líneas bonitas.

### La firma: los impulsos

Cuando FLUX nombra un sistema, **sale un impulso de ese racimo** y viaja por
sus axones hasta el centro. Así se ve de qué está hablando sin leer nada. Un
bloque nuevo en la cadena también dispara uno, y en reposo hay tráfico tenue
cada 900 ms para que respire sin gritar.

### La voz

- **FLUX habla inglés británico**, más despacio y más grave que los demás
  (`rate .93`, `pitch .86`). Se busca Daniel, Arthur, Oliver, Ryan o cualquier
  voz `en-GB`, y se prefieren las neuronales.
- **Cada agente tiene voz propia**, tomada del resto de la lista, para que se
  sepa quién habla sin mirar. Cuando un agente habla, su fila del raíl se
  ilumina.
- **Español entero** detrás del selector: no es una traducción a medias, son
  dos guiones completos.
- `limpiar()` sigue arreglando lo que la voz leería mal: `gwei` («güey» en
  español, «gway» en inglés) pasa a *gigawei*, los separadores de millares se
  quitan, y las direcciones largas se leen «una dirección».

### Hablarle

El botón **SPEAK** escucha una orden. Preguntar es libre —estado, cadenas,
dinero, seguridad, coste, equipo, Chainlist, bots, qué falta—; **actuar no**.

## El canal de órdenes · lo que puede y lo que no

`ordenes.py` escucha **sólo en 127.0.0.1** y sale a internet por Caddy, dentro
del sitio del cerebro, así que **hereda su contraseña**. Su lista es cerrada y
está escrita como constantes:

| | |
|---|---|
| `GET /ordenes/bots` | leer la última carrera de los bots |
| `POST /ordenes/bots/ahora` | lanzar una carrera de los bots |

Y nada más. **No hay ninguna ruta que acepte un nombre de comando, un
argumento ni una ruta de archivo**, no se construye ningún comando con texto
de fuera, y no se usa el shell. Cualquier otra ruta devuelve 404 —comprobado.

Desde aquí **no se despliega, no se mueven fondos, no se reinicia un nodo y no
se cambia configuración**. Una consola remota sobre producción colgada de una
página web sería el peor agujero del sistema, y el primero que marcaría el
Cerrajero. Lo único que se dispara es una prueba en la red de **pruebas**, que
ya corre sola cada tres horas: adelantarla no provoca nada que no fuera a
pasar igualmente.

Si algún día hace falta otra acción, se añade **una constante más, a mano**
—nunca un parámetro.

## Conversar de verdad · Claude detrás del cerebro

El cerebro de reglas conoce el sistema y contesta bien, pero no improvisa. Con
una llave de Anthropic puesta, la pregunta va a **Claude** con el estado que la
página ya tiene en pantalla, y contesta él.

- **La llave vive sólo en el nodo**, en `/etc/cerebro/anthropic.key`, de root y
  sólo de root. **No está en este repositorio, ni en S3, ni llega nunca al
  navegador.** La página pregunta a `ordenes.py` y es él quien habla con
  Anthropic.
- El modelo es **`claude-sonnet-5`**, fijo. `/hablar` **no deja elegir modelo,
  ni carácter, ni parámetros**: sólo acepta una pregunta, el idioma y el estado.
  El resto lo pone el servidor, así que desde el navegador no se le puede sacar
  de su papel.
- **Si no hay llave, no hay saldo o falla la red, se cae al cerebro de reglas
  sin avisar.** Peor que una respuesta menos rica es no tener respuesta. Y si
  el fallo es de llave o de saldo, no se reintenta en toda la sesión: no tiene
  sentido esperar cuarenta segundos en cada pregunta.
- Las **órdenes nunca pasan por el modelo**. Se resuelven antes, en local, y
  siguen siendo la misma lista cerrada de dos acciones.
- Se guarda el hilo de los últimos seis turnos, así que las preguntas de
  seguimiento tienen sentido.

El carácter de FLUX está en `ordenes.py` y es explícito en tres cosas: que le
van a **escuchar** y no leer, que **no se invente ni un número** —hay dinero
real dentro—, y que la 8532 está congelada y arrancar la 5550 es el corte.

### Poner la llave

```
mkdir -p /etc/cerebro && chmod 700 /etc/cerebro
umask 077; printf '%s' 'LA-LLAVE' > /etc/cerebro/anthropic.key
systemctl restart cerebro-ordenes
```

Comprobarlo: `curl -sS -X POST http://127.0.0.1:8790/hablar -H 'content-type:
application/json' -d '{"pregunta":"hola","idioma":"es","estado":{}}'`

## La Junta dentro · 13-ago-2026, segunda tanda

- **Cuatro usuarios**: `jose`, `leonardo`, `melany`, `medardo`, cada uno con su
  contraseña (entregadas en mano, no escritas aquí). Caddy pasa el usuario
  autenticado en `X-Usuario` y **FLUX saluda por el nombre de quien entró**.
- **El idioma se elige la primera vez** en una puerta de entrada, y se mantiene
  fiel en todo: voz, respuestas y pantalla. Elegirlo es además el primer toque,
  así que desbloquea el audio y FLUX se presenta.
- **El saber**: el cerebro de reglas conoce el ecosistema entero —qué es Orden
  Global, las aplicaciones, las webs, las máquinas, los tokens y el flujo del
  dinero— y se le puede pedir «explícame X». El mismo saber viaja al modelo
  cuando hay crédito: enseñarle a uno es enseñarles a los dos.
- **La voz obedece**: «más despacio», «más rápido» (se recuerda), «pausa»,
  «continúa», «repite». La base bajó a 0,85 porque leía rápido.
- **Si no sabe algo, lo dice** y pide que se le enseñe en la próxima
  actualización del parte — no finge un error.
- El botón **?** abre las instrucciones completas, y una línea de pistas rota
  cada seis segundos con cosas que se le pueden decir.
- La fecha del parte del día sale bajo el reloj: es la última actualización.

## Tocar y que pregunte · 14-ago-2026

Tocas **cualquier cosa del ecosistema** —un sistema del dock, una etiqueta del
cerebro, un agente— y pasan dos cosas a la vez: se abre su ficha con los datos,
y **FLUX pregunta en voz alta si quieres el reporte**.

> *¿Quieres que te dé el reporte de VETA WALLET?*

Contestas con la voz —«sí», «dale», «cuéntame», «no», «ahora no»— o con los dos
botones que aparecen bajo el subtítulo. Un «sí» dispara el reporte hablado
completo: estado, todos los datos vivos y lo que hay dentro.

Tres detalles que importan:

- **El «sí» solo cuenta si hay una pregunta en el aire.** Fuera de contexto un
  «sí» suelto no significa nada, así que la oferta queda *armada* hasta que
  contestas. Si en vez de contestar preguntas otra cosa, la oferta se cae sola
  y se atiende lo nuevo.
- **La oferta vale igual para los agentes**: tocas al Cerrajero y te ofrece su
  parte entero, con sus mediciones y lo que necesita de ti.
- Mientras habla, **las tarjetas se materializan** y el racimo correspondiente
  se enciende en el cerebro. Ves de qué habla sin leer.

Probado con `pruebas/probar-ofrecer.js`: ofrece al tocar, el sí reporta, el no
lo deja, un sí sin contexto no rompe nada, y cambiar de tema cancela la oferta.

## La presentación para inversionistas · 14-ago-2026

El cerebro es un cuarto de control, y un cuarto de control **es lo contrario de
un pitch**: lo primero que enseña son las fallas. Por eso esto no es otra
aplicación, es **un modo**. Mismo cerebro, mismos datos vivos, otra narrativa.

### El recorrido · botón RECORRIDO

Unos seis minutos. La voz narra, **la cámara vuela sola** al racimo que se está
nombrando, las tarjetas se materializan y los contadores suben. Todo con datos
vivos: el bloque que dice es el bloque que hay.

Termina en la demostración en vivo, que es lo que gana la reunión.

### La transacción en vivo · botón EN VIVO

Una transacción **de verdad**, firmada y confirmada delante de quien mira, con
el identificador en pantalla **para que lo abra en el explorador desde su
propio teléfono**. Es la misma que los bots hacen solos cada tres horas:
adelantarla no provoca nada nuevo. Y va en la red de **pruebas**, nunca en la
cadena congelada.

Nadie puede fingir eso. Un inversionista que verifica un hash en su móvil deja
de escuchar promesas.

### El viaje del dólar · ajustes → EL DÓLAR

El modelo de negocio en veinte segundos: un impulso recorre tarjeta, pasarela
de Polygon, tesoro, billetera y comercio, **por los axones de verdad**.

### El enlace de invitado · ajustes → CREAR ENLACE

No se le pide una contraseña a un inversionista. Se crea un enlace que **caduca
en veinticuatro horas**:

```
https://cerebro.ordenscan.com/demo?t=<vale>
```

**Cómo está protegido, que es lo que importa:**

- Caddy saca de la contraseña **sólo dos rutas**: `/demo` y `/ordenes/demo/*`.
  Todo lo demás sigue pidiendo clave.
- Quien protege esas dos rutas es **el propio servicio**, comprobando un vale
  con caducidad. No Caddy.
- Lo que devuelve `/ordenes/demo/datos` está **escrito a mano, campo por
  campo**. Es una lista blanca, no un filtro: si mañana el informe interno gana
  un campo, no se escapa solo.
- Comprobado contra el servidor: con un vale válido, `/partes.json` y
  `/ordenes/bots` siguen devolviendo **401**. Lo interno no sale por ahí.
- Y la página del invitado **ni siquiera pide** lo interno, para no dejar
  peticiones fallidas por el camino.

### Modo sala · ajustes → SALA

Tipografía grande para una tele o un proyector: se lee a tres metros.

### Lo que NO se hace, y es deliberado

**No se esconden los problemas, se separan.** Un inversionista serio hace
diligencia, y descubrir que se le ocultó algo mata el trato más rápido que el
problema. El modo interno —con las fallas, los pendientes, los costes y la
seguridad— se abre a propósito cuando llegue esa fase. Enseñar que hay siete
agentes automáticos encontrando los propios fallos **es un argumento de venta**.

### Antes de enseñarlo

**Resuelve el respaldo en oro.** Un billón de ORIGEN entre cincuenta y cinco
son 18.182 toneladas: más del doble de la reserva de Estados Unidos. Cualquier
inversionista con criterio hace esa multiplicación, probablemente delante de
ti. Si no hay una respuesta exacta y sostenible, la demostración en vivo no
salva la reunión. Está en `PROMPT-LEGAL-MINERIA.md`, la primera pregunta.

## El acceso, y el invitado sin contraseña · 14-ago

### El fallo que hubo que arreglar

Un invitado abría su enlace y **a los diez segundos el navegador le pedía
usuario y contraseña**. La causa no estaba en el enlace: los temporizadores del
modo interno seguían corriendo y pedían `/rpc` cada diez segundos. Esa ruta
devuelve **401 con cabecera `WWW-Authenticate`**, y ante eso el navegador saca
su ventana de acceso él solo, sin que la página pueda evitarlo.

Ahora el invitado tiene **sus propios temporizadores**, que sólo piden lo suyo.
Comprobado con un servidor simulado que responde exactamente igual que el de
verdad: **cero peticiones internas en veintiséis segundos**, en los dos modos.

### La pantalla de acceso

Antes, quien llegaba sin contraseña veía la página en blanco del navegador.
Ahora hay una pantalla propia —`401.html`, servida por Caddy en los errores 401—
que dice dónde está y ofrece dos caminos: **ENTRAR** y **VER LA PRESENTACIÓN**.

### Dos niveles de invitado

| | ve la presentación | transacción en vivo |
|---|---|---|
| `/demo` — **sin vale, público** | sí | **no** |
| `/demo?t=<vale>` — con vale, 24 h | sí | sí |

La presentación es pública a propósito: dice en voz alta lo mismo que diría
cualquier lámina de una reunión, y así el enlace se puede mandar sin miedo.

**La transacción en vivo sí pide vale**, y no por secreto: **gasta ORIGEN de
los bots**. Sin vale, cualquiera que encontrara la dirección podría secarlos.

Sin vale, el recorrido no termina en la demostración: cierra con palabras.
