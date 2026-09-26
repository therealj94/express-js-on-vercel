# filtro-besu · complemento de red cerrada (SFSP-150) para Besu 26.7.1

Complemento Java que registra un `TransactionPermissioningProvider` en el
`PermissioningService` de Besu. Por cada transacción consulta
`SFSPNetworkPermissions.transactionAllowed(sender, target, value, gasPrice, gasLimit, payload)`
en la cabeza de la cadena y la rechaza si el contrato devuelve `false`.

El porqué y el plan completo están en [`../RED-CERRADA.md`](../RED-CERRADA.md).

## Qué hace, exactamente

| Caso | Resultado |
|---|---|
| `--plugin-sfsp-filtro-habilitado=false` | Admite todo. El proveedor queda registrado, pero no consulta nada. |
| Bloque en curso (cabeza + 1) fuera de `[bloque-activacion, bloque-fin)` | Admite todo. Así la historia anterior se sigue importando igual. |
| Transacción con lista de delegación EIP-7702 | La rechaza, salvo `--plugin-sfsp-filtro-admitir-delegacion-7702=true`. |
| El contrato devuelve exactamente `true` (32 bytes) | La admite. |
| Devuelve `false` | La **rechaza**, sin más. Es un «no» normal. |
| Revierte, no tiene código, la salida no es un `bool` o falla la simulación | La **rechaza** y deja un `WARN` con el motivo (como mucho uno cada 10 s; el siguiente dice cuántos se callaron). A diferencia de la opción contractual retirada, un contrato ausente **no** abre la red. |
| Los servicios de Besu no están disponibles | La rechaza y deja un `ERROR` en el registro. |

Besu consulta a los proveedores en tres sitios (`TransactionValidationParams`,
`checkOnchainPermissions = true`): el **pool**, la **producción** de bloques y la
**importación** de bloques. Por eso el complemento tiene que estar, con la misma
configuración, en **todos** los nodos: los 7 validadores y los nodos RPC.

### Una sola lectura de la cabeza, y la caché atada a ella

Cada consulta pide a Besu **un** bloque pendiente (cabeza + 1) y de él saca todo: el
número con que se decide la ventana `[activación, fin)`, el estado que se simula (el de
su padre) y la clave de la caché. La caché guarda las respuestas por (hash del padre,
hash de transacción), hasta 50.000 por cabeza. Cada hilo guarda su respuesta en la
generación de la cabeza con la que **simuló**: una respuesta calculada con la cabeza
anterior no se sirve nunca para la nueva, aunque el bloque llegue a mitad de la
consulta. En la 0.1.0 la cabeza se leía dos veces y la caché se vaciaba sin coordinar;
un «no» de la cabeza anterior podía quedar guardado como respuesta de la nueva y dejar
al nodo rechazando un bloque válido hasta reiniciarlo.

### Gas de la consulta

La llamada simulada lleva el `payload` **entero** de la transacción, y Besu exige que el
gas intrínseco de ese calldata quepa en el gas de la llamada. El gas se calcula por
tamaño y sólo con el calldata (ninguna configuración local del nodo entra en la cuenta):

```
gas = 21.000 + 64 × bytes del calldata + 100.000      (mínimo 200.000, máximo 100.000.000)
```

64 por byte es la cota de todas las reglas que conoce Besu 26.7.1: 16 en Shanghai (la
5550 hoy), 40 con el suelo de Prague (EIP-7623) y 64 con el de Amsterdam (EIP-7976).
100.000 es para ejecutar `transactionAllowed`, que gasta entre 2.567 y 7.740. En la
0.1.0 el gas era un tope fijo de 200.000 y **toda transacción de más de unos 11 KB se
rechazaba** aunque el contrato dijera que sí: el despliegue de un `SFSPRegulatedAsset`
(14,6 KB), de un `SFSPAssetRegistry` (22,6 KB) o del reemplazo de la propia lista (12 KB).

**`--rpc-gas-cap`.** Besu rebaja el gas de cualquier simulación a ese tope, también el de
esta consulta. En los nodos con el complemento tiene que quedar en su valor por omisión
(100.000.000), más alto o en `0` (sin tope). Con un tope más bajo, ese nodo decidiría
distinto que los demás sobre las transacciones grandes. El `WARN` de una consulta que no
terminó bien dice si el gas aplicado fue menor que el pedido.

### Autoprueba

`transactionAllowed(0x0, contrato, 0, 0, 0, "")` tiene que devolver `true`: la lista
siempre admite `target == address(this)`. Si la dirección está mal escrita o no tiene
código, la respuesta es otra, y el nodo rechazaría **todas** las transacciones desde la
activación.

| Cuándo | Si falla |
|---|---|
| Al arrancar, con el filtro ya vigente | **No arranca**. Besu sólo dice `Error starting plugin of type sfsp.red.filtro.FiltroRedPlugin`; la causa está en la línea anterior, `SFSP filtro de red: NO ARRANCA: … AUTOPRUEBA FALLIDA …`. |
| Al arrancar, en los 20.000 bloques antes de la activación (unas 55 h a 10 s) | `ERROR` en el registro. |
| Al arrancar, antes de eso | `WARN`: es lo normal en un nodo que sincroniza desde el génesis y todavía no llegó al bloque del despliegue. |
| Desde 20.000 bloques antes de la activación y hasta el fin: cada 100 bloques y en el bloque de activación | `ERROR` en cada comprobación mientras falle; `INFO` cuando vuelve a salir bien. Corre en un hilo propio, no en el de importación. |

