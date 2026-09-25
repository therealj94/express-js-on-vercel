# SFSP-160 · SFSP-ID: la identidad de SFSP

| Campo | Valor |
|---|---|
| Serie | SFSP-160 · SFSP-ID (identidad autosoberana de SFSP) |
| Estado | `draft-0.4` (serie nueva, 25-sep-2026) |
| Código | Contrato `SFSPDidRegistry.sol`. SDK `sdk/src/sfsp-id/` (21 pruebas en `sfsp-id.test.ts`). Pruebas de contrato `14-did-registry.js`, `13-sfsp-id-credencial.js` y `15-did-sfsp-resolucion.js` |
| Se apoya en | SFSP-110 (Genesis ID y atestaciones), SFSP-120 (elegibilidad), SFSP-130 (cuenta y recuperación), SFSP-140 (licencias), SFSP-600 (privacidad), SFSP-800 (gobierno) |
| Decisiones que la bloquean | **D22** (el método `did:sfsp`, los emisores y cuándo comunicarlo), D13 (identidad y jurisdicción), D06 (privacidad) |

**Qué NO afirma este documento:**
- no afirma que Orden Global «sea Web5» (ver §10);
- no afirma compatibilidad certificada con ninguna billetera de terceros; la interoperabilidad se prueba (§10), no se supone;
- no afirma que el método `did:sfsp` esté inscrito en el registro de métodos del W3C: inscribirlo es un paso de D22;
- no afirma que exista un nodo personal de datos en producción.

---

## 1 · La regla de esta serie

**La base es SFSP. Web5 aporta formatos, no reglas.**

- Lo que decide quién es quién, qué vale y quién puede qué lo decide SFSP: Genesis ID, la Junta, la 5550 y sus contratos.
- Los estándares del W3C (DID y credenciales verificables) se usan como **formato de salida**, para que un banco, un regulador o una billetera de fuera puedan comprobar lo nuestro sin depender de nosotros.
- Nada de esta serie depende de una red, un dominio o un servicio ajeno.

| Pieza | Nuestra | Estándar que usa por fuera |
|---|---|---|
| Identificador | **`did:sfsp`**, sobre la 5550 | Sintaxis W3C DID Core 1.0 |
| Quién es un emisor | **`SFSPDidRegistry`** en la 5550, admitido por la Junta | Documento DID |
| Credencial | **Credencial SFSP**, emitida por Genesis ID con aprobación humana | W3C VC 2.0 sobre JOSE |
| Huella en la cadena | **Atestación de `SFSPIdentityAdapter`** (ya existía) | EIP-712 |
| Revocación | **La cadena** para operar; una lista de estado para fuera | W3C Bitstring Status List |
| Datos de la persona | **Sobre SFSP v1**, cifrado a su llave | ECDH X25519 + AES-256-GCM |

---

## 2 · GID y DID: qué es cada uno y por qué no son lo mismo

La pregunta de fondo: ¿el GID puede ser el identificador de la persona? **No como identificador público.** Pero **sí es la raíz** de todo.

| | GID (Genesis ID) | `did:sfsp` de persona |
|---|---|---|
| Qué es | La ficha única de la persona en Genesis ID: su KYC, su expediente y su numeración de identidad | El identificador con el que la persona se presenta ante cada empresa o app |
| Cuántos tiene una persona | **Uno** (así nadie se da de alta dos veces) | **Uno por relación**, derivados de la semilla de su billetera |
| Quién lo ve | Solo Genesis ID, con acceso autenticado y por propósito | Solo el verificador de esa relación |
| En la cadena | **Nunca** | **Nunca** (se autocertifica: no se registra) |
| Si se filtra | Expone la identidad completa | Expone una sola relación, sin datos personales |

**Por qué el GID no puede ser público:** un número único y estable por persona la sigue por todas partes. El banco, la tienda y el gobierno podrían cruzar sus bases por ese número. SFSP-110 §4 lo prohíbe.

**Cómo se unen, sin que se vea desde fuera:**

```
                 (privado, en Genesis ID)
 GID ─────────► subjectRef (opaca) ─────────► compromiso por propósito ──► 5550 (atestación)
  │
  └── vínculos privados ──► did:sfsp:5550:p:…(banco)
                          ► did:sfsp:5550:p:…(DBNX)          ◄── en la billetera de la persona
                          ► did:sfsp:5550:p:…(Veta)
```

