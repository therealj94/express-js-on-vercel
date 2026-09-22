# Compilador de Solidity fijado (P09)

## Qué necesita red y qué no

Ésta es la frase exacta, y reemplaza a la del README que decía «222 pruebas en
verde, sin red ni credenciales» sin matizar:

> En una máquina con las dependencias de desarrollo ya instaladas
> (`node_modules` de `sdk/`, `contracts/`, `indexer/` y `dbnx-api/`) y con el
> binario `contracts/compilador/solc-linux-amd64-v0.8.28+commit.7893614a`
> presente, **compilar los contratos y correr las cuatro suites no necesita red
> ni credenciales**. Sin esas dos cosas sí hace falta red, y sólo para ellas:
> `npm install` en cada paquete, y `node compilador/preparar.mjs` una única vez
> si el binario del compilador no está en el árbol. Ningún paso, en ningún
> momento, necesita credenciales, claves ni un RPC.

Tres precisiones que la frase corta no cabe y que no se omiten:

1. **El binario está vendorizado en este directorio**, no en la caché personal
   del usuario. Si está y su SHA-256 coincide, Hardhat lo usa tal cual y no
   consulta `binaries.soliditylang.org`. Comprobado: con
   `~/.cache/hardhat-nodejs/compilers-v2/` apartado y sin proxy,
   `npx hardhat compile` compila los 17 archivos y **no vuelve a crear la
   caché**, es decir no descarga nada.
2. **`npm install` necesita red** porque `contracts/` depende de Hardhat
   (`2.22.17`) y las tres suites de TypeScript dependen de `typescript` y
   `@types/node`. Eso es instalación, no ejecución: se hace una vez y queda.
   El SDK sigue sin dependencias **de ejecución**, que es una afirmación
   distinta y sigue siendo cierta.
3. **`preparar.mjs` es el único paso del árbol que abre una conexión.** Y ni
   siquiera siempre: primero mira si el binario ya está, después la caché local
   de Hardhat, después una ruta que le pases, y sólo entonces descarga.

## Qué está fijado

| Campo | Valor |
|---|---|
| Versión | `0.8.28` |
| Versión larga | `0.8.28+commit.7893614a` |
| Plataforma | `linux-amd64` |
| SHA-256 | `9a0fb7e0db2c0641dbae1c5cc645dc686820c83af516226abb1c0a2f76636f25` |
| Tamaño | 15 708 640 bytes |
| Origen | `https://binaries.soliditylang.org/linux-amd64/solc-linux-amd64-v0.8.28+commit.7893614a` |

La huella no la inventamos: es el campo `sha256` de la entrada `0.8.28` del
`list.json` que publica soliditylang.org, y coincide byte a byte con el binario
guardado aquí.

`compilador.json` es la **única** fuente de esa versión. `hardhat.config.js` la
lee de ahí; no la escribe a mano. Cambiar de compilador es cambiar ese archivo,
con la huella nueva comprobada contra la lista oficial, y volver a correr las 74
pruebas.

## Por qué existía el problema

El árbol fijaba el *número* de versión y nada más. Un número de versión no es un
compilador: el binario que Hardhat descargaba la primera vez quedaba en la caché
personal de quien compilara, sin huella comprobada y sin forma de saber, meses
después, si el que produjo los artefactos era ése. El auditor lo anotó como «sin
cubrir 4» y observó además que el lockfile menciona `solc` 0.8.26 mientras la
configuración pide 0.8.28.

Esa mención **no es una contradicción**: `solc` 0.8.26 es una dependencia interna
del propio Hardhat (su solcjs, que usa para sus utilidades), no el compilador que
compila `src/`. Los contratos de SFSP se compilan con el binario nativo 0.8.28
fijado aquí, y `artifacts/build-info/*.json` lo registra como
`"solcLongVersion": "0.8.28+commit.7893614a"`. Es comprobable y el comprobador lo
comprueba.

## Cómo se comprueba

```
npm run comprobar:compilador      # en sfsp/contracts
```

`comprobar-compilador.mjs` falla, con código y detalle, si:

| Código | Qué pasó |
|---|---|
| `CONFIG_CON_VERSION_PROPIA` | `hardhat.config.js` escribe a mano una versión distinta de la fijada |
| `CONFIG_NO_LEE_EL_FIJADO` | la configuración dejó de leer `compilador.json`, así que podría divergir |
| `COMPILADOR_AUSENTE` | falta el binario: compilar necesitaría red o la caché personal |
| `HUELLA_DISTINTA` | hay un binario, pero no es el fijado |
| `VERSION_DECLARADA_DISTINTA` | el binario se identifica como otra versión |
| `COMPILADOR_NO_EJECUTABLE` | el binario no corre en esta máquina |
| `ARTEFACTO_DE_OTRO_COMPILADOR` | hay artefactos en `artifacts/build-info/` compilados con otro solc |

No corre sólo a mano: `package.json` lo engancha en `pretest` y `prebuild`, así
que **la suite de contratos no arranca si el compilador no es el fijado**. Un
resultado obtenido con otro compilador no es el resultado de esta suite.

Y en segunda línea de defensa, `hardhat.config.js` vuelve a comprobar el SHA-256
justo antes de cada compilación: si no cuadra, `hardhat compile` aborta. Lo
comprobamos añadiéndole un byte al binario: el comprobador devuelve
`HUELLA_DISTINTA` con salida 1 y la compilación falla.

## Nota sobre el tamaño

El binario pesa 15,7 MB. Vendorizarlo es un coste real en el repositorio y una
decisión consciente: la alternativa era depender de una descarga y de una caché
que nadie audita. Si se decide no versionarlo, `preparar.mjs` lo reconstruye en
un paso y `comprobar-compilador.mjs` sigue fallando mientras falte — lo que no
se admite es la situación anterior, en la que faltaba y nadie lo notaba.

---

## Por qué el binario no está versionado

Pesa 15,7 MB y en git quedaría para siempre, también en cada clon de cualquiera
que sólo quiera leer la especificación. La integridad no depende de tenerlo
aquí: depende de la huella SHA-256 fijada en `compilador.json`, que se comprueba
antes de cada compilación y aborta si no cuadra.

Quien necesite compilar corre una vez:

```bash
node contracts/compilador/preparar.mjs
```

Ése es el único paso de todo el árbol que necesita red y no es `npm install`.
Si el binario falta o no es el fijado, la suite de contratos no arranca.
