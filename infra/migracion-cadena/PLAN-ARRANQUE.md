# El plan de armado · cadena 5550 sobre Besu QBFT

Escrito el 11-ago-2026 con las decisiones ya tomadas. Cada etapa dice qué se
hace, qué la da por buena, y cómo se vuelve atrás.

## Las decisiones que ya están cerradas

| Asunto | Decisión |
|---|---|
| Motor | Hyperledger Besu, consenso QBFT. Sin proof of stake. |
| Chain ID | **5550** (red) · 5534 (pruebas) · 55330 (ensayo desechable) |
| Validadores al arrancar | **4** |
| Período de bloque | **10 s** |
| Límite de gas por bloque | 10.000.000 |
| Precio del gas | **93 gwei desde el bloque cero**, revisado contra el oro (ver abajo) |
| Ranuras huérfanas | se cierran antes de construir |
| Ventana del corte | de noche, apenas esté todo listo |
| Cadena vieja | queda encendida como respaldo caliente |

## Los saldos nativos: decidido el 11-ago-2026

**Cada billetera de persona lleva exactamente 1 ORIGEN.** El resto del ORIGEN
nativo se consolida en una sola billetera y se reparte a mano después. **Todos
los demás tokens migran normal**, con sus tenedores y sus saldos intactos.

**Los contratos conservan su saldo nativo.** No son billeteras: su ORIGEN
respalda valor de la gente.

> **Corrección del 11-ago-2026.** Las cifras de abajo reemplazan a unas
> anteriores que estaban mal. Se habían medido consultando por RPC una lista de
> 439 direcciones sacadas de eventos y transacciones; el árbol de estado dice
> otra cosa, y el árbol manda.
>
> | | Se dijo antes | Es en realidad |
> |---|---|---|
> | Emisión total | 249.999.999.994 | **1.000.000.000.010** |
> | Billeteras de persona | 320 | **159** |
>
> La diferencia son **tres billeteras de 250.000 millones cada una que nunca
> enviaron una transacción**. Al no aparecer nunca en un evento ni en una
> transacción, la medición por direcciones conocidas no podía verlas. La
> emisión está repartida en cuatro asignaciones de 250.000 millones, no en una.

| | Saldo nativo en la 5550 |
|---|---|
| 155 billeteras de personas | **1 ORIGEN** cada una |
| 3 contratos con saldo | **el que tienen** · 17.236,9269 |
| **3 asignaciones de emisión** | **intactas** · 750.000.000.000 |
| La billetera única | **249.999.982.618,0731** |
| Suma | 1.000.000.000.000 — comprobado por el constructor, que aborta si no cuadra |

**Las tres asignaciones no se tocan, y eso necesita decisión de José.** Aplicar
«dejemos 1 en las billeteras» al pie de la letra les sacaría 750.000 millones a
tres billeteras intactas desde el génesis. Eso no es limpiar saldos de usuario:
es mover el tesoro, y va con instrucción escrita de la Junta. El constructor
las preserva con `--preservar` hasta que se diga lo contrario.

El caso que obliga a la excepción es `0xccbe0c6690bf61d1f23f95f3998e4ba0d7b89f75`,
**Wrapped Origen**: guarda 16.387,76 ORIGEN adentro, y en un envoltorio ese
ORIGEN *es* el respaldo de los tokens envueltos que la gente tiene afuera.
Dejarle 1 lo vuelve insolvente y evapora esos 16.387. Lo mismo con
`0xa22180530d9d52676925e6ad9247ce3c24341fb1`, que guarda 839,17 de liquidez.

**Con esto el gas puede arrancar encendido a 93 gwei**, sin esperar al reparto
manual: 1 ORIGEN alcanza para **210 transferencias de token**. Nadie queda
congelado y la comisión funciona desde el bloque cero.

Falta que José dé la dirección de la billetera única. Mientras tanto se usa la
del tesoro, `0x3d5510e5081822877d14cd51b356bf01df2c32c9`.

## El hierro: se reutiliza, no se compra

Los seis nodos están **sincronizados en la punta**, así que cada uno tiene una
copia completa de la cadena vieja. Eso permite reutilizar cuatro sin dejar el
respaldo huérfano.

| Nodo | Zona | Destino |
|---|---|---|
| node1 | us-east-1e | **no se toca** · validador y RPC de la vieja |
| node2 | us-east-2b | **no se toca** · copia completa, respaldo del respaldo |
| node3 | us-east-1e | validador Besu 1 |
| node5 | us-east-1d | validador Besu 2 |
| node6 | us-east-1d | validador Besu 3 |
| node4 | us-east-2b | validador Besu 4 |

