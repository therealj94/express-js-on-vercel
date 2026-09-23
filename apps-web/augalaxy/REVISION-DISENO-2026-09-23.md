# Galaxy OS · Crítica dura y mejoras de diseño (23-sep-2026)

La revisé como la ve la gente: la wallet real servida en local, con la galaxia montada en el Inicio, en teléfono (390×844) y en escritorio (1440×900). No me quedé en mirar: toqué los planetas con eventos de toque reales y medí **qué abre cada punto de la pantalla** con el mapa de toque. Evidencia en `revision-2026-09-23/`.

---

## 1 · El veredicto sin anestesia

**Parece una demo de sistema solar escolar, no el sistema operativo de una marca financiera.** Y lo peor no era lo visual: **tocar un planeta podía abrir otro.**

### Lo que estaba roto (funcional)

| # | Falla | Evidencia | Estado |
|---|-------|-----------|--------|
| F1 | **«No selecciona bien».** Cada nombre fijaba su posición una sola vez, como un desfase respecto a su planeta, y no la volvía a calcular. Con las órbitas girando, «PULSE2CHAT» quedaba encima del planeta de **Ordenex**. El nombre es un botón, así que tocar Ordenex abría el chat. «Ordenex» flotaba 90 px arriba de su planeta y «Settings» tapaba el planeta de Ajustes. | `01-seleccion-movil.jpg`, izquierda | ✅ **Corregido** |
| F2 | **Tope heredado.** En el teléfono los nombres no podían subir de 162 px, espacio reservado para una cabecera que dentro de la wallet no existe. Por eso «MINAS» y «Ordenex» quedaban aplastados arriba, lejos de sus planetas. | mismo | ✅ Corregido |
| F3 | **Dos idiomas a la vez.** La galaxia guardaba su propio idioma (el del navegador) y la wallet el suyo. Con la wallet en español se leía «Settings» y «Tap a world to enter». | captura del Inicio | ✅ Corregido: la casa manda el idioma y la galaxia lo sigue |
| F4 | La pista «Tap a world to enter» se encimaba con el saludo «Hola, José». | mismo | ✅ Movida arriba, en una sola línea |
| F5 | Los botones flotantes (AirTouch, AU-RA y pantalla completa) tapaban el final de las tarjetas y el botón «Actualizar», que se leía «Actualiza». | `02-billetera-movil.jpg` | ✅ Corregido en teléfono |
| F6 | **Dos pruebas de la wallet estaban rotas desde antes:** `aetherion-inicio.mjs` y `galaxia-entrada.mjs` fallan igual en el código sin tocar. Quedaron viejas cuando se cambió el motor de la galaxia; hoy no protegen nada. | salida de pruebas | ⚠️ Pendiente de reescribir |

### Lo que se veía mal (diseño)

| # | Crítica | Estado |
|---|---------|--------|
| D1 | **Foto de restaurante detrás de cada pantalla.** Caras, teléfonos y lámparas peleando con cada tarjeta. Se veía «plantilla de stock» y bajaba el contraste de todo. | ✅ Dentro de la app: fondo de marca oscuro con brillo de oro. La foto sigue solo en la portada. |
| D2 | **Nombres en cuatro estilos:** «MINAS», «Genesis ID», «PULSE2CHAT», «Ordenex». Sin sistema tipográfico. | ✅ Una sola voz: mayúsculas espaciadas y el núcleo en oro |
| D3 | **MINAS y DBNX se veían como mundos disponibles.** El Plan Maestro, regla 6, dice que no se anuncia como disponible lo que no está. | ✅ Llevan la marca «PRONTO» |
| D4 | **Escritorio:** el contenido quedaba pegado al menú, con 300 px de foto vacía a la derecha. | ✅ Centrado en el espacio útil (`03-billetera-escritorio.jpg`) |
| D5 | **Planetas de la NASA.** Dos Tierras (PULSE2CHAT y MyTokenPay), tres Lunas y Saturno para la billetera. Parece el sistema solar, no Orden Global: nada es oro y negro, nada dice «marca». | ✅ Segunda ronda: nueve mundos de la marca (sección 5) |
| D6 | **Los planetas no dicen nada.** Son iguales tengas 3 mensajes sin leer o ninguno, saldo o no. Es decoración, no un Inicio. | ✅ Segunda ronda: contadores y candados, nunca montos |
| D7 | **Genesis ID muestra dos tarjetas de identidad** con los mismos datos, una debajo de la otra. | ✅ Queda una sola credencial |
| D8 | **MyTokenPay y Remesas se ven apagados:** gris sobre gris, parecen deshabilitados aunque no lo estén. | ✅ No era diseño: la pantalla se redibujaba en bucle. Corregido |
| D9 | **El chat abre con otra marca:** splash azul de PULSE2CHAT sobre azul marino, que rompe el oro y negro de todo lo demás. | ↩️ Retirada: es su manual de marca |
| D10 | **AuCorp y Ordenex se abren en un marco vacío** (ícono de página rota). Desde aquí no se puede saber si es la red de este entorno o si esas webs prohíben abrirse dentro de otra. | ⚠️ Revisar en el dominio real |
| D11 | **El login ofrece «Entrar con mi frase semilla o llave privada»,** y el pie de la marca dice «Nunca te pedimos… doce palabras». Para alguien que llega, suena a contradicción. | ✅ Ahora dice «Ya tengo una billetera: importarla» |
| D12 | **Deuda de CSS:** `.world-label` está definido **seis veces**, cada capa pisando la anterior. Por eso cada arreglo rompía otra cosa. | ❌ Pendiente: una sola hoja limpia |

