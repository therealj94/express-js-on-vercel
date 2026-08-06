# MyTokenPay · Entrega

Estado del sistema al 6 de agosto de 2026. Todo lo de aquí está **desplegado y
verificado en vivo**, no en teoría.

## Lo que está corriendo ahora mismo

| Pieza | Dónde | Estado |
| --- | --- | --- |
| **Backend del POS** | `https://mytokenpay-api-5ab43b64205a.herokuapp.com` | ✅ en producción |
| **MyTokenPay (APK)** | [descargar APK](https://expo.dev/artifacts/eas/GtfZAZIPkJmJE2Br4iqITzsN4Oee2aQoxOeOWYZ0_oM.apk) · `@vetawallet/mytokenpay` | ✅ v1.0.0 con Genesis ID y API real |
| **Veta Wallet (APK)** | [descargar APK](https://expo.dev/artifacts/eas/44cn1FX-0Lox3jFbw4VJB-7lr5a-bs-Zdapc9itBSnU.apk) · `@vetawallet/veta-wallet` | ✅ v1.32.0 — el botón SSO le llega por el aire al abrirla |
| **Genesis ID (panel)** | `https://genesis-id.onrender.com` | ✅ en producción |
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

## Ya no hay nada simulado

El simulador (`USE_MOCK_API`) está **apagado**. La revisión destapó que con él
encendido el login guardaba un token de mentira y el POS —que siempre fue
real— lo rechazaba con 401: registrarse y cobrar no podían funcionar juntos.
Hoy la app entera habla con la API de producción:

- **POS** — cobrar, dividir, pagar, saldo, retiros, recibos, panel de admin.
- **Directorio** — comercios reales del backend (con su semilla de arranque).
- **Bonos y regalos** — los puntos salen de los pagos que hiciste de verdad:
  un lempira pagado, un punto. Verificado en vivo: pago de L 120 → +120 puntos.
- **KYC personal** — contra **Genesis ID**, el registro de identidad del
  ecosistema. Ver la sección siguiente.

## Genesis ID: conectado ✅

MyTokenPay es ahora un ciudadano pleno del ecosistema de identidad:

- **Entrar con Genesis ID.** En Veta Wallet (Ajustes → MyTokenPay) hay un botón
  «Abrir MyTokenPay con mi Genesis ID»: Genesis ID firma un pase de un solo
  uso, se abre `mytokenpay://sso` y entrás sin crear cuenta ni repetir el KYC.
  El botón «Entrar con Genesis ID» de la bienvenida de MyTokenPay hace el viaje
  inverso (abre Veta, que emite el pase y te devuelve).
- **Seguridad del pase:** el backend no se cree el correo del enlace — comprueba
  contra Genesis ID que pertenezca exactamente al GID del pase. Correo ajeno →
  403. Pase inventado → 401. Una cuenta jamás cambia de identidad en silencio.
- **Verificación dentro de MyTokenPay.** La pantalla «Identidad Genesis» ya no
  finge: datos → franja MRZ del documento → foto de rostro → revisión de un
  oficial de cumplimiento en el panel (`genesis-id.onrender.com`) → GID. La
  misma identidad vale en Veta Wallet y en todo el ecosistema.
- **Probado de punta a punta en producción:** alta → documento ICAO válido →
  biometría → aprobación de operador → vínculo → pase SSO → login en MyTokenPay
  → reingreso a la misma cuenta. La identidad de laboratorio quedó suspendida
  al terminar, como se registró en la bitácora.

**Para entrar con TU Genesis ID:** verificate en Veta Wallet (o en MyTokenPay,
pantalla Identidad Genesis), aprobá el trámite en el panel de cumplimiento con
el usuario administrador, y desde Veta tocá «Abrir MyTokenPay con mi Genesis
ID». La actualización de Veta Wallet llega sola por el aire (reabrí la app dos
veces).

## Base de datos: hecho ✅

El backend ya **no guarda en memoria**. Persiste en **MongoDB** (el mismo clúster
Atlas del ecosistema, base `mytokenpay`). Un reinicio del dyno ya no borra nada:
está verificado en vivo — se creó un cobro, se reinició el servidor, y el cobro
seguía ahí.

- `src/lib/almacen.ts` es una colección mínima con dos respaldos: MongoDB si hay
  `MONGODB_URI`, memoria si no (para desarrollo y pruebas). Si hay URI y falla,
  no arranca en memoria a escondidas: lanza.
- Índices únicos sobre el sello (cortafuegos final contra el doble cobro), el
  código del cobro y el correo del usuario.
- `GET /healthz` informa qué respaldo está activo (`"almacen":"mongo"`).

## El paso que queda para producción de verdad

1. **Verificar el hash en la cadena.** Hoy el pago se confía del comprobante que
   manda la app; comprobar que el monto y el destino cuadran en la 8532 cierra
   el círculo.

## Detalles técnicos

- **App:** Expo SDK 54, React 19, Reanimated 4, 23 pantallas. Empaqueta limpio
  (7,1 MB Hermes). Cero errores de tipos.
- **Backend:** Express + TypeScript, Node 20. Persistencia en MongoDB. Cero
  errores de tipos. 10/10 pruebas del dominio contra la URL de producción
  (ya con Mongo detrás).
- **Rama:** `claude/mytokenpay-pos-origen`.
- **Docs:** `ARQUITECTURA.md` (cómo conecta todo), `POS.md` (el dominio de
  cobro), este archivo (la entrega).

## Seguridad, de paso

El POS anterior (`pos-wallet`) servía identidades y cuentas bancarias sin
contraseña. Está apagado. Este backend tapa el número de cuenta en todas las
respuestas salvo en el panel de administración, y solo del retiro que se paga.
