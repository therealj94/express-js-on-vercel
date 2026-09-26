# SFSP-200 · Securities

> **Enmienda SFSP-410 (propuesta, 26-sep-2026, pendiente D23):** el 49 % que retiene el emisor en la colocación 51/49 es **supply autorizado, no acuñado**: se acuña al colocarse, al inversor, y nunca hacia el emisor ni hacia una cuenta interna (R1). Con emisión y quema continuas, el tope que gobierna el día a día es el de stock; el acumulado queda como techo de vida del instrumento (D24). Ver `spec/SFSP-410-SUPPLY-POLICY.md`.
>
> **Nota draft-0.5:** el v0.3 §4.3 describe lo acuñado como unidades en billeteras internas, tratadas como tesorería. Para securities esa lectura choca con R1 de SFSP-410. Hasta D23 rige esta enmienda; ver §0.3, regla 4.

| Campo | Valor |
|---|---|
| Serie | SFSP-200 · Securities |
| Estado | `draft-0.5` (alineada con el borrador SFSP v0.3 §5 y §8) |
| Fuente de tipos | `CONTRATO-INTERNO.md` §1, §2.3, §2.4, §3 |
| Parte del plan maestro | P7c (DBNX), P4 emisión de securities, P3 entregables 3 y 5 |
| Decisiones que la bloquean | D08 (clasificación, derechos y elegibilidad por activo y país), D13 (autorizaciones RFSA/RFCA), D07 (quórums de emisión y firmantes de DBNX), umbrales de los segmentos y parámetros de deslindes (v0.3 §18), D23 (acuñación de la porción no colocada) |

**Qué NO afirma este documento:** no afirma que exista ninguna autorización jurídica para ofrecer, emitir o negociar ningún instrumento, ni que ninguna plantilla de derechos haya sido aprobada; no clasifica ningún activo existente.

---

## 0 · Alineación con el borrador SFSP v0.3 (26-sep-2026)

> **Cómo leer esta sección.** El borrador SFSP v0.3 sustituye al v0.2 y es la regla (`../PLAN-SFSP-v0.3-2026-09-26.md`). Es un documento interno y **no está en el repositorio**: aquí se cita por sección (`v0.3 §n`), no se copia. Para la especificación, el v0.3 manda: la regla de más abajo que contradiga esta sección queda sustituida. Para ejecutar en la 5550 sigue haciendo falta la decisión firmada: lo que dependa de una decisión `PENDIENTE` en `../DECISIONES-SFSP.json` devuelve `BLOCKED_DECISION`.

### 0.1 Roles: DBNX admite y supervisa; no valúa (v0.3 §5, §5.1)

| Actor | Hace | No hace |
|---|---|---|
| DBNX | Admite y clasifica emisores, verifica el expediente contra requisitos publicados, autoriza supply, exige reporte, supervisa y suspende | **No valúa**, no certifica estados financieros, no emite ni acuña, no administra el negocio del emisor |
| Orden Global | Verifica **la forma** del documento de aprobación (§0.5) y ejecuta la acuñación autorizada | No crea supply sin autorización de DBNX, no valúa |
| Valuador independiente | Emite el dictamen de valuación, **contratado por el solicitante** | No participa en el emisor, no cobra en función del resultado |
| Auditor del emisor | Opina sobre los estados financieros | No responde por la gestión del emisor |

1. DBNX se documenta como **operador y entidad de autorregulación** del Mercado de Valores Inclusivo. «Regulador» se reserva para RFSA. La jurisdicción y el reglamento de DBNX quedan por definir (v0.3 §18).
2. Lo que DBNX hace después de la admisión se llama **supervisión**, no auditoría: la auditoría certifica información y DBNX no certifica la información del emisor.
3. La escala R1–R5 es una **clasificación interna de admisión** divulgada con lenguaje de advertencia, no una calificación de riesgo pública (§6).

### 0.2 Modelo de supply (v0.3 §8.1)

```
supplyAutorizado = floor(capitalAutorizadoACaptar / precioVigente)
```

La valuación independiente, verificada por DBNX, fija el **precio** por token, no la cantidad. Toda ampliación declara cuál de estas dos operaciones es y **presenta su prueba de neutralidad**:

| Operación | Mecánica | Efecto sobre el tenedor | Evento |
|---|---|---|---|
| `COLOCACION_NUEVA` | Se colocan tokens nuevos al precio vigente | Neutro si el precio es correcto; **dilutivo si se coloca por debajo** | `SupplyExpansionDeclared` y después `MintExecuted` |
| `DIVISION` | Se multiplican las unidades de **todos** los tenedores en la misma proporción, sin captar capital | Neutro por definición; el precio se ajusta a la inversa | `SupplyExpansionDeclared` y `SplitExecuted` |

