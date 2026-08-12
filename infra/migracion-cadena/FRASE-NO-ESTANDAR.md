# La frase de respaldo no sirve en ninguna otra billetera · 12-ago-2026

Salió probando: José importó su frase de Veta Wallet en MetaMask y le apareció
una dirección **vacía**, `0xcB6ab35A…`, sin nada en ninguna de las dos cadenas
y con nonce 0. Su billetera real es `0x746268…`, con 14,80 ONDK, 15,32 AUKA y
1.333,33 HARV.

No fue un error suyo. **Es la app.**

## Qué pasa

Veta Wallet crea la billetera así (`controller/authController.js`):

```js
const mnemonic = bip39.generateMnemonic();
const seed = await bip39.mnemonicToSeed(mnemonic);
const wallet = Wallet.fromPrivateKey(seed.slice(0, 32));
```

Toma los **32 primeros bytes de la semilla** y los usa directamente como llave
privada. Eso no es la derivación estándar. Todo lo demás —MetaMask, Trust,
Ledger, Rabby— usa BIP44, la ruta `m/44'/60'/0'/0/0`.

Comprobado con una frase de ejemplo pública:

| | Dirección |
|---|---|
| Veta Wallet | `0x5F8AD1B918Ac16B21811F034f956e2cc605Eefe6` |
| MetaMask (BIP44) | `0x58A57ed9d8d624cBD12e2C467D34787555bB1b25` |

Misma frase, direcciones distintas.

## Por qué importa

**La frase de respaldo de un usuario no le sirve en ninguna billetera del
mundo excepto Veta Wallet.** Quien la restaure en MetaMask verá una cuenta
vacía y creerá que perdió su dinero. Es la conclusión más razonable que puede
sacar, y es falsa.

Los fondos no están perdidos: siguen ahí, en la dirección que Veta Wallet sabe
calcular. Pero la autonomía que la frase promete no existe. Si mañana la app
desapareciera, esas doce palabras no bastarían para recuperar nada sin saber
además que hay que aplicar una derivación fuera de norma.

Y hay una frase concreta que hoy se le dice al usuario que no se sostiene. Al
borrar la cuenta, el backend responde:

> «Tus fondos siguen siendo recuperables con tu frase de respaldo.»

Con la frase y **ninguna otra herramienta que Veta Wallet**, que en ese momento
el usuario acaba de abandonar.

## Lo que NO es

No es un agujero de seguridad: la llave no es débil ni predecible. Los 32
primeros bytes de una semilla BIP39 son igual de aleatorios que cualquier otra
llave. El problema es de **portabilidad y de promesa**, no de fuerza.

Tampoco está nadie en riesgo ahora mismo. Es un problema que aparece el día que
alguien intenta salirse, que es justo el día en que más confianza hace falta.

## Qué hacer

**Para probar hoy**, y es lo que desbloquea a José: usar la **llave privada**,
no la frase. La app la muestra en Ajustes y el backend la sirve en
`/users/decriptPrivate`. Esa llave sí importa correctamente en MetaMask y da
la dirección de siempre.

**Para arreglarlo de verdad** hay dos caminos, y ninguno es gratis:

1. **Pasar a BIP44 las billeteras nuevas.** Fácil de escribir, y deja el
   ecosistema partido en dos: las cuentas viejas siguen sin ser portables.
2. **Migrar las existentes**: derivar la dirección BIP44 de cada frase, mover
   los fondos a la nueva y avisar. Es una operación con fondos de usuarios;
   va con la Junta, no se decide aquí.

Mientras tanto, lo mínimo honesto es **dejar de decirle al usuario que su frase
lo hace autónomo**, porque hoy no es cierto — o decirle junto a la frase que
solo funciona dentro de Veta Wallet.

## Cómo se comprobó

Con `bip39` + `ethers`, una frase de ejemplo pública y las dos derivaciones en
paralelo. No se tocó ninguna frase ni ninguna llave de nadie: el mecanismo se
demuestra con una frase inventada, y con eso basta.