---

## 2 · La mejora grande que falta (propuesta)

Un **Inicio que sea de Orden Global y que diga algo.**

1. **Mundos de marca, no de la NASA.** Once mundos de la misma familia, oro, obsidiana y verde-veta, cada uno con su rasgo:
   - la billetera, un gigante con anillo de oro;
   - Genesis ID, un búnker con anillo fino;
   - ORDENSCAN, hielo con retícula;
   - MINAS, roca con veta.

   El motor anterior (`sky/Wells.tsx`, las «naturas») ya tenía ese diseño, y se perdió al montar la vista nueva con texturas de la NASA.
2. **Que cada planeta muestre su estado:**
   - un punto de oro si hay algo nuevo (mensajes, cobros);
   - el anillo de la billetera brilla más si llegó dinero;
   - Genesis ID con candado si falta verificarse.

   Hace falta decidir qué datos expone la casa a la galaxia (solo contadores, nunca montos).
3. **Ajustes fuera del cielo.** Ya está en la barra de abajo; como planeta sobra.
4. **Una sola hoja de estilos para la galaxia** en lugar de seis capas.

---

## 3 · Qué se cambió en el código

- **`src/experience/cosmos.ts`**
  - Los nombres se colocan en cada cuadro en uno de cuatro sitios **pegados a su planeta**: debajo, arriba, derecha o izquierda.
  - Se elige el sitio que no pisa otro nombre ni **otro planeta**. Cambiar de lado cuesta, y el movimiento se suaviza para que no bailen.
  - La zona de toque mínima sube a 60 px de diámetro.
  - Dentro de la wallet se usan los márgenes de la casa, no los de la vista suelta.
- **`src/experience/entry.tsx` + `veta-wallet/app.js`:** `AUGALAXY.idioma()`. La wallet avisa al cambiar de idioma, y la galaxia lo relee al entrar y al volver a la puerta.
- **`src/experience/Universe.tsx` + `experience.css`:**
  - la marca «PRONTO» en los mundos futuros;
  - una tipografía única para los nombres;
  - la pista, arriba y en una línea.
- **`veta-wallet/index.html`:**
  - fondo de marca dentro de la app;
  - AirTouch solo en el Inicio en el teléfono;
  - la fila del título deja libre la esquina de pantalla completa;
  - contenido centrado en escritorio.
- **`tests/experience.test.ts`:** la prueba vieja exigía que los nombres **nunca** se movieran, que era justamente el defecto. La nueva recorre 3.600 cuadros de órbita y comprueba que cada nombre queda pegado a su planeta y que **nunca tapa el centro de otro planeta**. 29 de 29 en verde.
- **Bundle reconstruido** y montado en `veta-wallet/augalaxy/assets/`, con la versión nueva en `AET_V` para que ningún navegador se quede con el viejo.

## 4 · Lo que NO se hizo, y por qué

- **Nada se publicó en producción.** Hay que seguir la regla «producción = repositorio»: correr `comparar-publicado.py` antes de subir.
- **No se probó con GPU real ni en un teléfono físico.** Este entorno dibuja por software.
- **Siguen pendientes D10** (marcos de AuCorp y Ordenex, que hay que revisar en el dominio real) **y D12** (las capas de CSS de `.world-label`).

---

## 5 · Segunda ronda: «10 de 10, funcionando e inmersivo»

José dio libertad de diseño. Esto es lo que se decidió y se hizo.

