# Plataforma de migración SFSP-700

La plataforma donde se hace y se comprueba el paso de las monedas de la red 5550 a sus contratos v2 (SFSP §14). Cada saldo se fotografía en el bloque de corte, se le aplica la política de su moneda y lo que corresponde pasa a la misma dirección. **No se pierde a nadie por no encontrarlo**: lo no ubicado queda abierto a reclamo.

**No tiene llaves y no firma nada.** Toma fotos de saldos, publica sus raíces de Merkle, prepara lo que la firma múltiple tiene que ejecutar y después comprueba en la cadena que lo ejecutado es exactamente lo aprobado.

## Qué hace

| Parte | Para qué |
|---|---|
| Consulta pública (`/`) | Cualquier tenedor pega su dirección y ve su saldo en la foto, su prueba de Merkle, su saldo en la v2 y si su regalo de gas salió. |
| Panel interno (`/panel`) | El equipo carga las listas, toma y publica las fotos, concilia la v2, lleva las liberaciones de ORIGEN y el regalo de gas. |
| Bitácora | Toda acción queda registrada con quién la hizo. |

## Política de la migración (decisión de la Junta del 7 de octubre de 2026)

| Moneda | Qué pasa a la v2 |
|---|---|
| Todas (ONDK, AUKA, AGKA, HARV, IBS, MONARKA, AMOR) | Solo pasan los usuarios de Veta Wallet con **100.000 tokens o menos** (contado en tokens, no en dólares). Tesorería, sistema y direcciones fuera de Veta desaparecen; el usuario con más de 100.000 también. `0x7462…3ad8` queda con 50 AUKA |

La política vive en `src/catalogo.ts` (`POLITICA`). Cada exclusión queda en la foto con su motivo (`no-usuario`, `umbral` o `tope`). Solo reclama quien esté en la lista de usuarios de Veta Wallet (decisión de la Junta, 7 de octubre de 2026).

- **ORIGEN** queda nativo. Su supply es solo lo que tienen los usuarios de Veta Wallet (la suma de sus saldos): no hay un supply fijo del que se reste nada, y lo que no está en manos de un usuario no cuenta. El «mint» de ORIGEN es una **liberación de tesorería**, que solo procede contra lo asegurado (con su referencia documental) y con las firmas de 3 de los 5 custodios de la firma múltiple operativa.
- **ORIGEN para gas**: a cada usuario de Veta Wallet con menos de 1 ORIGEN se le completa lo que le falta, una sola vez, para que pueda pagar el gas fee al operar sus activos v2.
- **Reclamos**: lo que la foto no ubicó se publica con un plazo. Quien tenía saldo en una dirección no encontrada la reclama firmando un mensaje con esa misma billetera (no mueve fondos ni cuesta gas). Se le aplica la misma política, un operador lo revisa, y lo aprobado entra a la acuñación. Pasado el plazo, lo no reclamado desaparece.

## Flujo por moneda

1. **Listas.** Cargar en el panel la tesorería, las direcciones de sistema, los usuarios de Veta Wallet (`infra/migracion-v2/direcciones-veta.js`) y, si existe, el inventario de la cadena 8532.
2. **Foto.** Tomar la foto en el bloque de corte. La plataforma barre todos los eventos y transacciones de la 5550, suma los saldos y los compara con el supply.
3. **Política.** La foto separa lo que pasa a la v2 de lo que desaparece, con su motivo. Si queda algo «sin ubicar», se publica con un **plazo de reclamos**.
4. **Publicar.** Fija la foto y la raíz de Merkle de lo que se acuña. El archivo de acuñación (`acunacion.json`) trae cada dirección con su monto y su prueba, incluidos los reclamos aprobados.
5. **Acuñar.** La firma múltiple acuña la v2. Su dirección se configura en `V2_<CLAVE>` (por ejemplo `V2_AUKA`).
6. **Conciliar.** La plataforma compara la v2 con lo que había que acuñar: cada dirección con su monto exacto y el mismo total. Acuñar algo que debía desaparecer se detecta por el total. Solo entonces la moneda queda «migrada y conciliada».

Las pruebas de Merkle usan el formato de OpenZeppelin (hojas con doble hash y pares ordenados): se verifican con `MerkleProof.verify` en el contrato y con `StandardMerkleTree.verify` fuera de él.

## Despliegue en Render

El servicio está en el `render.yaml` de la raíz, desplegando desde `main`.

