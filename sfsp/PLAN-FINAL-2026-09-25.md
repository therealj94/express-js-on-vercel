# Plan final · SFSP como base, con su identidad propia (SFSP-ID), y el día de la subida

**25 de septiembre de 2026 · versión 2.** Este documento reemplaza la versión 1 de la mañana y junta en uno:
- el plan de construcción del 24-sep (`PLAN-DE-CONSTRUCCION-2026-09-24.md`, olas 0 a 6), que sigue teniendo el detalle de cada ola;
- **SFSP-ID** (`spec/SFSP-160-SELF-SOVEREIGN-IDENTITY.md`): la identidad de SFSP, construida sobre los estándares de Web5;
- Dr Electrum y AU-RA;
- el orden exacto de subida para cuando AWS levante la restricción, y después a vivo.

**Las dos reglas que mandan sobre todo lo demás:**
1. **La base es SFSP.** Web5 aporta formatos para que otros puedan verificar lo nuestro. Las reglas, la cadena, los emisores y los nombres son nuestros.
2. **Todo se construye completo y se sube apagado.** Nada se enciende, nada toca dinero y nada se escribe en la 5550 sin tu orden y sin su decisión firmada (`BLOCKED_DECISION` mientras tanto).

---

## 1 · La identidad de SFSP en una página

| Pregunta | Respuesta |
|---|---|
| ¿Cuál es nuestro identificador? | **`did:sfsp`**, un método propio sobre la 5550 |
| ¿Cómo se identifica una persona? | `did:sfsp:5550:p:…`, **uno por relación** (banco, DBNX, Veta…). Los deriva su billetera de una sola semilla. No se registra en ningún lado |
| ¿Y una empresa o un emisor? | `did:sfsp:5550:org:<nombre>`, en el contrato **`SFSPDidRegistry`**. Lo admite la Junta y sus llaves las maneja su propia multifirma |
| ¿Y el GID? | **La raíz privada de todo.** Una persona tiene un solo GID (así nadie se duplica), pero el GID **nunca se publica**: si fuera público, seguiría a la persona por todas partes (SFSP-110 §4). Genesis ID sabe qué identificadores son de qué GID; nadie más lo puede deducir |
| ¿Cuál es el número público de la persona? | Su **número de cuenta SFSP** (`SF-XXXX-XXXX-XXXX-C`): sin datos personales, sirve para recibir |
| ¿Qué le da Genesis ID? | **Credenciales SFSP** (KYC, KYB, acreditación, licencia) a su `did:sfsp`, con aprobación humana. La credencial no lleva datos: lleva la huella |
| ¿Qué queda en la cadena? | La **atestación** de `SFSPIdentityAdapter` (ya existía), con la misma huella que la credencial y un compromiso que no identifica a nadie |
| ¿Qué controla la persona? | Qué revela y a quién, los permisos que da a cada app y sus datos, cifrados a su llave |
| ¿Y los de fuera? | `did:key` y `did:web` **se aceptan para interoperar** (un banco extranjero, una billetera ajena). Lo nuestro nunca los usa |

---

## 2 · Dónde estamos hoy (comprobado)

| Pieza | Estado |
|---|---|
| Protocolo SFSP `draft-0.4` | 15 series. **Verificación completa en verde** (cifras al final de este plan) |
| **SFSP-ID (SFSP-160)** | **Hecho en código**: el contrato `SFSPDidRegistry` (9 pruebas), el SDK `sfsp-id` (22 pruebas) y tres pruebas cruzadas con los contratos reales (credencial ↔ atestación, `did:sfsp` resuelto desde la cadena, eventos contra la fuente única) |
| Eventos del protocolo | 35 en `eventos.json`: 18 con contrato y 17 sin contrato todavía |
| Veta Wallet web | Restaurada con sus arreglos. **Sin publicar**: AWS restringido |
| Dr Electrum · oficina por voz | **En vivo** en `ultron-looi-desk.onrender.com/electrum-oficina/` |
| Dr Electrum · catastro y llave de demostración | **Desconectados**: faltan `ELECTRUM_DB_URL` y `ELECTRUM_CLAVE` en Render |
| AU-RA / ULTRON FP | En vivo. Su memoria en S3 y su acceso a los nodos dependen de AWS |
| Cadena 5550 | Produce bloques. Sin acceso SSM a los nodos |
| Cuenta de AWS | **Restringida** (caso 178961886800858) |

---

## 3 · Las olas, con SFSP-ID dentro

