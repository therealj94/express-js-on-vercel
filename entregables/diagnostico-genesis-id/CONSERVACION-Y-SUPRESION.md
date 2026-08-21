# Genesis ID · conservación y supresión de datos personales

Qué guarda Genesis ID, dónde, por cuánto tiempo, por qué, y qué puede pedir una
persona sobre sus propios datos.

**Cada línea de este documento sale de leer el código, no de lo que el código
dice de sí mismo.** Esa distinción no es retórica: había comentarios en el
propio repositorio que afirmaban que el selfie se descartaba, y el código lo
guardaba desde hacía tiempo. Los comentarios ya se corrigieron; el aviso queda
para quien vaya a actualizar este documento en el futuro.

Escrito el 21 de agosto de 2026.

---

## Para qué sirve este documento

Un servicio de verificación de identidad guarda cédulas, pasaportes y caras de
personas reales. Tarde o temprano alguien pregunta: un cliente que quiere que lo
borren, un banco que estudia integrarse, un supervisor. La respuesta no puede
improvisarse, y menos delante de un regulador.

No es una opinión legal. Es el inventario de lo que hace el sistema, para que un
abogado del ramo pueda trabajar sobre algo cierto en vez de sobre suposiciones.

---

## Lo que se guarda

### Datos de identificación

| Qué | Dónde vive | Cifrado |
|---|---|---|
| Correo, teléfono, dirección, país de residencia | documento de estado | no |
| Nombre declarado y fecha de nacimiento declarada | documento de estado | no |
| Nombre legal, nacionalidad, tipo y número de documento, vencimiento | documento de estado | no |
| Ocupación, origen de fondos, propósito de la cuenta, volumen esperado | documento de estado | no |
| Condición de persona expuesta políticamente | documento de estado | no |
| Datos leídos de la banda del documento | documento de estado | no |
| Texto del anverso leído por reconocimiento óptico, hasta 1200 caracteres | documento de estado | no |
| Veredicto del cotejo de rostro, parecido y vivacidad | documento de estado | no |
| Resultado del tamizado contra listas y nivel de riesgo | documento de estado | no |
| Vínculos con aplicaciones: cuenta y dirección de billetera | documento de estado | no |
| Decisiones: quién aprobó o rechazó, cuándo y por qué | documento de estado | no |

Del negocio (verificación de empresas) se guarda además razón social, nombre
comercial, identificador fiscal, dirección, sitio web, y de cada beneficiario
final su nombre, porcentaje, fecha de nacimiento y nacionalidad.

### Imágenes

| Qué | Dónde | Cifrado | Plazo |
|---|---|---|---|
| Anverso y reverso del documento | colección aparte | **sí**, AES-256-GCM | 5 años desde la decisión |
| Fotograma del cotejo de rostro | colección aparte | **sí**, AES-256-GCM | 5 años desde la decisión |
| Retrato de la credencial | colección aparte | **sí**, AES-256-GCM | **no caduca** |
| Fotogramas de la prueba de vida | **no se guardan** | — | — |

Tres cosas que conviene decir sin rodeos:

**El selfie sí se guarda.** El fotograma con el que se cotejó la cara se
conserva cifrado, con el mismo plazo que el documento. Se hizo a propósito: sin
él, un operador no puede revisar a mano un cotejo dudoso ni reconstruir después
qué se miró para aprobar a alguien, y quedaba una cifra sin nada detrás. Y si la
identidad no tiene retrato, ese mismo fotograma pasa además a ser la foto de la
credencial.

**El retrato de la credencial no caduca, y es deliberado.** Las fotos del
documento se sueltan a los cinco años porque son prueba del trámite. El retrato
es la credencial: una credencial que se borra sola deja de ser una credencial.

**Los fotogramas de la prueba de vida no se guardan.** Van al proveedor
biométrico, vuelve un veredicto, y no tocan disco. De todo el material
biométrico es el que más revela sobre una persona y el que menos falta hace
conservar.

### Registro de auditoría

La bitácora guarda todo lo que cambia el estado de una identidad. Dentro de sus
entradas quedan datos personales: el correo de la persona, el nombre declarado,
el país, el identificador Genesis, la dirección de billetera vinculada, el
nombre de los beneficiarios finales, y el texto libre que escriben los
operadores al aprobar o rechazar.

