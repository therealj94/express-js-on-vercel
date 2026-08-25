# Plan de reinicio de la 5550 · consolidar el ORIGEN en el tesoro

**Escrito el 25 de agosto de 2026. No ejecutado.** Este documento se escribe
ANTES de tocar nada, por pedido expreso: primero el plan, después la mano.

---

## Por qué se hace

Hay **17.401,93 ORIGEN fuera del tesoro** y ninguna vía de transacción para
traerlos. Se investigó a fondo antes de proponer esto:

| Dónde está | ORIGEN | Por qué no sale por transacción |
|---|---|---|
| Pool AUKA/WORIGEN `0xd3790bfd…` | 16.259,23 | Retirarlo exige las 31 posiciones de liquidez, todas de `0x3063a26b…`, y **su llave no aparece** |
| Contrato `0xa2218053…` | 839,17 | 12 KB de código, no es un pool V3; sin leerlo no se sabe si tiene salida |
| 12 tenedores de WORIGEN | 128,53 | Haría falta la llave de cada uno |
| 155 billeteras semilla | 173,93 | Ídem, y ese 1 ORIGEN es su gas |
| Validadores (comisiones) | ~1,07 | Cobrado legítimamente, se queda |

La llave de `0x3063a26b…` se buscó en AWS Secrets Manager (vacío), en Parameter
Store (sólo llaves de validador), en `/root /opt /srv /home` de node1 y node7
(ningún keystore, ningún `.env`) y en el repositorio (sólo datos, nunca llaves).
No está en la infraestructura, que es lo correcto — pero significa que la tiene
una persona o no la tiene nadie.

**Y la posición es de prueba.** Con eso decidido, reescribir el estado es más
barato que perseguir llaves que quizá no existan.

## Por qué AHORA y no dentro de seis meses

La 5550 tiene **cero transacciones** en los últimos dos mil bloques y **una
sola** en toda su vida: la transferencia de 20 ORIGEN del bloque 14.955. El
precio de reiniciar hoy es esa transferencia y reindexar un explorador.

Con gente moviendo dinero de verdad, este mismo plan sería impensable. La
ventana está abierta y se cierra sola.

---

## Qué NO se afecta

Comprobado, no supuesto:

