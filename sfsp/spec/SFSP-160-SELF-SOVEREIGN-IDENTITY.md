# SFSP-160 · Identidad autosoberana (la capa Web5 de SFSP)

| Campo | Valor |
|---|---|
| Serie | SFSP-160 · Self-Sovereign Identity |
| Estado | `draft-0.4` (serie nueva, 25-sep-2026) |
| Código | `sdk/src/web5/` con 17 pruebas en `sdk/src/test/web5.test.ts` y la prueba cruzada `contracts/test/13-web5-credencial.js` |
| Se apoya en | SFSP-110 (identidad), SFSP-120 (elegibilidad), SFSP-130 (cuenta y recuperación), SFSP-600 (privacidad), SFSP-150 (red cerrada) |
| Decisiones que la bloquean | **D22** (métodos DID, dominio y llaves de emisores, comunicación), D13 (identidad y jurisdicción), D06 (privacidad) |

**Qué NO afirma este documento:**
- no afirma que Orden Global «sea Web5» hoy (ver §9);
- no afirma compatibilidad certificada con ninguna billetera de terceros: la interoperabilidad se prueba en §9, no se supone;
- no afirma que el formato de divulgación selectiva sea SD-JWT ni BBS+ (es un árbol de Merkle propio, descrito en §4.2);
- no afirma que exista hoy un nodo personal de datos en producción.

---

## 1 · La fusión en una frase

**La persona es dueña de su identidad, de sus credenciales y de sus datos; la red de liquidación sigue cerrada y regulada.**

Web5 descentraliza la *identidad* y los *datos*. No exige que la cadena de liquidación sea pública, y la 5550 sigue con permisos (SFSP-150). No hay contradicción: son capas distintas.

| Capa | Quién la controla | Serie |
|---|---|---|
| Identificador de la persona (DID) | **La persona**, desde su billetera | 160 |
| Credenciales (KYC, acreditación, licencias) | **La persona** las guarda y decide qué revela; el emisor solo puede revocarlas | 160 |
| Datos personales y expedientes | **La persona**, cifrados con su llave; las apps leen con su permiso | 160 |
| Compliance y aprobación | Genesis ID, con aprobación humana | 110 |
| Cuenta financiera | SFSP Account, número público sin datos personales | 130 |
| Liquidación y activos | La 5550, red cerrada | 100, 150, 500 |

El principio canónico de SFSP-110 se amplía:

> **DID ≠ Genesis ID ≠ SFSP Account ≠ Wallet Address ≠ Private Key.**

---

## 2 · Lo que ya estaba hecho y hace posible la fusión

El adaptador de identidad (`SFSPIdentityAdapter`) ya guardaba **solo** atestaciones firmadas, sobre un **compromiso por propósito**, con una **raíz de claims** y revocación explícita. Esa es exactamente la huella en cadena de una credencial verificable. Por eso esta serie **no cambia ningún contrato**: la capa Web5 vive en el SDK y en Genesis ID, y se proyecta en la cadena con el formato que el contrato ya acepta (§7).

---

## 3 · Identificadores (DID)

| Para | Método | Por qué |
|---|---|---|
| Personas | `did:key` con Ed25519 | Sin registro en ningún lado: el identificador **es** la llave. Nadie puede darlo de baja |
| Emisores (Genesis ID, DBNX, custodios) | `did:web` bajo un dominio de Orden Global | Un emisor debe ser público y reconocible |

Reglas:

1. **Un `did:key` por relación.** La billetera usa uno distinto con cada verificador. Dos verificadores no pueden cruzar a la misma persona, que es lo que exige SFSP-110 §4. Un DID único y global correlacionaría a la persona en todas partes.
2. **`did:ethr` no se usa para personas**: publicaría en la cadena el mapa persona → direcciones.
3. El documento de un `did:key` declara también una llave de acuerdo **X25519** derivada de la misma llave (mapa de Edwards a Montgomery), para recibir datos cifrados (§8).
4. El documento del emisor declara:
   - su llave Ed25519 de firma de credenciales (`#firma-N`);
   - **la dirección en la 5550** con la que firma las atestaciones, como `EcdsaSecp256k1RecoveryMethod2020` con `blockchainAccountId = eip155:5550:0x…`.

   Así la credencial y su proyección en cadena quedan atadas al mismo emisor, comprobable por cualquiera.
