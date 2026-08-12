# Cómo se envía · paso a paso

Chainlist se alimenta del repositorio `ethereum-lists/chains`. No hay
formulario: se abre un pull request con un archivo.

**Antes de empezar, siempre:**

```
python3 verificar.py eip155-5534.json
```

Si no sale «Listo para enviar», no se sigue. Cada falla es un motivo por el que
el pull request se cierra —o algo peor, como publicar un RPC que sirve otra
cadena.

## Los cinco pasos

1. Entrar a <https://github.com/ethereum-lists/chains> y pulsar **Fork**.
2. En el fork, ir a `_data/chains/` y **Add file → Create new file**.
3. Nombre exacto: `eip155-5534.json`. Contenido: el de `eip155-5534.json` de
   esta carpeta, tal cual.
4. **Commit** en una rama nueva y abrir el pull request contra `master`.
5. Esperar. La revisión es humana y no tiene plazo fijo; suelen tardar de días
   a un par de semanas. Cuando entra, aparece sola en chainlist.org y en
   MetaMask.

## Qué poner en el pull request

Título:

```
Add Orden Global Testnet (eip155-5534)
```

Cuerpo (en inglés, que es el idioma del repositorio):

```
Adds the Orden Global testnet, chain ID 5534.

- Besu QBFT, 4 validators, 10s block period.
- RPC: two independent endpoints, both HTTPS, both answering eth_chainId 0x159e.
  The load-balanced one only serves nodes that pass Besu's /readiness check.
- Explorer: EIP-3091 routes (/tx, /address, /block) all live.
- No faucet yet, so the list is empty rather than pointing at something
  that does not exist.
- slip44 1, as is the convention for testnets.
```

## Lo que van a comprobar, y ya está comprobado

| Lo que mira el revisor | Estado |
|---|---|
| El archivo se llama `eip155-<chainId>.json` | sí |
| `chainId` y `networkId` iguales | sí |
| El chainId no está tomado | libre entre las 2.689 publicadas |
| `shortName` y `name` no chocan | `ogb-test` y `Orden Global Testnet`, libres |
| Los RPC responden el chainId declarado | los dos |
| Los RPC son HTTPS y sin barra final | sí |
| El explorador existe y cumple EIP-3091 | sí |
| Los grifos que declara, abren | no declara ninguno |

## Cuando toque la 5550

El mismo procedimiento, pero **no antes** de que se cumpla la lista del
`README.md` de esta carpeta: la cadena produciendo bloques, un nombre de RPC
propio que no apunte a la 8532, `ordenscan.com` indexando la 5550, y
`"status": "active"` en vez de `"incubating"`.
