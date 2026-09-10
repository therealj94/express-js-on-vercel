# Lo que el expediente legal contradice

**Fuente:** `legal-detalle.md` y `legal.json` — Melany Ordóñez, Secretaria de la
Junta, 14 de agosto de 2026. Entregados al cerebro el 16 de agosto de 2026.

Este archivo no repite lo que dicen esos dos. Recoge solo **dónde chocan con lo
que ya está escrito en otro sitio**, con las dos versiones a la vista y, cuando
se pudo comprobar, con la comprobación hecha y fechada.

La regla de la casa es que un dato que se contradice a sí mismo no se resuelve
eligiendo el que suena mejor. Se deja el choque escrito hasta que alguien con
autoridad lo cierre.

---

## 1 · Respaldo en oro · **la grave**

**Lo que dice el expediente legal.** La figura jurídica de ORIGEN es
**referenciado, nunca respaldado** — y lo llama «terminología no negociable en
todos los documentos del ecosistema». Textual: *«no existe oro físico extraído y
custodiado en bóveda; el oro está en etapa de recurso o potencial minero»*. Y
sobre la norma: *«NI 43-101 es un estándar canadiense de reporte de recursos y
reservas mineras, no una certificación de barras de oro en bóveda»*. Quien
obtiene los tokens es **adquirente**, no inversionista.

**Lo que decimos hoy en público.** Tres sitios, todos vivos el 16/08/2026:

| Dónde | Qué dice |
|---|---|
| `conocimiento/saber.json`, ficha `origen` | «una fracción exacta de un gramo de oro **certificado y guardado en bóveda**. No es una promesa de oro — es el oro» |
| `conocimiento/saber.json`, ficha `boveda` | «Por cada ORIGEN en circulación hay un gramin de oro **guardado**, y el metal está **certificado bajo el estándar internacional NI 43-101**» |
| `apps-web/veta-wallet/i18n.js` (la portada) | «…**NI 43-101**. Antes de existir como saldo, existe como metal.» |
| `documentos/armar-dossier.py` (el PDF para inversionistas, entregado el 16/08) | «guardado en bóveda», «por cada ORIGEN en circulación hay un gramin guardado en bóveda», «certificado bajo el estándar internacional NI 43-101» |

Las fichas `origen` y `boveda` son **públicas**: es lo que AU-RA le contesta hoy
a cualquiera que abra la billetera y pregunte por el oro.

**Por qué es la grave y no una más.** No es una imprecisión de redacción. Es la
diferencia entre las dos figuras que el propio expediente separa: respaldado
exige custodia, auditoría y prueba de reservas; referenciado es una fórmula de
precio. Decir la primera cuando la realidad es la segunda, a 435 usuarios con
saldo real, es exactamente la exposición que la Secretaría nombra en el bloque 1
del expediente. Y el PDF para inversionistas ya la lleva impresa.

**Lo que se está haciendo al respecto.** La presidencia confirma el 16/08/2026
que **la bóveda es un frente en marcha: se está trabajando en montarla en
Próspera**. Eso no cambia lo que se puede decir hoy —una bóveda en trámite no es
una bóveda—, pero sí cambia el final de la historia: lo que se retiró de la web
no era una mentira sostenida a propósito, era una promesa contada en presente
antes de tiempo. Lo que falta para poder contarla, y en este orden: qué sociedad
o depositario custodia, en qué etapa está el trámite en Próspera, si la bóveda
respalda ORIGEN o AUKA, y bajo qué estándar de refinería se certifica —**LBMA
Good Delivery**, que es el que corresponde a barras, no NI 43-101, que es de
reporte de recursos mineros—.

**Estado:** abierto. Es la **Decisión 4 de la Junta** en el propio expediente:
*«fijar por escrito, con dictamen, la naturaleza referenciada de ORIGEN y
corregir los textos de la web que aún hablan de respaldo y bóveda»*. No se
corrige desde aquí: el expediente pide dictamen, y el texto público de un
instrumento financiero no lo cambia quien mantiene el sistema. Lo que sí queda
hecho es que está escrito, con las citas y las rutas de archivo, para que la
corrección sea un rato de trabajo y no otra investigación.

**Nota aparte, del mismo bloque:** ONDK **sí** se declara respaldado, y es
deliberado — es un valor negociable bajo Próspera, con otra naturaleza. La
coexistencia de los dos términos no es un error; el error es aplicarle a ORIGEN
el de ONDK.

---

## 2 · La comisión · **resuelta con comprobación**

El expediente la marca él mismo como contradicción a conciliar, así que se
concilió midiendo.

