# Contratos v2 (SFSP)

Los contratos conformes a SFSP a los que migran las monedas de la red Orden Global (SFSP §14 y adenda v0.5). Reemplazan a los ERC-20 heredados, que no tienen roles, suspensión ni restricción de transferencia (§14.2).

| Contrato | Qué hace |
|---|---|
| `TokenSFSP` | Token con roles (`EMISOR`, `SUSPENSION`, `QUEMA` y admin), todos en la firma múltiple. Tiene suspensión de cuentas, pausa de emergencia, restricción por elegibilidad y **acreditación de la migración por raíz de Merkle**. |
| `RegistroElegibilidad` | Estado de cada dirección según Genesis ID (sin verificar, habilitada o bloqueada), sin datos personales. Cuando el token lo tiene fijado, solo circulan entre direcciones habilitadas. |

## La acreditación

1. La plataforma de migración publica la foto y entrega `acunacion.json`: cada dirección con el monto que fija la política (§14.6) y su prueba de Merkle.
2. La firma múltiple llama `abrirMigracion(raiz, total, referencia)`.
3. Cualquiera puede llamar `acreditar` o `acreditarLote`: la prueba fija dirección y monto, y el destino es siempre la dirección de la hoja. Nadie recibe dos veces, ni más de lo abierto.
4. Los reclamos aprobados (§14.7) se acreditan con una ronda nueva.
5. La plataforma concilia el contrato contra lo que correspondía acuñar.

Las hojas usan el formato de OpenZeppelin (`keccak256(keccak256(abi.encode(address, uint256)))`), el mismo de la plataforma. Las pruebas usan un archivo generado con el código de la plataforma (`test/acunacion-ejemplo.json`).

## Comandos

```sh
npm install
npm run prueba        # 11 pruebas
```

| Script | Para qué |
|---|---|
| `scripts/desplegar.ts` | Despliega el token (y el registro si no hay uno), con todos los roles en `MULTIFIRMA`. En la red 5550 exige `CONFIRMO_PRODUCCION=si`. |
| `scripts/lotes-safe.ts` | Convierte `acunacion.json` en las transacciones para la firma múltiple (formato Safe Transaction Builder): apertura y lotes. Antes verifica cada prueba y el total. |
| `scripts/ensayo.ts` | Ensayo general: despliega, acuña por lotes y concilia cada moneda. No corre en la 5550. |

```sh
NOMBRE="Gold Kapital" SIMBOLO=AUKA PASAPORTE=COM-OG-0001 SERIE=SFSP-300 MULTIFIRMA=0x… \
  npx hardhat run scripts/desplegar.ts --network ensayo
ACUNACION=acunacion.json TOKEN=0x… CHAIN_ID=5550 npx hardhat run scripts/lotes-safe.ts
ENSAYO_DIR=carpeta npx hardhat run scripts/ensayo.ts
```

**Ensayo del 4 de octubre de 2026**, con los saldos reales y la política: las 7 monedas cuadran. El lote más pesado (40 tenedores de ONDK) gasta unos 2,4 millones de gas, por debajo del límite de 10 millones por bloque de la 5550.

Compila con `evmVersion: paris`, porque no se sabe si el génesis de la 5550 tiene la bifurcación que habilita `PUSH0`.

## Antes de desplegar en la 5550

Lo exige el plan de migración, fases 0 a 3:

- **Auditoría externa** de estos contratos.
- **Firma múltiple activa**: su dirección es `MULTIFIRMA`.
- **Ensayo en la red 5534**.
- **Acta de la Junta** con la política de la migración.
- **Bloque de corte anunciado**.