- Genesis ID sabe que esos identificadores son de la misma persona, porque los emitió.
- **Nadie más lo puede deducir**: ni los verificadores, ni quien lee la cadena.
- La persona los recupera todos con la semilla de su billetera (§3.1). Si pierde la semilla, la recuperación es la de SFSP-130: Genesis ID vuelve a emitir a llaves nuevas.
- **El número público de la persona sigue siendo su número de cuenta SFSP** (`SF-XXXX-XXXX-XXXX-C`, SFSP-130): no lleva datos personales y sirve para recibir. El GID no se publica nunca.

---

## 3 · El método `did:sfsp`

### 3.1 Sintaxis

```
did:sfsp:<red>:p:<llave>        persona, en una relación
did:sfsp:<red>:org:<orgId>      organización admitida por la Junta
```

- `<red>` es el chainId: `5550` (producción) o `5534` (ensayo). **Ensayo y producción no se mezclan**: una credencial con emisor de una red y titular de otra se rechaza (`DENY_POLICY`).
- `<llave>` es la llave Ed25519 en multibase: `z` más base58btc de `0xed01 ‖ llave`.
- `<orgId>` tiene de 3 a 31 caracteres (`a-z`, `0-9`, `_`). Se guarda en la cadena como `bytes32`.

**Derivación por relación.** La billetera no guarda una llave por relación, las **deriva**:

```
semilla_de_relación = HKDF-SHA256(semilla_billetera, sal = "SFSP.ID.RELACION.v1", info = <identificador del verificador>)
```

Con la misma semilla y la misma relación sale siempre la misma llave. Sin la semilla, dos llaves de dos relaciones no tienen relación observable.

### 3.2 Operaciones

| Operación | Persona (`p`) | Organización (`org`) |
|---|---|---|
| Crear | La billetera deriva la llave. Nada se publica | La Junta llama `registerOrg` (admisión, no autoservicio) |
| Resolver | El documento sale del propio identificador: una llave Ed25519 para firmar y su X25519 derivada para recibir datos cifrados | `SFSPDidRegistry` con `eth_call` (`lectorRpc`). La fuente de verdad es la 5550 |
| Actualizar | No aplica: cambiar de llave es otro identificador | El controlador de la organización agrega y revoca llaves, fija la dirección que firma atestaciones y ancla la huella del documento |
| Desactivar | Basta con dejar de usarlo | `deactivate`: irreversible, con código de motivo. La pide la Junta o el propio controlador |

### 3.3 Reglas del registro de organizaciones (`SFSPDidRegistry`)

1. **Solo organizaciones.** No hay función que registre personas ni reciba un sujeto; una prueba lo vigila.
2. La **Junta admite** y **no firma por nadie**: las llaves las maneja el controlador de la organización (su multifirma).
3. **Un `orgId` o un `keyId` no se reutilizan jamás.** Rotar es agregar la nueva y revocar la vieja.
4. **Una llave de firma no cifra y una de cifrado no firma.** Ed25519: aserción y autenticación. X25519: solo acuerdo.
5. **Revocar una llave invalida todo lo firmado con ella.** Para rotar sin tumbar credenciales vigentes, se agrega la nueva, se emite con ella y la vieja se revoca cuando sus credenciales vencen.
6. **La baja es para siempre.** Volver exige otro `orgId` con su expediente.
7. La Junta puede **cambiar el controlador** si la multifirma se pierde, siempre con código de motivo.
8. Todo cambio emite su evento (`OrgDid*`, 6 eventos en `eventos.json`), que la prueba H15 compara campo a campo con el ABI.

### 3.4 Identificadores de fuera

`did:key` (personas) y `did:web` (emisores) **se aceptan para interoperar**, por ejemplo con un banco extranjero que emite con su propio dominio. Nunca son lo nuestro:
- ninguna persona recibe un `did:key` de Genesis ID;
- ningún emisor nuestro se identifica por `did:web`.

Un emisor externo solo se acepta si figura en la lista de emisores aceptados **para ese propósito** (§6).

---

## 4 · La credencial SFSP

- Formato W3C VC 2.0, firmado como JWS compacto EdDSA (`typ: vc+jwt`), con los tipos `VerifiableCredential` y `SFSPAtestacion`.
- **No lleva datos personales.** Su `credentialSubject` lleva solo cuatro cosas:
  - el `did:sfsp` de la persona para esa relación;
  - el `proposito` de SFSP-110 §3 (KYC, KYB, ACCREDITED, SANCTIONS_CLEAR, LICENSE_G…);
  - la `claimsRoot`;
  - la `politica`.