| Versión | Qué afirma |
|---|---|
| El cerebro, hasta hoy | La comisión está **inactiva**: cobra cero |
| El expediente legal (bloque 10) | La comisión **ya está activa** en la cadena nueva — 0,001 ORIGEN por transacción |

**Comprobado el 16/08/2026.** Las dos son ciertas, de dos cosas distintas:

- **La comisión de la billetera** —los 0,001 ORIGEN fijos que iban al tesoro—
  sigue **apagada**. `lib/comision.js` solo cobra si existe la variable
  `OG_COMISION_ORIGEN`; en la aplicación `vetawallet` de Heroku esa variable
  **no está puesta**, así que `comisionEnWei()` devuelve cero y no se cobra
  nada. `TREASURY_OG_ADDRESS` sí está puesta.
- **El suelo de gas de la cadena** sí está activo: `eth_gasPrice` devuelve
  93 gwei, que a 21.000 de gas son **0,001953 ORIGEN** por un envío nativo.

Es decir: mover ORIGEN **ya cuesta** algo más de una milésima, pero ese cobro es
de la red y va al validador, no de Orden Global y no al tesoro. Coinciden en el
orden de magnitud y se parecen tanto que es fácil confundirlos, pero tienen
distinto cobrador — y por tanto distinto tratamiento fiscal, que es justo la
pregunta que el bloque 10 deja abierta.

**Qué corregir en cada lado:** el cerebro deja de decir «cobra cero» a secas y
pasa a decir las dos cifras con su cobrador. El expediente conviene precisarlo
en la próxima revisión: lo activo es el gas de la red, no la comisión de la
casa.

---

## 3 · El documento minero se contradice con el expediente legal

`portafolio-minero.md` entró al cerebro el 14/08. El expediente legal es del
mismo día y lo desmiente en tres puntos. Se dejan los tres a la vista porque el
documento minero es el que se usaría para explicarle el negocio a alguien de
fuera.

| Lo que dice el documento minero | Lo que dice el expediente legal |
|---|---|
| La moneda se llama **ORIEGEN** | Se llama **ORIGEN**. La cadena, el génesis y los 435 usuarios usan ORIGEN |
| «un sistema de tokens **respaldados en metales preciosos**», «anclado a activos físicos reales» | **Referenciado, nunca respaldado.** Terminología no negociable |
| «1 gramín = 1 gramo de oro, y 1 ORIEGEN = 1/55 de gramín» | La fórmula es gramo de oro en dólares ÷ 55. **Un ORIGEN es un gramin, y un gramin es 1/55 de gramo** |

La tercera no es cosmética: tal como está escrita en el documento minero, un
ORIEGEN valdría 1/55 de gramo… de un gramín que ya es un gramo entero, o sea lo
mismo por otro camino, pero con las palabras invertidas. Quien lea ese párrafo y
cite «1 gramín = 1 gramo de oro» estará diciendo que la unidad del ecosistema es
un gramo entero de oro — cincuenta y cinco veces el valor real.

**Estado:** el documento se conserva **tal como lo entregó la compañía**, sin
tocar una coma. La corrección es de quien lo redactó. Lo que hace el cerebro es
no repetir esas tres cosas: por eso existe `mineria-pendiente-legal.md`, que ya
manda sobre este archivo en lo que se dice en voz alta.

---

## 4 · Lo que el expediente añade y el cerebro no tenía

Sin choque, pero nuevo, y pesa:

- **Ninguna licencia emitida.** El paquete RFSA de Próspera está en preparación:
  cuatro trámites. La operación está viva mientras tanto.
- **Ni términos, ni política de privacidad, ni contrato de usuario.** Y no hubo
  punto de aceptación registrable cuando los 435 abrieron cuenta.
- **Ninguna marca registrada.** Los dominios están a nombre personal de una
  socia; el software no tiene cesión de derechos firmada hacia la sociedad.
- **El tesoro son cuatro billeteras madre**, 250.000 millones cada una — no la
  billetera única que el cerebro tenía anotada.
- **No hay dictamen jurídico externo** que fije qué es ORIGEN. La definición se
  construyó internamente.
- **La migración a la cadena nueva** sustituye el registro de saldos de 435
  personas reales, y está por ver si eso exige aviso o consentimiento previo.
  Decisión 8 de la Junta.

---

## Qué se hace con esto

Nada de este archivo cruza a AU-RA. Todas las fichas que salen de aquí van con
`publico: false` y el publicador las corta; `pruebas/probar-frontera.mjs` lo
comprueba en cada corrida.

Lo único que se pide desde aquí, y se pide una vez: **antes de enseñarle a nadie
el PDF para inversionistas, resolver el punto 1.** Ese documento repite hoy,
impreso, la afirmación que la Secretaria de la Junta acaba de poner por escrito
como incorrecta.