Una ampliación sin declaración, o una colocación por debajo del precio vigente sin la declaración de dilución, se **rechaza**.

### 0.3 Colocación: hasta el 51 % y un mínimo por segmento (v0.3 §8.2, §8.4)

| Regla | Valor |
|---|---|
| Colocación al público | **Máximo 51 %** del supply autorizado. Es un tope: cada emisor elige cuánto coloca por debajo y conserva el resto |
| Mínimo de colocación, Mercado Principal | `null`, `BLOCKED_DECISION` (umbrales de los segmentos, v0.3 §18) |
| Mínimo de colocación, Mercado de Crecimiento | `null`, `BLOCKED_DECISION` (umbrales de los segmentos, v0.3 §18) |
| Porcentaje en circulación por periodo | Lo autoriza DBNX en cada periodo, con calendario de liberación progresiva |
| Vesting, aceleración y porción retenida ante cambio de control | Pendiente (v0.3 §8.2) |

1. El mínimo existe porque un token con muy poca cantidad en circulación es fácil de manipular y difícil de supervisar. Mientras sea `null`, **ninguna admisión se resuelve favorablemente**: la capacidad que depende de él devuelve `BLOCKED_DECISION`.
2. Una colocación que lleve lo colocado por encima del 51 % del supply autorizado se rechaza con `DENY_LIMIT`.
3. El 51 % sustituye al «51/49» del v0.2: el 49 % ya no es una porción fija retenida sino lo que el emisor decide no colocar.
4. Si la porción no colocada se acuña o queda como supply autorizado sin acuñar es un punto abierto entre el v0.3 §4.3 (lo acuñado queda en billeteras internas, tratado como tesorería) y la enmienda SFSP-410 de la cabecera (no se acuña hacia cuentas internas). Hasta que se decida (D23), rige la enmienda SFSP-410 para esta serie y **las dos cifras se publican** en el pasaporte: supply autorizado, emitido y en circulación (v0.3 §4.2).

### 0.4 Expediente de admisión en ocho bloques; el Bloque 7 es condición de admisión (v0.3 §8.3)

Bloques 0 a 7: apertura, identidad y control, activos y titularidad, estados financieros y valuación, instrumento, riesgo, divulgación continua, **responsabilidades y deslindes**. La máquina de estados del caso es la del v0.3 Apéndice A (`ESTADOS-Y-EVENTOS.md`).

**Valor admisible de cada activo de la canasta:**

```
V_admisible_i = V_valuado_i × participaciónEfectiva_i × factorTitularidad_i
                × (1 − descuentoFaltaDeControl_i) × (1 − descuentoIliquidez_i)
                × factorConcentración_i
ValorCanasta  = Σ V_admisible_i        (no es la suma de los avalúos)
```

| Estado de titularidad | Factor |
|---|---|
| Perfeccionada | Pleno |
| Perfeccionada con gravamen | Reducido por el monto del gravamen |
| En trámite | Parcial, **con vencimiento**: si vence sin resolverse, el factor baja solo |
| Contingente | Mínimo o nulo |
| No perfeccionada | Nulo |

Reglas del expediente:

1. La concentración se mide **por activo y por familia**. Los activos en trámite y contingentes tienen tope de concentración.
2. **Prohibición de circularidad:** los activos digitales del propio ecosistema **computan cero** en una canasta.
3. Créditos de carbono: reconocimiento bajo o reservados hasta tener política propia.
4. **La valuación la elabora siempre un valuador independiente contratado por el solicitante**, para todo emisor (no solo los del ecosistema). DBNX verifica que el dictamen cumpla los requisitos publicados de metodología, vigencia e independencia. Independencia: sin participación en el emisor, sin servicios de estructuración prestados y sin honorarios contingentes al resultado.
5. Estados financieros auditados según el segmento: firma acreditada para el Mercado de Crecimiento, firma de categoría AA para el Mercado Principal (qué firmas califican: pendiente, v0.3 §18).
6. Un activo que no encaja en ninguna familia se admite si responde las cuatro preguntas (existe, es del solicitante, se puede transferir, cuánto vale), y DBNX registra la familia nueva.
7. La solicitud la firma quien acredite facultades, con **declaración de veracidad y completitud** que responsabiliza personalmente al firmante (Bloque 0).

#### 0.4.1 Bloque 7 · Responsabilidades y deslindes