Hay un filtro que sustituye por `[omitido]` cualquier campo cuyo nombre suene a
contraseña, ficha de sesión, secreto, clave, selfie o foto, y recorta a 500
caracteres los textos largos. Está para que el registro de seguridad no acabe
siendo una filtración.

También queda la dirección IP del operador al abrir sesión, al fallar y al
quedar bloqueado. La de la persona verificada no se guarda.

### Otros

| Qué | Plazo |
|---|---|
| Movimientos vigilados: identificador, contraparte, monto, activo, fecha, país | **sin plazo** |
| Padrón de personas por aplicación: correo, nombre, teléfono, país, ciudad, billetera | **sin plazo** |
| Casos de cumplimiento, con el nombre legal en el título y notas del operador | **sin plazo** |
| Telemetría de uso | **90 días**, se borra sola |
| Resúmenes diarios de telemetría | sin plazo, pero **sin identificar a nadie** |
| Sesiones de operador | **8 horas** |

La telemetría no guarda IP ni identificador de persona: usa una huella derivada
con HMAC y sal de servidor, de la que no se vuelve atrás.

---

## Los plazos, y de dónde salen

**Cinco años** para el material de verificación. Es el plazo estándar de
conservación de registros de debida diligencia y es el que promete la política
publicada de la casa. Se cuentan desde la **decisión** sobre el expediente, no
desde que se subió la foto.

**Un año de reserva** para un expediente que nunca se decide. Es un plazo nuevo,
y responde a un agujero que había: como el vencimiento solo se escribía al
decidir, alguien que subiera su cédula y no volviera nunca dejaba su documento
guardado **para siempre**. Y es el peor caso posible, porque son justamente las
personas con las que no llegó a existir ninguna relación, o sea aquellas para
las que menos se puede justificar conservar un documento de identidad. Una
revisión real se mide en días, así que un año es holgado de sobra y sigue siendo
un plazo, que es lo que faltaba.

**Noventa días** para la telemetría, que es lo que hace falta para ver
tendencias de uso y arreglar errores.

**Ocho horas** para una sesión de operador, que es una jornada.

El borrado no lo hace una tarea nuestra: lo hace MongoDB con un índice de
caducidad. La ventaja es que ocurre aunque nadie se acuerde. La desventaja es
que si ese índice no llega a crearse, «cinco años» se convierte en «para
siempre» sin que nada avise, y por eso `/healthz` publica `caducidadActiva`.

---

## Qué NO se borra, y por qué

**La bitácora no se borra nunca, y no se puede borrar.** No tiene índice de
caducidad y no existe ninguna función que quite entradas. Cuando un eslabón se
rompe, el sistema se niega a recalcular la cadena y en su lugar sella el tramo
dejando escrito dónde se rompió. Un registro de auditoría que se puede editar no
es un registro de auditoría.

Esto choca de frente con una solicitud de borrado, y hay que decirlo antes de
que lo diga otro: si una persona pide que se borren sus datos, **el rastro de su
paso por el sistema queda en la bitácora igualmente**. Es la excepción que
reconocen todos los regímenes de protección de datos para los registros que una
obligación legal manda conservar.

**El retrato de la credencial no caduca**, por lo dicho arriba.

**Los movimientos vigilados, el padrón y los casos no tienen plazo.** Esto no es
una decisión tomada, es una decisión que no se ha tomado: simplemente no se les
puso índice de caducidad. Queda escrito acá porque un documento de conservación
que solo cuenta lo que está bien resuelto no sirve para nada.

---

## A quién se le manda dato personal

| Destino | Qué va |
|---|---|
| AWS Rekognition | selfie, anverso, reverso y fotogramas de la prueba de vida |
| AWS SES | correo, nombre legal e identificador Genesis en los avisos de aprobación o rechazo |
| Proveedor biométrico externo, si se configura | selfie y documento |
| Explorador de la cadena | dirección de billetera |
| Backend de Veta Wallet | la ficha de sesión de la persona, para validarla |