Coste adicional: **cero**. Y la t2.large tiene 8 GB de memoria contra los 4 de
la t3.medium que se iba a comprar: el hierro que ya existe es mejor para Besu
que el que se iba a pagar.

Instantáneos EBS tomados antes de tocar nada, el 11-ago-2026:
`snap-043fc38632a9149ea` (node3), `snap-0663c8fbc2b23fd2f` (node5),
`snap-0cf5db2ce844b926d` (node6), `snap-00aee0b99990c94b1` (node4).

### Lo que hay que arreglar en el corte, y que hoy está mal

El RPC público `rpc.ordenglobal-rpc.com` apunta a un balanceador con **un solo
destino**: node1 — que es también el único validador. Si esa máquina cae, la
cadena deja de producir y la billetera se queda sin RPC a la vez. Los cuatro
validadores Besu van detrás del balanceador y el punto único desaparece.

## Nota sobre la decisión anterior

**Qué pasa con los saldos nativos de ORIGEN.** Medido contra la cadena en vivo
el 11-ago-2026, sobre 438 direcciones conocidas:

| | |
|---|---|
| Direcciones sin código (personas) | 321 |
| De ellas, con ORIGEN > 0 | 151 |
| La mayor (tesoro/desplegador) | 249.999.831.472 ORIGEN |
| Personas de verdad con saldo | 150, sumando 151.285 ORIGEN |
| De ellas, con más de 1 ORIGEN | **109** |

Las dos salidas y lo que cuesta cada una:

- **Migrar todo y completar hasta un piso de 1 ORIGEN.** Nadie pierde nada y
  nadie queda sin poder pagar el gas. Coste: **184 ORIGEN**, que es lo que
  falta para subir a los que están por debajo del piso.
- **No migrar y sembrar 1 a cada uno.** 109 personas pierden **151.149 ORIGEN**
  entre todas. La mayor pérdida individual es de 104.371.

La primera es la recomendada y la que sostiene lo que se viene diciendo desde
el principio: que no quede nadie atrás. La segunda es una decisión de Junta,
no de ingeniería, porque esa gente compró.

**Nada de lo de abajo se ejecuta hasta que esto esté resuelto**, porque
determina el contenido del génesis.

## Etapa A · Cerrar las 80 ranuras huérfanas

Quedan 66 del índice de enumeración del gestor de posiciones de Uniswap V3 y
4 en cada uno de 3 contratos gemelos. Afectan a 31 posiciones de liquidez de
2 personas.

```bash
python3 cosechar-posiciones.py     # genera las claves exactas de enumeración
python3 cerrar-ranuras.py          # bucle de punto fijo: traza y realimenta
python3 emparejar-preimagenes.py estado.json candidatos.json
```

**Da por buena la etapa:** el emparejamiento cierra en **cero huérfanas**.
Mientras no cierre, no se construye ningún génesis.

## Etapa B · La foto del estado

```bash
go build -o volcar volcar-estado.go
./volcar -trie ./trie -raiz 0x<stateRoot> -salida estado-final.json
sha256sum estado-final.json          # la huella va al acta
```

`volcar-estado.go` cuenta los nodos que no puede leer y **termina con error si
falta uno solo**. Esa es la garantía de que la foto está completa.

**Da por buena la etapa:** 0 nodos faltantes, y la huella guardada en dos
sitios.

## Etapa C · Las cuatro llaves de validador

Una por nodo, generadas en la propia máquina para que la llave privada nunca
viaje por la red:

```bash
besu --data-path=/opt/besu/nodo public-key export-address   # filtrar ANSI
```

Dónde vive cada una:

1. **En su nodo**, en SSM Parameter Store como `SecureString` con una clave KMS
   propia. El rol de cada máquina lee **sólo su ruta**: comprometer un nodo se
   lleva una llave, no las cuatro.
2. **Copia fría de las cuatro**, cifrada y fuera de AWS. Es la única que
   sobrevive a perder la cuenta.
3. Nunca las cuatro juntas en una máquina, ni en el repositorio, ni en una
   variable de entorno.

Con QBFT, perder **una** llave se repara: las otras tres votan para sacar ese
validador y meter uno nuevo. Lo que detiene la cadena es perder **dos**.

