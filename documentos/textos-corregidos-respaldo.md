# Los textos corregidos · respaldo, bóveda y NI 43-101

**Para:** Junta Directiva de Orden Global Corp — Decisión 4
**Base:** expediente de la Secretaría del 14/08/2026 (`infra/cerebro/conocimiento/legal-detalle.md`)
**Redactado:** 16/08/2026 · **no aplicado**

Aquí está, listo para pegar, cada texto que hoy dice respaldo en oro, custodia
en bóveda o certificación NI 43-101, con su corrección. Nada de esto se ha
tocado en producción: el expediente pide dictamen escrito, y el texto público de
un instrumento financiero no lo cambia quien mantiene el sistema. Se aplica el
día que se diga.

---

## El reparto de términos

Es lo que ordena todo lo demás. Cada instrumento tiene su palabra y no se
presta:

| | Palabra | Por qué |
|---|---|---|
| **ORIGEN** | **referenciado** al oro | fórmula de precio: gramo de oro USD ÷ 55 |
| **AUKA** | oro · una onza | ver el bloque de abajo — hay que decidir |
| **AGKA** | plata · una onza | igual que AUKA |
| **ONDK** | **respaldado** — *security token* de Orden Global | única excepción, y es deliberada: valor negociable bajo Próspera |

---

## Antes de los textos: AUKA

Me pediste que la bóveda y la NI 43-101 pasen de ORIGEN a AUKA. Redacté las dos
versiones —abajo, texto **A** y texto **B**—, pero hay tres cosas que tenés que
saber antes de elegir, porque no son opinión mía:

**1 · La NI 43-101 no certifica barras en bóveda, para ningún token.** No lo
digo yo: lo dice tu propia Secretaria, textual — *«es un estándar canadiense de
reporte de recursos y reservas mineras, no una certificación de barras de oro en
bóveda; esa función corresponde a estándares de refinería tipo LBMA Good
Delivery»*. Mover esa frase de ORIGEN a AUKA no la arregla, la muda de sitio. Si
AUKA tiene metal detrás, el sello que toca es **LBMA Good Delivery** más un
**certificado de custodia** del depositario. Eso sí se puede publicar y sí
aguanta que alguien lo verifique.

**2 · La cifra no cierra.** Medido en la 5550 hoy:

| | Emisión en la cadena | Metal que exigiría si cada unidad es una onza respaldada |
|---|---|---|
| AUKA | 55.000.000 | **1.710.693 toneladas de oro** — unas **ocho veces todo el oro extraído en la historia** (≈216.000 t) |
| AGKA | 500.000.000 | **15.551.750 toneladas de plata** |

Los tokens ya están emitidos, no en diseño. Publicar «AUKA está respaldado en
oro guardado en bóveda» con esa emisión en la cadena es una afirmación que
cualquiera desmonta con una calculadora en dos minutos — y peor que la de ORIGEN,
porque esta es aritméticamente imposible, no solo indocumentada. Si el respaldo
es de lo que circula y no de lo emitido, entonces la frase tiene que decir
**cuánto circula** y dónde comprobarlo, y esa cifra hay que publicarla.

**3 · El expediente lista AUKA como referenciado**, no respaldado, y dice que el
único respaldado es ONDK. Si AUKA sí tiene bóveda, eso corrige el documento de
la Secretaría, y la corrección tiene que venir de ella o de la Junta, no de acá.

**Mi recomendación:** publicar hoy el **texto A**, que es cierto y no promete de
menos, y dejar el **texto B** guardado para el día que existan los cuatro
papeles de la lista final. El texto B es mejor argumento de venta — pero solo
sirve si aguanta que lo comprueben, y una promesa de oro que no aguanta es
justamente el riesgo que el expediente nombra.

---

# 1 · `infra/cerebro/conocimiento/saber.json` — lo que AU-RA contesta

Es lo más urgente de los cuatro: AU-RA le está diciendo esto ahora mismo a
cualquiera que abra la billetera.

### Ficha `origen`

> **HOY:** ORIGEN es oro real hecho dinero: cada uno es un gramin, una fracción exacta de un gramo de oro **certificado y guardado en bóveda**. **No es una promesa de oro — es el oro**, con otra forma de viajar. Se envía en segundos por nuestra propia cadena.