- **Divulgación selectiva:**
  - cada claim es una hoja `keccak256("SFSP.CLAIM.v1" ‖ sal₃₂ ‖ keccak256(nombre) ‖ keccak256(valor canónico))`;
  - las hojas, ordenadas por nombre, forman un árbol de Merkle de pares ordenados;
  - la sal es obligatoria, porque un claim predecible (`pais = HN`) se adivinaría por fuerza bruta.
- Las divulgaciones (nombre, valor y sal) van a la persona por canal cifrado y **el emisor no las guarda**.
- **La `claimsRoot` es la misma que la de la atestación en la cadena**: una sola prueba de Merkle vale dentro y fuera.

---

## 5 · La presentación

La firma la persona con su `did:sfsp` de esa relación. Lleva:
- una credencial;
- los claims que ella elige revelar, con su prueba;
- la audiencia (el `did:sfsp` del verificador);
- un reto de un solo uso;
- una vigencia de 5 minutos.

Cada paso de la verificación devuelve un código de SFSP, nunca un booleano:

| # | Comprobación | Si falla |
|---|---|---|
| 1 | Firma de la persona con la llave de su identificador | `DENY_AUTHORIZATION` |
| 2 | Audiencia, reto, vigencia y reto no usado | `DENY_AUTHORIZATION` / `DENY_POLICY` |
| 3 | La credencial es del titular, el propósito es el pedido, el emisor está aceptado para ese propósito y las redes coinciden | `DENY_AUTHORIZATION` / `DENY_POLICY` |
| 4 | Emisor resuelto (desde la 5550 si es `did:sfsp`), llave vigente en su `assertionMethod` y firma válida | `UNKNOWN_SOURCE` si no se lee; `DENY_AUTHORIZATION` si no cuadra, si la llave está revocada o si el emisor está de baja |
| 5 | Vigencia de la credencial | `DENY_POLICY` |
| 6 | Lista de estado del mismo emisor, con el bit en 0 | `UNKNOWN_SOURCE` si no se lee; `DENY_ELIGIBILITY` si está revocada |
| 7 | Cada claim revelado cuadra con la raíz y están los exigidos | `DENY_AUTHORIZATION` / `DENY_ELIGIBILITY` |

**Nada que no se pudo leer se convierte en `ALLOW`.**

---

## 6 · Genesis ID como emisor (`EmisorGenesis`)

1. **Sin aprobación humana no se emite** (SFSP-110 §0).
2. Emite la credencial y asigna un índice **al azar** en la lista de estado.
3. **Proyecta la atestación** a `SFSPIdentityAdapter` (§7) y la firma con la dirección que el registro declara como su firmante (`setAttestor`).
4. Registra la emisión **sin claims**.
5. **Revoca en las dos partes**: primero la lista, después la cadena.
6. **Interruptor propio, apagado por defecto.**
7. Tiene dos llaves en el KMS, **separadas del ancla**: Ed25519 para credenciales (en `SFSPDidRegistry`) y secp256k1 para atestaciones (el firmante del registro, con el rol `ATTESTOR` del adaptador).

**Emisores aceptados por propósito.** La lista es de SFSP, no de cada app. Arranca con `did:sfsp:5550:org:genesis_kyc` para KYC y KYB. Crece por acta de la Junta, y cada emisor necesita su licencia en SFSP-140 cuando el propósito la exija.

---

## 7 · La huella en la cadena

La atestación de `SFSPIdentityAdapter` es la proyección de la credencial. **No se cambió ningún campo del contrato.**

| Campo | Sale de |
|---|---|
| `attestationId` | `keccak256(id de la credencial)` |
| `subjectCommitment` | `keccak256(abi.encode(COMMITMENT_TAG, subjectRef, purpose, salt))`: `subjectRef` y `salt` viven solo en Genesis ID |
| `purpose` | bytes32 del propósito |
| `claimsRoot` | **la misma raíz de la credencial** |
| `validFrom`, `validUntil` | la vigencia, en segundos |
| `policyVersion` | bytes32 de la política |

La prueba `13-sfsp-id-credencial.js` comprueba que el compromiso y el digest EIP-712 del SDK son byte por byte los del contrato, que se registran y que se revocan.

---

## 8 · Los datos de la persona

- **Permisos** (`sfsp-permiso+jwt`). La persona los firma con su `did:sfsp` y dicen qué app, qué protocolo de datos, qué acciones, para qué y hasta cuándo. Dr Electrum, AU-RA, Veta y DBNX leen expedientes **con ese permiso**. Solo la persona los revoca.
- **Sobre SFSP v1.** Lo que se guarda para la persona va cifrado a su llave. Orden Global puede alojarlo y no puede leerlo, y la persona se lo puede llevar.

