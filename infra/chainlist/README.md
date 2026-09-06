# Registro de la cadena 5550 en Chainlist

Chainlist se alimenta del repositorio público [`ethereum-lists/chains`]. Registrar
la cadena es abrir un PR ahí con un JSON y un ícono. No hay formulario ni
trámite: lo revisa un mantenedor y un bot valida el formato.

[`ethereum-lists/chains`]: https://github.com/ethereum-lists/chains

## Requisitos técnicos — verificados

| Requisito | Estado |
| --- | --- |
| `eth_chainId` devuelve el chainId declarado | `0x15ae` = 5550 |
| `net_version` coincide | `5550` |
| RPC accesible por HTTPS | `https://ordenglobal-rpc.com` |
| RPC con CORS abierto (Chainlist consulta desde el navegador) | responde `access-control-allow-origin` con el origen que pregunta |
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

### 2. Más de un nodo detrás del balanceador

Si el nodo que atiende cae, Chainlist marca la cadena como no disponible y hay
que pedir revisión de nuevo. La red ya tiene 7 nodos corriendo, así que esto es
sumarlos al target group `ordenKapital` — no hay que esperar a nada.

> Nota: el estado del balanceador no se puede comprobar desde el repo, hace
> falta una credencial de AWS. Lo único verificado desde afuera es que el
> dominio público responde.

### ~~3. Considerar el estado de descentralización~~ — resuelto

Era el bloqueo de fondo: registrar una cadena pública con un único validador la
exponía. Ya no aplica. `qbft_getValidatorsByBlockNumber` devuelve **7
direcciones** y se comprobó que las siete proponen bloques por turnos. La red
tolera 2 validadores caídos sin detenerse.

## Cómo abrir el PR

1. Fork de `ethereum-lists/chains`
2. Copiar `eip155-5550.json` a `_data/chains/eip155-5550.json`
3. Crear `_data/icons/ordenglobal.json` con el CID del ícono
4. PR con título `Add Orden Global (5550)`

El bot valida el formato y que el RPC responda. Si el RPC está caído en ese
momento, el PR se rechaza.

## El archivo

`eip155-5550.json` de esta carpeta es el JSON listo para copiar. Los valores
se tomaron de la cadena en vivo, no de memoria.

El archivo se llamaba `eip155-8532.json` y declaraba la cadena vieja. La
migración a Besu cambió el identificador a **5550**: mandar el archivo anterior
habría registrado en Chainlist una cadena que ya no existe.