**CORREGIDO · es**
> ORIGEN es la moneda de la cadena de Orden Global, y su valor está referenciado al oro: un ORIGEN es un gramin, la cincuentaicincoava parte de un gramo de oro, al precio del oro de hoy. La fórmula no la ponemos nosotros y no cambia, así que el precio lo podés rehacer con una calculadora cuando quieras. Se envía en segundos por nuestra propia cadena.

**CORREGIDO · en**
> ORIGEN is the currency of the Orden Global chain, and its value is referenced to gold: one ORIGEN is one gramin, the fifty-fifth part of a gram of gold, at today's gold price. We do not set the formula and it does not change, so you can redo the price with a calculator whenever you like. It sends in seconds over our own chain.

### Ficha `boveda` → renombrar a `referencia`

> **HOY:** Por cada ORIGEN en circulación hay un gramin de oro **guardado**, y el metal está **certificado bajo el estándar internacional NI 43-101**, que firma un tercero y no nosotros. La emisión y cada movimiento quedan en la cadena, así que se puede comprobar en ordenscan.com sin pedirnos nada.

**CORREGIDO · es**
> El precio de ORIGEN sale de una fórmula pública: el gramo de oro en dólares dividido entre cincuenta y cinco. No hay oro en bóveda detrás de ORIGEN — hay una referencia de precio, y eso se dice con esas palabras. Lo que sí se comprueba sin pedirnos nada es la cadena: la emisión total y cada movimiento están en ordenscan.com. Detrás del ecosistema hay activos en construcción —concesiones mineras en validación, terrenos, las plataformas y la propia cadena— y de esos hablamos por lo que son hoy, no por lo que serán.

**CORREGIDO · en**
> ORIGEN's price comes from a public formula: the gram of gold in dollars divided by fifty-five. There is no vaulted gold behind ORIGEN — there is a price reference, and we say it in those words. What can be checked without asking us is the chain: the total issuance and every movement are on ordenscan.com. Behind the ecosystem there are assets under construction — mining concessions under validation, land, the platforms and the chain itself — and we speak of those for what they are today, not for what they will be.

**Palabras de la ficha:** cambiar `["boveda","vault","respaldo","certificado"]` por
`["boveda","vault","respaldo","backing","referencia","formula","precio"]` — quien
pregunte por la bóveda tiene que caer justo en la ficha que le dice que no la
hay.

### Fichas nuevas: `auka`, `agka`, `ondk`

**`auka` · texto A — publicable hoy**
> AUKA sigue el precio de una onza de oro. Es la forma de tener exposición al oro dentro del ecosistema sin custodiarlo vos. La figura de respaldo —quién guarda el metal, bajo qué contrato y con qué auditoría— está en manos de la Junta y no está firmada, así que hasta que lo esté te digo lo que sí es: sigue el precio, no te entrega el metal.

**`auka` · texto B — el día que existan los papeles**
> AUKA es una onza de oro. El metal está custodiado por un depositario independiente, bajo estándar LBMA Good Delivery, y el certificado de custodia y la última auditoría se publican en [ruta]. Circulan [N] AUKA contra [N] onzas guardadas, y las dos cifras se comprueban: la de la cadena en ordenscan.com, la de la bóveda en el certificado.

**`agka` · texto A**
> AGKA sigue el precio de una onza de plata: la puerta al mercado de la plata desde la misma billetera. Igual que AUKA, la figura de respaldo del metal no está cerrada, y hasta que lo esté no te voy a decir que la plata está guardada.

**`ondk`**
> ONDK es Orden Global hecha token: un instrumento patrimonial digital, lo que en Próspera se llama un valor negociable —security token—, y es el único del ecosistema que sí está respaldado. Su valor viene de los activos del grupo: la minería, la infraestructura tecnológica y la participación en las compañías. Se gana por apreciación, y de vez en cuando Orden Global abre ventanas de recompra, que son una oportunidad puntual y no un derecho de rescate. No es una acción: no da voto ni te hace socio. No se mercadea en Estados Unidos.

*(Las tres necesitan su `en`, sus palabras, `revisadoPor` y `revisadoEn` — el
publicador rechaza una ficha pública a medias.)*

---

# 2 · `apps-web/veta-wallet/i18n.js` — la portada