| Ola | Lo de siempre (detalle en el plan del 24-sep) | SFSP-ID en esta ola |
|---|---|---|
| **0 · Cimientos** | Un solo backend, nada se publica solo, secretos, una sola fuente de precio y red, un solo puente Genesis ↔ Veta, `/version`, SDK empaquetado | El SDK empaquetado lleva `sfsp-id`. **Apagar el autodespliegue** de los 4 servicios de Render que publican solos (§8) |
| **1 · Diseño** | Las 8 pantallas | **9.** Veta: **«Mis credenciales»** (qué tengo, quién lo emitió, qué comparto con quién y un botón para revocar). **10.** La **hoja de consentimiento** cuando una app pide un dato. **11.** Genesis: la pantalla del **aprobador humano** que emite la credencial |
| **2 · Protocolo** | Licencias, elegibilidad, pasaporte, emisión, commodities, oráculo y tesorería, red cerrada, pagos | **`SFSPDidRegistry` ya está escrito y probado.** Entra en el manifiesto de despliegue y en la red cerrada como contrato registrado |
| **3 · Servicios** | Indexador, DBNX, precio único, conciliación, emisor en Genesis, exposición, directorio, salud | **El emisor de Genesis es `EmisorGenesis`**, con dos llaves en el KMS. El indexador ya decodifica los 6 eventos `OrgDid*`. **Nodo personal fase B** |
| **4 · Productos en sombra** | Genesis, backend, Veta, ORDENSCAN, Ordenex, DBNX, MyTokenPay, AuCorp, AU-RA | **Veta** guarda la semilla de identidad y deriva un `did:sfsp` por relación. **DBNX y el backend** verifican presentaciones en sombra, al lado de lo actual. **Dr Electrum y AU-RA** piden permiso para leer expedientes. **ORDENSCAN** muestra las organizaciones del registro |
| **5 · Ensayo general** | Los 12 escenarios | **13.** Registrar `genesis_kyc` en el registro de la 5534. **14.** Una persona recibe su KYC, prueba «mayor de edad y KYC 2» sin revelar nada más; Genesis revoca y deja de pasar dentro y fuera de la cadena. **15.** Rotar la llave del emisor sin tumbar credenciales vigentes. **16.** Una billetera de terceros lee nuestras credenciales |
| **6 · Paquete de encendido** | P11 por servicio y el runbook de 8 pasos | **Paso 5-bis:** desplegar `SFSPDidRegistry` en la 5550 y registrar `genesis_kyc`, con D22 y D07 firmadas |

---

## 4 · El día que AWS levante la restricción

Antes de empezar, corre `node sfsp/deploy/preflight-subida.mjs`: solo lee y dice qué falta.

### Bloque A · Recuperar la casa (día 1, unas 2 horas)

| # | Qué | Se comprueba con |
|---|---|---|
| A1 | Confirmar en el caso de soporte que la restricción está levantada | Un despliegue de prueba en Amplify no da el error de facturación |
| A2 | **Llaves nuevas, una por función y con el mínimo permiso**: `amplify-subida`, `ses-correo`, `s3-memoria-aura`, `electrum-subida`. Te paso las políticas exactas | Cada llave hace lo suyo y **falla** en lo demás |
| A3 | Roles de los nodos otra vez (`EC2-SSM-Core`, `og5550-validador-node3..6`) | Los nodos aparecen en SSM |
| A4 | Las llaves van a la configuración del entorno (Claude, Heroku, Render), **nunca por el chat** | `preflight` las ve por nombre |
| A5 | **Borrar las llaves que pasaron por el chat**: la de Render `rnd_8rE3…` y las de AWS | Ya no autentican |

### Bloque B · Lo que ya está listo (día 1)

| # | Qué | Se comprueba con |
|---|---|---|
| B1 | **Veta Wallet web**: ensayo, revisión y después producción, con el mismo artefacto (P11) | `comparar-publicado.py`: **0 diferencias**; `privacidad.html` y `terminos.html` presentes |
| B2 | **Catastro de Dr Electrum**: el túnel al PostGIS por SSM y `ELECTRUM_DB_URL` en Render | «¿Qué concesiones vencen en 90 días?» contesta con datos |
| B3 | **Llave de demostración de Electrum** (`ELECTRUM_CLAVE`) | El enlace `?llave=` abre la oficina |
| B4 | **Memoria de AU-RA en S3** | `/api/health` sin el aviso de disco efímero |
| B5 | **Vigía y correo** (Lambda y SES) | Llega una alerta de prueba |

### Bloque C · Lo que se sube apagado (semanas 1 a 11)

Olas 0 a 5, con los interruptores apagados y visibles en `/salud`. SFSP-ID vive en el **ensayo (5534)**: registro de organizaciones, emisor de Genesis y verificación en DBNX.

### Bloque D · A vivo, con tu firma (sin fecha)

Es el paso a paso de la ola 6. Cada paso es una orden tuya con su decisión firmada:

