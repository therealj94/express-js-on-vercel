# MyTokenPay · Arquitectura

Cómo encaja todo, qué está construido y qué falta. Es el mapa para no perderse.

## Las piezas

```
        ┌─────────────────────────────────────────────────────────┐
        │                     App MyTokenPay                        │
        │            Expo SDK 54 · React 19 · 23 pantallas          │
        │                                                           │
        │  Directorio   ·   POS del comercio   ·   Pago del cliente │
        │  (comercios)      (cobrar, caja,          (escanear,      │
        │                    saldo, retiro)          dividir, pagar)│
        └───────┬───────────────────┬───────────────────┬──────────┘
                │                   │                   │
        ┌───────▼────────┐  ┌───────▼────────┐  ┌───────▼──────────┐
        │  Backend        │  │  Genesis ID     │  │  Veta Wallet      │
        │  MyTokenPay     │  │  (identidad)    │  │  (firma el pago)  │
        │                 │  │                 │  │                   │
        │  cobros · split │  │  KYC · KYB      │  │  tiene las llaves │
        │  saldo · retiro │  │  sanciones AML  │  │  mueve el ORIGEN  │
        │  admin          │  │  19.178 fichas  │  │                   │
        └───────┬─────────┘  └─────────────────┘  └────────┬─────────┘
                │                                           │
                └──────────────► Cadena 8532 ◄─────────────┘
                          bloques cada 15,3 s · ORIGEN
```

## Cómo se mueve el dinero, paso a paso

1. **El comercio cobra.** Teclea L 450 en la caja, opcionalmente divide entre N.
   El backend congela la tasa del oro del momento y crea el cobro con un código
   y un QR.
2. **El cliente escanea.** Ve la cuenta, elige qué porciones paga, y la app lo
   manda a **Veta Wallet** por enlace profundo con la dirección del comercio, el
   monto en ORIGEN y un sello único.
3. **Veta Wallet firma.** Es la única que tiene las llaves. Mueve el ORIGEN en
   la **cadena 8532** y vuelve a MyTokenPay con el hash.
4. **El backend confirma.** Marca la porción pagada, abona el ORIGEN al saldo
   del comercio, y el mismo sello no cobra dos veces.
5. **El comercio retira.** Pide pasar su saldo ORIGEN a lempiras en su banco. Un
   administrador de Orden Global hace la transferencia a mano y la marca pagada.
6. **Los dos guardan su recibo** en PDF, con el hash verificable en el
   explorador público.

## La conversión lempira ↔ ORIGEN

En `src/lib/tasas.ts`. ORIGEN se ancla al oro:

```
onza de oro (USD) ÷ 31,1035 = gramo ÷ 55 = 1 ORIGEN (USD) × (HNL/USD)
```

El precio del oro se lee del mercado (CoinGecko, respaldo gold-api.com). El tipo
de cambio dólar-lempira va por `HNL_POR_USD` para que la organización lo fije al
del banco central. **Si ninguna fuente responde, no se crea el cobro** — una
tasa inventada se descubre cuando ya es tarde.

La tasa se **congela** al crear cada cobro y cada retiro: si el oro se mueve
mientras el cliente saca el teléfono, nadie pierde.

## Estado, pieza por pieza

| Pieza | Estado |
| --- | --- |
| App SDK 54, 23 pantallas, cero errores de tipos | ✅ construido |
| POS: cobrar, dividir cuenta, caja, saldo, retiro | ✅ construido y probado (10 pruebas) |
| Pago del cliente + enlace profundo a Veta Wallet | ✅ construido |
| Panel de administración: verificar negocios, pagar retiros | ✅ construido |
| Conversión lempira ↔ ORIGEN con precio real del oro | ✅ construido |
| Bloqueo con rostro / huella | ✅ construido |
| Recibos en PDF descargables | ✅ construido |
| Ajustes completos | ✅ construido |
| `app.json` listo para tienda (permisos, íconos, builds) | ✅ construido |
| **Conexión real con Genesis ID** | ⏳ el directorio aún usa KYC simulado |
| **Base de datos** | ⏳ todo en memoria; un despliegue borra los cobros |
| **Verificar el hash contra la cadena** | ⏳ hoy se confía en el comprobante de la app |
| **Versión web** | ⏳ no empezada |
| **Avisos push** al comercio cuando entra un pago | ⏳ no empezado |

## Lo que sigue, en orden de valor

1. **Base de datos** (MongoDB, como Genesis ID). Es lo primero: sin ella un
   despliegue borra los cobros. Todo el backend está escrito para que sea
   cambiar `src/lib/caja.ts` y `src/lib/db.ts`, nada más — ninguna ruta sabe
   cómo se guardan las cosas.
2. **Genesis ID de verdad.** Hoy el KYC del directorio se auto-aprueba en la app
   (`USE_MOCK_API`). El puente ya existe en `infra/genesis-proxy` y Genesis ID
   opera con 19.178 fichas de sanciones. Es conectar, no construir.
3. **Verificar el hash en la 8532.** Comprobar que el monto y el destino del
   pago cuadran con lo que dice la app cierra el círculo.
4. **Web.** Mismo backend, mismo dominio de cobro. La web sirve sobre todo al
   comercio (caja en una tablet, panel de retiros) y al cliente que no tiene la
   app. Es un frontend nuevo, no un backend nuevo.

## Seguridad: lo que se cerró

El **POS anterior** (`pos-wallet` en Heroku) servía nombres, números de
identidad y cuentas bancarias en `GET /payments` **sin pedir contraseña**. Se
apagó (dyno a 0). Los datos siguen en su MongoDB; la exposición pública, no.

Este backend nuevo tapa el número de cuenta en todas las respuestas salvo en el
panel de administración, y solo del retiro que se está pagando.
