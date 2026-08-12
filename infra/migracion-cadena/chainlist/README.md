# Chainlist · qué se envía, qué no, y por qué

Chainlist no es un directorio: es `ethereum-lists/chains`, un repositorio de
GitHub. Se envía un pull request con **un archivo** en `_data/chains/`, llamado
`eip155-<chainId>.json`. Un humano lo revisa, y lo primero que hace es abrir las
direcciones que el archivo promete.

**La regla de esta carpeta: no se abre el pull request si `verificar.py` no sale
en verde.**

```
python3 verificar.py eip155-5534.json
```

## Estado hoy · 12-ago-2026

| | 5534 (pruebas) | 5550 (producción) |
|---|---|---|
| chainId libre en la lista publicada | sí | sí |
| shortName libre | sí (`ogb-test`) | sí (`ogb`) |
| RPC que responde el chainId correcto | **sí** | **no existe todavía** |
| Explorador con rutas EIP-3091 | sí | sí |
| `verificar.py` | **verde** | rojo, a propósito |

**La 5534 se puede enviar hoy.** La 5550 no, y no debe intentarse hasta que la
cadena exista.

## Lo que este archivo arregló

Lo que había aquí antes prometía tres cosas. Dos eran falsas.

1. **`https://faucet-testnet.ordenglobal.org` no existe.** Nunca se levantó.
   Un revisor abre eso, no carga, y cierra el pull request. **Quitado**: la
   lista de grifos va vacía, que es la verdad.

2. **`https://rpc-testnet.ordenglobal-rpc.com` contesta bloque 0 la mitad de
   las veces.** Es el nombre del balanceador, y detrás tiene dos máquinas: una
   sincronizada y otra que no. `verificar.py` preguntó seis veces y **tres
   contestaron altura 0**.

   Esto es peor que un pull request rechazado. Una billetera que caiga en el
   nodo vacío ve saldo cero y nonce cero: cree que la cuenta no tiene nada, y
   si aun así firma, firma con un nonce ya usado. **Quitado de la lista** hasta
   que el segundo nodo del balanceador esté sincronizado o fuera del grupo.
   Mientras tanto se publica `pruebas.ordenglobal-rpc.com`, que es una sola
   máquina y contesta la altura correcta en las seis llamadas.

3. **`rpc.ordenglobal-rpc.com` sirve la cadena 8532, no la 5550.** Ese nombre
   apunta al balanceador de la cadena vieja. Si se publicara como RPC de la
   5550, una billetera configurada para 5550 firmaría contra 8532. Por eso el
   archivo de la 5550 declara `rpc5550.ordenglobal-rpc.com`, un nombre que
   **todavía no existe** y que hay que crear apuntando a la cadena nueva.

## Lo que hay que hacer antes de enviar la 5550

1. La 5550 tiene que estar produciendo bloques con sus cuatro validadores.
2. Crear `rpc5550.ordenglobal-rpc.com` con TLS, apuntando **sólo** a nodos de
   la 5550, y comprobar que ningún nodo detrás contesta altura 0.
3. `ordenscan.com` tiene que estar indexando la 5550 (hoy indexa la vieja).
4. Cambiar `"status": "incubating"` por `"active"`.
5. Correr `verificar.py eip155-5550.json` y que salga en verde.

## Detalles de forma que el revisor mira

- El nombre del archivo tiene que ser exactamente `eip155-<chainId>.json`.
- `chainId` y `networkId` iguales.
- RPC en `https://` o `wss://`, sin barra final.
- Las direcciones de explorador, sin barra final, y con `/tx/<hash>`,
  `/address/<dir>` y `/block/<n>` funcionando: eso es EIP-3091.
- `slip44: 1` es la convención para redes de prueba. La 5534 lo lleva.
- `shortName` corto y único. `ordenglobal-testnet` era largo para el estilo del
  repositorio; se cambió a `ogb-test`.
- El símbolo de la moneda de pruebas es **`tORIGEN`**, distinto a propósito del
  `ORIGEN` de producción: en MetaMask las dos redes se ven una al lado de la
  otra y confundirlas es el error caro.

`verificar.py` comprueba todo lo de esta lista y además abre cada dirección.
