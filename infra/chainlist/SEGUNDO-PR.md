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