**Es condición de admisión.** Un caso no pasa a `resuelto favorablemente` ni a `resuelto con condiciones` sin los instrumentos firmados de §0.4.1.g registrados por hash y versión. Mientras falten, la admisión devuelve `BLOCKED_DECISION`.

**a. Cada dato tiene un autor que responde por él, y ningún eslabón responde por el trabajo de otro.**

| Actor | Responde por | No responde por |
|---|---|---|
| Emisor | La veracidad de lo que presenta, la gestión del negocio y del capital captado, la divulgación continua | No puede trasladar a otro la responsabilidad por lo que declara |
| Auditor | Su opinión sobre los estados financieros | La gestión del emisor |
| Valuador | Su dictamen, la metodología y su independencia | El precio de mercado posterior |
| Custodio y fiduciario | Existencia, segregación e inmovilización de lo que guarda, y sus atestaciones | El valor del activo |
| DBNX | La verificación del expediente contra sus requisitos publicados y la supervisión conforme a su proceso | La valuación, los estados financieros, la veracidad del emisor y el resultado de la inversión |
| Orden Global | La acuñación exacta de lo que autoriza el documento de aprobación y el funcionamiento de la red | El contenido de la aprobación y el activo |
| Au Corp. | La ejecución de órdenes, la custodia de clientes y los rieles de moneda fiduciaria | El valor de los activos negociados y la liquidez del mercado |

**b. Niveles de responsabilidad.**

| Nivel | Alcance | Tratamiento |
|---|---|---|
| Fuera de la función | Lo que el actor no se obligó a hacer | Sin responsabilidad |
| Error operativo | Negligencia ordinaria en la propia función | Daño directo de la operación afectada, sin daños indirectos ni lucro cesante, con **tope total por incidente** para cada entidad (`null`, `BLOCKED_DECISION`) |
| Dolo, culpa grave y obligaciones legales | Fraude, descuido grave, prevención de lavado, segregación de activos | Responsabilidad plena, **declarada expresamente** |

Los deslindes se redactan para sostenerse frente al estándar de protección al consumidor más estricto razonable de la región, no solo frente al marco de Próspera. Con clientes institucionales el tope puede pactarse aparte. **Pendiente de verificación legal** la oponibilidad frente a minoristas (v0.3 §8.3, §19).

**c. Ventanilla única de reclamos.** DBNX la opera **desde el lanzamiento**. El adquirente reclama en un solo lugar y DBNX lo dirige a la entidad responsable según la tabla (a). Plazo de respuesta: `null`, `BLOCKED_DECISION`. Vencido el plazo, el adquirente queda libre de ir a arbitraje o a tribunales: el reclamo previo es un paso del proceso, no una renuncia a la vía judicial cuando la ley del adquirente la garantiza.

**d. Fondo de protección.** Cubre **errores operativos de los operadores** cuando la entidad responsable no paga, hasta un límite por persona. No cubre pérdidas de inversión ni el fraude de un emisor. Se alimenta con una fracción de las comisiones **desde el lanzamiento**, paga reclamos a partir de una segunda fase, y lo administra alguien independiente de las entidades que cubre. Mientras tanto, cada entidad cubre el nivel de error operativo con un seguro de responsabilidad. Fracción de comisiones y límite por persona: `null`, `BLOCKED_DECISION`.

**e. Rendición de cuentas.** El solicitante reporta la aplicación de los fondos contra el destino declarado, con periodicidad definida y explicación de las desviaciones. DBNX puede pedir más información, ordenar auditoría con cargo al solicitante ante indicios de desviación y aplicar la escala de estados hasta la suspensión. Esa facultad se ejerce sobre la información y el estado del listado, no sobre las decisiones de negocio.

**f. Declaración del adquirente.** Antes de adquirir, el adquirente reconoce que la admisión no es garantía ni recomendación, que la clasificación de riesgo no asegura resultado, que la gestión corresponde al emisor y que puede perder su inversión. **Se registra en cadena con la versión del documento aceptado** (`AcquirerDeclarationRecorded`: `documentHash`, `documentVersion`). Una adquisición sin declaración vigente para la versión en curso de los términos se rechaza. La fricción es proporcional al riesgo (§0.6).

**g. Instrumentos firmados.** Acuerdo de admisión (DBNX–solicitante), términos de servicio de infraestructura (Orden Global–emisor) y términos del adquirente. El protocolo registra hashes y versiones aceptadas; la fuerza legal viene de los documentos.

**h. Declaración falsa.** Acreditada la declaración falsa u omisión material, DBNX revoca la admisión (código `DECLARACION_FALSA`), publica la causa, y el solicitante responde frente a los adquirentes. DBNX puede rechazar dictámenes posteriores del profesional o la firma responsable, con fundamento registrado.

