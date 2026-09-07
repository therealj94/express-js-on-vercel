# ORDENEX P2P · el diseño, y por qué así

El mercado entre personas: quien tiene ORIGEN lo vende por lempiras, quetzales,
pesos o dólares a quien los tiene, y al revés. **La casa no toca el dinero de
nadie**: custodia el ORIGEN en garantía mientras las dos partes hacen la
transferencia por su cuenta, y arbitra si se pelean.

Este documento es **el contrato**, igual que `DISENO.md`. Lo que no se pueda
cumplir se cambia AQUÍ primero y luego en el código.

---

## 1. Qué hay hoy y qué le falta

El circuito fiat de `DISENO.md` §«agentes» ya es medio P2P, y lo que ya está
hecho no se tira: el ledger con reserva, `transitar()` con guarda atómica, la
historia de cada cambio de estado, el tope por diligencia, el reporte AML y la
disputa resuelta por admin. Todo eso se hereda tal cual.

Lo que **no** existe, comprobado en el código:

| pieza | hoy | qué pasa sin ella |
|---|---|---|
| anuncios | no hay | el usuario no elige precio ni contraparte: la casa le asigna un agente |
| alta propia de comerciante | solo por admin | nadie puede ponerse a vender; el mercado no crece solo |
| **cronómetro** | **no hay ni uno** | una solicitud abierta se queda abierta para siempre y el ORIGEN del otro, congelado |
| congelar el reloj al pagar | no aplica | — |
| conversación con comprobantes | no hay | la disputa se arbitra sin pruebas |
| calificaciones | no hay | no hay forma de distinguir a quien cumple |
| fianza del comerciante | no hay | una estafa no le cuesta nada al que la hace |
| monedas LATAM | solo HNL y USD | fuera de Honduras no se puede operar |
| castigo por cancelar | no hay | se puede bloquear el ORIGEN ajeno gratis, todo el día |
| métodos de pago propios | banco a mano en el agente | no hay dónde poner una billetera ni un tercer banco |

`grep -n "Date.now\|setTimeout\|vence\|caduc\|expira" controllers/fiatController.js`
no devuelve **nada**. El cronómetro es la pieza que falta más grande y la que
José nombró primero.

---

## 2. Las cinco reglas que mandan aquí

1. **La casa nunca toca fiat.** Ni una cuenta bancaria de la casa en el
   circuito. Lo que se custodia es ORIGEN, en el ledger, y nada más. Sin esto,
   Ordenex sería otra cosa y esa otra cosa necesita permisos que esta casa **no
   tiene** (`cabecera-de-la-casa.md`, regla 3).
2. **Nunca se libera solo.** No existe, en ninguna rama del código, un camino
   por el que el ORIGEN salga de la garantía sin que una persona lo suelte o un
   árbitro lo resuelva. Ver §7 — es la decisión más importante del documento.
3. **El reloj vive en el servidor.** Un contador en la pantalla es un adorno.
   La verdad es una fecha guardada, y se evalúa también al leer, no solo cuando
   pasa el barredor.
4. **Los datos de banco se revelan tarde y a uno solo.** Nunca en la lista de
   anuncios; solo a la contraparte de una orden **con la garantía ya bloqueada**.
   Y cifrados en la base.
5. **Fail-closed con el dinero.** Precio que no se pudo calcular = anuncio
   suspendido, no anuncio con el precio de ayer. Saldo que no se pudo leer =
   orden que no entra.

---

## 3. El vocabulario (y por qué no «comprador» y «vendedor»)

Hay dos direcciones y cuatro papeles, y llamarlos «comprador/vendedor» los
cruza: el que compra ORIGEN vende lempiras. El código ya evita esa trampa con
`pagadorFiat()` / `receptorFiat()`. Se formaliza:

- **PAGADOR** — el que manda el dinero por el banco.
- **ENTREGADOR** — el que pone el ORIGEN. **Su ORIGEN es el que está en
  garantía, siempre, en las dos direcciones.**
- **COMERCIANTE** — el que publicó el anuncio.
- **TOMADOR** — el que lo tomó.

Comerciante y tomador son perpendiculares a pagador y entregador: en un anuncio
`vendo`, el comerciante es el entregador; en uno `compro`, es el pagador.

---

## 4. El recorrido completo, pantalla por pantalla

### 4.1 Abre P2P

Dos pestañas —**COMPRAR ORIGEN** / **VENDER ORIGEN**— y cuatro filtros: moneda,
monto, método de pago, y un interruptor de «solo comerciantes verificados».
La moneda se propone por el país del perfil de Genesis, y se puede cambiar.

