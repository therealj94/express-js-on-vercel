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
| Precio del gas | **93 gwei**, revisado contra el oro (ver abajo) — 0,01 USD por transferencia |
| Ranuras huérfanas | se cierran antes de construir |
| Ventana del corte | de noche, apenas esté todo listo |
| Cadena vieja | queda encendida como respaldo caliente |

## Los saldos nativos: decidido el 11-ago-2026

**Ningún usuario lleva ORIGEN nativo a la cadena nueva.** Todo el ORIGEN se
consolida en una sola billetera y se reparte a mano después. **Todos los demás
tokens migran normal**, con sus tenedores y sus saldos intactos.

De eso se desprende algo que no es opcional: **la cadena arranca con el gas en
cero**. Si nadie tiene ORIGEN y el gas cuesta 93 gwei, nadie puede mover ni sus
propios tokens — cada transacción se paga en nativo. Los 406 usuarios quedarían
congelados el día uno.

El orden correcto es: arrancar con gas 0 (igual que hoy), repartir los ORIGEN a
mano, y **recién entonces** encender el gas a 93 gwei con una sola llamada
`miner_setMinGasPrice`, en caliente, sin reiniciar ni reconstruir. El mecanismo
ya estaba previsto para el ajuste contra el oro.

Falta que José dé la dirección de esa billetera única. Mientras tanto se usa la
del tesoro, `0x3d5510e5081822877d14cd51b356bf01df2c32c9`, que es la que hoy
tiene 249.999.831.472 ORIGEN.

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
