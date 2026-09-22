# Modelo de amenazas de metadatos

**Alcance:** qué puede inferir un observador sobre personas y sobre el negocio, a partir de datos que el sistema expone por su funcionamiento normal, sin romper ninguna criptografía.

**Estado:** evaluación. Nada de lo descrito aquí está mitigado. Las capacidades y configuraciones efectivas de cada canal son **NO_VERIFICADAS**: este entorno no tiene accesos.

**Premisa:** el atacante no necesita entrar en ningún sistema. Le basta con mirar lo que ya está a la vista y cruzarlo.

---

## 1. Observadores considerados

| Observador | Qué alcanza |
|---|---|
| Externo con acceso a un RPC | Todo el estado público de la cadena y todas las transacciones |
| Operador de un nodo o validador | Lo anterior más el mempool y el orden de llegada |
| Operador de la plataforma | Bases internas, registros, vínculos entre cuenta y dirección |
| Insider con acceso parcial | Un subconjunto de lo anterior, a menudo suficiente |
| Proveedor de terceros (tarjeta, analítica, nube) | Lo que se le envía, más metadatos de conexión |
| Adversario que cruza fuentes | La unión de todo lo anterior con datos públicos externos |

---

## 2. Canal por canal

### 2.1 RPC y estado público

**Expone:** saldos de cualquier dirección, historial completo de transferencias, grafo de relaciones entre direcciones, altura y momento de cada operación, código y almacenamiento de contratos.

**Inferencias:** patrimonio por dirección; con quién opera cada dirección y con qué frecuencia; agrupación de direcciones por patrones de gasto; direcciones de tesorería y su comportamiento; número aproximado de usuarios activos.

**Por qué no se mitiga ocultando el explorador:** el explorador es una vista. El RPC es la fuente. Quitar una pantalla no cambia lo que responde el nodo.

### 2.2 Calldata

**Expone:** el selector de función y todos los argumentos de cada llamada, en claro, para siempre.

**Inferencias:** qué operación se hizo exactamente, con qué activo, por qué importe y hacia quién; qué políticas se aplicaron; identificadores internos que aparezcan como argumento. Un `assetId`, un `caseId` o un `operationId` en calldata queda público y es correlacionable.

**Riesgo específico:** incluir una referencia opaca pero **estable** en calldata convierte esa referencia en un identificador permanente de la persona.

### 2.3 Logs y eventos

**Expone:** los campos de cada evento emitido, y en particular los campos indexados, que son directamente consultables y filtrables.

**Inferencias:** la historia completa de un activo o de una dirección con una sola consulta; el momento de cada emisión, recuperación o migración; el volumen por emisor.

**Riesgo específico:** un evento de recuperación o de migración señala **qué cuentas tuvieron un problema**. Indexar una dirección en un evento de este tipo publica esa señal. Por eso `RecoveryExecuted` se emite con expediente y sin datos personales, y los eventos sensibles se minimizan.

**Nota estructural:** un rechazo por revert no deja un log útil. Por eso la auditoría operativa de rechazos vive fuera de la cadena, y esa fuera de cadena es otra superficie de metadatos.

### 2.4 Tiempos

**Expone:** cuándo ocurre cada cosa, con precisión de bloque, y el orden en el mempool.

**Inferencias:** husos horarios y rutinas de una persona; días de pago y ciclos de nómina; que dos direcciones pertenecen al mismo usuario porque actúan siempre en la misma ventana; que una operación grande está a punto de ocurrir, por su preparación.

**Riesgo específico:** una operación automatizada a hora fija identifica a la organización que la ejecuta.

### 2.5 Importes

**Expone:** cada cantidad exacta, en unidades base.

**Inferencias:** un importe poco común es un identificador. Si una cantidad sale de una dirección y entra en otra, aunque pasen por intermediarios, el importe las enlaza. Los importes redondos indican compra a precio fijo; los importes con muchos decimales indican conversión y revelan la tasa usada.

**Riesgo específico:** las técnicas de agrupación por importe funcionan incluso con retardos y con saltos intermedios.

### 2.6 Recibos

**Expone:** gas consumido, estado de éxito o fallo, eventos emitidos y dirección efectiva del remitente.

**Inferencias:** el gas consumido revela **qué rama de código se ejecutó**, incluso cuando la operación no emite eventos distintivos. Distingue un primer uso de un uso repetido, una operación con política aplicada de una sin ella, y a veces el tamaño de una estructura recorrida.

