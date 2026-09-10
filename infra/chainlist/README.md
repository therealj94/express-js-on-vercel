# Orden Global en Chainlist — estado del registro

Chainlist se alimenta del repositorio público [`ethereum-lists/chains`]. Registrar
una cadena es abrir un PR ahí con un JSON y un ícono; lo revisa un mantenedor y
un bot valida el formato.

[`ethereum-lists/chains`]: https://github.com/ethereum-lists/chains

## Resumen: no queda nada pendiente

**La cadena 5550 está registrada, completa y publicada.** Los tres PR que
abrimos están fusionados y el cuarto trámite —el ícono— también entró.

| PR | Qué hizo | Fusionado |
| --- | --- | --- |
| [#8594] | Reserva del chainId 5550, sin RPC, `incubating` | 15-ago-2026 |
| [#8612] | RPC, explorador y el ícono en IPFS | 19-ago-2026 |
| [#8613] | `status` → `active` | 20-ago-2026 |

[#8594]: https://github.com/ethereum-lists/chains/pull/8594
[#8612]: https://github.com/ethereum-lists/chains/pull/8612
[#8613]: https://github.com/ethereum-lists/chains/pull/8613

Los tres los abrió la cuenta `therealj94`, y los tres los fusionó un mantenedor
(`ligi`). No hay ninguno esperando respuesta.

## Comprobado el 22-ago-2026, no recordado

El estado no se lee de la página de un PR —que puede quedar desactualizada— sino
de lo que consumen las billeteras:

| Comprobación | Resultado |
| --- | --- |
| `raw.githubusercontent…/_data/chains/eip155-5550.json` | 200 — está en `master` |
| `raw.githubusercontent…/_data/icons/ordenglobal.json` | 200 — el ícono también |
| `chainid.network/chains.json` | la 5550 figura, entre 2.717 cadenas |
| El ícono en IPFS se descarga | 200, PNG 512×512 RGBA |
| Y es el nuestro | mismo SHA-256 que `ordenglobal.png` de esta carpeta |

Y la cadena que está detrás de esos datos, medida el mismo día:

| Medición | Resultado |
| --- | --- |
| `eth_chainId` en ambos RPC | `0x15ae` = 5550 |
| Altura | 63.660 |
| Antigüedad del último bloque | 8 segundos |
| Pares (`net_peerCount`) | 6 |
| Validadores en el conjunto QBFT | **7** |
| Validadores que firmaron en los últimos 40 bloques | **7 de 7** |
| Intervalo entre bloques | 10 s exactos, mínimo y máximo |

## Sobre el `status: active`

El plan escrito en `SEGUNDO-PR.md` era dejarlo en `incubating` a propósito,
porque en su momento la cadena corría con **un solo validador** y anunciarla como
activa publicitaba ese punto único de falla. El PR #8613 lo pasó a `active` el
20-ago.

**Hoy ese cambio es correcto, y se comprueba arriba**: no hay un validador, hay
siete, y los siete firman por turnos. La reserva que motivaba el `incubating` ya
no aplica. Se deja anotado porque la decisión y el resultado se tomaron en
momentos distintos, y el papel decía una cosa mientras la cadena hacía otra.

## La cadena 8532: NO registrar

`eip155-8532.json` de esta carpeta **está preparado pero no se abrió nunca**, y
no debe abrirse. La 8532 es la cadena vieja, en retirada, y su nombre RPC
`ordenglobal-rpc.com` **hoy sirve la 5550** — o sea que ese JSON declara un
endpoint que responde con otro chainId. Registrarlo publicaría datos falsos y el
propio CI del repositorio podría rechazarlo.

Queda como referencia histórica. El destino de la 8532 es una decisión pendiente
de la Junta, y hasta que se tome, este archivo no se toca ni se envía.

## La testnet 5534: abandonada

El PR **#8593** (testnet 5534) nunca se fusionó, y la rama del #8613 lleva un
commit «Remove dead testnet entry». Se comprobó: `eip155-5534.json` devuelve 404
en `master`. No hay nada que perseguir ahí.

## Si algún día hay que tocar el registro

Son **cuatro** comprobaciones, no una. Están leídas de `.github/workflows/` del
repositorio, y se corren todas antes de enviar nada:

```sh
npx prettier --check '_data/*/*.json'                                        # prettier_check.yml
gradle run                                                                   # build.yml (completo)
gradle run --args="verbose singleChainCheck _data/chains/eip155-5550.json"   # build.yml (por archivo)
cd tools && npm install && node schemaCheck.js                               # validate_json.yml
```

El #8612 salió en rojo la primera vez por saltarse `prettier`: el array `rpc`
iba en varias líneas y prettier lo quiere en una sola porque cabe. El detalle
está en `SEGUNDO-PR.md`.

## Los archivos de esta carpeta

| Archivo | Qué es |
| --- | --- |
| `eip155-5550.json` | copia exacta de lo que está hoy en `master` |
| `eip155-5550-active.json` | el borrador que se usó para el #8613; ya fusionado |
| `eip155-8532.json` | preparado y **no enviado** — ver arriba |
| `ordenglobal-icon.json` | el JSON del ícono, con el CID de IPFS |
| `ordenglobal.png` | el ícono, 512×512 |