5. Un documento `did:web` cuyo `id` no coincide con el DID pedido se rechaza.
6. Si el documento no se puede leer, el resultado es `UNKNOWN_SOURCE`, nunca un permiso.

Código: `sdk/src/web5/did.ts`.

---

## 4 · Credenciales

### 4.1 Formato

W3C Verifiable Credentials Data Model 2.0, firmado como JWS compacto EdDSA (`typ: vc+jwt`). Tipos: `VerifiableCredential`, `SFSPAtestacion` y los que agregue el propósito.

La credencial **no lleva datos personales**. Su `credentialSubject` lleva solo cuatro cosas:
- `id`, el `did:key` de la persona para esa relación;
- `proposito`, uno de los de SFSP-110 §3: KYC, KYB, ACCREDITED, SANCTIONS_CLEAR, LICENSE_G…;
- `claimsRoot`;
- `politica`.

### 4.2 Divulgación selectiva

- Cada claim es una hoja: `keccak256("SFSP.CLAIM.v1" ‖ sal₃₂ ‖ keccak256(nombre) ‖ keccak256(JSON canónico del valor))`.
- La **sal** de 32 bytes es obligatoria: sin ella, un claim predecible (`pais = HN`) se adivina por fuerza bruta (SFSP-110 §4.6).
- Las hojas se ordenan por nombre y forman un árbol de Merkle de pares ordenados. La raíz es `claimsRoot`.
- Las **divulgaciones** (nombre, valor, sal) se entregan a la persona por canal cifrado y **el emisor no las guarda**.
- La persona revela solo las hojas que quiere, con su camino hasta la raíz.

### 4.3 Estado

W3C Bitstring Status List:
- la lista tiene al menos 131 072 posiciones, está comprimida y la firma el emisor;
- el verificador descarga la lista entera, así que el emisor no sabe qué credencial se consultó;
- los índices se asignan **al azar**, porque índices consecutivos revelarían el orden de aprobación.

Código: `credencial.ts`, `estado.ts`.

---

## 5 · Presentaciones

Una presentación (`typ: vp+jwt`) la firma la persona con su `did:key`. Contiene:
- exactamente una credencial;
- las divulgaciones que eligió revelar, con su prueba;
- `aud` (el DID del verificador);
- `nonce` (el reto de un solo uso que emitió el verificador);
- `iat` y `exp` (5 minutos por defecto).

Orden de verificación. Cada paso devuelve código del §4 del contrato interno, nunca un booleano:

| # | Comprobación | Si falla |
|---|---|---|
| 1 | Firma de la persona con la llave de su DID | `DENY_AUTHORIZATION` |
| 2 | Audiencia, reto, vigencia de la presentación y reto no usado | `DENY_AUTHORIZATION` / `DENY_POLICY` |
| 3 | La credencial es del titular, el propósito es el pedido y el emisor está aceptado **para ese propósito** | `DENY_AUTHORIZATION` / `DENY_POLICY` |
| 4 | Documento del emisor, llave en `assertionMethod` y firma de la credencial | `UNKNOWN_SOURCE` si no se lee; `DENY_AUTHORIZATION` si no cuadra |
| 5 | Vigencia de la credencial | `DENY_POLICY` |
| 6 | Lista de estado: la firma el mismo emisor y el bit está en 0 | `UNKNOWN_SOURCE` si no se lee; `DENY_ELIGIBILITY` si está revocada |
| 7 | Cada claim revelado cuadra con `claimsRoot` y están los exigidos | `DENY_AUTHORIZATION` / `DENY_ELIGIBILITY` |

