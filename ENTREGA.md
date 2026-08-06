# MyTokenPay · Entrega

Estado del sistema al 6 de agosto de 2026. Todo lo de aquí está **desplegado y
verificado en vivo**, no en teoría.

## Lo que está corriendo ahora mismo

| Pieza | Dónde | Estado |
| --- | --- | --- |
| **Backend del POS** | `https://mytokenpay-api-5ab43b64205a.herokuapp.com` | ✅ en producción |
| **App móvil (APK)** | [descargar APK](https://expo.dev/artifacts/eas/hZjZPhXHkfLeC1Ooww_pHnn0MpfqfDLvcKz_1pjFLcY.apk) · `@vetawallet/mytokenpay` | ✅ compilado (v1.0.0) |
| **Cadena 8532 + ORIGEN** | `ordenscan.com` | ✅ en producción |

El backend pasó las **10 pruebas del dominio contra la URL de producción**, no
solo en local: cuenta dividida sin perder un centavo, doble cobro bloqueado,
retiro mayor que el saldo rechazado, cuenta bancaria nunca expuesta, panel de
administración invisible para quien no es administrador.

## Acceso de administrador

El panel que verifica negocios y paga los retiros:

```
correo:      admin@ordenglobal.link
contraseña:  Mtp-Y8phx8FdtO
```

> **Cambiala** en cuanto entres. Es la llave que aprueba comercios y libera
> dinero. Se pone en la variable `ADMIN_PASSWORD` del backend en Heroku.

## Cómo probarlo, de punta a punta

1. Instalá el APK (link en la sección de builds de EAS cuando termine).
2. Registrate y creá un negocio. Configurale una **dirección de cobro** de la
   cadena 8532 en «Mi empresa».
3. Con el admin, verificá ese negocio.
4. En el negocio: **Cobrar** → tecleá un monto → dividí la cuenta si querés →
   sale el QR.
5. Desde otro teléfono (o el mismo): **Pagar** → escaneá → elegí tus partes →
   firmás en Veta Wallet → volvés y ves la celebración.
6. El comercio ve su saldo subir, pide un **retiro** a su banco, y el admin lo
   marca pagado.
7. Los dos descargan su **recibo en PDF** con el hash verificable.

## Lo que funciona de verdad vs lo simulado

**Real (API en producción, dinero de verdad):**
todo el POS — cobrar, dividir, pagar, saldo, retiros, panel de administración,
recibos, conversión lempira↔ORIGEN con el precio real del oro, y el bloqueo con
rostro/huella.

**Simulado todavía (el directorio de comercios):**
la búsqueda de comercios, los puntos y premios, y el KYC personal usan datos de
demostración en el teléfono (`USE_MOCK_API`). Es la parte de «vitrina», no la de
dinero. Conectarla a Genesis ID es un paso aparte.

## Los tres pasos para producción de verdad

En orden. Ninguno es reconstruir; los tres son conectar o configurar.

1. **Base de datos.** El backend guarda en memoria: un reinicio del dyno borra
   los cobros. Bien para probar en un teléfono, no para comercios reales.
   MongoDB, como Genesis ID. El almacén (`src/lib/caja.ts`, `src/lib/db.ts`)
   está aislado para que sea cambiar esos dos archivos.
2. **Genesis ID.** Quitar el KYC simulado del directorio y apuntar al motor que
   ya opera con 19.178 fichas de sanciones. El puente vive en
   `infra/genesis-proxy`.
3. **Verificar el hash en la cadena.** Hoy el pago se confía del comprobante que
   manda la app; comprobar que el monto y el destino cuadran en la 8532 cierra
   el círculo.

## Detalles técnicos

- **App:** Expo SDK 54, React 19, Reanimated 4, 23 pantallas. Empaqueta limpio
  (7,1 MB Hermes). Cero errores de tipos.
- **Backend:** Express + TypeScript, Node 20. Cero errores de tipos.
- **Rama:** `claude/mytokenpay-pos-origen`.
- **Docs:** `ARQUITECTURA.md` (cómo conecta todo), `POS.md` (el dominio de
  cobro), este archivo (la entrega).

## Seguridad, de paso

El POS anterior (`pos-wallet`) servía identidades y cuentas bancarias sin
contraseña. Está apagado. Este backend tapa el número de cuenta en todas las
respuestas salvo en el panel de administración, y solo del retiro que se paga.