Sin sesión se ve todo: la lista es pública. La sesión se pide al tomar.

### 4.2 La lista de anuncios

Cada fila, exactamente como la lee alguien que nunca ha hecho esto:

```
ALIAS DEL COMERCIANTE          24,85 HNL        Comprar
✓ verificado · 312 órdenes     por ORIGEN
98,7 % completadas             Disponible 45.200 ORIGEN
libera en ~4 min               Límite 500 – 25.000 HNL
                               🏦 Banco Atlántida · BAC
```

Orden por defecto: mejor precio primero. Empates, por tasa de completadas.
**Un anuncio que no se puede pagar con ningún método que el usuario tenga
guardado se enseña igual, en gris** — esconderlo haría creer que no hay
mercado.

### 4.3 Tomar el anuncio

Se escribe el monto **en fiat o en ORIGEN**, y el otro se calcula solo. Se
enseñan, antes del botón:

- lo que da y lo que recibe, con el precio **congelado en ese instante**;
- los términos que escribió el comerciante, tal cual;
- el método de pago que va a usar (elegido de los del anuncio);
- el tiempo que va a tener para pagar;
- la comisión, si la hay;
- la referencia del oro al lado, rotulada — nunca como precio de la casa.

### 4.4 La orden nace: se bloquea la garantía y arranca el reloj

En **una sola operación atómica**, y en este orden:

1. Se valida contra el anuncio: monto entre el mínimo y el máximo, cantidad
   restante suficiente, condiciones de la contraparte cumplidas, tope por
   diligencia del §«tope» no pasado, ninguna de las dos puntas bloqueada.
2. `reservar(entregadorId, 'ORIGEN', cantidad, ref)` — **si esto falla, no hay
   orden.** El ledger es el que manda.
3. Se descuenta de `cantidadRestante` del anuncio.
4. Se escribe la orden con `estado: 'creada'` y
   **`venceEn = ahora + anuncio.minutosParaPagar`**.
5. Recién ahí se le revelan al PAGADOR los datos de banco del ENTREGADOR.

Si el paso 2 pasa y el 4 falla, el barredor libera la reserva huérfana: la
reserva lleva la `ref` de la orden y una reserva sin orden es, por definición,
para atrás.

### 4.5 La pantalla de pago — el cronómetro

```
┌─────────────────────────────────────────┐
│  Orden ONX-P2P-000412        ⏱ 14:32    │
│                                         │
│  Transferí 24.850,00 HNL a:             │
│                                         │
│  Banco Atlántida                        │
│  Cuenta   012-345-678901        [copiar]│
│  Titular  MARIA JOSE FLORES     [copiar]│
│  Monto    24.850,00             [copiar]│
│                                         │
│  ⚠ La cuenta desde la que pagás tiene   │
│    que estar a TU nombre. Un pago de un │
│    tercero no se puede liberar.         │
│  ⚠ No escribás «ORIGEN», «cripto» ni    │
│    «Ordenex» en el concepto.            │
│                                         │
│  [ YA TRANSFERÍ ]        [ cancelar ]   │
└─────────────────────────────────────────┘
```

El cronómetro de la pantalla se dibuja restando de `venceEn` que vino del
servidor, y **se vuelve a pedir cada 15 s**: si el teléfono tiene la hora mal,
manda el servidor.

Los dos avisos no son adorno. Son los dos fraudes de manual: pagar desde una
cuenta ajena (cuenta robada), y que el banco congele la cuenta del comerciante
por la palabra en el concepto.

### 4.6 «YA TRANSFERÍ» — aquí se congela el tiempo

Esto es lo que José pidió por nombre. Al marcar pagado:

```
venceEn      → null          el reloj se PARA. No hay más vencimiento.
congeladoEn  → ahora
apelableEn   → ahora + ORDENEX_P2P_APELACION_MIN   (por defecto 10 min)
estado       → 'pagada'
```

Desde aquí:
- **la orden ya no vence nunca** — no se puede perder el dinero por que se
  acabe un tiempo después de haber pagado;
- **el pagador ya no puede cancelar.** Solo apelar. Si pudiera cancelar después
  de pagar, cancelaría siempre que el precio se moviera a su favor;
- el entregador recibe el aviso y ve el botón de liberar.

Se le pide al pagador el **número de referencia** de la transferencia. No es
obligatorio para congelar —obligarlo sería dejar a alguien que ya pagó sin
poder decirlo—, pero sin él la apelación la tiene cuesta arriba, y así se le
dice en la pantalla.