| Qué | Antes | Ahora |
|-----|-------|-------|
| **Mundos** | Texturas de la NASA: dos Tierras, tres Lunas, Saturno | **Nueve mundos de la marca**, pintados por un shader propio (`brandFragment`): billetera de oro con bandas, Genesis ID de obsidiana con retícula que late, PULSE2CHAT como océano de corrientes, MyTokenPay esmeralda con vetas de oro, ORDENSCAN de hielo con franja de lectura, Ordenex de hierro con brasa, AuCorp de bronce con anillos de bóveda, MINAS de roca con oro vivo y DBNX de acero con cuadrícula. Sus líneas brillan solas y se ven también en la cara de noche. |
| **Estados** | Los planetas no decían nada | La casa manda solo contadores y marcas, nunca montos (`AUGALAXY.estados`): mensajes sin leer junto a PULSE2CHAT, y un candado en los mismos mundos que la wallet cierra sin Genesis ID. El planeta con algo nuevo late. |
| **Ajustes** | Planeta y además pestaña | Solo pestaña: dentro de la wallet ya no es planeta |
| **Entrar a un mundo** | Salto seco de la galaxia a la pantalla | Vuelo con el color del destino, «ENTRANDO A · Veta Wallet» y barra de avance |
| **Tocar un nombre** | La descripción escondida agrandaba cada botón: tocar «PULSE2CHAT» abría Ordenex | Cada botón mide lo que se ve. Prueba nueva `pruebas/galaxia-toques.mjs`: cada nombre abre su mundo, en teléfono y escritorio |
| **MyTokenPay, Remesas, Tarjeta y Mi comercio** | Si su API no contestaba, la vista se redibujaba varias veces por segundo sin fin: la pantalla se quedaba apagada, a medio aparecer, y el servidor recibía una ráfaga | Un reintento como máximo cada 20 a 30 s. Revisadas **todas** las pantallas: ninguna queda en bucle. |
| **Genesis ID** | Dos tarjetas con los mismos datos | Una sola credencial cuando está verificada |
| **Login** | «Entrar con mi frase semilla o llave privada» | «Ya tengo una billetera: importarla», para que no choque con «nunca te pedimos doce palabras» |
| **Cielo** | Estrellas ruidosas compitiendo con los mundos | Más tenue dentro de la wallet |

**Retiro de la crítica D9:** el azul de PULSE2CHAT **no es un error**. Es su manual de marca («donde dice PULSE2CHAT, manda el azul») y se respeta.

**A revisar, sin tocar:** el lema del chat dice «Cada latido, cifrado de punta a punta», y en el código conviven dos notas que se contradicen: «NO hay cifrado de punta a punta» y «sigue siendo cifrado de punta a punta». Además, el plan maestro (H04) dice que degrada a texto claro sin aparatos. Antes de usar ese lema en campaña hay que confirmar qué es verdad hoy.

**Pruebas:**
- Motor: 29/29.
- `galaxia-toques.mjs`: en verde.
- `inicio-ida-y-vuelta.mjs`: en verde.
- `aetherion-inicio.mjs` y `galaxia-entrada.mjs` siguen fallando **igual que antes de estos cambios**: prueban el motor y el cielo 2D que se reemplazaron, y hay que reescribirlas para el motor actual.

---

## 6 · Tercera pasada: diseño, animación y sonido

La recorrí entera otra vez: portada, entrada, Inicio, tocar, vuelo, mundo y vuelta, en teléfono y en escritorio con «movimiento reducido». El sonido lo medí contando las voces que se crean en el audio del navegador. Evidencia: `06-auditoria-final.jpg`.

