# La cadena 8532 sigue viva, y el runbook dice que no

Medido el 21 de agosto de 2026 por RPC directo contra `23.23.205.33:80`.
**No se tocó nada**: solo se consultó.

---

## Lo que dice el runbook

`SIETE-VALIDADORES-20-AGO.md` registra que el 20 de agosto se paró y deshabilitó
`polygon-edge` en las seis máquinas, con «procesos vivos: 0».

## Lo que contesta la máquina

| | |
|---|---|
| ¿Responde por RPC? | **sí** |
| `chainId` | `0x2154` = 8532 |
| ¿Avanza la altura? | **sí**: 4.224.881 y subiendo, un bloque cada pocos segundos |
| Transacciones en el último bloque | **0** |
| `gasUsed` del último bloque | **0** |
| Raíz de estado | `0x033485c8…`, la MISMA del corte del 15 de agosto |
| Pares (`net_peerCount`) | **0** |
| Validadores | **1** |

## Qué significa esto, con precisión

**El estado está congelado de verdad.** La raíz de estado coincide byte a byte
con la que quedó anotada como punto de corte el 15 de agosto, y los bloques
salen vacíos. **No ha entrado ni salido dinero desde entonces.** Eso es lo
primero que había que comprobar y está bien.

**Lo que no está bien es que el proceso siga corriendo.** Un nodo solo, sin
pares, con un validador, firmando bloques vacíos contra un estado que nadie va a
volver a mover, y sirviendo RPC abierto al internet en el puerto 80.

## Por qué importa aunque no se mueva dinero

1. **El runbook miente, y alguien va a confiar en él.** Un documento que dice
   «apagado» sobre algo que está encendido es peor que no tener documento: la
   próxima persona que lo lea va a tomar una decisión con datos falsos.
2. **Un RPC vivo invita a que alguien lo use.** Una versión vieja de una
   aplicación, un marcador guardado, una configuración que nadie revisó: quien
   caiga ahí ve una cadena que responde y avanza, y no tiene forma de notar que
   está sola. Genesis ID no corre ese riesgo porque comprueba el `chainId` antes
   de fiarse de una lectura, pero eso lo resuelve Genesis ID, no la cadena.
3. **Se está pagando una máquina para que no haga nada.**

## Qué NO se hizo, y por qué

**No se apagó.** Apagar un nodo de una cadena que guarda el estado de todos los
saldos anteriores a la migración es una decisión con consecuencias, y no es mía.
Antes de apagarlo hay que estar seguro de dos cosas:

- Que existe una copia del estado en un sitio que no sea esa máquina. Si el
  disco de la 8532 es el único lugar donde vive el histórico anterior al 15 de
  agosto, apagarlo sin copia es irreversible.
- Que nada del ecosistema sigue leyendo de ahí. Genesis ID ya no, comprobado.
  Falta comprobar la billetera, el explorador y cualquier cosa que tenga
  `RPC_8532_URL` puesta.

## Lo que hay que hacer, en orden

1. Entrar por SSM a `node1` y ver si `polygon-edge.service` está activo. La
   medición dice que sí, pero conviene verlo en la máquina.
2. Comprobar si hay copia del estado fuera de esa máquina.
3. Buscar quién sigue apuntando a la 8532 (`grep -r RPC_8532_URL` y las
   variables de entorno de Heroku y Render).
4. Con las tres respuestas, decidir: cerrar el RPC al público es lo mínimo y no
   pierde nada; apagar el nodo entero solo cuando haya copia.
5. Corregir `SIETE-VALIDADORES-20-AGO.md` diga lo que diga la decisión, porque
   hoy afirma algo que es falso.