Con 4 validadores se tolera 1 caída. Con 6 también se tolera 1 —la cuenta es
f=(N−1)/3—, así que subir a 6 no compra nada. Para tolerar 2 harían falta 7.
Los 2 nodos restantes quedan sirviendo RPC.

## Etapa D · El génesis

```bash
python3 construir-genesis-desde-arbol.py estado-final.json \
    --ranuras ranuras-cerradas.json \
    --chain-id 5550 --periodo 10 --piso-origen 1 \
    --validadores validadores.json \
    --salida genesis-5550.json
```

Lo que produce:

- cada contrato con su código y **todas** sus ranuras — un contrato viaja
  entero o no viaja;
- cada cuenta con su saldo y su **nonce** (el nonce copiado impide que una
  transacción vieja firmada se reejecute);
- el piso de 1 ORIGEN aplicado a quien esté por debajo;
- **sin** el contrato de staking de Edge: los validadores los gestiona QBFT;
- `extraData` con los 4 validadores, codificado con `besu rlp encode`.

Falta implementar `--piso-origen`; hoy el guion no lo tiene.

## Etapa E · El ensayo, con el génesis de verdad

El mismo génesis, cambiando sólo el chain ID a 5534, sobre cuatro máquinas.

```bash
python3 comparar-cadenas.py --vieja https://rpc.ordenglobal-rpc.com \
                            --nueva http://ensayo:8545
```

**Da por buena la etapa:** la comparación de **raíces de almacenamiento** da
igual para todos los contratos. Eso es prueba de completitud, no muestreo: si
la raíz coincide, no falta ni sobra una ranura.

Dos trampas ya conocidas, anotadas para no volver a descubrirlas:

- QBFT **no produce bloques con `--p2p-enabled=false`**. Se arranca con
  `--p2p-host=127.0.0.1 --discovery-enabled=false`.
- Besu **colorea su salida**: `public-key export-address` y `rlp encode`
  devuelven códigos ANSI mezclados con el valor. Hay que filtrarlos o el
  `extraData` sale vacío.

## Etapa F · Las aplicaciones contra el ensayo

Veta Wallet (web y móvil), Genesis ID y ordenscan apuntando a 5534. Operar una
semana como un día cualquiera.

**Lo nuevo que hay que probar, y que hoy no existe:** con el gas en 93 gwei,
por primera vez una transacción puede fallar por saldo insuficiente. Hoy el gas
es cero y ese camino de código nunca se ejecutó. Hay que comprobar que la
billetera lo detecta y lo explica en vez de fallar en silencio.

## Etapa G · El corte (de noche)

1. **Congelar**: backend de la billetera en mantenimiento.
2. **Foto final**: repetir la etapa B. La huella va al acta.
3. **Génesis final** sobre esa foto, con chain ID 5550.
4. Arrancar los 4 validadores y los 2 nodos RPC.
5. `comparar-cadenas.py` contra el nodo nuevo. **Si no cuadra, se aborta**:
   se levanta el mantenimiento y la cadena vieja sigue siendo la oficial.
6. Voltear el número en los cuatro sitios: billetera web, app móvil por OTA,
   fila `ChainId` del backend, DNS del RPC.
7. Levantar el mantenimiento.

**Vuelta atrás:** reapuntar el DNS a la cadena vieja, que nunca se apagó. Son
minutos. Lo que se pierde es lo ocurrido después del corte, que por eso se hace
de noche.

## Etapa H · Después

- Inscribir 5550 y 5534 en `ethereum-lists/chains`. No se puede reservar un
  número: se toma cuando se fusiona la solicitud, y para eso la cadena tiene
  que estar viva respondiendo por RPC.
- La cadena vieja queda encendida como respaldo caliente. No se apaga ni se
  borra.
- Documentar el procedimiento de revisión del precio del gas: cambiarlo exige
  reiniciar los nodos con otro `--min-gas-price`, y con el ORIGEN a 5 dólares
  esos 93 gwei pasan a costar 0,024 en vez de 0,010.

## El precio del gas sigue al oro

**La definición:** un ORIGEN es un gramo de oro dividido en 55.

```
ORIGEN_USD = (oro_USD_por_onza / 31,1034768) / 55
gwei       = 0,01 / ORIGEN_USD × 10^18 / 51.000 / 10^9
```

