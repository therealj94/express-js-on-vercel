# El corte a la 5550 · lo que hay HOY, 15-ago, medido

José pidió hacer la migración completa «ya, full». Antes de tocar nada se midió
el terreno. **Hay un bloqueador y no es opinable**, así que este documento
empieza por él.

## 1 · La cadena vieja se movió: el génesis construido ya no vale

`GENESIS-5550-LISTO.md` (12-ago) dice, y con razón, que el génesis es válido
**mientras la 8532 no se mueva desde el cierre de ranuras**. Comprobado hoy
contra el nodo 3 por RPC:

| | Cierre (12-ago) | Hoy (15-ago 05:10 UTC) |
|---|---|---|
| Bloque | 4.174.569 | **4.187.293** |
| Raíz de estado | `0xd21e29ff…7882` | **`0x033485c8…c116`** |

La raíz del bloque del cierre **sigue siendo exactamente la del documento** —el
trabajo de agosto está impecable—, pero el estado cambió después. Buscando el
punto exacto por bisección: la raíz aguantó intacta hasta el bloque 4.185.898 y
cambió en el **4.185.899**.

### Las cinco transacciones que lo invalidan

| Bloque | Cuándo | De → a | ORIGEN |
|---|---|---|---|
| 4.185.899 | 14-ago 23:28 | `0x7462…3ad8` → `0xEcB7…7c06` | 0,010 |
| 4.185.951 | 14-ago 23:41 | `0x7462…3ad8` → `0xEcB7…7c06` | 0,010 |
| 4.187.070 | 15-ago 04:26 | `0xd894…BDA5` → `0xA522…53E3` | 0,010 |
| 4.187.124 | 15-ago 04:40 | `0xA522…53E3` → `0xd894…BDA5` | 0,020 |
| 4.187.221 | 15-ago 05:05 | `0xd894…BDA5` → `0x7462…3ad8` | 0,012 |

Cuatro billeteras de persona, cantidades de prueba, la última **media hora
antes de medir**. No son bots: es gente usando la app —muy probablemente el
propio equipo probando los envíos que se arreglaron esta noche—.

**Consecuencia:** arrancar la 5550 con el génesis del 12-ago publicaría unos
saldos que ya no son los reales y **borraría esas cinco transacciones**. Poco
dinero, pero dinero de alguien, y sobre todo un precedente que no se puede
sentar: la cadena nueva tiene que nacer siendo la verdad exacta de la vieja.

## 2 · Lo que sí está listo, y es casi todo

| Pieza | Estado |
|---|---|
| Génesis de la 5550 | construido y juzgado con **cero diferencias** (331 cuentas, 1.375 ranuras) |
| Método para reconstruirlo | probado de punta a punta; el problema de las 78 ranuras huérfanas quedó resuelto |
| Billetera única | confirmada, `0x3d55…32c9` |
| Máquinas | **no hacen falta nuevas**: nodos 3, 4, 5 y 6 ya llevan Besu con IP fija y la malla de bootnodes |
| Besu en producción | los cuatro **vivos**, 5 pares, misma altura, cuatro validadores QBFT |
| Interruptor de red | **existe en los tres sitios**: app `EXPO_PUBLIC_WALLET_CHAIN_ID` (api.js:718) · web `window.OG_CHAIN_ID` (app.js:16) · el resto por variable |

Lo que corre hoy en esos cuatro nodos es la **5534 de pruebas**
(`eth_chainId` → `0x159e`, y el génesis en `/opt/og5550/` dice `chainId: 5534`).
La carpeta se llama `og5550` desde que se preparó, pero la 5550 **todavía no ha
arrancado nunca**.

## 3 · El orden correcto del corte

El error que hay que evitar es reconstruir el génesis con la cadena aún
abierta: entrarían transacciones nuevas mientras se construye y volveríamos al
mismo punto. Por eso **congelar va primero**.

1. **Ventana anunciada.** Decidir la hora y avisar a los 435. Media hora basta.
2. **Congelar de verdad.** Que el backend deje de admitir envíos (no basta con
   pedirlo: hay que cerrar la puerta) y comprobar que la punta deja de traer
   transacciones durante varios bloques seguidos.
3. **Reconstruir el génesis** desde el árbol de estado del bloque congelado, con
   el mismo procedimiento ya probado, y pasar `juez.py`: **cero diferencias o
   no se sigue**.
4. **`extraData` con los validadores del día** (`besu rlp encode`), que el
   génesis recién construido no arranca sin eso.
5. **Arrancar la 5550** en los nodos 3-6, parando antes su Besu de la 5534 para
   no mezclar. Comprobar: chainId 5550, cuatro validadores, altura subiendo.