**Riesgo específico:** un recibo público diseñado para transparencia puede filtrar por gas lo que el diseño pretendía ocultar.

### 2.7 Respaldos

**Expone:** todo lo que había en el sistema en el momento de la copia, incluido lo que después se borró.

**Inferencias:** un respaldo conserva vínculos entre cuenta y dirección, datos personales y material cifrado mucho después de que la política de retención los haya eliminado del sistema vivo. Una restauración en un entorno menos protegido traslada todo eso a un lugar con menos controles.

**Riesgo específico:** el borrado por política no alcanza a los respaldos salvo que se diseñe expresamente. Cambiar direcciones de correo en una copia **no anonimiza** una base con llaves, biometría o movimientos.

### 2.8 Analítica

**Expone:** rutas de navegación, dispositivo, dirección IP, idioma, resolución, momento de uso y, con demasiada frecuencia, identificadores de cuenta en la URL o en los eventos.

**Inferencias:** un tercero de analítica recibe la asociación entre una persona identificable y su actividad financiera. La dirección IP más el momento permiten cruzar con la cadena: si una operación se firma justo después de una visita, el tercero puede asociar dirección de red y dirección de cadena.

**Riesgo específico:** un identificador de cuenta o una dirección en una URL se envía en la cabecera de origen a todos los recursos de terceros de esa página.

### 2.9 Proveedor de tarjeta y pagos

**Expone:** al proveedor, la identidad del titular, el comercio, el importe, el momento y la ubicación aproximada. Al sistema, los datos que el proveedor devuelva.

**Inferencias:** el proveedor conoce el patrón de consumo completo. Si además se le envía un identificador interno, puede enlazarlo con la actividad en cadena. El cruce entre una liquidación en cadena y una transacción de tarjeta por importe y momento es directo.

**Riesgo específico:** guardar datos de tarjeta en registros amplía el alcance de cumplimiento y crea un objetivo. Se usa la tokenización del proveedor y se evalúa el alcance de los datos de tarjeta.

---

## 3. Riesgos transversales

### 3.1 Compromisos deterministas

Un compromiso calculado siempre igual a partir del mismo dato **es un identificador estable**. Publicado en dos contextos, los une. Si el espacio del dato es pequeño o predecible (un documento de identidad, una fecha, un importe), se recupera por fuerza bruta.

**Mitigación:** aleatorización en el compromiso, secreto de apertura gestionado, y documentar explícitamente qué se puede inferir de cada compromiso publicado.

### 3.2 Agregados pequeños

"Total por país" o "total por categoría" identifica a una persona cuando en esa celda hay una sola. Dos publicaciones sucesivas de un agregado revelan la diferencia, que puede ser una única operación.

### 3.3 Correlación entre capas

El riesgo mayor no está en ningún canal: está en el cruce. Momento en analítica, más importe en cadena, más liquidación del proveedor, identifican a una persona aunque cada canal por separado parezca anónimo.

### 3.4 Enumeración del directorio

Un servicio que resuelve Account Number o alias a una dirección permite, sin límite de tasa, construir el mapa completo. Por eso la resolución es autenticada, con límite de tasa y con vigencia corta, y el vínculo entre cuenta y dirección es privado por defecto y se expone sólo por propósito.

### 3.5 Documentos no confiables

Los documentos que entran al sistema (expedientes, informes, adjuntos) pueden contener instrucciones dirigidas a un procesamiento automático. Se tratan como datos, nunca como instrucciones, con escaneo, límites de herramientas y citas al expediente.

---

## 4. Qué no resuelve nada de esto

- Ocultar el explorador.
- Quitar saldos de terceros de una pantalla.
- Publicar hashes en vez de datos, cuando el dato es adivinable.
- Renombrar campos.
- Un aviso legal.

---

## 5. Qué haría falta de verdad

Depende de qué se quiera ocultar y frente a quién. Esa es exactamente la pregunta de **D06**. Los dos candidatos, con sus garantías reales y sus límites, están en `prototipo-custodial.md` y `prototipo-criptografico.md`.

## 6. Cierre de la compuerta G4

G4 se cierra comprobando, para el alcance concreto que se quiera lanzar, **qué puede inferir un observador por RPC, calldata, logs, tiempos, importes y recibos, y qué ve cada actor**, y publicando esos límites. No se cierra añadiendo una pantalla.