| Fase del nodo personal | Qué |
|---|---|
| A (hecha, en el SDK) | Permisos firmados y sobres cifrados |
| B | Nodo alojado: guarda sobres, exige permiso en cada lectura y registra accesos sin contenido |
| C | Exportación completa y portabilidad |
| D | Compatibilidad con el protocolo DWN de la DIF, si D22 lo decide |

---

## 9 · Lo que esta serie agrega a la cadena

| Qué | Dónde |
|---|---|
| `SFSPDidRegistry`, solo organizaciones | Contrato nuevo, ola 2 |
| 6 eventos `OrgDid*` | `spec/eventos.json` (35 eventos en total) |
| Nada en el adaptador de identidad | Se usa tal cual |

---

## 10 · Cuándo se puede decir qué

| Frase | Condición |
|---|---|
| «SFSP-ID: identidad autosoberana de SFSP, con estándares W3C (DID y VC)» | Genesis ID emite credenciales reales a `did:sfsp` de personas reales y Veta las guarda |
| «Web5» | Además: un verificador en producción, **una billetera de terceros** que lee nuestras credenciales, nodo personal en fase B y revisión externa de llaves y privacidad |

Hasta entonces, ninguna de las dos.

---

## 11 · Pruebas de aceptación

| Id | Qué | Dónde |
|---|---|---|
| T-160-01 | `did:sfsp` de persona: se autocertifica, se deriva por relación, se recupera con la semilla y no se enlaza entre relaciones | `sfsp-id.test.ts` |
| T-160-02 | `did:sfsp` de organización: se resuelve desde el registro; una llave revocada no figura; una organización de baja o inexistente no resuelve; otra red no resuelve | `sfsp-id.test.ts` |
| T-160-03 | El registro en la cadena: solo la Junta admite, solo el controlador maneja llaves, nada se reutiliza, la baja es irreversible, la recuperación exige motivo y no hay funciones para personas | `14-did-registry.js` |
| T-160-04 | El resolutor del SDK lee el contrato real; al revocar la llave en la cadena, la credencial deja de pasar | `15-did-sfsp-resolucion.js` |
| T-160-05 | Compromiso y digest del SDK iguales a los del contrato; registro y revocación de la atestación | `13-sfsp-id-credencial.js` |
| T-160-06 | Revela solo lo elegido, y la credencial no lleva datos personales | `sfsp-id.test.ts` |
| T-160-07 | Reto de un solo uso; otra audiencia, otro reto o falta de lo exigido no pasan | `sfsp-id.test.ts` |
| T-160-08 | Claim alterado; credencial ajena; emisor no aceptado; ensayo contra producción | `sfsp-id.test.ts` |
| T-160-09 | Revocada = `DENY_ELIGIBILITY`; lista ilegible = `UNKNOWN_SOURCE`; lista de otro no pasa | `sfsp-id.test.ts` |
| T-160-10 | Emisor con llave revocada o de baja: lo que firmó deja de pasar | `sfsp-id.test.ts` |
| T-160-11 | Permisos y sobres cifrados | `sfsp-id.test.ts` |
| T-160-12 | Genesis no emite sin aprobación humana, no guarda claims y revoca en lista y cadena | `sfsp-id.test.ts` |
| T-160-13 | Interoperabilidad: emisor `did:web` y persona `did:key` de fuera | `sfsp-id.test.ts` |
| T-160-14 | Los 6 eventos del registro coinciden con `eventos.json` (H15) | `11-eventos-contra-spec.js` |

---

## 12 · Lo que falta, sin adornos

| Pieza | Dónde | Bloqueada por |
|---|---|---|
| Desplegar `SFSPDidRegistry` y registrar `genesis_kyc` | 5534 y luego 5550 | Ola 5 (ensayo), D22, D07 (firmantes) |
| Firma secp256k1 y Ed25519 del emisor desde el KMS | Genesis ID | AWS y D22 |
| Servicio emisor y almacén durable | Genesis ID | Ola 3 |
| Semilla, derivación por relación, «Mis credenciales» y consentimiento | Veta Wallet | Ola 1 (diseño) y ola 4 |
| Verificar presentaciones | DBNX y el backend de la billetera | Ola 4 |
| Nodo personal fase B | Servicio nuevo | AWS y D22 |
| Inscribir `did:sfsp` en el registro de métodos del W3C | W3C | D22 |
| Prueba con una billetera de terceros | Ensayo | Ola 5 |