- **Chainlist.** Los tres PR están fusionados (#8594, #8612, #8613) y el JSON
  publicado lleva `chainId`, `networkId`, las URLs de RPC, ORIGEN con sus 18
  decimales, el ícono y el explorador. **No lleva hash de génesis ni datos de
  bloques.** Conservando el 5550 y las mismas URLs, la entrada sigue siendo
  correcta y no hay que abrir ningún PR.
- **Las direcciones de los contratos**, que viajan en el `alloc` del génesis
  nuevo.
- **Los saldos de los tokens** ERC-20.
- **Las llaves de validador** — las cuatro de Parameter Store siguen sirviendo.
- **Las aplicaciones**: wallet, Ordenex y la app apuntan al mismo RPC.
- **Nada del código fija el hash del génesis ni una altura de arranque.** Se
  buscó en `infra/`, `apps-web/` y `orden-global-app/src`: cero coincidencias.

## Qué SÍ se rompe, y cómo se atiende

| Se rompe | Cómo se atiende |
|---|---|
| Besu no arranca con datos viejos | Vaciar el directorio de datos de **los siete**. Uno mal borrado no entra al consenso |
| Ordenscan sirve 91.000 bloques fantasma | Vaciar su base y reindexar desde cero **antes** de levantar el mantenimiento |
| MetaMask guarda el nonce | Quien la haya usado con la 5550 debe hacer «borrar datos de actividad». A los usuarios de la app no les pasa: el backend lee el nonce de la cadena en cada envío |
| Comprobantes de pago del chat | PULSE2CHAT guarda el hash en el mensaje tipo `pago`. Esos enlaces quedan muertos. Hoy son muy pocos |
| Se pierden 91.000 bloques | En la práctica: una transferencia de 20 ORIGEN y unos gastos de gas |

---

## El génesis nuevo

Se construye **sobre la foto del estado de hoy**, no sobre el génesis viejo: hay
que conservar lo que pasó en estos diez días.

### Lo que cambia

1. **Se consolidan en el tesoro** `0x3d5510e5…` los saldos nativos de:
   - el pool `0xd3790bfd…` (16.259,23)
   - el contrato `0xa2218053…` (839,17)
   - los 12 tenedores de WORIGEN (128,53)
2. **El wrapper `0xccbe0c66…` queda a cero de ORIGEN, y su `storage` de saldos
   también.** Esto es lo delicado: dejarlo con WORIGEN emitido y sin respaldo
   lo vuelve insolvente, que es exactamente lo que el corte anterior se cuidó de
   no hacer. Se vacían **las dos cosas a la vez o ninguna**.
3. **El pool queda sin liquidez.** Con ello desaparece el mercado AUKA/WORIGEN.
   Es la consecuencia buscada — la posición era de prueba.

### Lo que NO cambia

- Las tres asignaciones preservadas de 250.000 millones. No se tocan: mover el
  tesoro exige instrucción escrita de la Junta, y esto no lo es.
- El 1 ORIGEN de gas de las 155 billeteras. Quitárselo las congela y no
  recupera nada que importe: son 173,93 en total.
- Los saldos de todos los tokens ERC-20.
- El chainId, el networkId, el gasLimit y el precio del gas.

### La suma tiene que cuadrar

Antes y después, el total de ORIGEN de la cadena debe ser **idéntico al último
decimal**. Si no cuadra, el génesis está mal y no se despliega. Esta
comprobación no es opcional y no se hace «a ojo»: la hace un guion.

---

## El procedimiento

### Etapa 0 · El respaldo, antes de nada

- Copia del génesis actual `/opt/og5550-real/genesis.json` fuera de las
  máquinas.
- **Volcado del estado completo** de la cadena viva a la altura del corte, con
  su huella.
- Copia de la base de Ordenscan.

> Sin la etapa 0 no hay vuelta atrás. Es la única etapa que no se puede
> improvisar después.

### Etapa 1 · Construir y JUZGAR el génesis nuevo

- `construir-genesis-desde-arbol.py` sobre la foto, con los cambios de arriba.
- `comparar-cadenas.py` entre la foto y el génesis nuevo. Tiene que salir
  idéntico salvo en las direcciones que se consolidan a propósito.
- Comprobar a mano las tres cosas que no perdonan: la suma total de ORIGEN, que
  el wrapper esté a cero por los dos lados, y que las tres preservadas sigan
  con sus 250.000 millones exactos.

### Etapa 2 · El ensayo, en una máquina aparte

Levantar una cadena con ese génesis en la instancia de ensayo —`ogb-testnet-2`
o `-3`, que ya existen— y contra ella:

- leer el saldo del tesoro y comprobar que subió los 17.226,93 esperados;
- comprobar que los cinco contratos ERC-20 siguen respondiendo su emisión;
- **apuntar la wallet de ensayo a esa cadena** y hacer un envío de verdad.

Si el ensayo no pasa, se para aquí y no se ha tocado producción.

### Etapa 3 · El corte

De noche, y en este orden:

1. **Mantenimiento**: backend de la wallet en pausa.
2. **Foto final** y su huella al acta.
3. **Parar los siete nodos.**
4. **Vaciar el directorio de datos de los siete.** Comprobar uno por uno que
   quedó vacío — un nodo con datos viejos no entra y no lo dice claro.
5. Distribuir el génesis nuevo a los siete. Comprobar la **huella md5 en cada
   uno**: un archivo distinto en un nodo es una cadena que no arranca.
6. Arrancar los validadores. Esperar a que produzcan bloques.
7. **Comprobar desde fuera**: altura subiendo, siete validadores, saldo del
   tesoro correcto, los contratos responden.
8. Vaciar y reindexar Ordenscan.
9. Levantar el mantenimiento.

### Etapa 4 · Después

- Aviso a quien haya usado MetaMask: borrar datos de actividad.
- Actualizar el informe de las cadenas con las cifras nuevas.
- **Chainlist: nada que hacer.** Queda dicho aquí para que nadie abra un PR por
  las dudas.

---

## Vuelta atrás

Hasta la etapa 3 paso 4, se aborta sin consecuencias: no se ha tocado nada.

Después del paso 4, la vuelta atrás es **restaurar el génesis viejo y el volcado
del estado** de la etapa 0 en los siete nodos. La historia posterior al corte se
pierde — por eso el corte va de noche y por eso el backend está en
mantenimiento.

**No hay vuelta atrás sin la etapa 0.** Si el respaldo no está hecho y
comprobado, el corte no empieza.

---

## Las dos lecciones del corte anterior, que aquí se aplican

Del `PLAN-ARRANQUE.md`, y valen su peso:

**Un respaldo que no se comprueba no es un respaldo.** La primera extracción de
las llaves de validador las truncaba a 62 caracteres y nadie lo habría sabido
hasta necesitarlas. Aquí: la huella del génesis se comprueba **en cada nodo**,
no en el que se subió.

**Lo que no se prueba, no funciona.** El aislamiento de las llaves parecía
puesto y cada nodo seguía leyendo las de los otros tres. Aquí: la etapa 2 no es
una formalidad, es la que decide si esto sigue.

---

## Lo que hace falta de José antes de empezar

1. **Confirmar que la posición del pool es de prueba** y que cerrar el mercado
   AUKA/WORIGEN es aceptable. Ya dicho, queda escrito.
2. **Decidir sobre los 128,53 de los doce tenedores de WORIGEN.** Consolidarlos
   es quitarle a doce direcciones un saldo que hoy tienen. Si alguna es de una
   persona de fuera, esto deja de ser una operación técnica.
3. **Una ventana de corte.** Media hora de mantenimiento, de noche.

Y una que no es una pregunta sino un aviso: **esto se hace una vez.** Si
después aparece la llave de `0x3063a26b…`, ya dará igual.