### 4.7 Liberar

El entregador mira su banco, ve el dinero, y suelta:

```
ejecutarReserva(entregador, 'ORIGEN', cantidad, pagador, ref)
comisión → cuenta interna `casa`   (ORDENEX_P2P_COMISION_PPM, 0 si no está)
estado → 'liberada'    →  AML  →  calificación de los dos
```

**No hay ningún camino automático hasta aquí.** Ver §7.

### 4.8 Si se acaba el tiempo antes de pagar

El barredor —cada 20 s— y también cualquier lectura de la orden:

```
estado 'creada' y venceEn < ahora  →  'vencida'
liberar(entregador, 'ORIGEN', cantidad, ref)     la garantía vuelve
cantidadRestante del anuncio     +=  cantidad
falta al PAGADOR
```

**Tres faltas en 24 h ⇒ 24 h sin poder tomar anuncios.** Sin esto, cualquiera
bloquea el inventario de todos los comerciantes gratis y todo el día, y el
mercado se muere sin que nadie robe un centavo.

### 4.9 Apelar

Desde `apelableEn`, cualquiera de los dos. La orden pasa a `apelada`, la
garantía **se queda quieta**, y se abre el expediente: motivo, y las pruebas que
suba cada uno a la conversación de la orden. Un árbitro (`X-Admin-Key`) resuelve
a una de las dos puntas, con motivo escrito, y eso mueve la garantía:

- a favor del pagador → `ejecutarReserva` hacia él (recibió lo que pagó);
- a favor del entregador → `liberar` (la garantía vuelve a ser suya).

Todo queda en `historia` con quién, cuándo y por qué. **La casa arbitra el
ORIGEN, nunca el dinero del banco**: no puede devolver una transferencia y así
se lo dice a las dos partes desde el primer día.

---

## 5. La máquina de estados, entera

```
                     ┌──────────── cancelada ◄── el pagador, solo antes de pagar
                     │
   creada ───────────┼──────────── vencida  ◄── el reloj (falta al pagador)
   ⏱ corriendo       │
   garantía puesta   │
                     ▼
                  pagada  ⏱ CONGELADO — ya no vence, ya no se cancela
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
      liberada            apelada ──► resuelta-pagador
      (terminal)                 └──► resuelta-entregador
```

| de → a | quién | condición |
|---|---|---|
| creada → pagada | pagador | — · **congela el reloj** |
| creada → cancelada | pagador | solo antes de pagada · falta |
| creada → vencida | el sistema | `venceEn < ahora` · falta al pagador |
| pagada → liberada | entregador | — |
| pagada → apelada | los dos | `ahora ≥ apelableEn` |
| apelada → resuelta-* | árbitro | con motivo escrito |

**El entregador no puede cancelar nunca** una vez creada la orden. Si pudiera,
cancelaría cada vez que el precio se moviera en su contra, y un mercado donde el
que vende se echa atrás no es un mercado.

Toda transición usa `transitar(id, de, a, quien)` — el `findOneAndUpdate` con
`{_id, estado: de}` que ya existe. Es lo que hace imposible que dos toques del
mismo botón liberen dos veces.

---

## 6. El precio

**v1: solo precio fijo.** El comerciante escribe cuántos lempiras por ORIGEN y
ése es el precio hasta que lo cambie.

El precio flotante —«oro − 2 %»— **queda fuera de v1 a propósito**, y esto es una
decisión, no un olvido. Para flotar hace falta un índice ORIGEN↔lempira, y ese
índice hoy sería: referencia del oro (USD/onza, de un feed) × una tasa
USD→HNL que en esta casa es **de referencia y sin ejecución real**
(`aucorp-api/LEEME.md`). Una referencia de una referencia, moviendo el precio de
gente de verdad. Eso choca de frente con la regla 2 de la casa. Cuando haya
tratos P2P de verdad durante un tiempo, el índice sale de ellos y entonces sí.

Mientras tanto la referencia del oro se enseña **al lado**, rotulada, con su
hora y su fuente, y si el feed no llega se enseña un guion. Nunca como precio.

El precio de una orden **se congela al crearla**. Los 15 minutos de riesgo de
movimiento los asume el comerciante: es el oficio.

---

## 7. Por qué NUNCA se libera solo

