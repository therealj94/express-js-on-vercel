# Rotación de `PASS_ADM` en Veta Wallet

`PASS_ADM` es la clave con la que se cifran la **llave privada** y la **frase
semilla** de cada usuario. Esos dos datos son lo único que permite mover los
fondos de una cuenta: no hay otra copia en ningún lado.

La clave tenía **7 caracteres**. Siete caracteres se rompen por fuerza bruta en
un rato con una tarjeta gráfica cualquiera, así que quien consiguiera un volcado
de la colección `users` podía vaciar las 403 cuentas. Ese es el problema que
resuelve esta migración.

## Por qué no se cambia de golpe

Cambiar la variable y recifrar todo en un solo paso tiene dos formas de salir
mal, y las dos son irreversibles:

- Si la recifrado se corta a la mitad, la mitad de los registros queda en una
  clave y la aplicación configurada con la otra. Esos usuarios pierden el acceso
  a sus fondos.
- Si alguien se registra mientras corre, su registro nace con una clave y se lee
  con otra.

Por eso va en tres etapas.

## Las tres etapas

### Etapa 1 — la aplicación entiende las dos claves *(hecha y desplegada)*

`cripto.js` es el módulo que se desplegó como `lib/cripto.js`. Cifra siempre con
`PASS_ADM_NUEVA` y, al descifrar, prueba primero la nueva y cae a `PASS_ADM` si
hace falta. Con eso los registros viejos y los nuevos conviven: no hace falta
ventana de mantenimiento, no hay carrera con los registros que se creen mientras
tanto, y una migración interrumpida no rompe nada.

Las siete llamadas que antes usaban `process.env.PASS_ADM` a mano pasaron a este
módulo: `authController` (1 cifrado), `userController` (2 descifrados),
`swapController` (1) y `transactionController` (2).

`PASS_ADM` **se dejó puesta a propósito**. Es la vuelta atrás.

#### La verificación por formato, y por qué hace falta

Descifrar con la clave equivocada normalmente falla, pero no está garantizado:
con baja probabilidad puede devolver basura que parezca válida. Si eso pasara al
probar la clave nueva, se devolvería basura en vez de caer a la vieja.

Se evita comprobando la forma de lo que sale. Ambos datos tienen un formato
estricto, y se verificó contra los 403 registros reales que **todos** lo
cumplen: 402 llaves privadas con `0x` + 64 hexadecimales, y 402 semillas de
exactamente 12 palabras en minúsculas.

### Etapa 2 — recifrar los registros *(lista, sin ejecutar)*

`migrar.js`. Arranca en simulacro; solo escribe con `MIGRAR=si`.

Lo que protege cada cosa:

1. **Simulacro por defecto.** Recorre los 403 registros, hace todas las
   comprobaciones y no toca la base.
2. **Respaldo en el propio documento.** Antes de sobrescribir guarda el cifrado
   original en `privateKeyRespaldo` / `seedRespaldo`. Nunca pisa un respaldo que
   ya exista, así que correrlo dos veces no destruye la vuelta atrás.
3. **Ida y vuelta antes de escribir.** Descifra con la vieja, valida el formato,
   cifra con la nueva, vuelve a descifrar lo que acaba de cifrar y compara con
   el original. Si algo no cuadra, ese registro se salta y queda como estaba.
4. **Un documento nunca queda a medias.** Los dos campos se escriben en una sola
   operación.
5. **Relectura desde la base.** Después de escribir vuelve a leer el documento y
   comprueba que descifra al mismo texto. Si no, lo restaura del respaldo en el
   acto.
6. **Idempotente.** Los registros que ya están en la clave nueva se saltan.
7. **No toca lo que ya estaba roto.** Ver más abajo.

Nada del texto en claro se imprime nunca.

### Etapa 3 — quitar la clave vieja

Solo cuando `verificar.js` informe `conVieja: 0`. Recién ahí se borra `PASS_ADM`
de la configuración y se puede quitar la rama de respaldo del módulo.

## Los 2 campos rotos

De los 806 campos cifrados, **804 se descifran bien y 2 no**, los del usuario
`0x00646bd8c7455c7cc64a4ff74f39fd1825042055`. Están rotos **desde antes** de
cualquier migración: no se descifran ni con la clave actual. La migración no los
toca ni intenta arreglarlos — solo los lista. Es un problema aparte, anterior, y
merece revisarse por su lado (conviene mirar si esa dirección tiene saldo
on-chain).

## Cómo se corre

Los scripts corren en un **dyno one-off de la propia aplicación**, no desde
acá: MongoDB Atlas solo acepta conexiones desde Heroku. Eso además tiene la
ventaja de que usan el `lib/cripto.js` **real que está desplegado**, no una
copia — si el módulo desplegado tuviera algún problema, sale a la luz antes de
escribir nada.

```sh
export HEROKU_API_KEY=...        # hace falta uno vigente

python3 dyno.py verificar.js     # solo lectura, no escribe nada
python3 dyno.py migrar.js        # simulacro
MIGRAR=si python3 dyno.py migrar.js   # migración de verdad
python3 dyno.py verificar.js     # confirmar conVieja: 0
```

> `dyno.py` manda el script en base64 por una variable de entorno del dyno (para
> que el shell no lo destroce), lo escribe en `/app` — desde `/tmp` Node no
> resuelve los `node_modules` del slug — y lo ejecuta con `babel-node`, que es
> como arranca la aplicación.

## Las pruebas

`pruebas/` ejercita `migrar.js` contra una colección en memoria
(`mongoose-falso.cjs`), sin tocar ninguna base real.

```sh
cd pruebas && npm i crypto-js
mkdir -p node_modules/mongoose && cp mongoose-falso.cjs node_modules/mongoose/index.cjs
# package.json con {"type":"module"} y main: index.cjs en el falso

PASS_ADM=vieja77 PASS_ADM_NUEVA=$(printf 'N%.0s' {1..64}) \
  node migracion.test.js                 # simulacro: nada cambia
MIGRAR=si ... node migracion.test.js     # 20 comprobaciones
MIGRAR=si ... node idempotencia.test.js  # 8 comprobaciones
```

`migracion.test.js` cubre seis casos: tres usuarios normales, uno ya migrado,
uno corrupto de antes, y uno cuya relectura devuelve basura para comprobar que
se restaura solo.

`idempotencia.test.js` corre la migración **dos veces** sobre el mismo registro.
Lo que comprueba de verdad es que la segunda pasada no pise el respaldo con el
cifrado nuevo: si eso pasara, se perdería la única vía de vuelta.

Resultado actual: las dos pasan.

## Estado

| Etapa | Estado |
| --- | --- |
| 1 — doble clave desplegada | hecha, en producción |
| 1 — verificada contra los 403 registros en vivo | **pendiente**, hace falta un token de Heroku vigente |
| 2 — recifrado | script listo y probado, sin ejecutar |
| 3 — quitar `PASS_ADM` | pendiente de la etapa 2 |

Para volver atrás de la etapa 1 basta con desplegar la release anterior, la
**53**. Como `PASS_ADM` sigue puesta y ningún registro se ha recifrado todavía,
la vuelta atrás hoy es inmediata y sin pérdida.