**i. Atestaciones y dictámenes.** Cada uno identifica firmante y fecha y tiene vigencia declarada. La atestación vencida degrada sola el reconocimiento del activo. Auditor, valuador, custodio y fiduciario quedan identificados en el Asset Passport; esos campos **no se omiten por razones comerciales**.

### 0.5 Verificación previa a la acuñación (v0.3 §5, §8.3 Bloque 7)

Antes de acuñar, Orden Global verifica **la forma** del documento de aprobación de DBNX, **no el fondo**:

| # | Comprobación | Si falla |
|---|---|---|
| 1 | **Completo**: el documento referenciado por hash en la autorización existe y tiene todos los campos exigidos (activo, cantidad, destino o regla de destino, vigencia, firmantes) | Rechazo, `VERIFICACION_PREVIA_FALLIDA` |
| 2 | **Firmado** por los firmantes de DBNX facultados para esa acción (quórum D07) | Rechazo, `DENY_AUTHORIZATION` |
| 3 | **Vigente** en el momento de acuñar, y no consumido | Rechazo, `DENY_AUTHORIZATION` |
| 4 | **Cantidad exacta**: lo que se acuña coincide con lo autorizado | Rechazo, `VERIFICACION_PREVIA_FALLIDA` |

Reglas:

1. **La regla aplica también cuando Orden Global es el solicitante**: pasa por DBNX en las mismas condiciones que cualquier emisor. No hay ruta de acuñación propia exenta.
2. La verificación de forma **no traslada** a Orden Global la responsabilidad por el contenido de la aprobación (Bloque 7, tabla a).
3. «Cantidad exacta» sustituye, para la acuñación, a la regla de §3.1 que admitía acuñar por debajo del monto autorizado en varias veces. Una autorización que prevea tramos declara la cantidad exacta de cada tramo, y cada acuñación ejecuta un tramo completo.
4. Se implementa sobre la autorización ligada al contenido (ADR-013, SFSP-800 §12): el digest aprobado compromete el hash del documento de aprobación. Un rechazo por forma no emite evento de supply; queda en el registro operativo.

### 0.6 Segmentos y acceso del adquirente (v0.3 §8.4, §8.5)

`PRINCIPAL` y `CRECIMIENTO`; `INSTITUCIONAL` queda reservado sin activar. El segmento (madurez del emisor) y el nivel de riesgo (riesgo del instrumento) son **variables distintas y se publican las dos**. Se asciende y se desciende de segmento.

En el Mercado de Crecimiento el acceso se controla por **límite de exposición**, no por perfil de inversionista:

1. Por **Genesis ID**, no por dirección.
2. Sobre la **exposición agregada al segmento**, no por activo.
3. Contra el **valor de adquisición**, no el de mercado.
4. Como porcentaje del ingreso o patrimonio **autodeclarado**, con piso y techo, sin comprobación documental.
5. Expresado en la **unidad de cuenta del protocolo**, no en moneda local.

Lo acompañan la **fricción proporcional al riesgo** y el registro versionado del reconocimiento (`AcquirerDeclarationRecorded`, `ExposureLimitRecorded`). Porcentaje, piso y techo: `null`.

**Este acceso abierto aplica solo a los activos cuya colocación admite oferta al público.** Para los colocados bajo la oferta exenta rige el alcance de SFSP-120 §0.5 (v0.3 §8.5). Pendiente de verificación legal: si la jurisdicción de DBNX impone restricciones por perfil, conviven con el límite de exposición.

### 0.7 Tokenización de acciones (v0.3 §8.9)

Cuando el instrumento representa acciones del emisor, **las acciones tokenizadas no pueden duplicarse fuera del sistema**, ni con títulos físicos por la misma participación ni con acciones nuevas de la misma clase.

**Modelo de representación.** El token puede ser la acción misma, si la ley aplicable reconoce el registro en cadena como libro legal de accionistas, o representar una acción que un **fiduciario conserva inmovilizada**. Mientras la ley aplicable no reconozca el registro en cadena, **el protocolo adopta el segundo modelo**. El pasaporte declara el modelo y el fiduciario.

**Condiciones de admisión.** El expediente incluye, todos obligatorios:

| # | Documento |
|---|---|
| 1 | Acuerdo de la asamblea de accionistas que aprueba la tokenización |
| 2 | Reforma de estatutos: las acciones de esa clase circulan **únicamente** como tokens |
| 3 | Anotación correspondiente en el libro de registro de acciones |
| 4 | Contrato de inmovilización con el fiduciario, que conserva los títulos físicos cuando existan, con anotación de su representación en tokens |
| 5 | Compromiso del emisor de no emitir acciones de esa clase fuera del protocolo sin autorización de DBNX |