| # | Hallazgo | Arreglo |
|---|----------|---------|
| A1 | **La galaxia era muda dentro de la wallet.** Su motor de sonido existe (notas al elegir, ráfaga al viajar), pero dentro de la casa no había interruptor y nacía apagado: tocar un mundo no sonaba nada. | **Un solo interruptor para todo el sonido: el de la música.** Con la música puesta, tocar y viajar suenan bajo, sin zumbido de fondo, y la música se agacha para dejarlos oír. Con la música callada, la galaxia calla. Comprobado en las dos direcciones. |
| A2 | **«Movimiento reducido» mostraba otra casa:** el cerebro 2D, con otro diseño, «Ordenexchange», un planeta de Ajustes y una franja oscura entre el menú y el cielo en escritorio. | Todos ven la misma galaxia 3D. El motor ya respeta esa preferencia: órbitas quietas, sin intro y viaje de 120 ms. El cerebro queda solo para quien no tiene 3D, y ya no deja la franja. |
| A3 | **«DBNX · PRONTO» quedaba cortado debajo del botón de AirTouch.** | La casa marca sus botones flotantes (`data-ae-obstaculo`) y los nombres los esquivan como a un planeta. En 12 s de órbita, ningún nombre queda debajo de un botón, en teléfono ni en escritorio. |
| A4 | El candado de «falta verificarte» era un punto (●) que se confundía con «hay algo nuevo». | Es un candado de verdad. |
| A5 | **El nombre del destino no se leía en el vuelo:** «ENTRANDO A MyTokenPay» pasaba a media opacidad por encima del sol. | Lleva su propia sombra y aparece antes. |
| A6 | «Cancelar viaje»: una píldora suelta a media pantalla en un vuelo de un segundo. | Fuera, dentro de la wallet. |
| A7 | Los nombres aparecían de golpe al terminar la entrada. | Entran con un fundido. |
| A8 | En escritorio, señalar un nombre con el ratón no se notaba, y la pista decía «Toca» a quien usa ratón. | Se enciende en oro al señalarlo. La pista dice «Elige un mundo para entrar». |

**Descartado tras medir:**
- el «parpadeo» de nombres en la entrada: era una hoja de capturas desordenada, porque la secuencia real es intro y después nombres;
- el título cortado de la portada: es AU-RA escribiendo letra por letra.

**La prueba de toques** fallaba a veces en escritorio **también con el código anterior**: esperaba 3,2 s fijos, y dibujando por software el vuelo tarda más. Ahora espera al pedido. Pasa dos veces seguidas.

**Sin medir aquí:** la fluidez real, en cuadros por segundo. Este entorno dibuja sin tarjeta gráfica, a unos 6 cuadros por segundo, y ese número no dice nada del teléfono de nadie. Hay que medirlo en un aparato real.

---

## 7 · Entrar a una app, las letras y el giro con el ratón

José: «al entrar a una app es muy fea la experiencia, las letras, seleccionarlo y rotar con el mouse es muy duro, no hay rotación ordenada».

| Qué | Por qué se sentía mal | Ahora |
|-----|----------------------|-------|
| **Entrar a una app** | El viaje llegaba al planeta, **la cámara se volvía a alejar** medio segundo y recién ahí la wallet cortaba en seco a su pantalla: dos movimientos y un salto. | La cámara **se queda aparcada** en el planeta. En el último tercio del viaje un velo del color del mundo cubre la escena con «ENTRANDO A · GENESIS ID», y la wallet abre la app **detrás del mismo velo** (`#velo-llegada`), que se retira mientras la app sube. Menú, pestañas y encabezado no parpadean. `07-entrar-a-una-app.jpg` |
| **Girar con el ratón** | La cámara iba **en línea recta** de un punto del círculo a otro: cada giro rápido acercaba y alejaba el sistema, y se sentía como un tirón. Al soltar se frenaba en seco. La inclinación dejaba el sistema torcido para siempre. | La cámara se suaviza en giro, inclinación y distancia, así que la distancia no cambia al girar (hay prueba). **Inercia:** un gesto rápido sigue girando y se frena solo; soltar después de quedarse quieto no lanza nada. **Giro ordenado:** arrastrar gira como un plato, la inclinación va acotada con resistencia, y al soltar el sistema vuelve despacio a estar derecho. Volver al Inicio toma siempre el camino corto. |
| **Los nombres al girar** | Se recolocaban en cada cuadro y saltaban de lado mientras el sistema giraba. | Mientras gira, los nombres se apagan y no se pueden tocar. Vuelven con un fundido cuando el giro se asienta. `08-giro-con-raton.jpg` |
| **Las letras** | Los nombres y el destino iban en una letra genérica, distinta de «ORDEN GLOBAL» y del saludo. | **Cinzel**, la letra de la marca, con sombra para leerse sobre cualquier planeta. |
| **Nombres bajo el menú** | En escritorio el cielo pasa por debajo del menú lateral, y un nombre podía quedar escondido ahí: tocarlo abría «Chat». | El menú y las pestañas se marcan como obstáculos y los nombres los esquivan. |

**Pruebas:**
- Motor: 31/31. Hay dos pruebas nuevas: la inercia (sigue, se detiene y no lanza al soltar quieto) y la distancia constante al girar. Dos pruebas viejas fijaban el tope de inclinación (1,18) y la ganancia del giro; se actualizaron a los valores nuevos a propósito.
- `galaxia-toques.mjs`: en verde.
- `inicio-ida-y-vuelta.mjs`: en verde.