Es la pregunta que va a volver («¿y si el vendedor no aparece?»), así que queda
escrita: **si existiera un “si nadie hace nada en X minutos, se libera”, el
fraude es de una línea**: tomo la orden, marco pagado sin pagar, espero, me
llevo el ORIGEN. Nadie roba una casa que no tiene puerta; ésta simplemente no
tendría.

Lo que pasa si el entregador desaparece es lo correcto: el pagador apela y un
árbitro resuelve, con las pruebas a la vista. Es más lento y es el único diseño
en el que el que pagó de verdad siempre puede cobrar.

Corolario operativo: **el arbitraje es una persona**, y de eso depende que el
producto sirva. Ver §11.

---

## 8. Comerciantes, fianza y límites

### Darse de alta

Requisitos, todos verificables antes de publicar nada:

1. `perfil.verificada === true` en Genesis;
2. términos del P2P aceptados en su versión vigente;
3. al menos un método de pago guardado;
4. **fianza** en ORIGEN, bloqueada en el ledger.

La fianza es lo que hace que estafar cueste. Se libera al cerrar el
comercio, y **no antes de 30 días desde la última orden** — que es la ventana en
la que aparece un reclamo.

### Los tres escalones

| escalón | fianza | tope por orden | anuncios abiertos |
|---|---|---|---|
| tomador (cualquiera verificado) | — | el de su diligencia | no publica |
| comerciante | `ORDENEX_P2P_FIANZA_MIN` | el de su diligencia | 5 |
| comerciante de confianza | 10× | el de su diligencia | 20 |

El escalón se sube **a mano**, con acta, mirando 30 días de historial. Nada de
subir solo por volumen: el volumen se compra.

El tope por diligencia (`topeUsdDe`, hoy 1.000 USD sin dato) sigue mandando por
encima de todo, y sigue siendo conservador por la misma razón de siempre.

---

## 9. Los datos de banco

```
metodosDePago: {
  comercianteId, moneda, tipo: 'banco',
  banco, titular,
  cuentaCifrada,        // AES-256 con ORDENEX_ADM, como llaveDepositoCifrada
  activo
}
```

- **Cifrada en la base.** Un volcado de Mongo no puede ser la lista de cuentas
  bancarias de todos los comerciantes del país. Se descifra en el servidor, en
  la única respuesta que la revela.
- **Nunca en `GET /p2p/anuncios`.** Ahí solo va el nombre del banco.
- Se revela **solo** al PAGADOR de una orden **con la garantía puesta**, y solo
  la del método elegido.
- El `titular` se compara contra el nombre verificado del comerciante en
  Genesis. Si no calzan, el método no se activa: una cuenta a nombre de otro es
  la forma en que se lava dinero ajeno.
- **v1 solo bancos.** Nada de rieles que se pueden reversar después de liberar
  (algunos monederos y pagos móviles lo permiten): ahí el comerciante suelta el
  ORIGEN y le sacan el dinero de vuelta. Cada riel nuevo entra por lista blanca
  y por acuerdo, no porque alguien lo escriba en un campo de texto.

---

## 10. Las monedas

`HNL` Honduras · `GTQ` Guatemala · `NIO` Nicaragua · `CRC` Costa Rica ·
`MXN` México · `COP` Colombia · `PEN` Perú · `CLP` Chile · `DOP` R. Dominicana ·
`USD` (El Salvador, Panamá, Ecuador y quien quiera).

Todas en **centavos, como string entero**, operadas con BigInt — el mismo
criterio que ya usa `montoFiatValido()`. **El CLP no tiene centavos**: se guarda
igual en centavos (×100) para que un solo camino sirva para todas, y se pinta
sin decimales. Escribir dos aritméticas es escribir dos bugs.

El tope se mide en dólares, y para eso hace falta pasar cada moneda a USD. Se
hace con la misma honestidad que ya está en `HNL_POR_USD = 20n`: **una tabla de
divisores conservadores, a propósito por debajo del cambio real**, para que el
tope muerda antes y nunca de menos. Es un tope, no una cotización.

---

## 11. La crítica — lo que está flojo y hay que decirlo

Esto es lo que pediste revisar. Lo pongo entero, sin suavizar.

**1. El árbitro decide mirando capturas de pantalla, y una captura se falsifica
en dos minutos.** No tiene arreglo técnico: la casa no ve el banco de nadie. Lo
que se puede hacer es encarecer la mentira —nombre del titular igual al nombre
verificado, número de referencia, fianza que se pierde, historial— y **empezar
con topes bajos**. Binance vive con este mismo problema; lo tapa con volumen,
puntaje de riesgo y un equipo de soporte grande. Orden Global no tiene ninguna
de las tres el día uno.

