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
| RPC que responde el chainId correcto | **sí, dos** | **no existe todavía** |
| Explorador con rutas EIP-3091 | sí | sí |
| `verificar.py` | **verde** | **verde**, como `incubating` |

**Las dos se pueden enviar hoy**, pero no dicen lo mismo. La 5534 se registra
entera, con RPC y explorador. La 5550 se registra **vacía y en estado
`incubating`**: reserva el número y no promete nada.

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
   si aun así firma, firma con un nonce ya usado.

   **Arreglado el mismo día.** La causa de fondo era el chequeo de salud del
   balanceador: usaba `/liveness`, que sólo dice que el proceso vive, así que
   un nodo en el bloque 0 figuraba como sano. Besu tiene `/readiness`, que
   además mira peers y sincronía —medido: 200 en el nodo bueno, **503** en el
   vacío—. El grupo pasó a `/readiness?minPeers=1&maxBlocksBehind=5`, y el
   segundo nodo se sincronizó de verdad. Ahora un nodo atrasado no puede
   servir tráfico aunque alguien lo añada por error. Las dos direcciones están
   en el archivo.

3. **`rpc.ordenglobal-rpc.com` sirve la cadena 8532, no la 5550.** Ese nombre
   apunta al balanceador de la cadena vieja. Si se publicara como RPC de la
   5550, una billetera configurada para 5550 firmaría contra 8532. Por eso el
   archivo de la 5550 declara `rpc5550.ordenglobal-rpc.com`, un nombre que
   **todavía no existe** y que hay que crear apuntando a la cadena nueva.

## Por qué la 5550 se envía vacía, y por qué conviene enviarla ya

Un `chainId` es **primero que llega, primero que se queda**. El propio
repositorio lo dice: no puede haber dos cadenas con el mismo número, *«esto
abriría la puerta a ataques de repetición»*. Hoy el 5550 está libre. El día que
arranquemos la cadena podría no estarlo, y entonces habría que cambiarle el
número a una cadena ya migrada — con las apps, las billeteras y el explorador
ya apuntando.

Registrarla **vacía** quita el único riesgo que tenía hacerlo pronto:

- `"rpc": []` — no hay ninguna dirección que pueda hacer que una billetera
  firme contra la cadena equivocada. Ese era el peligro real:
  `rpc.ordenglobal-rpc.com` sirve hoy la **8532**.
- Sin explorador — `ordenscan.com` indexa hoy la cadena vieja; declararlo como
  explorador de la 5550 enseñaría datos de otra cadena.
- `"status": "incubating"` — el campo existe exactamente para esto. En la lista
  publicada hay **99 cadenas en `incubating`** y **163 sin ningún RPC**, varias
  con las dos cosas: Neura, Neura Devnet, Redbelly Devnet.

Cuando la 5550 esté produciendo bloques se abre un **segundo pull request**
mínimo: añadir el RPC y el explorador, y cambiar `incubating` por `active`.

## Lo que hay que hacer antes de ese segundo envío

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
