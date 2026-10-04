# Plataforma de migración SFSP-700

La plataforma donde se hace y se comprueba el paso de las monedas de la red 5550 a sus contratos v2 (SFSP §14). Cada saldo se fotografía en el bloque de corte, se le aplica la política de su moneda y lo que corresponde pasa a la misma dirección. **No se pierde a nadie por no encontrarlo**: lo no ubicado queda abierto a reclamo.

**No tiene llaves y no firma nada.** Toma fotos de saldos, publica sus raíces de Merkle, prepara lo que la firma múltiple tiene que ejecutar y después comprueba en la cadena que lo ejecutado es exactamente lo aprobado.

## Qué hace

| Parte | Para qué |
|---|---|
| Consulta pública (`/`) | Cualquier tenedor pega su dirección y ve su saldo en la foto, su prueba de Merkle, su saldo en la v2 y si su regalo de gas salió. |
| Panel interno (`/panel`) | El equipo carga las listas, toma y publica las fotos, concilia la v2, lleva las liberaciones de ORIGEN y el regalo de gas. |
| Bitácora | Toda acción queda registrada con quién la hizo. |

## Política de la migración (decisión del 4 de octubre de 2026)

| Moneda | Qué pasa a la v2 |
|---|---|
| ONDK | Todo, salvo posiciones de más de 100.000 (tesorería), que desaparecen |
| AUKA | Todo, salvo posiciones de más de 50, que desaparecen. `0x7462…3ad8` queda con 50 |
| AGKA | Todo, salvo posiciones de más de 50 |
| HARV, IBS, MONARKA, AMOR | Solo lo de los usuarios: lo de más de 100.000 es tesorería y desaparece |
| ORIGEN | No se migra: queda nativo |

La política vive en `src/catalogo.ts` (`POLITICA`). Cada exclusión queda en la foto con su motivo (`umbral` o `tope`).

- **ORIGEN** queda nativo. Su supply visible es lo que circula fuera de tesorería. El «mint» de ORIGEN es una **liberación de tesorería**, que solo procede contra lo asegurado (con su referencia documental) y con las firmas del umbral.
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
| `MIGRACION_UMBRAL` | Firmas para aprobar una liberación (por defecto 2, dos de los tres custodios). |
| `RPC_ORDEN_URL` | Nodo de la red 5550 (por defecto `https://rpc.ordenglobal-rpc.com/`). |
| `V2_<CLAVE>` | Contrato v2 de cada moneda, cuando esté desplegado. |

Reglas del panel: quien propone una liberación no puede aprobarla, un firmante no aprueba dos veces, y una ejecución solo se acepta si la transacción salió de una dirección de tesorería, al destino aprobado, por el monto exacto y confirmada.

## Desarrollo

```sh
npm install
npm run prueba      # pruebas contra una cadena simulada
npm run typecheck
npm run dev         # http://localhost:3000
```