| Variable | Qué es |
|---|---|
| `MIGRACION_MONGO_URL` | **Obligatoria en producción.** Sin ella, los datos van a un archivo que Render borra en cada despliegue. |
| `MIGRACION_MONGO_DB` | Base de datos (por defecto `migracion`). |
| `MIGRACION_SECRETO` | Secreto de las sesiones del panel, 32 caracteres o más. Cambiarlo cierra todas las sesiones. |
| `MIGRACION_OPERADORES` | Quién entra al panel: `correo\|roles\|hash;…`. Roles: `operador`, `firmante`, `lectura`. El hash se genera con `npm run clave -- '<clave>'`. |
| `MIGRACION_UMBRAL` | Firmas para aprobar una liberación **sin** firma múltiple configurada (por defecto 2). Con la Safe, el umbral es el de la Safe. |
| `SAFE_DIRECCION` | La firma múltiple operativa (Safe 1.4.1, dos de tres). Con ella, aprobar es firmar la transacción de la Safe con la billetera de custodio. |
| `SAFE_CONSTITUCIONAL` | La firma múltiple de los tres custodios: roles y registro de los contratos (SFSP §5.3). Opcional; sin ella esas operaciones no se arman aquí. |
| `SAFE_ANTERIOR` | Una Safe reemplazada que todavía guarda fondos. Desde ella la plataforma solo arma la **recuperación**: todo su ORIGEN a la operativa vigente, firmado por los custodios de esa Safe con su umbral. Se quita cuando queda vacía. |
| `SAFE_MULTISEND` | El `MultiSendCallOnly` desplegado con la Safe: varias llamadas (como una tanda del regalo) van en una sola transacción. |
| `RPC_ORDEN_URL` | Nodo de la red 5550 (por defecto `https://rpc.ordenglobal-rpc.com/`). |
| `V2_<CLAVE>` | Contrato v2 de cada moneda, cuando esté desplegado. |

Reglas del panel sin firma múltiple: quien propone una liberación no puede aprobarla, un firmante no aprueba dos veces, y una ejecución solo se acepta si la transacción salió de una dirección de tesorería, al destino aprobado, por el monto exacto y confirmada.

## Firma múltiple

Hay dos Safes con los mismos tres custodios, como pide la tabla de SFSP §5.3. La **operativa** (dos de tres) es la tesorería de ORIGEN y emite, abre la migración, quema, suspende y ratifica pausas. La de **los tres custodios** administra los roles y el registro de los contratos. La pausa de emergencia no pasa por la plataforma: cada custodio la hace con su billetera, directo en el contrato, y vence a las 72 horas si la operativa no la ratifica. Se despliega con `contratos-v2/scripts/desplegar-multifirma.ts` y se conecta con `SAFE_DIRECCION` y `SAFE_MULTISEND`. La plataforma no tiene llaves: arma la transacción exacta, recoge las firmas y comprueba lo ejecutado.

Cada **operación** es una transacción de la Safe con su nonce:

| Operación | De dónde sale |
|---|---|
| Liberación de ORIGEN | Al proponer una liberación: un envío de la Safe al destino. |
| Tanda del regalo | «Preparar» en ORIGEN para gas: tandas parejas de hasta 120 usuarios, cada una un lote de envíos (unos 36.700 de gas por usuario: una tanda llena gasta unos 4,4 millones, menos de la mitad de un bloque de la 5550). |
| Contratos v2 | La pestaña «Firma múltiple», eligiendo la Safe: en la operativa, abrir una migración, emitir (en un security, anunciar y, siete días después, emitir), quemar, suspender, ratificar o levantar una pausa; en la de los tres custodios, fijar el registro y los roles. Acepta el archivo de `contratos-v2/scripts/lotes-safe.ts`. |
| Anulación | Al anular cualquier operación pendiente: una transacción vacía con el mismo nonce, que hay que firmar y ejecutar (cómo se rechaza en Safe). Se hace siempre, aunque la plataforma no tenga firmas: alguien pudo firmarla fuera con el archivo descargado. |

El ciclo:

1. Cada custodio firma con su billetera (MetaMask, `eth_signTypedData_v4`). Sin billetera en el navegador: «Descargar para firmar», `contratos-v2/scripts/firmar.ts` y «Pegar firma». `firmar.ts` saca de los datos firmados cada destino, monto y función, los compara con el archivo y el hash, y solo firma en una segunda corrida con `FIRMAR=si`.
2. La plataforma comprueba que la firma es de un custodio de la Safe. No acepta que firme quien propuso la operación, que un operador firme dos veces ni que la misma billetera firme dos veces.
3. Con las firmas del umbral queda **lista**: «Ejecutar con mi billetera», o cualquiera con ORIGEN para el gas manda `execTransaction`.
4. Al registrar la transacción, la plataforma comprueba que la Safe emitió `ExecutionSuccess` con el hash de lo firmado. Si coincide, coinciden el destino, el monto, los datos y el nonce. La liberación queda ejecutada, y con ella todos los envíos de la tanda.

Si la Safe ejecuta algo con un nonce fuera de la plataforma, las operaciones pendientes con ese nonce quedan **caducadas**.

La Safe cuenta como tesorería: lo que tiene no circula y no recibe el regalo. Todo lo ejecutado se ve en la página pública (sin las firmas).

## Desarrollo

```sh
npm install
npm run prueba      # pruebas contra una cadena simulada
npm run typecheck
npm run dev         # http://localhost:3000
```