Falta uno y el caso no se resuelve favorablemente.

**Certificación periódica.** El fiduciario certifica que **las acciones inmovilizadas coinciden con los tokens en circulación**. La certificación es una atestación con firmante, fecha y vigencia; se registra en el Asset Passport (`PassportUpdated`). Si vence o falta, se activa la escala de estados de divulgación: el reporte del emisor pasa a `vencido` y luego a `en advertencia` (código `ATESTACION_VENCIDA`). Periodicidad: `null`, `BLOCKED_DECISION`.

### 0.8 Plantillas (v0.3 §8.6)

| v0.3 | `dbnx-api/src/plantillas.ts` |
|---|---|
| Patrimonial (canasta) | **No existe**: hay que añadirla |
| Capital | `EQ` |
| Deuda | `DEBT` |
| Participación en ingresos | `REV` |
| Regalía | `ROY` |
| Interés inmobiliario | `RE` |

### 0.9 Motor de pagos y acciones corporativas (v0.3 §8.7, §8.8)

**No existen.** Mientras no existan, la admisión de `DEBT` y `REV` devuelve `BLOCKED_DECISION`.

### 0.10 Diferencia con el código actual

Existen emisión (`SFSPIssuanceController`), activo regulado y `dbnx-api` (casos, plantillas, riesgo). **No existen**: la verificación previa por hash del documento de aprobación, el tope del 51 % y el mínimo por segmento, el límite de exposición, la declaración de ampliación y del adquirente en contrato, el Bloque 7 en la máquina del caso ni la tokenización de acciones. Es el punto 3 de la fase 2 del plan v0.3.

### 0.11 Pruebas de aceptación nuevas

1. **T-200-20**: Una ampliación sin `SupplyExpansionDeclared` se rechaza.
2. **T-200-21**: Una `DIVISION` multiplica todas las tenencias en la misma proporción y deja igual el valor agregado a precio ajustado.
3. **T-200-22**: El límite de exposición se agrega entre todas las direcciones del mismo Genesis ID.
4. **T-200-23**: La exposición se computa contra el valor de adquisición: una subida de precio no bloquea compras nuevas.
5. **T-200-24**: Un token del propio ecosistema dentro de una canasta computa cero.
6. **T-200-25**: Una atestación en trámite vencida baja el factor sin acción humana.
7. **T-200-26**: La admisión de `DEBT` o `REV` sin motor de pagos devuelve `BLOCKED_DECISION`.
8. **T-200-27**: Un caso sin los instrumentos del Bloque 7 registrados no pasa a `resuelto favorablemente` ni a `resuelto con condiciones`.
9. **T-200-28**: Una acuñación con documento de aprobación incompleto, sin las firmas de DBNX, vencido o con cantidad distinta de la autorizada se rechaza.
10. **T-200-29**: La misma acuñación pedida por Orden Global como solicitante sigue exactamente la ruta de T-200-28; no existe ruta propia.
11. **T-200-30**: Una colocación que lleva lo colocado por encima del 51 % del supply autorizado se rechaza con `DENY_LIMIT`.
12. **T-200-31**: Con el mínimo de colocación del segmento en `null`, la admisión devuelve `BLOCKED_DECISION`.
13. **T-200-32**: Una adquisición sin `AcquirerDeclarationRecorded` para la versión vigente de los términos se rechaza; una declaración de una versión anterior no sirve.
14. **T-200-33**: Un dictamen de valuación de un valuador con participación en el emisor, con servicios de estructuración o con honorarios contingentes se rechaza, y DBNX no figura nunca como valuador en el pasaporte.
15. **T-200-34**: La admisión de acciones tokenizadas sin alguno de los cinco documentos de §0.7 se rechaza.
16. **T-200-35**: Una certificación del fiduciario vencida pasa el reporte del emisor a `vencido` sin acción humana.

---

## 1 · Admisión DBNX

DBNX recibe empresas, valida su Genesis ID corporativo, revisa documentos, riesgos y derechos, y emite autorizaciones **dentro de su mandato documentado**. Orden Global comprueba la autorización y ejecuta.

### 1.1 Onboarding corporativo

Insumos mínimos: KYB, beneficiario final, mandato y representación, documentos del instrumento y derechos asociados.

### 1.2 Máquina de estado del caso