Los 51.000 son el gas de una transferencia de token, que es la operación normal
de la billetera. Comprobación: el ORIGEN a 2,10 implica el oro a 3.592 USD/oz,
y a ese precio la fórmula da **93 gwei** — el número que fijamos.

| Oro USD/oz | USD/gramo | ORIGEN | Gas |
|---:|---:|---:|---:|
| 3.000 | 96,45 | 1,7537 | 112 gwei |
| 3.300 | 106,10 | 1,9290 | 102 gwei |
| **3.592** | **115,49** | **2,0997** | **93 gwei** |
| 3.800 | 122,17 | 2,2213 | 88 gwei |
| 4.200 | 135,03 | 2,4551 | 80 gwei |
| 5.000 | 160,75 | 2,9228 | 67 gwei |

Sube el oro, baja el gas en gwei, y la transferencia sigue costando un centavo.

**Cómo se aplica.** Besu expone `miner_setMinGasPrice` en la API MINER, que
cambia el precio en caliente sin reiniciar. Hay que confirmarlo contra la
versión exacta durante la etapa E; si no funcionara, la alternativa es reinicio
escalonado de a un nodo, que tampoco corta el servicio.

**Los dos frenos, que van desde el primer día:**

- **Banda muerta del 5 %.** Si el precio nuevo difiere menos de eso del vigente,
  no se toca. Sin esto se reescribe el gas todos los días por ruido de mercado.
- **Tope del 20 % por ajuste.** Un dato malo de la fuente no puede disparar el
  gas de golpe. Si la fuente pide más, se mueve el 20 % y se vuelve a evaluar
  en el siguiente ciclo.

Y una regla que no es técnica: **cada ajuste queda registrado** —precio del oro
leído, ORIGEN resultante, gwei anterior y nuevo, hora—. Si nadie puede
auditarlo después, el usuario no tiene cómo saber por qué pagó lo que pagó.

## Etapa C, hecha · las cuatro llaves de validador · 11-ago-2026

| Nodo | Zona | Dirección de validador |
|---|---|---|
| node3 | us-east-1e | `0x69e8a7b25586511a0c14430b45100e9439aae36c` |
| node5 | us-east-1d | `0x65f987264bd77c3a094badfd88e4ba84c0b36382` |
| node6 | us-east-1d | `0xc548464725d5fd4a15b882a221da67b9cfd29514` |
| node4 | us-east-2b | `0x48ccec9a54b9357623458f26afadcd7412a6a833` |

`extraData` de QBFT generado con las cuatro, en orden ascendente de dirección,
en `/opt/v2/extradata.txt` de la máquina de ensayo.

**Cada llave se generó dentro de su propio nodo y la parte privada nunca salió
de ahí.** Sólo viajó la parte pública, con la que se deriva la dirección. La
privada se guarda cifrada en SSM Parameter Store, en `/og/5550/<nodo>/`, con la
clave KMS `alias/og-validadores-5550` (rotación anual activada), y el propio
nodo la escribe con su rol: en ningún momento pasa por el operador.

### Dos errores que aparecieron al comprobar, y por qué conviene comprobar

**La primera extracción truncaba las llaves.** Salían de 62 caracteres en vez
de 64 porque el `grep` que las leía sólo tomaba los bytes seguidos de dos
puntos, y el último byte de cada campo no lleva. Una llave truncada guardada
como respaldo es peor que no tener respaldo. Se rehizo leyendo el DER, que no
depende del formato de texto, y se comprobó que la privada guardada deriva
exactamente a la pública de la que sale la dirección.

**El aislamiento no existía hasta que se probó.** Con el permiso acotado a
`/og/5550/<nodo>/*` puesto, **cada nodo seguía leyendo las llaves de los otros
tres**. La causa es que `AmazonSSMManagedInstanceCore` —la política estándar de
AWS, necesaria para que el agente funcione— concede `ssm:GetParameter` sobre
`Resource: "*"`. Acotar en una política no sirve si otra abre todo.

Se arregló con una **denegación explícita** de las rutas de los otros tres. En
IAM, un Deny gana siempre. Comprobado en los cuatro: cada uno lee la suya y
ninguno lee las ajenas.

### Lo que falta de esta etapa

La **copia fría de las cuatro**, cifrada y fuera de AWS. Es la única que
sobrevive a perder la cuenta, y necesita una persona: no la puede hacer el
operador automático sin que las llaves pasen por él.

## Etapa del oráculo, hecha · 11-ago-2026

