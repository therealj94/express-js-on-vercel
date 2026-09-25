# Plan final · SFSP con capa Web5, todo el ecosistema, y el día de la subida

**25 de septiembre de 2026.** Este documento junta en uno solo:
- el plan de construcción del 24-sep (`PLAN-DE-CONSTRUCCION-2026-09-24.md`, olas 0 a 6);
- la capa Web5 (`spec/SFSP-160-SELF-SOVEREIGN-IDENTITY.md`);
- lo que se hizo en Dr Electrum y AU-RA;
- el orden exacto de subida para cuando AWS levante la restricción.

Donde este documento y el del 24-sep dicen lo mismo, manda el del 24-sep, que tiene el detalle; aquí está el orden y lo nuevo.

**Regla que no cambia:** todo se construye completo y se sube **apagado**. Nada se enciende, nada toca dinero y nada se publica en la 5550 sin tu orden y sin su decisión firmada (`BLOCKED_DECISION` mientras tanto).

---

## 1 · Dónde estamos hoy (comprobado)

| Pieza | Estado | Dónde |
|---|---|---|
| Protocolo SFSP `draft-0.4` | 15 series con SFSP-160. **530 pruebas en verde** en `verificar-todo` (SDK 181, contratos 182, indexador 67, DBNX 86, adversarias 14) | `sfsp/` en la rama `claude/galaxy-web-review-260wt4` |
| **Capa Web5 (SFSP-160)** | **Hecha en código**, sin cambiar ningún contrato: DIDs, credenciales W3C con divulgación selectiva, listas de estado, presentaciones, proyección en el adaptador, permisos y datos cifrados, y el emisor de Genesis. 17 pruebas y una prueba cruzada contra el contrato | `sfsp/sdk/src/web5/` |
| Veta Wallet web | Restaurada con el planeta completo y sus arreglos. **Sin publicar**: la cuenta de AWS está restringida | `apps-web/veta-wallet/` |
| Dr Electrum · oficina por voz | **En vivo** en `ultron-looi-desk.onrender.com/electrum-oficina/` (PR #28) | ULTRON-APP `main` |
| Dr Electrum · catastro en producción | **Desconectado**: falta `ELECTRUM_DB_URL` en Render, y el túnel al nodo depende de los roles de AWS borrados | Render y AWS |
| Dr Electrum · llave de demostración | **No existe**: falta `ELECTRUM_CLAVE` | Render |
| AU-RA / ULTRON FP | En vivo. Su memoria en S3 y su SSM dependen de AWS | Render y AWS |
| Cadena 5550 | Produce bloques. Sin acceso SSM a los nodos | AWS |
| Cuenta de AWS | **Restringida** (caso 178961886800858). Tú hiciste la limpieza; esperamos que AWS la levante | AWS |

---

## 2 · La fusión SFSP × Web5, en una tabla

| Hoy en SFSP | Con la capa Web5 | Quién controla |
|---|---|---|
| Genesis ID guarda la identidad | La persona tiene su `did:key` en Veta; Genesis ID **emite credenciales** a ese DID | La persona |
| Atestación EIP-712 en la cadena | Es la **proyección** de una credencial W3C: misma `claimsRoot`, mismo emisor | Emisor y protocolo |
| El operador ve el expediente | La persona revela **solo** lo que el verificador pide (divulgación selectiva) | La persona |
| Revocación en la cadena | Revocación en la cadena **y** en una lista de estado que no delata qué se consultó | Emisor |
| Datos en nuestros servidores | Datos cifrados con la llave de la persona; las apps leen con **su permiso firmado** | La persona |
| Red 5550 cerrada (SFSP-150) | **Sigue cerrada**. Web5 es identidad y datos, no la red de liquidación | Junta |

---

## 3 · Las olas, con Web5 dentro

Mismas olas del 24-sep. En **negrita** lo que entra por Web5.

| Ola | Contenido | Web5 en esta ola |
|---|---|---|
| **0 · Cimientos** | Un solo backend (`veta-wallet-backend-`), nada se publica solo, secretos, una sola fuente de precio y de red, un solo puente Genesis ↔ Veta, `/version` en todo, SDK empaquetado | **El SDK empaquetado ya lleva `web5`**. Además: apagar el autodespliegue de Render (§7) |
| **1 · Diseño** | Las 8 pantallas para aprobar | **9ª pantalla: «Mis credenciales» en Veta**: qué credenciales tengo, quién las emitió, qué comparto con quién y un botón para revocar permisos. **10ª: la hoja de consentimiento** cuando una app pide un dato |
| **2 · Protocolo** | Licencias, elegibilidad ampliada, pasaporte, emisión, commodities, oráculo y tesorería, red cerrada, pagos | **Nada nuevo en contratos**: la proyección usa `SFSPIdentityAdapter` tal cual (probado) |
| **3 · Servicios** | Indexador, API y portal DBNX, referencia de precio, conciliación diaria, emisor EIP-712 en Genesis, agregador de exposición, directorio de cuentas, salud | **El emisor de Genesis pasa a ser `EmisorGenesis` del SDK** (credencial + proyección + revocación doble), con sus dos llaves en KMS. **Publicar `did.json` de los emisores y la lista de estado.** **Nodo personal fase B** (sobres cifrados y permisos exigidos) |
| **4 · Productos en sombra** | Genesis, backend, Veta, ORDENSCAN, Ordenex, DBNX, MyTokenPay y AuCorp, AU-RA | **Veta guarda credenciales y divulgaciones** (llave en el llavero del teléfono). **DBNX y el backend verifican presentaciones** en sombra, al lado de la verificación actual, y comparan. **Dr Electrum y AU-RA piden permiso** para leer expedientes |
| **5 · Ensayo general** | Los 12 escenarios | **Escenario 13:** una persona recibe su KYC como credencial, prueba «mayor de edad y KYC nivel 2» sin revelar nada más, Genesis la revoca y deja de pasar dentro y fuera de la cadena. **Escenario 14:** interoperabilidad con una billetera de terceros |
| **6 · Paquete de encendido** | P11 por servicio y el runbook de 8 pasos | **Paso 2-bis:** credenciales en sombra con personas reales, solo después de firmar D22 |

---

## 4 · El día que AWS levante la restricción

En orden. Cada bloque tiene su comprobación y **no se pasa al siguiente sin ella**. Antes de empezar, corre `node sfsp/deploy/preflight-subida.mjs`: solo lee y dice qué falta.

### Bloque A · Recuperar la casa (día 1, ~2 h)

| # | Qué | Quién | Se comprueba con |
|---|---|---|---|
| A1 | Confirmar en el caso de soporte que la restricción está levantada | Tú | Un despliegue de prueba de Amplify no devuelve el error de facturación |
| A2 | **Llaves nuevas, una por función**, con el mínimo permiso: `amplify-subida` (solo Amplify de las dos apps), `ses-correo`, `s3-memoria-aura` (solo su bucket), `electrum-subida` (solo su bucket) | Tú en IAM; yo te paso las políticas exactas | Cada llave hace lo suyo y **falla** en lo demás |
| A3 | **Roles de los nodos otra vez**: `EC2-SSM-Core` a los nodos de la 5550 y al de Qwen/PostGIS; `og5550-validador-node3..6` | Tú, con las políticas que te paso | `aws ssm describe-instance-information` ve los nodos |
| A4 | Las llaves van a la configuración del entorno, **nunca por el chat**: Claude (Edit → variables), Heroku y Render | Tú | `preflight` las ve por nombre |
| A5 | Borrar la llave de Render `rnd_8rE3…` que pasó por el chat, y cualquier otra pegada aquí | Tú | Ya no autentica |

### Bloque B · Lo que ya está listo y solo espera a AWS (día 1)

| # | Qué | Cómo | Se comprueba con |
|---|---|---|---|
| B1 | **Veta Wallet web**: primero el ensayo (`d289v5ffkexk23`), después producción (`d264zjawew1yea`), con el mismo artefacto (P11) | `comparar-publicado.py` antes; `subir.py` al ensayo; revisión; `subir.py` a producción; `comparar-publicado.py` después | **0 diferencias** con el artefacto; `privacidad.html` y `terminos.html` presentes |
| B2 | **Catastro de Dr Electrum**: rehacer el túnel al PostGIS con SSM y poner `ELECTRUM_DB_URL` en Render | `scripts/electrum/tunel.sh` de ULTRON-APP | «¿Qué concesiones vencen en 90 días?» contesta con datos en la oficina |
| B3 | **Llave de demostración de Electrum**: `ELECTRUM_CLAVE` en Render | Tú, o yo si me lo ordenas | El enlace `?llave=` abre la oficina |
| B4 | **Memoria de AU-RA en S3** (`ULTRON_MEMORIA_BUCKET` y llave) | Render | `/api/health` sin el aviso de disco efímero |
| B5 | **Vigía y correo**: la Lambda `aura-vigia` y el reenvío de SES | Con sus roles nuevos | Una alerta de prueba llega |

### Bloque C · Lo que se sube apagado (semanas 1 a 11, según las olas)

Sigue el runbook de la ola 6 del 24-sep, paso 1 («subir apagado»), con los interruptores apagados y visibles en `/salud`. Incluye el emisor de Genesis con Web5 **apagado**: emite solo en el ensayo.

### Bloque D · Lo que exige tu firma (no tiene fecha)

Pasos 2 a 8 de la ola 6: sombra, equivalencia, conmutación, contratos en la 5550, red cerrada, parámetros económicos y colocación de AUKA/AGKA. Y, por Web5, **D22** antes de emitir credenciales reales.

---

## 5 · Qué código está listo y dónde

| Repo · rama | Qué | Estado |
|---|---|---|
| `express-js-on-vercel` · `claude/galaxy-web-review-260wt4` | SFSP draft-0.4 + SFSP-160 + capa Web5 del SDK | 530 pruebas en verde. **Sin fusionar a `main`** hasta tu orden |
| ídem | Veta Wallet web restaurada | Paquete P11. Espera a AWS (B1) |
| `ULTRON-APP` · `main` | Oficina de Dr Electrum por voz y su ruta `/ver` | **En vivo** |
| `ULTRON-APP` · `claude/galaxy-web-review-260wt4` | Conceptos, animaciones y demos de Dr Electrum | Documentación |

---

## 6 · Lo que puedes decir en público, y cuándo

| Frase | Se puede decir |
|---|---|
| «Protocolo SFSP: cada activo con pasaporte y cada movimiento con evento público sin datos personales» | Cuando los contratos estén en la 5550 (ola 6, paso 5) |
| «Identidad autosoberana con credenciales verificables (W3C DID y VC)» | Cuando Genesis emita credenciales reales y Veta las guarde (SFSP-160 §9, puntos 2 y 3) |
| «Web5» | **Solo** con SFSP-160 §9 completo |
| «Respaldado», «regulado», «licenciado», proyecciones de precio | **Nunca**, salvo lo que diga el acta |

---

## 7 · Hallazgo de hoy en Render (solo lectura, 25-sep)

| Servicio | Publica solo desde | Riesgo |
|---|---|---|
| `ultron-looi-desk` | `main` | Correcto: es lo acordado |
| `Ultron-fp` | `claude/veta-wallet-phantom-design-7syah8` | Un push a esa rama publica ULTRON FP |
| `genesis-id` | `claude/veta-wallet-phantom-design-7syah8` | Un push a esa rama publica Genesis ID (ya estaba en el anexo B) |
| `genesis-id-api` | `claude/genesis-id-verification-engine-wj75mj` | Ídem |
| `tesoreria` | `claude/security-tokens-treasury-platform-tk5g77` | Ídem, y toca tesorería |

Los cinco tienen el autodespliegue encendido. La ola 0.2 lo apaga en todos salvo `ultron-looi-desk`, y deja publicar solo a mano con tu aprobación.

---

## 8 · Qué necesito de ti

1. **Aprobar este plan final.**
2. **Firmar o ajustar D22** (DIDs, emisores y cuándo decir Web5). La propuesta está en `DECISIONES-SFSP.json`.
3. **Avisarme cuando AWS levante la restricción.** Empiezo el bloque A contigo.
4. Lo pendiente del 24-sep:
   - el backend canónico;
   - las compuertas de publicación;
   - las tres respuestas de la fase 2;
   - rotar la contraseña de H01 y la clave de CoinMarketCap.
5. **Borrar la llave de Render** que pasó por el chat.
