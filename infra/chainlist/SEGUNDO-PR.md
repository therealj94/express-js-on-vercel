# El segundo PR a Chainlist — de reserva a registro funcional

## Dónde estamos (verificado el 19-ago-2026)

El PR **#8594 está fusionado**: la cadena 5550 «Orden Global» figura en la lista
oficial, entre 2.714 cadenas. Se comprueba en tres sitios, sin depender de leer
la página de un PR:

- `https://chainid.network/chains.json` — el archivo que consumen las billeteras
- `https://raw.githubusercontent.com/ethereum-lists/chains/master/_data/chains/eip155-5550.json` — responde 200, o sea que está en `master`
- `https://chainlist.org/chain/5550` — página propia, título «Orden Global RPC and Chain settings»

El PR **#8593** (testnet 5534) **no** está fusionado: la 5534 no figura en la
lista publicada.

## El problema del registro tal como está

```json
"rpc": [],  "status": "incubating"
```

Chainlist enseña la cadena pero **no deja conectarse**: sin RPC, «Add to
MetaMask» no tiene a dónde apuntar. Salió así porque era una **reserva** del
chainId — que era el plan y funcionó: nadie más puede tomar el 5550.

## Lo que este PR cambia

| Campo | Antes | Después |
| --- | --- | --- |
| `rpc` | `[]` | los dos endpoints en HTTPS |
| `explorers` | no estaba | ordenscan, EIP3091 |
| `status` | `incubating` | **se queda en `incubating`** |

`status` NO se toca a propósito. La cadena corre hoy con **un solo validador**,
y anunciarla como activa en el directorio principal de billeteras publicita ese
punto único de falla. Los RPC entran igual —que es el 90% del valor: quien
encuentre la cadena ya puede conectarse—. Pasar a activa es cambiar una línea el
día que los otros validadores estén arriba.

## SON DOS COMPROBACIONES, NO UNA

Se corrió el procesador de Kotlin y se dio por bueno. **El PR #8612 salió en
rojo igual**: el repositorio tiene además un `prettier_check` que valida el
FORMATO del JSON, y ese no se había mirado.

```
npx prettier --check '_data/*/*.json'
```

Lo único que objetaba: el array `rpc` escrito en varias líneas. Prettier lo
quiere en una sola porque cabe dentro del ancho.

```
-  "rpc": [
-    "https://ordenglobal-rpc.com",
-    "https://rpc.ordenglobal-rpc.com"
-  ],
+  "rpc": ["https://ordenglobal-rpc.com", "https://rpc.ordenglobal-rpc.com"],
```

Es exactamente el mismo tipo de error que el `tORIGEN` de agosto: una regla que
nadie mira hasta que el CI la señala, semanas después de hacer la cola. La
diferencia es que esta vez se descubrió en horas y no en semanas.

**Y tampoco son dos: son CUATRO.** Leídas de los flujos de `.github/workflows/`,
no de memoria. Antes de tocar este archivo otra vez se corren las cuatro:

```sh
npx prettier --check '_data/*/*.json'                          # prettier_check.yml
gradle run                                                     # build.yml (completo)
gradle run --args="verbose singleChainCheck _data/chains/eip155-5550.json"   # build.yml (por archivo)
cd tools && npm install && node schemaCheck.js                 # validate_json.yml
```

Estado con el archivo que está hoy en la rama `patch-1` — descargado del fork,
no el de acá:

| Comprobación | Resultado |
| --- | --- |
| prettier | `All matched files use Prettier code style!` — salida 0 |
| build completo | `BUILD SUCCESSFUL` — salida 0 |
| singleChainCheck | `BUILD SUCCESSFUL` — salida 0 |
| schemaCheck | `Schema check completed successfully` — salida 0 |

## El CI REAL del repositorio, corrido acá

No las reglas de memoria: se clonó `ethereum-lists/chains`, se puso este archivo
en `_data/chains/` y se corrió su procesador de Kotlin.

```
BUILD SUCCESSFUL     salida 0
```