6. **Repuntar** app (OTA con la variable), web (`OG_CHAIN_ID`), ordenscan y el
   backend de la wallet. Cada uno tiene su interruptor: es un cambio de valor.
7. **Verificar con dinero real**: un envío pequeño de punta a punta, y que
   ordenscan lo enseñe.
8. **Parar la 8532** solo después de que 7 salga bien. Queda como respaldo
   caliente, apagada pero restaurable.

## 4 · Lo que decide José, no yo

- **Cuándo** es la ventana de mantenimiento.
- Si se avisa a los usuarios y con qué texto.
- Si las cinco transacciones de prueba se conservan (reconstruyendo, que es lo
  correcto) o se aceptan como pérdida (no recomendado).

## 5 · Y una regla que ya estaba escrita y hoy se cumplió sola

«Ningún bot debe transaccionar en la 8532: una sola transacción invalida el
génesis de la 5550.» No fue un bot, fueron personas — pero el efecto es
exactamente el que se temía. Mientras la app siga hablando con la 8532, el
génesis caduca cada vez que alguien envía. Por eso el paso 2 no es opcional y
el corte no se puede estirar en el tiempo: se congela, se reconstruye y se
arranca **en la misma ventana**.

---

## 6 · Ejecutado el 15-ago · la 5550 es la red oficial

| Paso | Resultado |
|---|---|
| Génesis instalado en nodos 3, 4, 5 y 6 | md5 `89a1ec6b…` idéntico en los cuatro |
| Identidad de cada nodo | conservada (se copió su `key`), la malla se rearmó sola |
| Arranque | chainId **5550**, 4 validadores QBFT, período 10 s, bloques subiendo |
| Billetera única | 249.999.982.618,0731 ORIGEN — la cifra del acuerdo |
| RPC público | `rpc.`, `www.` y la raíz de ordenglobal-rpc.com → 5550 |
| App y web | identificador 5550 y 16 rótulos con la ficha técnica |
| Explorador | frontend a 5550; backend ya leía la 5550 solo (apunta al mismo nombre) |

La 5534 de pruebas queda **parada**, con su carpeta intacta: volver es cambiar
la unidad de systemd y arrancar.

### El tropiezo, por si vuelve a pasar
`rpc.ordenglobal-rpc.com` cuelga del balanceador **OrdenKapital**, no del que
lleva el nombre `ogb-testnet-rpc`. Al cortar por el sitio correcto salió 502:
node5 y node6 estaban en una subred que ese balanceador no cubría. Se revirtió
en segundos, se añadió la subred y el segundo intento entró limpio. **Un
balanceador solo puede alcanzar instancias de las subredes que tiene
asignadas** — comprobarlo antes, no después.

## 7 · Lo que queda, y por qué no lo puedo hacer yo

### a) La base del explorador mezcla dos cadenas — IMPORTANTE
El indexador (`revisarNuevosBloques`, cada 15 s) ya guarda bloques de la 5550
en la **misma** base de Mongo que tiene el histórico de la 8532. Y los números
de bloque **se solapan**: el bloque 100 de la 5550 y el 100 de la vieja son
distintos y comparten número. Hoy el explorador enseña 207 bloques (5550) junto
a 1.532 transacciones y direcciones con `blockNumber: 206376` (8532): datos que
en la cadena oficial no existen.

**El arreglo:** vaciar las colecciones `blocks`, `transactions`, `addresses` y
`tokentxs` y dejar que reindexe desde el bloque 0 de la 5550.

```sh
# con la URI que ya vive en la variable MONGODB_URI de Heroku
mongosh "$MONGODB_URI" --eval 'db.blocks.deleteMany({}); db.transactions.deleteMany({}); db.addresses.deleteMany({}); db.tokentxs.deleteMany({})'
heroku restart -a orden-global-scan
```

No lo ejecuto porque **no tengo acceso a Heroku** (el token está caducado desde
el 12-ago) y la URI de Mongo vive ahí. Es de José o de quien tenga esa cuenta.

El histórico de la 8532 se pierde **del explorador**, no de la cadena: la 8532
sigue en pie como respaldo caliente y su historia entera está en sus nodos.

### b) node3 no atiende consultas
Pasa a `unhealthy` en el balanceador (`Target.FailedHealthChecks`) aunque
responde bien en local y **valida bloques con normalidad**. La red sirve con
node5 y node6. Queda por mirar.

### c) Falta el envío real y parar la 8532
Un envío de punta a punta desde la app —lo tiene que hacer una persona, no se
puede firmar desde aquí— y, solo si sale bien, parar `polygon-edge` en los seis
nodos. La 8532 queda apagada pero restaurable.