**2. El arbitraje es una persona, y hoy es una sola.** Las disputas crecen con
el volumen. Sin alguien de guardia, una orden apelada un viernes se queda
congelada hasta el lunes con el ORIGEN de alguien adentro, y eso se cuenta
solo. **Antes de abrir hace falta: un turno con nombre, un compromiso de tiempo
escrito en los términos, y una cola visible.** Si no hay quién, no se abre —
esto es lo que hunde el producto, no el código.

**3. El mercado vacío mata.** Un P2P que abre con cero anuncios se ve muerto y
nadie vuelve. Los agentes que ya existen tienen que estar publicando **antes**
de que la pantalla sea visible, con precio y con inventario.

**4. La casa cobra comisión de un mercado que organiza.** No toca el fiat —eso
está bien resuelto— pero sí pone la plaza, las reglas y el árbitro, y cobra.
Eso es una conversación de Junta antes de abrir, no después. Y en las pantallas
no se nombra ningún organismo ni ninguna ley, ni para decir que no aplica
(regla 3 de la cabecera).

**5. Los comerciantes operan por su cuenta y tienen que saberlo.** Quien
publica un anuncio está cambiando su propio dinero con desconocidos. Los
términos lo dicen con esas palabras, y no con letra chica.

**6. Los bancos congelan cuentas por esto.** En la región, una cuenta con
transferencias frecuentes y la palabra «cripto» en los conceptos termina
bloqueada. El aviso de la §4.5 es de las cosas más útiles del producto entero.

**7. Cosecha de datos bancarios.** Si tomar una orden revela una cuenta, alguien
puede tomar y cancelar en serie para armar una lista de cuentas. Lo frenan:
las faltas por cancelar, un límite de órdenes abiertas a la vez (**3**), y que
la garantía tenga que quedar puesta antes de revelar nada.

**8. Se juntan dos relojes en la misma pantalla y se confunden.** El del pago y
el de la apelación. En la pantalla hay **uno solo a la vez**, grande, con lo que
pasa cuando llegue a cero escrito debajo. Un cronómetro sin consecuencia escrita
solo pone nervioso.

**9. La conversación de la orden es prueba, así que no se puede editar ni
borrar.** Ni por el usuario ni por el comerciante. Y las imágenes hay que
guardarlas en algún lado con un costo y una retención decidida — el bucket
`ordenex-media` ya existe; falta decir cuánto tiempo se guardan.

**10. Los reversos del riel.** Ver §9: un riel que permite deshacer el pago
después de liberar convierte al comerciante en el que siempre pierde. Lista
blanca, y v1 solo bancos.

**11. Esto es mucho más código que el circuito de agentes.** Anuncios,
comerciantes, métodos, órdenes, mensajes, calificaciones, barredor, arbitraje,
más las pantallas. Hacerlo de una sola vez es como se sacan las cosas a medias.
Ver §13.

**12. Un dyno y una cola.** El motor ya asume un dyno para no tener carreras. El
barredor del P2P **tiene que ser idempotente igual**: si algún día hay dos
dynos, dos barredores no pueden vencer la misma orden dos veces. La guarda
atómica de `transitar()` lo cubre — pero hay que escribirlo con esa guarda desde
el primer día, no arreglarlo después.

---

## 12. Rutas

```
GET  /p2p/anuncios?lado&moneda&metodo&monto&soloVerificados     público
GET  /p2p/anuncios/:id                                          público
GET  /p2p/comerciantes/:id                                      público (estadísticas)
GET  /p2p/monedas                                               público

POST   /p2p/comerciante 🔒        alta: verificada + términos + método + fianza
GET    /p2p/comerciante 🔒
PATCH  /p2p/comerciante 🔒        pausar / reanudar todo de golpe
POST   /p2p/metodos 🔒   GET /p2p/metodos 🔒   DELETE /p2p/metodos/:id 🔒
POST   /p2p/anuncios 🔒  PATCH /p2p/anuncios/:id 🔒  DELETE /p2p/anuncios/:id 🔒

POST /p2p/ordenes 🔒 {anuncioId, montoFiat|cantidad, metodoPagoId, ordenKey}
     → bloquea garantía, arranca reloj, revela el banco de la contraparte
GET  /p2p/ordenes 🔒          GET /p2p/ordenes/:id 🔒
POST /p2p/ordenes/:id/pagado 🔒     solo el pagador · CONGELA EL RELOJ
POST /p2p/ordenes/:id/liberar 🔒    solo el entregador
POST /p2p/ordenes/:id/cancelar 🔒   solo el pagador, solo en `creada`
POST /p2p/ordenes/:id/apelar 🔒     los dos, desde `apelableEn`
GET  /p2p/ordenes/:id/mensajes 🔒   POST /p2p/ordenes/:id/mensajes 🔒
POST /p2p/ordenes/:id/calificar 🔒

GET  /admin/p2p/apelaciones 🔑
POST /admin/p2p/apelaciones/:id/resolver 🔑  {aQuien:'pagador'|'entregador', motivo}
POST /admin/p2p/comerciantes/:id/escalon 🔑  {escalon, acta}
POST /admin/p2p/comerciantes/:id/suspender 🔑
```

