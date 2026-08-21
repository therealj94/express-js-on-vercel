# Genesis ID · diagnóstico

Revisión completa del servicio, del código y del cumplimiento.
21 de agosto de 2026, contra el commit `2358877a8cdc` que corre en producción.

---

## Cómo se hizo esta revisión, y por qué importa

Cada hallazgo de abajo se comprobó **contra el servicio vivo**, no solo leyendo
el código. Eso cambió tres conclusiones durante el trabajo:

1. Un primer barrido decía que **treinta y tantas rutas del panel estaban sin
   guardia**. Probadas contra producción, todas contestan `401`. La guardia
   estaba a nivel de router (`panelRouter.use(exigeOperador)`) y mi patrón de
   búsqueda no la veía. **No era un fallo del código, era un fallo mío.**
2. Lo mismo con `/directorio/confirmar`, que parecía abierta. Exige clave
   pública **y** un token que solo el backend de esa app reconoce. Está bien
   pensada.
3. Iba a reportar «no existe retamizado de los ya aprobados», que habría sido
   el hallazgo más grave. Existe: `retamizarTodas()` corre en cada recarga de
   listas. El problema real es otro, y es más fino. Está abajo como **G-1**.

Lo escribo porque un diagnóstico que infla hallazgos es peor que ninguno: la
segunda vez ya nadie lo lee.

---

## Veredicto en una línea

**Genesis ID está mejor construido que la mayoría de lo que se vende como KYC
en la región.** El diseño tiene decisiones que un producto comercial no toma:
no guardar el selfie, fallar cerrado cuando no hay listas, negarse a recalcular
una bitácora rota. Lo que le falta no es arquitectura. Es **automatismo y
prueba**: demasiadas garantías dependen de que una persona se acuerde, y
demasiadas alarmas pueden apagarse sin que nadie lo note.

| | |
|---|---|
| Líneas de código | 17.120 en TypeScript |
| Pruebas | 16 archivos, 3.314 líneas |
| Rutas de API | 60, todas con guardia comprobada |
| Reglas de monitoreo AML | 8 |
| Bitácora | 1.288 entradas, íntegra, con 1 sello en la rotura 767 |

---

## Lo que está bien, y hay que decirlo

**El selfie no se guarda.** Se coteja contra la foto del documento con AWS
Rekognition y se descarta. Queda el veredicto, no la cara. Muy pocos lo hacen,
y es la decisión que más reduce el daño de una filtración.

**Las listas fallan cerrado.** Sin listas cargadas, el motor no dice «sin
coincidencias» (que es indistinguible de haber tamizado bien). Dice **«sin
tamizar»** y el riesgo pasa a bloqueante. Es la diferencia entre un sistema de
cumplimiento y un teatro de cumplimiento.

**La bitácora no se recalcula.** Cuando un eslabón se rompe, el sistema se
niega a rehacer la cadena y en su lugar **sella** el tramo, dejando escrito
dónde se rompió. Recalcular destruiría justo lo que la cadena aporta.

**Contraseñas con scrypt** y parámetros del RFC 7914, comparación en tiempo
constante, bloqueo por intentos con `429` separado del `401`. Correcto.

**Ocho reglas de monitoreo** que incluyen estructuración, velocidad,
contraparte sancionada, jurisdicción de riesgo y cuentas de paso. Comparable a
herramientas comerciales.

**Permisos por rol y por alcance**, con una regla escrita en el propio código:
*una aplicación NUNCA puede aprobar una identidad, por mucho que tenga una
clave válida*. Aprobar es un acto humano.

---

## Hallazgos

Ordenados por lo que costaría el día de una auditoría, no por dificultad.

### G-1 · GRAVE · Todo el tamizado continuo depende de que alguien se acuerde

**Qué pasa.** El retamizado de las personas ya aprobadas existe y funciona,
pero solo corre cuando un operador entra al panel y aprieta «recargar listas».
**No hay ningún programador que lo dispare solo.** Los únicos `setInterval` del
servicio limpian sesiones y contadores de límite.

**Por qué es grave.** Si la OFAC agrega un nombre el martes y nadie entra al
panel hasta el mes siguiente, durante todo ese tiempo hay clientes aprobados
que ya deberían estar bloqueados y el sistema los deja operar. La obligación de
debida diligencia continua (GAFI Rec. 10) no se cumple con un botón.

**Y la alarma que avisaría puede no sonar nunca.** En `aml/listas.ts:313`:

```ts
vencidas: dias != null && dias > 30
```

Si `fechaDescarga` es `null` —porque el `meta.json` no la traía, o porque las
listas se cargaron desde la base sin ella— entonces `dias` es `null` y
`vencidas` es **`false` para siempre**. Las listas pueden tener dos años y el
panel las dará por frescas. En un módulo cuyo principio declarado es fallar
cerrado, este contador falla abierto.