### Acto I · la entrada

`bv.p` — **hoy:** «…sin cambiarle la naturaleza: **metal certificado, guardado en bóveda**, vivo en una cadena que es nuestra…»

**es** → `Imperios enteros se apagaron y el oro siguió siendo dinero. Orden Global lo trae a este siglo sin cambiarle la referencia: el precio del oro, vivo en una cadena que es nuestra. Esto no es una app de finanzas. Es la casa del oro digital — y se entra con una sola cuenta.`

**en** → `Entire empires went dark and gold stayed money. Orden Global brings it into this century without changing its reference: the price of gold, alive on a chain of our own. This is not a finance app. It is the house of digital gold — and one account opens it.`

### Acto II · qué es ORIGEN

| Clave | Corregido (es) |
|---|---|
| `q.t1` / `q.t2` | `El oro marca el precio.` / `La cadena lo mueve.` |
| `q.p` | `Cada ORIGEN es un gramin: la cincuentaicincoava parte de un gramo de oro, al precio del oro de hoy. Es una referencia de precio, no una promesa de metal guardado — y por eso se puede comprobar en cualquier momento, sin creernos nada.` |
| `q.1t` | `Sale de una fórmula` |
| `q.1p` | `El gramo de oro en dólares dividido entre cincuenta y cinco. No la fijamos nosotros y no la movemos: la marca el mercado del oro, cada día.` |
| `q.2t` | `Se escribe en el génesis` |
| `q.2p` | `Un billón de ORIGEN, exactos, escritos en el primer bloque de la cadena. No hay una llave que emita más: la emisión total está a la vista y no se toca.` |
| `q.3t` / `q.3p` | *(sin cambio — la cadena 5550, QBFT, envíos en segundos)* |

| Clave | Corregido (en) |
|---|---|
| `q.t1` / `q.t2` | `Gold sets the price.` / `The chain moves it.` |
| `q.p` | `Each ORIGEN is one gramin: the fifty-fifth part of a gram of gold, at today's gold price. It is a price reference, not a promise of stored metal — and that is why it can be checked at any moment, without taking our word for it.` |
| `q.1t` | `It comes from a formula` |
| `q.1p` | `The gram of gold in dollars divided by fifty-five. We do not set it and we do not move it: the gold market marks it, every day.` |
| `q.2t` | `It is written in the genesis` |
| `q.2p` | `One trillion ORIGEN, exactly, written into the chain's first block. There is no key that mints more: the total issuance is in plain sight and it is not touched.` |

### Acto III · «La bóveda» → «La referencia»

Esta sección entera hay que reescribirla, porque hoy vende justo lo que no hay.

| Clave | Corregido (es) | Corregido (en) |
|---|---|---|
| `b.sello` | `La referencia` | `The reference` |
| `b.t1` / `b.t2` | `El precio no` / `lo ponemos nosotros.` | `We do not` / `set the price.` |
| `b.p` | `La diferencia entre una moneda que se puede comprobar y una que hay que creerse es de dónde sale su número. El de ORIGEN sale del precio del oro y de una división. Las dos mitades son públicas.` | `The difference between a currency you can check and one you have to believe is where its number comes from. ORIGEN's comes from the gold price and a division. Both halves are public.` |
| `b.cifra` | `un gramin = 1/55 del gramo de oro` | `one gramin = 1/55 of a gram of gold` |
| `b.g1t` / `b.g1p` | `Una fórmula, no una promesa` / `El gramo de oro en dólares entre cincuenta y cinco. Rehacé la cuenta con el precio del oro de hoy y te va a dar.` | `A formula, not a promise` / `The gram of gold in dollars over fifty-five. Redo the sum with today's gold price and it will match.` |
| `b.g2t` / `b.g2p` | `Emisión cerrada` / `Un billón de ORIGEN escritos en el génesis. No hay forma de emitir más, y eso también se comprueba en la cadena.` | `Closed issuance` / `One trillion ORIGEN written into the genesis. There is no way to mint more, and that is checkable on the chain too.` |
| `b.g3t` / `b.g3p` | *(sin cambio — auditable 24/7 en ORDENSCAN)* | *(sin cambio)* |

### Acto IV · la cadena