Además, si `--plugin-sfsp-filtro-contrato` lleva mayúsculas y minúsculas, tiene que ser
la forma **EIP-55** exacta, o el nodo no arranca. En minúsculas no lleva checksum; para
eso está la autoprueba.

## Compilar

Hace falta **JDK 25**, porque los artefactos de Besu 26.7.1 lo exigen, y
**Gradle 8.14** o posterior. El JDK 21 no sirve: Gradle rechaza las dependencias.

```bash
cd sfsp/red/filtro-besu
# Si el JDK 25 no es el de sistema, se indica a Gradle dónde está:
gradle --no-daemon \
  -Porg.gradle.java.installations.paths=/ruta/al/jdk-25 \
  -Porg.gradle.java.installations.auto-download=false \
  clean test jar
sha256sum build/libs/sfsp-filtro-red-0.2.0.jar
```

- **Pruebas** (`gradle test`, JUnit 5): 17, contra un Besu de mentira que reproduce la
  regla de gas intrínseco de Shanghai y deja mover la cabeza a mitad de una consulta
  (`src/test/java/sfsp/red/filtro/`). Cubren el gas por tamaño, la carrera de la caché,
  la ventana, el filtro apagado, la autoprueba y el checksum EIP-55. Las de gas, caché y
  autoprueba **fallan** con la 0.1.0.

- **Dependencias**: se resuelven de Maven Central y de
  `https://hyperledger.jfrog.io/artifactory/besu-maven/`. Van como `compileOnly`,
  porque Besu ya trae esas clases y el jar no las empaqueta.
- **Salida**: `build/libs/sfsp-filtro-red-0.2.0.jar`, de unos 15 KB. `build/`
  no se versiona.
- **La 0.1.0 no se instala en ningún nodo.** Tenía el tope fijo de gas y la carrera de la
  caché. Como el jar decide qué transacciones son válidas, en una red no pueden convivir
  la 0.1.0 y la 0.2.0 con el filtro vigente: discreparían sobre las transacciones grandes.
- **Compilado el 26-sep-2026** con Temurin 25.0.4.1 y Gradle 8.14.3. La huella
  SHA-256 varía con cada compilación: el jar no es reproducible byte a byte,
  porque lleva la fecha dentro. **Se publica la huella del jar que se instala** y
  se comprueba en cada nodo.
- **Versión de Besu**: el jar se compila contra la API de la **26.7.1**. La API de
  complementos no garantiza compatibilidad entre versiones, así que actualizar
  Besu obliga a recompilar y a volver a probar en la 5534.

## Instalar (en cada nodo, uno a uno)

Los validadores corren el tarball de Besu 26.7.1 con Corretto 25 y una unidad de
systemd (`besu5550.service`; ver `infra/migracion-cadena/SIETE-VALIDADORES-20-AGO.md`).

```bash
# 1. Copiar el jar al directorio de complementos del tarball (<BESU_HOME>/plugins).
sudo install -o besu -g besu -m 0444 sfsp-filtro-red-0.2.0.jar <BESU_HOME>/plugins/
sha256sum <BESU_HOME>/plugins/sfsp-filtro-red-0.2.0.jar      # = la huella publicada

# 2. Añadir las banderas a ExecStart (la unidad se reescribe entera, no se parchea):
#    --plugin-sfsp-filtro-habilitado=true
#    --plugin-sfsp-filtro-contrato=<dirección de SFSPNetworkPermissions>
#    --plugin-sfsp-filtro-bloque-activacion=<N, EL MISMO en todos los nodos>
#    [--plugin-sfsp-filtro-bloque-fin=<M>]   # sólo para una reversión programada
#    y NINGÚN --rpc-gas-cap por debajo de 100000000 (el valor por omisión sirve)

sudo systemctl daemon-reload && sudo systemctl restart besu5550

# 3. Comprobar en el registro:
journalctl -u besu5550 | grep -E "Registered plugin of type sfsp.red.filtro.FiltroRedPlugin|SFSP filtro de red: (contrato|autoprueba OK)"
```

- **La autoprueba tiene que salir `OK`** en cada nodo antes de pasar al siguiente. Un
  `AUTOPRUEBA FALLIDA` en el arranque es una dirección mal escrita (o un nodo que aún no
  sincronizó el despliegue): se corrige antes de seguir.
- **Si falta el jar**, las banderas `--plugin-sfsp-filtro-*` son desconocidas y
  Besu **no arranca**. Es a propósito: un nodo no puede quedar abierto en silencio
  por olvidar el jar.
- **Con `--config-file` (TOML)**, las claves son las mismas sin los guiones
  iniciales, por ejemplo `plugin-sfsp-filtro-habilitado=true`. Esa forma **no se
  ensayó**: se comprueba en la 5534 antes de usarla.
- **Avisos esperables en el arranque**: `PluginVerifier … is without a catalog` y
  `built against Besu version unknown`. No impiden cargarlo. El resumen tiene que
  decir `TOTAL = 1 of 1 plugins successfully registered`.

## Ensayo

`../ensayo-local/ensayo-besu-local.mjs` levanta Besu 26.7.1 real con este jar en
127.0.0.1 (chainId 1337) y comprueba pool, producción, importación y reversión.
Ver `../RED-CERRADA.md` §6.