`oraculo-gas.py` implementa la cadena completa: oro por onza → por gramo →
entre 55 → ORIGEN en dólares → gwei que hace que la transferencia de token
cueste un centavo.

### El precio de referencia quedó viejo

Los **93 gwei** acordados salían de un ORIGEN a 2,10 USD, que implica el oro a
3.592 la onza. **El oro está hoy a 4.358**, así que:

| | Acordado | Hoy |
|---|---:|---:|
| Oro | 3.592 USD/oz | **4.358 USD/oz** |
| ORIGEN | 2,10 USD | **2,55 USD** |
| Gas para que la transferencia cueste 0,01 | 93 gwei | **77 gwei** |

No es un error del acuerdo: es exactamente para esto que el oráculo existe. La
cadena puede arrancar en 93 y el primer ajuste la baja a 77 —un 17 %, dentro
del tope—, o arrancar directamente en 77. **Arrancar en 77 es preferible**:
evita que el primer día alguien pague de más.

### Las defensas, probadas una por una

| Regla | Qué hace | Comprobado |
|---|---|---|
| **Mediana de tres fuentes** | oro al contado, PAXG y XAUT | una fuente que devuelve 999.999 se descarta y no mueve el precio |
| **Mínimo dos fuentes** | con menos, no decide | con una sola viva, aborta |
| **Cotas de cordura** | descarta fuera de 500–20.000 USD/oz | sí |
| **Banda muerta 5 %** | no toca por ruido | con 78 vigente y 77 ideal, no toca |
| **Tope 20 % por ajuste** | un dato malo no dispara el gas | con 1.000 vigente baja a 800, no a 77 |
| **No aplica sin `--aplicar`** | por omisión sólo dice qué haría | sí |
| **Registro de cada ajuste** | JSONL con oro, fuentes, motivo y hora | sí |

Con las fuentes caídas **aborta en vez de inventar un precio**. Un oráculo que
adivina cuando no sabe es peor que uno que se detiene.

### Lo que falta

Programarlo para que corra solo. Va con el corte, porque hasta entonces no hay
cadena nueva a la que apuntarle.

## La red de cuatro validadores, probada de verdad · 11-ago-2026

Hasta acá la cadena sólo había corrido con **un** validador. Con cuatro, QBFT
exige que tres se pongan de acuerdo, y si el `extraData` o las llaves no
encajan no se produce un solo bloque. Eso no se podía descubrir la noche del
corte.

Se montaron los cuatro validadores reales —node3, node5, node6 y node4, cada
uno con su llave en su propia máquina— sobre el chain ID de pruebas 5534, con
el génesis completo de 331 cuentas.

Preparación: Java 25 y Besu 26.7.1 en los cuatro; el puerto 30303 abierto
**sólo entre esas cuatro direcciones**, no al mundo; el génesis repartido con
URLs firmadas de S3, para que ningún nodo necesitara permisos nuevos.

### Las tres pruebas

| Prueba | Esperado | Resultado |
|---|---|---|
| Los cuatro en pie | produce bloques | **sí** · 3 pares cada uno, avanzando juntos |
| Cae **uno** | sigue produciendo | **sí** · +4 bloques en 60 s |
| Caen **dos** | se detiene | **sí** · 0 bloques en 75 s |
| Vuelven los dos | se recupera sola | **sí**, pero **tarda minutos** |

### El dato operativo que hay que conocer

**La recuperación no es inmediata.** Al volver los nodos, los cuatro quedan
repartidos entre rondas distintas —dos en la ronda 2 y dos en la 3— y ninguna
junta los tres necesarios. La convergencia llega sola, pero tarda **varios
minutos**, no segundos.

A los 80 segundos la cadena seguía parada y parecía no recuperarse. A los pocos
minutos había pasado del bloque 18 al 35.

Esto importa para el corte: **si la cadena se detiene, hay que esperar antes de
tocar nada.** Reiniciar los nodos por impaciencia reinicia también el reloj de
convergencia y alarga la parada en vez de acortarla. La instrucción para esa
noche es esperar al menos cinco minutos antes de intervenir.

### Lo que queda comprobado

- El `extraData` de QBFT es correcto y los cuatro se reconocen:
  `qbft_getValidatorsByBlockNumber` devuelve 4 en los cuatro nodos.
- Las llaves generadas en cada máquina funcionan como identidad de red y como
  firma de validador.
- La tolerancia a fallos es la que se le dijo a la Junta: **aguanta una caída,
  no dos**.