`ch.p` termina hoy en «…responde solo ante **la casa que guarda el metal**».
**Corregido:** «…responde solo ante la casa que la construyó.» / en: «…answers only to the house that built it.»

---

# 3 · `apps-web/veta-wallet/cadena.js` — las fichas de token

Estas van pegadas al contrato y son lo único que se escribe sobre un activo que
la gente compra.

**ORIGEN** — `r:` pasa de `1 gramin = 1/55 g de oro` a `Referenciado · 1 gramin = 1/55 g de oro`.

**AUKA** — hoy dice `Token respaldado en oro`. Texto A:
> `d:` `Sigue el precio de una onza de oro: exposición al oro sin custodiarlo vos. La figura de respaldo del metal está en manos de la Junta y no está firmada.` · `t:` `Token de commodity` · `r:` `Oro · 1 onza (precio)`

**AGKA** — hoy dice `Token respaldado en plata`. Texto A:
> `d:` `Sigue el precio de una onza de plata: una forma de entrar al mercado de la plata desde la billetera. La figura de respaldo del metal no está cerrada.` · `t:` `Token de commodity` · `r:` `Plata · 1 onza (precio)`

**ONDK** — hoy dice `Activo de gobernanza y utilidad`, y eso hay que quitarlo: el
expediente es explícito en que ONDK **no da voto ni condición de socio**.
> `d:` `Orden Global hecha token. Instrumento patrimonial digital —valor negociable bajo Próspera— respaldado por los activos del grupo: minería, infraestructura y participación en las compañías. Da derechos económicos por contrato; no es una acción y no da voto.` · `t:` `Security token de Orden Global` · `r:` `Ecosistema · valor negociable`

---

# 4 · `documentos/armar-dossier.py` — el PDF para inversionistas

| Línea | Hoy | Corregido |
|---|---|---|
| 164 | `metal certificado, guardado en bóveda, vivo` | `el precio del oro, vivo` |
| 351-354 | `Cada ORIGEN es un gramin: 1⁄55 de un gramo de oro certificado bajo el estándar internacional NI 43-101… Por cada ORIGEN en circulación hay un gramin guardado en bóveda. No es una promesa de oro: es el oro…` | `Cada ORIGEN es un gramin: 1⁄55 de un gramo de oro, al precio del oro del día. Es una referencia de precio, pública y verificable, no una promesa de metal en bóveda. La emisión —un billón exacto— está escrita en el génesis de la cadena y no se puede ampliar.` |
| 365 | cifra `1:1` · `Un gramin guardado por cada ORIGEN` | `÷55` · `Un gramin es 1/55 del gramo de oro` |
| 447 | `Un activo respaldado en oro que solo se puede guardar es un ahorro.` | `Un activo referenciado al oro que solo se puede guardar es un ahorro.` |
| 603 | `crédito respaldado en…` | *(sin cambio — ahí «respaldado» es de crédito con garantía, no del token)* |
| 652 | `Un activo respaldado en oro certificado.` | `Un activo referenciado al oro, con la fórmula a la vista.` |

**Y una página que hay que añadir**, porque un inversionista la va a pedir y es
mejor dársela: *De dónde sale el valor* — la fórmula, la emisión cerrada, el
portafolio minero como potencial declarado (con el matiz de que son recursos, no
reservas certificadas), y el estado del paquete de licencias RFSA. Contado así
es una tesis; contado como bóveda es una acusación esperando a que alguien
verifique.

---

## Lo que hace falta para poder publicar el texto B de AUKA

Cuatro documentos. Mientras falte uno, va el texto A:

1. **Contrato de custodia** con el depositario — nombre, jurisdicción, vigencia.
2. **Certificado o atestación de la bóveda**, con el metal y su estándar de
   refinería (**LBMA Good Delivery**, no NI 43-101).
3. **Auditoría o prueba de reservas** de un tercero, con fecha, y cada cuánto se
   repite.
4. **Derecho de canje**: si alguien con AUKA puede pedir la onza, cómo, dónde y
   con qué mínimo. Si no puede, hay que decirlo también.

Y con ellos, la cifra que hoy no cuadra: **cuántos AUKA circulan** frente a
cuántas onzas hay guardadas. Emitidos hay 55.000.000 en la cadena; si lo
respaldado es otra cifra, esa es la que va en el texto, y va con la fuente al
lado.