**Y no se puede ver desde fuera.** `/healthz` publica `listasCargadas` y
`listasVencidas`, pero **no** `diasDesdeDescarga` ni `registros`. O sea que
desde afuera no se distingue una lista de 50.000 registros bajada ayer de una
de 3 registros cargada hace un año. Las dos salen `true, false`.

**Qué hacer.**
1. Un temporizador que baje la OFAC y retamice cada 24 horas. La ruta
   `/listas/ofac` ya hace las dos cosas: solo falta que algo la llame sola.
2. `vencidas: dias == null || dias > 30`. Sin fecha es motivo de alarma, no de
   silencio.
3. Publicar `diasDesdeDescarga` y `registros` en `/healthz`.

---

### G-2 · GRAVE · La bitácora encadenada no está firmada

**Qué pasa.** Cada entrada lleva el hash de la anterior, y eso detecta una
edición hecha por fuera. Pero **no hay HMAC con una clave secreta**, y
`bitacoraCopiasApartadas` está en **0**: no existe copia fuera de la propia
base.

**Por qué es grave.** Quien tenga permiso de escritura sobre MongoDB puede
borrar entradas, reescribir las siguientes y recalcular todos los hashes. La
cadena verificará **íntegra**. Contra un atacante externo la cadena sirve;
contra un administrador o contra quien se lleve las credenciales de la base, no
prueba nada. Y el insider es exactamente el riesgo que un regulador quiere ver
cubierto en un registro de auditoría.

**Qué hacer.** Cualquiera de los dos, y mejor los dos:
1. Firmar cada entrada con HMAC-SHA256 usando una clave que **no viva en la
   misma base** (variable de entorno, o KMS). Sin la clave no se puede rehacer
   la cadena.
2. Un volcado diario del último hash a un sitio que la base no controle: un
   bucket con bloqueo de objetos, o una transacción en la propia 5550. Un solo
   hash al día basta para acotar cualquier reescritura a 24 horas.

---

### G-3 · GRAVE · La caducidad a 5 años puede no existir y nadie se entera

**Qué pasa.** Los documentos se conservan cinco años mediante un índice TTL de
MongoDB. Se crea en cada arranque con `prepararCaducidad()`. Si falla, la
función devuelve `false` y el servicio **escribe un aviso en la consola**:

```
[genesis-id] AVISO: archivo cifrado pero SIN índice de caducidad;
             no se borrarán solos
```

Ese aviso **no llega a `/healthz`**. Va a un registro que nadie lee.

**Por qué es grave.** «Se conservan cinco años» se convertiría en «se conservan
para siempre», con cédulas y pasaportes dentro, sin que ninguna pantalla lo
diga. Es incumplimiento de la política publicada por la propia empresa y de
cualquier régimen de protección de datos que exija plazo de conservación.

El comentario del código ya anticipa el riesgo («que el archivo no se quede sin
caducidad y nadie lo note»), pero el arreglo se queda a un paso: avisa en vez
de exponerlo.

**Qué hacer.** Que `prepararCaducidad()` guarde su resultado y `/healthz`
publique `caducidadActiva: true|false`. Tres líneas.

---

### G-4 · ALTO · No hay segundo factor para los operadores

**Qué pasa.** Un operador entra con correo y contraseña. No hay TOTP, ni llave
física, ni verificación por segundo canal. Ese operador puede aprobar
identidades, leer documentos de identidad de todo el padrón y generar reportes.

Hay mitigantes reales: bloqueo por intentos, sesiones de 8 horas, permisos por
rol. Pero una contraseña reutilizada o pescada abre el expediente completo.

**Por qué importa.** Toda guía moderna de KYC/AML exige autenticación reforzada
para el acceso privilegiado a datos de debida diligencia. Es de las primeras
cosas que pregunta un auditor, y no hay respuesta que sustituya al «sí».

**Qué hacer.** TOTP con `otplib` sobre el modelo de operador que ya existe, y
obligatorio para los roles que puedan aprobar o ver documentos. Es medio día de
trabajo y cambia la conversación con cualquier regulador.

---

### G-5 · MEDIO · Sin HSTS, y el servidor dice qué es

Producción contesta con `X-Frame-Options`, `X-Content-Type-Options`,
`Referrer-Policy` y `Permissions-Policy`, que está bien. Faltan dos:

- **No hay `Strict-Transport-Security`.** Sin él, la primera visita de alguien
  a `http://` puede interceptarse antes de llegar a TLS.
- **`x-powered-by: Express`** le regala a cualquiera la pila que corre debajo.
  Se quita con `app.disable('x-powered-by')`.

---

### G-6 · MEDIO · No hay forma de que una persona pida que la borren

No existe ninguna ruta de supresión ni un procedimiento escrito. Para un
servicio de KYC esto es **defendible**: la obligación de conservar por cinco
años pesa más que la solicitud de borrado durante ese plazo, y así lo reconocen
todos los regímenes.