```
[ DRAFT ] --envío--> [ REVIEW ]
                        |  |  \
                        |  |   \--> [ NEEDS_INFO ] --respuesta--> [ REVIEW ]
                        |  |
                        |  +--> [ REJECTED ]   (terminal, con motivo y apelación)
                        |
                        +--> [ APPROVED ]
```

`caseId` = `case_` + 32 hex.

| Estado | Significado |
|---|---|
| `DRAFT` | Expediente en preparación por el solicitante. |
| `REVIEW` | En revisión por DBNX. |
| `NEEDS_INFO` | Falta información identificada; el plazo y el responsable están declarados. |
| `APPROVED` | Admisión aprobada. **No** es una autorización monetaria. |
| `REJECTED` | Rechazado, con motivo codificado y vía de apelación. |

Se corresponde con `AssetLifecycle.admission` (`DRAFT`, `REVIEW`, `APPROVED`, `REJECTED`, `WITHDRAWN`). `NEEDS_INFO` es un estado del caso, no del activo; el activo permanece en `REVIEW` mientras tanto.

### 1.3 Autorización posterior

La **autorización monetaria** posterior a la admisión tiene alcance, monto, versión, vigencia y firmas propias. Es una `SignedAuthorization` (§2.4 del contrato interno) y se especifica en SFSP-800.

Reglas:

1. Admisión aprobada **no** es autorización de emisión.
2. Una aprobación de Junta autoriza una acción empresarial; **no reemplaza** la revisión técnica, jurídica ni del custodio.
3. Ni un score de un modelo ni un JSON con `approved: true` dan permiso de emisión.

---

## 2 · Plantillas de derechos

Cinco plantillas mínimas. Cada una tiene `id` y `version` en `AssetPassport.rightsTemplate`.

| Plantilla | `economicType` | Contenido mínimo del derecho |
|---|---|---|
| Equity | `EQUITY` | Participación en el capital, derechos económicos, derechos políticos si existen, dilución, preferencias, transmisibilidad |
| Deuda | `DEBT` | Principal, cupón, calendario, prelación, garantías, eventos de incumplimiento, vencimiento |
| Participación de ingresos | `REVENUE_SHARE` | Base de ingresos definida, porcentaje, periodicidad, tope si existe, auditoría de la base |
| Royalty | `ROYALTY` | Base de cálculo, tasa, territorio, duración, mínimos, verificación |
| Interés económico en vehículo | `VEHICLE_INTEREST` | Vehículo, tipo de interés económico, gobierno del vehículo, gastos, waterfall, salida |

Reglas invariables:

1. **No se transforma una acción en royalty cambiando un campo.** Un cambio de plantilla es un instrumento distinto, con expediente, autoridad y, cuando corresponda, una migración (SFSP-700).
2. La `version` de la plantilla es parte del derecho. Cambiarla es cambiar derechos y requiere su propia autoridad.
3. El registro legal debe conciliar participaciones emitidas **también fuera** del contrato. El contrato no es la única fuente de la cifra emitida.
4. Una plantilla no acredita la clasificación jurídica. `legalClass` sigue siendo `null` hasta D08.

---

## 3 · Emisión

`SFSPRegulatedAsset` es una implementación real de emisión, tenencia, transferencias y retiro conforme a la política. **No es una etiqueta de registro.**

`IssuanceController` consume la autorización de DBNX/Tech, comprueba vigencia, cantidad y destinatario, y evita reutilización.

### 3.1 Límites

| Límite | Regla |
|---|---|
| Por autorización | La cantidad acuñada **acumulada** no puede superar el monto aprobado de esa autorización. **draft-0.5:** cada acuñación ejecuta la cantidad exacta del documento o del tramo (§0.5). |
| Por instrumento | `outstanding` más las reservas de emisión concurrentes no pueden superar el límite aprobado. |
| Tesorería | El inventario de tesorería ya acuñado **cuenta dentro** del `outstanding`. |
| Quema | Quemar **no** renueva automáticamente una autorización. |

Se distingue explícitamente un **cap de stock** (cuánto puede existir a la vez) de un **cap acumulado de emisión** (cuánto se ha podido acuñar en total). Son dos límites y se comprueban los dos.

### 3.2 Máquina de estado de emisión

```
[ AUTORIZADA ] --vigencia y límites comprobados--> [ EN_EJECUCION ] --> [ EJECUTADA ]
      |                                                  |
      | vencida / revocada / consumida                   +--> [ FALLIDA ]
      v                                                  +--> [ UNKNOWN ]  (estado real)
[ NO_DISPONIBLE ]
```

`UNKNOWN`, `FALLIDA` y `NO_DISPONIBLE` son estados distintos y no se colapsan. Un `UNKNOWN` se reconcilia; no se reintenta acuñando otra vez.