Una lista de estado ilegible es `UNKNOWN_SOURCE`, **nunca** `ALLOW`. Fallar hacia «válida» es aceptar una credencial revocada el día que el emisor está caído.

Código: `presentacion.ts`.

---

## 6 · El emisor de Genesis ID

`EmisorGenesis` (`emisor.ts`) aplica la regla. El servicio solo pone lo que depende del entorno: el almacén, la firma de cadena desde el KMS y el envío a la 5550.

1. **Sin aprobación humana no se emite.** Recibe `aprobadaPor` y `expediente`; sin ellos, `DENY_AUTHORIZATION` (SFSP-110 §0).
2. Emite la credencial, asigna un índice al azar en la lista y **proyecta** la atestación (§7).
3. Registra la emisión **sin claims**: el id, el propósito, el índice, el compromiso y la vigencia.
4. **Revocar es revocar en las dos partes.** Primero la lista (efecto inmediato fuera de la cadena), después `revokeAttestation` en la 5550. Si la cadena falla, la lista ya revocada se queda y la operación se reintenta: la dirección segura es «revocada».
5. **Interruptor propio, apagado por defecto**, con el patrón de Ordenex. Apagado, emite y firma pero no toca la cadena.
6. Las llaves del emisor van en el KMS y **separadas de la del ancla**, que ya escribe en la 5550 (plan de construcción, ola 3). Son dos: Ed25519 para credenciales y secp256k1 para atestaciones.

---

## 7 · La proyección en la cadena

| Campo de la atestación | Sale de |
|---|---|
| `attestationId` | `keccak256(id de la credencial)` |
| `subjectCommitment` | `keccak256(abi.encode(COMMITMENT_TAG, subjectRef, purpose, salt))`, igual que `purposeCommitment` del contrato |
| `purpose` | bytes32 del propósito |
| `claimsRoot` | **la misma raíz de la credencial** |
| `validFrom`, `validUntil` | la vigencia de la credencial, en segundos |
| `policyVersion` | bytes32 de la política |

El digest es el EIP-712 de `hashAttestation`, con el dominio `SFSPIdentityAdapter / draft-0.3 / chainId / contrato`. La prueba cruzada comprueba:
- que el compromiso del SDK es el del contrato;
- que el digest del SDK es `hashAttestation` byte por byte;
- que la atestación de una credencial se registra y deja de valer al revocarla;
- que una credencial alterada no pasa.

`subjectRef` y `salt` viven solo en el directorio privado de Genesis ID. En la cadena no queda nada que identifique a la persona (SFSP-110 §5).

---

## 8 · Los datos de la persona

### 8.1 Permisos

Las apps (Veta, DBNX, AU-RA, Dr Electrum) leen los datos de una persona **porque ella les dio permiso**, no porque estén en nuestros servidores. Un permiso (`typ: sfsp-permiso+jwt`):
- lo firma la persona con su `did:key`;
- dice para qué app (`aud`), qué protocolo de datos, qué acciones (`leer`, `escribir`, `consultar`), para qué propósito y hasta cuándo.

Solo la persona lo revoca: una revocación firmada por otro se rechaza.

### 8.2 Cifrado

Lo que se guarda para la persona va en un **sobre SFSP v1**: ECDH-ES con llave efímera X25519 hacia la llave de su DID, HKDF-SHA256 y AES-256-GCM, con datos asociados autenticados. Si Orden Global le aloja el nodo, igual no puede leerlo. Si la persona se va a otro proveedor, se lleva sus datos legibles para ella.

### 8.3 El nodo personal, por fases