Lo que no es defendible es **no tener el procedimiento escrito**. Alguien va a
pedirlo, y la respuesta no puede improvisarse. Hace falta un documento que
diga: qué se conserva, por cuánto, por qué obligación legal, qué se borra al
vencer, y a qué dirección se escribe para pedirlo.

---

### G-7 · BAJO · `CORS` abierto en un servicio que maneja documentos

`app.use(cors())` deja `Access-Control-Allow-Origin: *` en todas las rutas.

**Es menos grave de lo que parece**, y conviene decirlo con precisión: sin
cookies de sesión, un origen ajeno no puede robar el token de operador, y las
rutas de aplicación se autentican con clave de API que un navegador ajeno no
tiene. Lo comprobé: sin credenciales todo contesta `401`.

Aun así, `*` sobre `/api/panel` no aporta nada y amplía la superficie sin
motivo. Lo correcto es una lista cerrada de orígenes para el panel y `*` solo
donde de verdad lo necesitan las apps.

---

## Contra qué se compara

| | Genesis ID | Lo que hace un Sumsub o un Onfido |
|---|---|---|
| Documento + rostro con vivacidad | sí | sí |
| No guardar el selfie | **sí** | casi ninguno |
| Tamizado de sanciones | sí, falla cerrado | sí |
| Retamizado continuo | existe, **pero manual** | automático |
| Monitoreo de transacciones | 8 reglas | sí, más maduro |
| KYB con beneficiarios finales | sí | sí |
| Registro de auditoría | encadenado, **sin firmar** | firmado y externalizado |
| Segundo factor para operadores | **no** | sí |
| Certificación (SOC 2, ISO 27001) | **ninguna** | sí |

La columna que más pesa comercialmente no es ninguna de las técnicas: es la
última. **Sin una certificación, un banco serio no integra.** No es un fallo de
ingeniería y no se arregla programando, pero conviene saber que ese es el techo
hasta que exista.

---

## Lo que haría, y en qué orden

**Esta semana**, porque son horas y cierran agujeros reales. **Los cuatro ya
están hechos**, en el mismo commit que este documento:

1. ~~`vencidas: dias == null || dias > 30`~~ **(G-1)** ✅ Unas listas sin fecha
   de descarga ahora se cuentan como vencidas en vez de darse por frescas para
   siempre. Va con tres pruebas, y se comprobó que la prueba se pone en rojo si
   alguien devuelve la expresión vieja.
2. ~~`caducidadActiva` en `/healthz`~~ **(G-3)** ✅ Si el índice que caduca los
   documentos a los cinco años no quedó puesto, se ve desde afuera. Antes era un
   aviso por consola que nadie mira.
3. ~~`diasDesdeDescarga` y `registros` en `/healthz`~~ **(G-1)** ✅ Los dos
   números que deciden si el tamizado sirve estaban escondidos.
4. ~~`app.disable('x-powered-by')` y HSTS~~ **(G-5)** ✅ Comprobado contra el
   servidor corriendo: `X-Powered-By` ya no sale, y
   `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` sí.

**Lo que esto NO arregla, y conviene decirlo.** Los cuatro hacen que el sistema
*avise* de lo que está mal; ninguno hace que el sistema *esté* bien. `/healthz`
ahora dice la verdad sobre las listas, pero las listas se siguen bajando a mano.
Eso es el punto 5, y es el que de verdad cierra G-1.

**Este mes**, porque cambian la postura de cumplimiento:

5. Temporizador diario que baje la OFAC y retamice. **(G-1)**
6. HMAC sobre la bitácora, con la clave fuera de la base. **(G-2)**
7. TOTP obligatorio para operadores que aprueban o leen documentos. **(G-4)**
8. El documento de conservación y supresión. **(G-6)**

**Cuando haya con qué**, porque es dinero y tiempo, no código:

9. Un ancla diaria del hash de la bitácora fuera de la base. **(G-2)**
10. SOC 2 Tipo I como primer paso hacia integrarse con un banco.

---

## Lo que este diagnóstico NO cubre

- **No leí la app móvil de Genesis ID** (`genesis-id-app/`), solo el servicio.
- **No hice pruebas de penetración**: no intenté inyección, escalada de
  privilegios entre roles, ni abuso de la subida de imágenes. Todo lo de arriba
  sale de leer el código y de probar el comportamiento público.
- **No revisé la calidad del cotejo biométrico** contra un banco de rostros.
  Que Rekognition esté configurado no dice qué tasa de falsos positivos tiene
  con documentos hondureños, y eso solo se sabe midiéndolo.
- **No hay opinión legal aquí.** Lo que digo sobre GAFI y sobre conservación es
  lectura de las recomendaciones, no asesoría. Antes de presentarse ante la
  CNBS conviene que lo mire un abogado del ramo.
