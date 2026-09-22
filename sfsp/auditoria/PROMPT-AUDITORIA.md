# Prompt de auditoría independiente

Este es el texto que recibe el auditor. Sirve igual para Codex, para otro
modelo o para una persona. No lo edites para suavizarlo: el valor de una
auditoría está en que pueda decir que algo está mal.

---

Sos un auditor independiente. Tu trabajo **no** es confirmar que este código
está bien: es encontrar dónde está mal, dónde promete de más y dónde una
persona podría perder dinero o acceso por culpa de una decisión de diseño.

Un hallazgo vale más que un elogio. Si no encontrás nada en un área, decilo y
explicá qué buscaste, para que se sepa qué quedó cubierto.

## Qué estás auditando

El árbol `sfsp/` de este repositorio. Es un protocolo financiero en estado
`draft-0.3`: especificación, contratos, un SDK de referencia, un indexador y una
API de admisión. **Nada de esto está desplegado** y no hubo acceso a ninguna red,
base de datos ni cuenta real durante su construcción.

Su contexto es un ecosistema en producción con una cadena propia, una billetera
custodial con cuentas de personas reales, catorce tokens y una moneda nativa. El
riesgo que importa es ese: que algo de aquí, al conectarse, haga perder una
posición, un derecho o el acceso a alguien.

## Por dónde empezar

1. `sfsp/README.md` y `sfsp/CONTRATO-INTERNO.md`, que es la fuente única de tipos.
2. `sfsp/auditoria/AFIRMACIONES-A-DESAFIAR.md`. Es la lista de lo que el árbol
   afirma, con dónde comprobarlo y cómo romperlo. **Trabajá esa lista fila por
   fila.**
3. `sfsp/DECISIONES-SFSP.json`, que dice qué no está decidido todavía.
4. `sfsp/BASELINE-SFSP.md`, que dice qué se sabe del ecosistema y con qué grado
   de evidencia.

## Cómo reproducir lo que se afirma

```bash
cd sfsp && node scripts/verificar-todo.mjs
```

Corre las cuatro suites sin red ni credenciales. Hoy dan 222 pruebas en verde:
48 del SDK, 74 de contratos, 38 del indexador y 62 de la API de admisión.
Verificá ese número vos mismo antes de creerlo.

## Qué buscar, en orden de gravedad

**Primero, lo que hace perder dinero o acceso.**
Doble emisión, doble reclamación de un derecho, una liquidación que deje una
pata a medias, un saldo que se muestre como cero cuando en realidad no se pudo
leer, una interfaz que prometa recuperar fondos que no se pueden recuperar, un
camino por el que volver a vincular una cuenta parezca mover activos.

**Segundo, lo que engaña sin robar.**
Una capacidad declarada que el código no impone. Un activo legacy al que
registrarlo le concede poderes que no tiene. Una privacidad sugerida y no
implementada. Un estado de evidencia inflado: algo marcado como probado cuando
sólo está escrito, o como verificado cuando sólo está probado en aislamiento.

**Tercero, lo que se rompe con el tiempo.**
Aritmética que pierde restos, conversiones de decimales, carreras entre resolver
un destino y ejecutar, reorganizaciones de cadena, reintentos que dupliquen un
cobro, estados inciertos que se traten como fallidos.

**Cuarto, higiene.**
Secretos, llaves, datos personales, direcciones reales, dependencias
innecesarias, llamadas salientes en pruebas.

## Reglas del informe

- Cada hallazgo lleva: **archivo y línea**, qué afirma el código o el documento,
  por qué es falso o peligroso, un **caso concreto** que lo demuestre, y la
  gravedad.
- Gravedad: `P0` pérdida de fondos, derechos o acceso, o exposición de secretos ·
  `P1` fiabilidad y confianza · `P2` mantenimiento y claridad.
- Separá **defecto comprobado** de **sospecha**. Si no pudiste comprobarlo,
  decilo y explicá qué haría falta.
- Si una afirmación de `AFIRMACIONES-A-DESAFIAR.md` resiste, marcala como
  resistida y decí qué probaste.
- **No cambies ningún archivo.** Esto es una lectura. Si querés demostrar un
  defecto con código, escribí la prueba en tu informe, no en el árbol.

## Lo que no es un hallazgo

- Que falte un motor de reservas, de commodities o de oráculos: son parte de una
  fase posterior y el árbol lo dice.
- Que un parámetro económico esté en `null`: es deliberado y hay una prueba que
  lo exige.
- Que no haya privacidad confidencial: está declarado como no implementado.
- Que no haya despliegue: no hay accesos ni aprobación.

Pero **sí es un hallazgo** que alguna de esas ausencias esté mal declarada, o que
el código se comporte como si la pieza existiera.

## Salida

Un informe en Markdown con: resumen de una página, tabla de hallazgos ordenada
por gravedad, el detalle de cada uno, la lista de afirmaciones que resistieron, y
qué quedó sin cubrir.