Rekognition se usa en modo sin estado: no se crean colecciones de rostros ni se
guarda ninguna plantilla facial del lado de AWS. Lo que vuelve es un número de
parecido y unos atributos, y es lo único que se conserva.

---

## Qué puede pedir una persona

### Que le digan qué se tiene sobre ella

**Se atiende a mano.** No hay hoy una ruta que le entregue a la persona su propio
expediente completo; el panel sí permite a un operador reunirlo. Se pide por
correo y se responde dentro de un mes.

Está apuntado como lo siguiente que hay que construir. Mientras no exista, decir
que «se atiende» y no que «está resuelto» es lo honesto.

### Que se corrija algo que está mal

Se atiende. Si el dato corregido cambia el resultado de la verificación, el
expediente vuelve a revisión y la corrección queda en la bitácora con quién la
hizo.

### Que la borren

Aquí la respuesta tiene que ser precisa, porque la respuesta cómoda sería
mentira.

**Durante los cinco años del plazo de conservación, no procede el borrado del
material de verificación.** La obligación de conservar registros de debida
diligencia pesa más que la solicitud, y así lo reconocen expresamente todos los
regímenes de protección de datos que contemplan este caso. No es una excusa del
proveedor: es la misma norma que obliga a verificar la identidad la que obliga a
guardar la prueba de haberlo hecho.

**Lo que sí se puede hacer, y se hace:**

- Desvincular la identidad de las aplicaciones del ecosistema, de forma que deje
  de operar en ellas.
- Borrar el retrato de la credencial, que no está sujeto al plazo.
- Reiniciar el expediente, lo que limpia documento, biometría y nombre legal.
  Conviene saber que **no es un borrado**: se conservan el correo, el nombre
  declarado, las decisiones anteriores y la bitácora entera.
- Al cumplirse los cinco años, el material de verificación se borra solo, sin
  que haya que pedirlo.

**Lo que no se puede hacer:** quitar entradas de la bitácora.

### Dónde se pide

Por correo a **privacidad@ordenglobal.org**, desde la dirección con la que se
registró, indicando qué se pide. Si no cuadra la dirección se piden datos que
solo el titular pueda saber, porque atender una solicitud de un impostor sería
la filtración que este documento intenta evitar.

Plazo de respuesta: un mes.

---

## Lo que este documento todavía no puede prometer

Escrito aparte y a propósito, porque un documento de cumplimiento que solo
enumera lo resuelto es exactamente el que se cae en la primera pregunta seria.

1. **No hay entrega automática del propio expediente.** El derecho de acceso se
   atiende a mano. Debería ser una ruta.
2. **Los movimientos, el padrón y los casos no tienen plazo de conservación.**
   Hay que decidir cuál es y ponérselo.
3. **El plazo se cuenta desde la decisión, no desde que termina la relación.**
   Varios marcos cuentan desde el cierre de la relación comercial, que suele ser
   más tarde. Lo tiene que mirar un abogado del ramo.
4. **El documento de estado no está cifrado.** Las imágenes sí, y son el dato
   más sensible, pero el nombre, el número de documento y la nacionalidad están
   en claro dentro de la base. Lo cubre el cifrado del proveedor sobre el disco,
   que no es lo mismo que cifrarlo nosotros.
5. **Nadie de fuera ha auditado esto.** Sin una certificación independiente, lo
   escrito acá es lo que decimos de nosotros mismos. Un banco serio va a pedir
   más que eso, y tiene razón.

---

## Dónde comprobar cada afirmación

| Qué | Archivo |
|---|---|
| Qué campos se guardan | `src/types.ts` |
| Plazos y caducidad de las imágenes | `src/kyc/fotosDocumento.ts` |
| El retrato de la credencial | `src/kyc/fotoCredencial.ts` |
| Qué se manda a Rekognition | `src/kyc/rekognition.ts` |
| La bitácora, su filtro y su firma | `src/audit/bitacora.ts` |
| Plazo de la telemetría y la huella sin identificar | `src/analitica/eventos.ts` |
| Qué se le enseña a la propia persona | `src/motor/identidades.ts` |
| Que la caducidad está activa de verdad | `GET /healthz` |