🔒 Bearer JWT propio · 🔑 `X-Admin-Key`. `ordenKey` para idempotencia, con el
mismo índice parcial que `ordenSchema`.

Variables nuevas: `ORDENEX_P2P_COMISION_PPM` (0 sin ella), `ORDENEX_P2P_FIANZA_MIN`,
`ORDENEX_P2P_APELACION_MIN` (10), `ORDENEX_P2P_BARREDOR_MS` (20000),
`ORDENEX_P2P_FALTAS_24H` (3), `ORDENEX_P2P_ORDENES_ABIERTAS` (3).

---

## 13. Por dónde se construye

En este orden, y **cada tramo entregable solo**: si se para en cualquiera de
ellos, lo hecho sirve.

1. **Esqueleto y reloj.** ✅ **HECHO** (7-sep). `lib/p2p.js` con el reloj
   inyectable, `models/index.js` con `anuncios`, `p2pOrdenes` y `faltas`,
   `controllers/p2pController.js`, `routes/p2p.js` y el barredor cada 20 s en
   `app.js`. Ya se puede hacer una operación entera por API.

   Lo que la prueba (`pruebas/probar-p2p.mjs`) deja comprobado, con el reloj
   movido a mano — probar el vencimiento con `Date.now()` sería esperar quince
   minutos de verdad, o sea no probarlo:
   - el camino entero: tomar → pagar → liberar, y el ORIGEN llega a quien pagó;
   - **el congelado**: al marcar pagado `venceEn` queda en `null`, y diez horas
     después la orden sigue viva. Una orden pagada no vence jamás;
   - una orden sin pagar se vence **al leerla**, sin esperar al barredor —entre
     dos pasadas hay veinte segundos en los que una orden muerta diría «podés
     pagar»— y la garantía y el inventario del anuncio vuelven los dos;
   - **dos barredores a la vez vencen 2 órdenes, no 4**, y la garantía vuelve
     una sola vez;
   - **dos toques del botón de liberar pagan una sola vez**;
   - el que entrega no puede cancelar nunca; el que paga no puede cancelar
     después de haber marcado el pago;
   - tres faltas en 24 h bloquean, y al día siguiente se puede otra vez;
   - la misma `ordenKey` devuelve la misma orden, no una segunda;
   - y detrás de cada camino, la invariante: **la suma de disponible +
     reservado de las dos puntas es la misma que al empezar**. Un estado
     correcto con el dinero mal es el bicho que nadie ve hasta que alguien
     reclama.

   Falta de este tramo, a propósito: los anuncios se siembran a mano (el alta
   propia es el tramo 2).
2. **Anuncios y comerciantes.** Alta propia, fianza, métodos cifrados,
   condiciones, límites, faltas.
3. **Las pantallas** — lista, orden, cronómetro, panel del comerciante.
4. **Conversación y apelación** con las imágenes.
5. **Calificaciones y estadísticas.**
6. **Monedas LATAM** — hasta aquí, solo HNL y USD.

Pruebas por tramo, con Mongo de memoria y reloj falso (`ahora()` inyectable, no
`Date.now()` esparcido — un reloj que no se puede mover no se puede probar):
vencimiento, congelado, liberación doble, cancelación tardía, apelación antes de
tiempo, garantía huérfana, faltas, y la invariante de siempre: **la suma de los
asientos por activo da cero**.

---

## 14. Lo que este documento NO resuelve

- Quién arbitra, con nombre y horario. **Es de José y de la Junta.**
- Si la casa cobra comisión desde el día uno, y cuánta.
- Cuánto es la fianza mínima.
- Cuánto tiempo se guardan las imágenes de los comprobantes.
- La conversación de Junta del punto 4 de la crítica.

Nada de eso se decide escribiendo código, y ponerle un número por defecto sería
inventarlo.