Emite `MintExecuted` con la referencia a la autorización concreta.

---

## 4 · Reporting

`AssetPassport.reportStatus`: `CURRENT` | `DUE` | `LATE` | `WARNING` | `NONE`.

| Valor | Significado |
|---|---|
| `CURRENT` | La divulgación exigida está al día. |
| `DUE` | Hay una divulgación exigible con plazo abierto. |
| `LATE` | Venció el plazo sin divulgación. |
| `WARNING` | Situación de divulgación que exige atención explícita al titular. |
| `NONE` | No hay obligación de divulgación declarada para este activo. |

### 4.1 El reporting es divulgación, no restricción de mercado

Esta es una separación normativa de la serie:

1. `reportStatus` **describe divulgación**. No es una restricción.
2. Las restricciones de mercado (`trading`, `transferability`) son **decisiones separadas y proporcionadas**, con su propia autoridad y su propio registro.
3. Un `LATE` **no suspende automáticamente** la negociación. Puede motivar una decisión de suspensión, que se toma, se documenta y se registra aparte.
4. Un activo `CURRENT` no queda por ello habilitado para negociar: eso depende de `admission`, `legal` y `trading`.

### 4.2 Plantilla de reporting

Cada plantilla de derechos declara: frecuencia, fecha límite, responsable, definición de evento material, canal de notificación y periodo de subsanación.

`DisclosurePublished` publica el hash del informe con su fecha límite. Un hash prueba integridad del documento presentado; **no prueba su veracidad externa**.

---

## 5 · Corporate actions

Se incluyen dividendos, cupones, votaciones y demás acciones societarias **según la plantilla**, y sólo **antes** de habilitar esos derechos se acredita el mecanismo completo.

### 5.1 Record date

1. Toda corporate action declara una **record date** explícita, con zona horaria y bloque o corte de referencia reproducible.
2. La determinación de titulares a la record date se hace sobre una lectura reproducible a bloque y hash comunes.
3. La cobertura e incertidumbre de la lista de titulares se **enumeran**. No se infiere que unos `Transfer` logs incompletos prueben todo el suministro.
4. Los titulares en custodia, tesorería, wallets de contrato y escrows se identifican por separado. La equivalencia no se comprueba sólo contra las cuentas del backend.

### 5.2 Entitlements no reclamados

1. Un entitlement no reclamado **no se extingue por no reclamarse a tiempo**.
2. Los entitlements no reclamados se **segregan** y se reconcilian por separado.
3. El mantenimiento del mecanismo de reclamación se **financia y se define**, con un mecanismo de continuidad jurídicamente aprobado.
4. No se promete que una página web funcionará eternamente. Se declara el mecanismo de continuidad.
5. La reconciliación de una corporate action compara: entitlements calculados, entitlements pagados, entitlements pendientes y entitlements no reclamados. La suma debe cuadrar y una diferencia bloquea la acción siguiente.

---

## 6 · Clasificación de riesgo R1–R5

`AssetPassport.riskStatus`:

```ts
{ level: 'R1'|'R2'|'R3'|'R4'|'R5'|'SIN_EVALUAR', methodologyVersion: string|null, evaluatedAt: string|null }
```

R1–R5 es una **clasificación relativa** con metodología aprobada. Requisitos de todo grado publicado:

| Requisito | Regla |
|---|---|
| Metodología | Versionada (`methodologyVersion`). Un grado sin metodología versionada no es un grado. |
| Factores | Explícitos y documentados. |
| Evidencia | Referenciada por `evidenceId`. |
| Fecha | `evaluatedAt`, en UTC. Un grado sin fecha no se publica. |
| Responsable | Identificado, con rol. |
| Apelación | Vía de apelación definida, con plazo y autoridad. |

### 6.1 `SIN_EVALUAR`

1. `SIN_EVALUAR` se usa **cuando falte información**. Es el valor correcto, no un defecto vergonzante.
2. **No se usa R5 como sustituto de falta de evaluación.** R5 es un grado evaluado.
3. **R1 no significa sin riesgo.** La presentación lo dice explícitamente.
4. La presentación explica **pérdida, liquidez y complejidad**, sin prometer ganancias.

Un cambio de grado emite `RiskChanged` con metodología y responsable.

### 6.2 Acceso minorista

El acceso minorista de montos pequeños se mantiene como **objetivo**, sujeto a la acción concreta y al régimen aplicable. Aceptar una advertencia **no sustituye** una autorización jurídica. Los umbrales concretos son `null`, pendientes D08 y D13.