Y para que ese «pasó» signifique algo, se comprobó que el CI SÍ falla cuando
debe: con el símbolo puesto en `tORIGEN` —el error exacto del 13-ago— devuelve

```
NativeCurrencySymbolMustHaveLessThan7Chars
BUILD FAILED         salida 1
```

Un CI que aprueba cualquier cosa no prueba nada. Este distingue.

## Comprobado antes de abrir, no después

Esto existe por lo del 13-ago: el símbolo `tORIGEN` tenía siete caracteres y el
CI exige menos de siete. Nadie lo vio, y el PR habría muerto tras semanas de
cola. Ahora se comprueba antes:

| Regla del CI | Resultado |
| --- | --- |
| `symbol` menor de 7 caracteres | `ORIGEN` = 6 ✅ (justo en el límite) |
| `symbol` alfanumérico | ✅ |
| `shortName` en minúsculas/guiones | `ogb` ✅ |
| `chainId` == `networkId` | 5550 == 5550 ✅ |
| RPC por HTTPS o WSS | los dos ✅ |
| Sin claves desconocidas | ✅ |
| URL de explorador sin `/` final | ✅ |

Y lo que comprueban los mantenedores a mano:

| Comprobación | Resultado |
| --- | --- |
| `eth_chainId` de ambos RPC | `0x15ae` = 5550 ✅ |
| `net_version` de ambos RPC | `5550` ✅ |
| `ordenscan.com/block/1` | 200 ✅ |
| `ordenscan.com/tx/0x…` | 200 ✅ |
| `ordenscan.com/address/0x…` | 200 ✅ |

## El ícono: preparado, pendiente de IPFS

`ordenglobal.png` en esta carpeta ya está al formato que pide el repositorio:
**512×512, cuadrado, PNG con transparencia**, recortado a la tinta del logotipo
y con un 6% de aire para que no se corte cuando Chainlist lo mete en un círculo.

Falta subirlo a IPFS y obtener el CID. Ningún servicio acepta subida anónima
—se probaron ipfs.io, web3.storage e Infura—, así que hace falta una cuenta
gratuita en Pinata o web3.storage. Con el CID, el archivo queda:

```json
[ { "url": "ipfs://<CID>", "width": 512, "height": 512, "format": "png" } ]
```

en `_data/icons/ordenglobal.json`, y en la cadena se añade `"icon": "ordenglobal"`.

**El ícono es opcional**: el registro actual pasó el CI sin él. Por eso no
bloquea este PR — va en uno posterior, o en este mismo si el CID llega antes.

Y no hay atajo: se leyó el validador (`processor/.../Main.kt:172`) y exige
`ipfs://` explícitamente, además de descargar los bytes para comprobar las
dimensiones. Un PNG servido desde nuestro propio dominio no le vale.

## Cómo abrirlo sin herramientas

GitHub deja editar un archivo de otro repositorio desde el navegador y hace el
fork solo. Son cinco pasos:

1. Abrir
   `https://github.com/ethereum-lists/chains/edit/master/_data/chains/eip155-5550.json`
2. GitHub avisa que va a crear un fork — aceptar
3. Borrar todo el contenido y pegar el de `eip155-5550.json` de esta carpeta
4. Abajo, en «Commit changes», poner de título:
   `Add RPC endpoints and explorer to Orden Global (eip155-5550)`
5. Elegir «Create a new branch and start a pull request» → **Propose changes**

Como cuerpo del PR:

```
The chain ID 5550 was reserved in #8594 with an empty `rpc` array.
This PR fills it in now that the network is live.

- Two HTTPS RPC endpoints. Both answer `eth_chainId` with `0x15ae` (5550)
  and `net_version` with `5550`.
- Block explorer at ordenscan.com, EIP-3091 compliant: `/block/<n>`,
  `/tx/<hash>` and `/address/<0x...>` all return 200.
- `status` intentionally stays `incubating` until additional validators
  are online.

Verified locally against the repository's own processor: BUILD SUCCESSFUL.
```