| Fase | Qué |
|---|---|
| A (hecha, en el SDK) | Permisos firmados y sobres cifrados |
| B | Nodo alojado por Orden Global: guarda sobres, exige permiso en cada lectura y registra accesos sin contenido |
| C | Exportación completa y portabilidad a otro proveedor |
| D | Compatibilidad con el protocolo de nodos de la DIF (DWN), si D22 lo decide |

Código: `permisos.ts`, `cifrado.ts`.

---

## 9 · Cuándo se puede decir «Web5»

Nada de esto autoriza a comunicarlo. **La palabra «Web5» no se usa** hasta que se cumpla todo esto, con evidencia:

1. D22 firmada.
2. Genesis ID emite credenciales reales a personas reales, a su `did:key`, con aprobación humana.
3. Veta Wallet guarda las credenciales y las divulgaciones, y la persona elige qué revela.
4. Al menos un verificador interno (DBNX o el motor de elegibilidad vía la proyección) acepta presentaciones en producción.
5. Una **billetera de terceros** lee nuestras credenciales y nuestro verificador acepta una credencial de un emisor externo. Es la prueba de interoperabilidad.
6. Nodo personal en fase B, con permisos exigidos en cada lectura.
7. Revisión externa del manejo de llaves y de privacidad.

Mientras tanto, la frase que sí es verdad **cuando se cumplan los puntos 2 y 3**: «identidad autosoberana con credenciales verificables (W3C DID y VC)». Antes de eso, ninguna.

---

## 10 · Pruebas de aceptación

| Id | Qué | Dónde |
|---|---|---|
| T-160-01 | `did:key` ida y vuelta; la X25519 derivada coincide con la calculada por OpenSSL | `web5.test.ts` |
| T-160-02 | `did:web`: ruta, resolución, documento ajeno rechazado, caída = `UNKNOWN_SOURCE` | `web5.test.ts` |
| T-160-03 | Toda hoja prueba su pertenencia, con 1 a 9 claims; con otra sal no | `web5.test.ts` |
| T-160-04 | La persona revela solo lo que elige, y la credencial no lleva datos personales | `web5.test.ts` |
| T-160-05 | El reto no sirve dos veces; otra audiencia, otro reto o falta de lo exigido no pasan | `web5.test.ts` |
| T-160-06 | Un claim cambiado no cuadra con la raíz | `web5.test.ts` |
| T-160-07 | Nadie presenta la credencial de otro | `web5.test.ts` |
| T-160-08 | Emisor no aceptado para ese propósito | `web5.test.ts` |
| T-160-09 | Revocada = `DENY_ELIGIBILITY`; lista ilegible = `UNKNOWN_SOURCE`; lista de otro = no pasa | `web5.test.ts` |
| T-160-10 | Compromiso y digest del SDK iguales a los del contrato; registro y revocación en cadena | `13-web5-credencial.js` |
| T-160-11 | Permisos: dentro de lo dado, fuera no; solo el titular revoca | `web5.test.ts` |
| T-160-12 | Solo la persona abre su sobre; un byte cambiado o datos asociados distintos se detectan | `web5.test.ts` |
| T-160-13 | El emisor no emite sin aprobación humana, no guarda claims y revoca en lista y cadena | `web5.test.ts` |

---

## 11 · Lo que falta, dicho sin adornos

| Pieza | Dónde | Bloqueada por |
|---|---|---|
| Firma secp256k1 del emisor desde el KMS | servicio de Genesis ID | AWS (KMS) y D22 |
| Publicar el `did.json` de los emisores | dominio de Orden Global | D22 |
| Servicio emisor (capa fina sobre `EmisorGenesis`) y almacén durable | Genesis ID | Ola 3 del plan |
| Guardar credenciales y elegir qué revelar | Veta Wallet (web y app) | Ola 1 (diseño) y ola 4 |
| Aceptar presentaciones | DBNX y el backend de la billetera | Ola 4 |
| Nodo personal fase B | servicio nuevo | AWS y D22 |
| Prueba de interoperabilidad con una billetera de terceros | ensayo | Ola 5 |
