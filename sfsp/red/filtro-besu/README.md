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
| Devuelve `false`, revierte, no tiene código o falla la simulación | La **rechaza**. A diferencia de la opción contractual retirada, un contrato ausente **no** abre la red. |
| Los servicios de Besu no están disponibles | La rechaza y deja un `ERROR` en el registro. |

Besu consulta a los proveedores en tres sitios (`TransactionValidationParams`,
`checkOnchainPermissions = true`): el **pool**, la **producción** de bloques y la
**importación** de bloques. Por eso el complemento tiene que estar, con la misma
configuración, en **todos** los nodos: los 7 validadores y los nodos RPC.

Hay una caché de respuestas por (cabeza, hash de transacción), de hasta 50.000
entradas. Se vacía en cada bloque nuevo.

## Compilar

Hace falta **JDK 25**, porque los artefactos de Besu 26.7.1 lo exigen, y
**Gradle 8.14** o posterior. El JDK 21 no sirve: Gradle rechaza las dependencias.

```bash
cd sfsp/red/filtro-besu
# Si el JDK 25 no es el de sistema, se indica a Gradle dónde está:
gradle --no-daemon \
  -Porg.gradle.java.installations.paths=/ruta/al/jdk-25 \
  -Porg.gradle.java.installations.auto-download=false \
  clean jar
sha256sum build/libs/sfsp-filtro-red-0.1.0.jar
```

- **Dependencias**: se resuelven de Maven Central y de
  `https://hyperledger.jfrog.io/artifactory/besu-maven/`. Van como `compileOnly`,
  porque Besu ya trae esas clases y el jar no las empaqueta.
- **Salida**: `build/libs/sfsp-filtro-red-0.1.0.jar`, de unos 8 KB. `build/`
  no se versiona.
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
sudo install -o besu -g besu -m 0444 sfsp-filtro-red-0.1.0.jar <BESU_HOME>/plugins/
sha256sum <BESU_HOME>/plugins/sfsp-filtro-red-0.1.0.jar      # = la huella publicada

# 2. Añadir las banderas a ExecStart (la unidad se reescribe entera, no se parchea):
#    --plugin-sfsp-filtro-habilitado=true
#    --plugin-sfsp-filtro-contrato=<dirección de SFSPNetworkPermissions>
#    --plugin-sfsp-filtro-bloque-activacion=<N, EL MISMO en todos los nodos>
#    [--plugin-sfsp-filtro-bloque-fin=<M>]   # sólo para una reversión programada

sudo systemctl daemon-reload && sudo systemctl restart besu5550

# 3. Comprobar en el registro:
journalctl -u besu5550 | grep -E "Registered plugin of type sfsp.red.filtro.FiltroRedPlugin|SFSP filtro de red: contrato"
```

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
