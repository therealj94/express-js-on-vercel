# Diagnóstico del ecosistema · 26 de agosto de 2026

Hecho el día después del reinicio de la 5550. Todo lo de aquí se midió; nada se
supone. Donde algo no se pudo comprobar, se dice.

---

## Resumen

**El ecosistema está sano.** La cadena, los siete nodos, los backends, el
relevo del chat y las webs responden todos correctamente. Salieron **tres
hallazgos** que no se veían y **una cosa que llevaba días deshaciéndose sola**.

| Área | Estado |
|---|---|
| Cadena 5550 | sana · 7 validadores · 10 s exactos |
| Los siete nodos | sanos · malla completa · memoria y disco de sobra |
| RPC públicos | los tres sirven la 5550 |
| Chainlist | correcto · sus dos RPC responden |
| Backend de la wallet | sano · **leyendo la cadena nueva** |
| Relevo PULSE2CHAT | vivo · **corre exactamente lo del repositorio** |
| Explorador Ordenscan | reindexado, sigue la punta |
| Webs públicas | todas responden |
| Seguridad | limpia · ningún secreto en el repositorio |
| Pruebas | 45 suites en verde, 1 en rojo por un bug real |

---

## Lo que estaba mal

### 1 · Un cron resucitaba la cadena vieja cada media hora

En node1, en el crontab de root:

```
0,30 * * * * /usr/bin/systemctl restart polygon-edge
```

La 8532 se dio por apagada el 20 de agosto. **Nunca lo estuvo**: esta línea la
levantaba cada treinta minutos. Es también lo que la encendió a las 23:30 en
plena ventana del corte del 25.

Quitada, con copia en `/root/crontab.antes-de-quitar-polygon-2026-08-26.bak`.
El servicio quedó parado y `disabled`. Sus datos siguen en disco (2,6 GB).

**La lección, que ya van tres veces:** parar un servicio no es apagarlo. Entre
`Restart=always`, un temporizador y un cron, en esta flota hay tres maneras
distintas de que algo vuelva solo, y las tres han mordido.

### 2 · Una prueba decía «verde» sin comprobar nada

`apps-web/probar-nucleo-toques.mjs` recorría las esferas del Núcleo con un
`forEach` y reportaba las que estaban tapadas. Cuando la lista quedó vacía
—porque el Núcleo de esferas pasó a ser el respaldo de AETHERION— el `forEach`
no recorría nada, no encontraba nada tapado, y el archivo imprimía «todas
libres» y salía en verde.

Es la peor forma de fallar: en silencio y con buena cara. Ahora la prueba fuerza
el respaldo (corta el bundle de Aetherion) y **falla si encuentra menos de seis
esferas**.

### 3 · Una prueba llevaba meses en rojo por un motivo equivocado

`orden-global-app/pruebas/probar-olvidar.cjs` fallaba 5 comprobaciones y yo lo
tenía anotado como «rojo preexistente» sin mirarlo. No lo era: el relevo
contesta `403 · hace falta que te acepte`, porque **las solicitudes de amistad
ya están implementadas** y la prueba mandaba mensajes sin pedir permiso. El
hilo arrancaba vacío y todo lo demás medía sobre nada.

Arreglada. Y de paso queda comprobado que **la tarea #31 está hecha**, no
pendiente: `puede_escribir()` exige amistad o historial previo, el bloqueo corta
en los dos sentidos, y las conversaciones que ya existían se conservan para no
cortarlas el día del despliegue.

---

## Dos bugs de verdad, encontrados al correr las pruebas

### A · El botón de AIR TOUCH tapa el «Mandar» del chat · ESCRITORIO · ARREGLADO

En 1280×860, el botón flotante de AIR TOUCH (`#at-boton`) queda encima del
botón de enviar de PULSE2CHAT (`.cha-manda`) e intercepta el toque. Un dedo o
un ratón en ese punto **abre AIR TOUCH en vez de mandar el mensaje**.

No es un aviso teórico: el navegador lo dice con nombre y apellido.

```
waiting for element to be visible, enabled and stable
  <path …> from <button id="at-boton" title="AIR TOUCH"> subtree intercepts pointer events
```

Se sigue pudiendo mandar con Enter, así que no deja a nadie sin chat — pero el
botón que la pantalla enseña no hace lo que dice.

**Arreglado.** Con el pie del chat en pantalla, la manito se aparta:

```css
body:has(.cha-pie) #at-boton{display:none!important}
```

Se ancla en `.cha-pie` y no en la vista entera a propósito: en la LISTA de
conversaciones no hay pie, no hay choque, y ahí AIR TOUCH sigue estando —
comprobado en billetera, chat, pay, identidad y ajustes. Apagarlo del todo
habría hecho pasar la prueba y roto la función.

`probar-chat` pasó de rojo a verde, y queda una prueba propia,
`veta-wallet/pruebas/probar-airtouch-chat.mjs`, que fija las dos mitades.

**Sobre esa prueba, que la primera versión no servía:** puse el pie sintético
pegado abajo y pasaba con el arreglo QUITADO — la manito vive 108px más arriba
y nunca llegaban a tocarse. Ahora el pie se ancla a la caja real de
`#at-boton`, y se comprobó que sabe ponerse roja: sin el arreglo dice «el
centro de Mandar es DE AIR TOUCH» en las tres pantallas.

### B · En el Núcleo de respaldo, tocar una esfera no entra · ARREGLADO

Reproducido limpio, sin un solo error de JavaScript:

```
movimiento normal   : nucleo -> nucleo     NO ENTRA
movimiento reducido : nucleo -> billetera  ENTRA
```

