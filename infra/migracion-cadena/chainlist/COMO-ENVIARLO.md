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

## Y además, correr el CI de verdad

`verificar.py` es nuestro. El que decide es el del repositorio, y el bot de
Chainlist lo dice al abrir el pull request: *«sólo miraremos los PR con los que
el CI esté contento»*. Se puede correr entero aquí, y **hay que hacerlo**: el
13-ago así apareció que el símbolo `tORIGEN` tenía siete caracteres y el CI
exige menos de siete. Ninguna comprobación nuestra lo había visto.

```
git clone --depth 1 https://github.com/ethereum-lists/chains.git chains-ci
cp eip155-5534.json eip155-5550.json chains-ci/_data/chains/
cd chains-ci

npx prettier --check '_data/chains/eip155-5534.json'      # 1 · formato
cd tools && npm install && node schemaCheck.js && cd ..    # 2 · esquema
./gradlew run --args="verbose singleChainCheck _data/chains/eip155-5534.json"
./gradlew run                                              # 4 · lista entera
```

La tercera es la importante: **se conecta de verdad** a cada RPC declarado y
falla si contesta otro chainId, y abre el explorador. Necesita Java; tarda unos
dos minutos la primera vez.

Las reglas que aplica están en `processor/.../Main.kt` y `Env.kt`. Las que más
se olvidan: el símbolo de la moneda con **menos de 7 caracteres**, ningún campo
fuera de la lista de obligatorios y opcionales, y los nombres sólo con letras,
números, guión, punto, paréntesis y espacio —nada de acentos ni comas.

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

## La 5550 · en dos pasos

**Paso 1, ahora: reservar el número.** Mismo procedimiento, con
`eip155-5550.json` tal como está en esta carpeta: sin RPC, sin explorador y en
`incubating`. No promete nada que no exista, y deja el 5550 a nuestro nombre.

Título:

```
Add Orden Global (eip155-5550)
```

Cuerpo:

```
Reserves chain ID 5550 for Orden Global, a Besu QBFT chain currently being
migrated from an older network.

Submitted as "incubating" with no RPC and no explorer on purpose: the chain
is not producing blocks yet, and we would rather reserve the ID than publish
endpoints that do not serve it. A follow-up PR will add the RPC and explorer
and flip the status to active once the chain is live.

The testnet is in #8593.
```

**Paso 2, después del corte:** añadir el RPC y el explorador y poner
`"status": "active"`, cuando se cumpla la lista del `README.md`: la cadena
produciendo bloques, un nombre de RPC propio que no apunte a la 8532, y
`ordenscan.com` indexando la 5550.