| Paso | Qué pasa | Qué hace falta |
|---|---|---|
| 1 | Subir apagado a producción | Firma P11 |
| 2 | Sombra en producción | Firma P11 |
| 3 | Equivalencia: cero diferencias sobre el censo real | El informe |
| 4 | Conmutar, producto por producto | Firma P11 por producto |
| 5 | Contratos del protocolo en la 5550, **incluido `SFSPDidRegistry`**, y registro de activos | §16 del v0.2, D07, D08, D09, **D22** y la auditoría |
| 5-bis | **Registrar `genesis_kyc`** y empezar a emitir credenciales a personas reales | D22 |
| 6 | Red cerrada | El manifiesto completo y D07 |
| 7 | Parámetros económicos por acta | D01, D02, D03 y D04 |
| 8 | AUKA y AGKA con metal | Metal custodiado, D05 y la licencia Clase G |

---

## 5 · Qué código está listo y dónde

| Repo · rama | Qué | Estado |
|---|---|---|
| `express-js-on-vercel` · `claude/galaxy-web-review-260wt4` | SFSP `draft-0.4` + SFSP-ID (contrato, SDK, pruebas) | **Verificación completa en verde.** Sin fusionar a `main` hasta tu orden |
| ídem | Veta Wallet web restaurada | Paquete P11. Espera a AWS (B1) |
| `ULTRON-APP` · `main` | Oficina de Dr Electrum por voz | **En vivo** |

---

## 6 · Lo que se puede decir en público, y cuándo

| Frase | Cuándo |
|---|---|
| «SFSP: cada activo con pasaporte y cada movimiento con evento público sin datos personales» | Con los contratos en la 5550 (paso 5) |
| «SFSP-ID: identidad autosoberana de SFSP, con estándares W3C» | Con credenciales reales emitidas a personas reales y guardadas en Veta (paso 5-bis) |
| «Web5» | Solo con SFSP-160 §10 completo: además, un verificador en producción, una billetera de terceros, el nodo personal y una revisión externa |
| «Respaldado», «regulado», «licenciado», proyecciones de precio | **Nunca**, salvo lo que diga el acta |

---

## 7 · Revisión hecha a este código

- **Prueba adversaria** de cada pieza:
  - datos alterados, credencial ajena, reto reusado, otra audiencia;
  - emisor caído, llave del emisor revocada o de baja, lista de revocación falsa;
  - mezcla de ensayo y producción, red desconocida;
  - registro con demasiadas llaves.
- **Dos fallos encontrados en la revisión y corregidos, con su prueba:**
  - una red desconocida producía una excepción en vez de un código;
  - un registro con miles de llaves hacía miles de llamadas al nodo.
- **Pruebas cruzadas contra los contratos reales**, no contra copias:
  - el SDK y el contrato calculan el mismo compromiso y el mismo digest;
  - el SDK resuelve `did:sfsp` leyendo el registro desplegado;
  - los 6 eventos coinciden campo a campo con la fuente única.
- **Límites que la revisión no cubre, dichos claro:**
  - no hay auditoría externa de los contratos nuevos (se recomienda antes de la 5550, ola 5);
  - no hay revisión criptográfica externa de la derivación por relación ni del sobre cifrado.

---

## 8 · Hallazgo en Render (solo lectura, 25-sep)

Cuatro servicios se publican solos desde ramas de trabajo:
- `Ultron-fp` y `genesis-id`, desde `claude/veta-wallet-phantom-design-7syah8`;
- `genesis-id-api`, desde `claude/genesis-id-verification-engine-wj75mj`;
- `tesoreria`, desde `claude/security-tokens-treasury-platform-tk5g77`.

La ola 0.2 los pasa a publicación manual. `ultron-looi-desk` sigue publicando desde `main`, como está acordado.

---

## 9 · Qué necesito de ti

1. **Aprobar este plan.**
2. **Firmar o ajustar D22**: el método `did:sfsp`, el registro de organizaciones, el emisor inicial `genesis_kyc` y cuándo comunicarlo. La propuesta está en `DECISIONES-SFSP.json`.
3. **Avisarme cuando AWS levante la restricción.** Empiezo el bloque A contigo.
4. Lo pendiente del 24-sep:
   - el backend canónico;
   - las compuertas de publicación;
   - las tres respuestas de la fase 2;
   - rotar la contraseña de H01 y la clave de CoinMarketCap.
5. **Borrar las llaves que pasaron por el chat.**

---

## Cifras de la verificación (25-sep, commit `082a2a56`)

| Suite | Pruebas |
|---|---|
| SDK (incluye SFSP-ID, 22) | 186 |
| Contratos (incluye `SFSPDidRegistry` y las pruebas cruzadas) | 200 |
| Indexador | 67 |
| API de DBNX | 86 |
| Pruebas adversarias | 14 |
| **Total** | **553, todas en verde** |

`verificar-todo`: `VERIFICACION_COMPLETA` con el árbol limpio. Conformidad: 8 de 8. Decisiones pendientes: 23. Parámetros económicos con valor: 0.
