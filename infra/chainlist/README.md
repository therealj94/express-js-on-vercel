# Registro de la cadena 8532 en Chainlist

Chainlist se alimenta del repositorio público [`ethereum-lists/chains`]. Registrar
la cadena es abrir un PR ahí con un JSON y un ícono. No hay formulario ni
trámite: lo revisa un mantenedor y un bot valida el formato.

[`ethereum-lists/chains`]: https://github.com/ethereum-lists/chains

## Requisitos técnicos — verificados

| Requisito | Estado |
| --- | --- |
| `eth_chainId` devuelve el chainId declarado | `0x2154` = 8532 |
| `net_version` coincide | `8532` |
| RPC accesible por HTTPS | `https://ordenglobal-rpc.com` |
| RPC con CORS abierto (Chainlist consulta desde el navegador) | `access-control-allow-origin: *` |
| Explorador que cumple EIP-3091 | `ordenscan.com` — `/block/<n>`, `/tx/<hash>`, `/address/<0x…>` responden 200 |

## Lo que falta antes de abrir el PR

### 1. El ícono

Es el único requisito que no se puede resolver desde acá — hace falta el
logotipo. Chainlist pide:

- **PNG cuadrado**, mínimo 512×512
- Fondo transparente preferentemente
- Se sube a `_data/icons/ordenglobal.json` apuntando a un CID de IPFS

El repo exige que la imagen esté en IPFS. El flujo es: subir el PNG a IPFS
(por ejemplo con [web3.storage] o Pinata), tomar el CID, y crear:

```json
{
  "format": "png",
  "width": 512,
  "height": 512,
  "url": "ipfs://<CID>"
}
```

[web3.storage]: https://web3.storage

### 2. Más de un RPC (recomendado, no obligatorio)

Hoy `ordenglobal-rpc.com` apunta a un solo nodo (node1, vía el balanceador
`OrdenKapital`). Si ese nodo cae, Chainlist marca la cadena como no
disponible y hay que pedir revisión de nuevo.

Conviene sumar 2-3 nodos más al balanceador **antes** de registrar. Están
sincronizando; cuando terminen, agregarlos al target group `ordenKapital`.

### 3. Considerar el estado de descentralización

La cadena tiene **un solo validador activo** hoy. No es un requisito formal de
Chainlist, pero registrar una cadena pública con un único punto de falla la
expone: cualquiera puede ver el estado de la red. Conviene tener los
validadores adicionales corriendo antes.

## Cómo abrir el PR

1. Fork de `ethereum-lists/chains`
2. Copiar `eip155-8532.json` a `_data/chains/eip155-8532.json`
3. Crear `_data/icons/ordenglobal.json` con el CID del ícono
4. PR con título `Add Orden Global (8532)`

El bot valida el formato y que el RPC responda. Si el RPC está caído en ese
momento, el PR se rechaza.

## El archivo

`eip155-8532.json` de esta carpeta es el JSON listo para copiar. Los valores
se tomaron de la cadena en vivo, no de memoria.