---

## 7 · Delisting

**Delisting no elimina propiedad.**

| Qué cambia con `trading: 'DELISTED'` | Qué NO cambia |
|---|---|
| No se aceptan órdenes nuevas en el mercado | El saldo del titular |
| El activo sale del catálogo de oportunidades de compra | La visibilidad para el titular |
| n/a | Los documentos y el `documentRoot` |
| n/a | Los derechos de la plantilla vigente |
| n/a | La posibilidad de una transferencia legal fuera de mercado, si `transferability` lo permite |

Reglas:

1. `DELISTED` jamás implica `visibility: 'HIDDEN_FROM_CATALOG'` para el titular.
2. La interfaz muestra `SUSPENDED` y `DELISTED` **con saldo, documentos y causa**.
3. El **relisting exige una nueva revisión**, no una reversión administrativa.
4. El listado activo sólo filtra oportunidades de compra; el portafolio del titular es la unión del inventario legacy, sus posiciones y el registro conocido.

---

## 8 · Parámetros pendientes

| Parámetro | Valor | Decisión |
|---|---|---|
| `legalClass` por activo | `null` | D08 |
| Jurisdicciones y restricciones transfronterizas | `null` | D08 / D13 |
| Umbrales de acceso minorista | `null` | D08 / D13 |
| Metodología de riesgo aprobada | `null` | D08 |
| Límites por instrumento y por autorización | `null` | D07 / D08 |
| Frecuencias y plazos de reporting por plantilla | `null` | D08 |

Cualquier capacidad que dependa de estos devuelve `BLOCKED_DECISION`.

---

## 9 · Pruebas de aceptación de la serie

1. **T-200-01**: Un caso recorre `DRAFT -> REVIEW -> NEEDS_INFO -> REVIEW -> APPROVED` y un segundo caso termina en `REJECTED` con motivo codificado y vía de apelación. Ref. T06.
2. **T-200-02**: Una admisión `APPROVED` **no** habilita emisión sin una `SignedAuthorization` vigente. Ref. T36.
3. **T-200-03**: Una emisión que supera el monto acumulado de su autorización se rechaza con `DENY_LIMIT`. Ref. T34.
4. **T-200-04**: Quemar unidades **no** restaura capacidad de emisión en una autorización ya consumida. Ref. T34.
5. **T-200-05**: El inventario de tesorería ya acuñado cuenta dentro del `outstanding` al comprobar el cap de stock. Ref. T34.
6. **T-200-06**: Cambiar `rightsTemplate.id` de `EQUITY` a `ROYALTY` se rechaza como cambio de campo y exige instrumento nuevo. Ref. P7c.
7. **T-200-07**: Un activo con `reportStatus: 'LATE'` conserva `trading: 'LISTED'` salvo una decisión de suspensión registrada por separado. Ref. T25.
8. **T-200-08**: `DisclosurePublished` registra hash y fecha límite; el hash no se presenta como prueba de veracidad del contenido. Ref. T25.
9. **T-200-09**: Una corporate action con record date produce una lista de titulares reproducible a bloque y hash comunes, con su incertidumbre enumerada. Ref. T13, T38.
10. **T-200-10**: Los entitlements no reclamados quedan segregados y siguen reclamables tras el plazo nominal. Ref. T16.
11. **T-200-11**: La reconciliación de una corporate action cuadra calculados = pagados + pendientes + no reclamados; una diferencia bloquea. Ref. T39.
12. **T-200-12**: Un activo sin evaluación muestra `SIN_EVALUAR` y **no** R5; la interfaz no presenta R1 como ausencia de riesgo. Ref. T26.
13. **T-200-13**: Un grado sin `methodologyVersion` o sin `evaluatedAt` no se publica y devuelve `BLOCKED_DECISION`. Ref. T50.
14. **T-200-14**: Un activo `DELISTED` conserva saldo, documentos y visibilidad para el titular, y permite una transferencia legal fuera de mercado si `transferability` es `FREE`. Ref. T06, regla 6 del plan.
15. **T-200-15**: El relisting exige un caso de revisión nuevo; no existe una transición directa de `DELISTED` a `LISTED`. Ref. T07.
16. **T-200-16**: Un documento del expediente con instrucciones maliciosas embebidas no altera ninguna decisión ni dispara ninguna acción. Ref. P7c.

---

## 10 · Propuestas para el contrato interno

Integradas en `../CONTRATO-INTERNO.md` (punto C01 del plan de corrección). Esta
sección ya no propone nada: lo que este documento necesitaba está en el contrato
interno, que vuelve a ser la fuente única.