La animación de entrada se come la navegación. `entrarPorLaEsfera()` programa
`setTimeout(abrir, 420)` y las clases `cer-yendo`/`nu-yendo` **nunca llegan a
ponerse**, así que algo corta antes.

**Cuánto importa, dicho con honestidad:** el Núcleo de esferas **ya no es la
pantalla principal**. Desde que AETHERION monta la escena 3D del Inicio, esas
esferas sólo se pintan si el bundle no carga — y en producción carga
(`aetherion.js`, 321.822 bytes, HTTP 200). O sea que era un bug **en la red de
seguridad**, no en el camino que ve la gente. Pero es exactamente la red que
tiene que funcionar el día que el bundle falle.

**La causa, medida evento por evento:**

```
pointerdown -> esfera wallet
pointerup   -> CANVAS          ← la esfera se corrió bajo el dedo
click       -> cerebro         (ancestro común: el onclick nunca se entera)
```

Las esferas flotan sin parar; un toque son dos momentos separados por ochenta
o cien milisegundos. Si la esfera se mueve en ese rato, el navegador manda el
`click` al ancestro común de los dos targets, y el `onclick` del botón no lo
recibe. Con «reducir movimiento» las esferas se quedan quietas y todo
funcionaba — por eso se veía sólo a veces y sólo en algunas máquinas, que es
la peor forma de romperse: quien lo sufre parece que toca mal.

**Arreglado.** Se recuerda qué esfera recibió el APRETÓN y se abre esa al
soltar: la intención está en el apretón, y dónde termine el dedo es cosa de la
animación, no de la persona. Con dos cuidados — si se soltó encima de la misma
esfera no se hace nada (el `click` nativo llega solo y se entraría dos veces),
y se mira **cuánto se alejó el dedo como máximo** durante todo el gesto, no
dónde terminó, para que arrastrar la constelación y volver al punto de partida
siga sin abrir nada.

**Una cosa que corregí sobre la marcha:** la primera versión descartaba los
gestos de más de 600 ms, y eso dejaba fuera a quien toca despacio. Una
pulsación larga y quieta es un toque, no un jalón. El tiempo se quitó; la
distancia máxima hace el trabajo mejor y sin castigar a nadie por ir lento.

---

## Lo que está bien, comprobado

### La cadena

```
tres nombres de RPC     -> los tres, chainId 5550
altura                  -> subiendo
validadores             -> 7
proponentes en 70 bloques -> 7 distintos
cadencia                -> min 10 s, max 10 s, media 10,0 s
```

Cadencia sin **una sola** desviación en la muestra. Eso es QBFT sano.

### Los siete nodos

Los siete con `besu5550` activo, su vigía activo, **seis pares cada uno**
—malla completa—, altura sincronizada, y entre 3.000 y 3.070 MB de memoria
libre. El disco más lleno es node7 al 10 %.

### Producción corre lo que dice el repositorio

El relevo de mensajes expone la huella del código que está corriendo:

```
en produccion  : 14caada662
en el repositorio: 14caada662
```

Ese sello se puso justamente porque un arreglo del chat estuvo diez días en el
repositorio sin desplegar y no había forma de saberlo desde fuera. Hoy se
contesta con un GET.

### El backend sobrevivió al reinicio

`/salud` devuelve `{"ok":true,"mongo":true,"cadena":true,"bloque":214}` — está
leyendo la cadena NUEVA sin que hubiera que tocarle nada.

### Seguridad

| Comprobación | Resultado |
|---|---|
| Credenciales TURN de Cloudflare en el repositorio | **ninguna** |
| Archivos `.env` versionados | 4, y los cuatro son `.env.example` con valores vacíos |
| Claves con forma `AKIA` | 2, y las dos son las de ejemplo de la documentación de AWS, dentro de una prueba de detección de secretos |
| Buckets S3 públicos | 1 de 12, `ordenex-media`, y sólo `imagenes/*` en lectura: son logos de bancos y de tokens |

### Las pruebas

| Suite | Verde | Rojo |
|---|---|---|
| `orden-global-app` | 5 | 0 |
| `infra/mensajes` | 10 | 0 |
| `apps-web/veta-wallet` | 19 | 0 |
| `apps-web` (raíz) y las otras casas | 11 | 1 |
| **Total** | **45** | **1** |

El único rojo era `probar-nucleo-profundidad`, y estaba rojo **porque el bug B
era real**. Con el bug arreglado quedó en verde, y se le sumaron dos pruebas
nuevas: `probar-airtouch-chat` y `probar-esfera-toque`. De las dos se comprobó
que saben ponerse rojas sin su arreglo — una prueba que no sabe fallar no
comprueba nada.

---

## Costo

Del 1 al 25 de agosto: **418,71 USD**.

| Servicio | USD |
|---|---:|
| EC2 · cómputo | 323,31 |
| VPC (las IP elásticas) | 39,73 |
| EC2 · otros | 23,99 |
| Balanceador | 21,76 |
| Route 53 | 5,13 |
| Amplify | 2,82 |

Sigue abierto lo de siempre: las siete máquinas están sobradas para lo que
hacen —un validador gasta medio giga— y hay cinco IP elásticas reservadas sin
usar, que se cobran igual.

---

## Lo que queda

1. ~~Bug A · el botón de AIR TOUCH sobre el «Mandar» del chat.~~ **Hecho.**
2. ~~Bug B · entrar por la esfera con animación.~~ **Hecho.**
3. **La 8532** está parada de verdad por primera vez. Queda decidir cuándo se
   borran sus 2,6 GB y cuándo se retira la máquina, que cuesta al mes.
4. **La tarea #31 se puede cerrar**: las solicitudes de amistad están hechas.
