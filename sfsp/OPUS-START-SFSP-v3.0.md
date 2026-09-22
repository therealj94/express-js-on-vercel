# OPUS-START · cómo se trabaja en este árbol

Una parte o subparte por sesión. Antes de editar nada, la sesión identifica:
repositorio, SHA base, entorno, archivos permitidos, criterio de cierre y
decisiones pendientes que la afectan.

## Antes de escribir una línea

1. `CONTRATO-INTERNO.md` — tipos, identificadores, estados, eventos, códigos y
   fórmulas. Es la fuente única. Si falta un concepto, se añade ahí primero.
2. `DECISIONES-SFSP.json` — qué está aprobado y qué no. Un `null` no se
   sustituye por una recomendación.
3. `BASELINE-SFSP.md` — qué se sabe del ecosistema y con qué estado de evidencia.
4. La serie de `spec/` que corresponde a la parte.

## Las seis reglas que no se negocian

1. **Lectura por defecto.** Una variable de entorno no autoriza una escritura
   sensible. Hace falta aprobación de operación con red, contrato, destinatario,
   monto, límites y estado previo verificado.
2. **Secreto y custodia separados.** Ninguna semilla, llave privada ni dato
   personal entra en código, pruebas, registros, CI, staging ni evidencia. Un
   secreto expuesto abre un incidente; borrar el texto no lo revoca.
3. **Aislamiento efectivo.** Las pruebas destructivas corren sobre
   infraestructura desechable aprovisionada para esa ejecución. No hay atajo por
   nombre de base ni por variable de override.
4. **Sin decisiones inventadas.** Un precio, un haircut, un quórum, un derecho o
   un permiso pendiente conserva estado `BLOCKED_DECISION`. En pruebas se usa un
   fixture sintético etiquetado, nunca el valor «recomendado».
5. **Un estado incierto no se reintenta pagando otra vez.** Se registra
   operación, nonce y recibo, y se concilia antes de continuar.
6. **Toda producción pasa por P11.** Esta entrega no autoriza ningún despliegue,
   ninguna activación de flag y ningún cambio de contrato.

## Qué puede hacer una sesión en este árbol, hoy

| Permitido | No permitido |
|---|---|
| Escribir y probar especificación, ADR, SDK, contratos e indexador | Desplegar en 5534 o 5550 |
| Correr suites con datos sintéticos | Leer cuentas, saldos o llaves reales |
| Proponer parámetros como `null` con su decisión | Fijar un valor económico |
| Documentar discrepancias del ecosistema como `NO_VERIFICADO` | Afirmar que algo de producción está corregido |
| Generar números de cuenta en pruebas | Generar números de cuenta reales |

## Cómo termina una sesión

Con evidencia, no con una afirmación. El cierre lleva:

- el SHA sobre el que se trabajó;
- el comando exacto de pruebas y su salida;
- el diff;
- los hallazgos que quedaron en `BLOCKED` con su decisión y su responsable;
- lo que quedó fuera y por qué;
- el siguiente paso permitido.

Nunca termina con «todo listo».

## Orden de construcción

```
P0/P1  →  P3 (incluye SFSP-130)  →  P4/P5  →  P6/P7  →  P8  →  P9  →  P11 por release
```

P2 puede avanzar en paralelo una vez estabilizada la línea base. P0, P1, P2, P6,
P10 y P11 tocan sistemas existentes y credenciales: no se ejecutan dentro de
este árbol, sino en sus repositorios y con sus aprobaciones.
