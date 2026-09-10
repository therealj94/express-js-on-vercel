# El cobro con ORIGEN

Cómo cobra un comercio, cómo paga un cliente y cómo el dinero termina en
lempiras en una cuenta bancaria.

```
  cliente                 MyTokenPay              Veta Wallet         cadena 8532
     │                         │                       │                   │
     │  escanea el QR ────────▶│                       │                   │
     │◀──── ve la cuenta ──────│                       │                   │
     │  elige sus partes ─────▶│ reserva               │                   │
     │                         │──── abre con los datos del pago ─────────▶│
     │                                                 │  firma ──────────▶│
     │◀──── vuelve con el comprobante ─────────────────│                   │
     │  confirma ─────────────▶│ abona al comercio     │                   │
```

MyTokenPay **nunca toca una llave privada**. Cuando hay que mover ORIGEN manda
al usuario a Veta Wallet y espera a que vuelva con el comprobante. Un directorio
de comercios no tiene por qué poder gastar el dinero de nadie.

## Las cuatro reglas que sostienen todo

**1. La tasa se congela.** Un cobro guarda cuántos lempiras valía un ORIGEN
cuando se creó. Si el oro se mueve mientras el cliente saca el teléfono, ni el
comercio ni el cliente pierden: los dos acordaron un número.

**2. El saldo no se guarda, se calcula.** No existe un campo `saldo` que un
fallo a mitad de camino pueda dejar mal. Es la suma de los movimientos, y cada
movimiento dice de dónde salió. Un descuadre se puede encontrar; un número
suelto, no.

**3. Una parte pagada no se vuelve a cobrar.** Cada porción de una cuenta
dividida tiene su estado, y quien la reserva la bloquea ocho minutos. Sin eso,
dos amigos tocando «pagar» a la vez pagan la misma porción y el comercio cobra
de menos. Si el que reservó se va, la reserva caduca sola.

**4. El mismo sello no cobra dos veces.** La app genera un sello por intento de
pago que viaja igual en el reintento. Si la red se corta y se reintenta, el
servidor devuelve el mismo resultado en vez de cobrar otra vez.

## El precio de ORIGEN

ORIGEN se ancla al oro: es un «gramín», la cincuentaicincoava parte de un gramo.

```
onza de oro (USD) ÷ 31,1035 = gramo (USD) ÷ 55 = 1 ORIGEN (USD) × USD/HNL
```

El precio del oro se lee del mercado (CoinGecko, con gold-api.com de respaldo).
**Si ninguna fuente responde, no se crea el cobro.** Un cobro con una tasa
inventada se descubre cuando ya es tarde.

El tipo de cambio dólar-lempira va por `HNL_POR_USD` porque es un dato que la
organización debe fijar —normalmente al del banco central— y no heredar de una
fuente cualquiera que un día devuelva otra cosa.

## Retiros: cómo funciona de verdad

El comercio pide un retiro, **una persona de Orden Global hace la transferencia
bancaria a mano**, y la marca como pagada. No hay integración bancaria
automática, y la app lo dice así de claro: un comercio que espera el dinero en
dos minutos y le llega mañana pierde la confianza mucho más rápido que uno al
que se lo advirtieron.

El saldo se descuenta **solo cuando el administrador confirma que pagó**. Entre
medias el monto queda «retenido»: ni disponible para pedirlo otra vez, ni
descontado de un dinero que todavía no salió.

## Datos bancarios

El número de cuenta **solo se ve completo en el panel de administración**, y
solo del retiro que se está pagando. En todas las demás respuestas viaja tapado
(`····8877`).

Esta regla existe por algo concreto: el POS anterior servía nombres, números de
identidad y cuentas bancarias en `GET /payments` **sin pedir contraseña**.

## La API

| Ruta | Quién | Para qué |
| --- | --- | --- |
| `POST /api/cobros` | dueño verificado | Crear un cobro, opcionalmente dividido |
| `GET /api/cobros/mios` | dueño | Su caja |
| `POST /api/cobros/mios/:id/anular` | dueño | Anular, si nadie pagó todavía |
| `GET /api/cobros/codigo/:codigo` | cualquiera con sesión | Ver la cuenta a pagar |
| `POST …/reservar` · `…/liberar` | cualquiera con sesión | Tomar y soltar porciones |
| `POST …/pagar` | cualquiera con sesión | Confirmar con el comprobante y el sello |
| `GET /api/retiros/saldo` | dueño | Saldo, tasa y movimientos |
| `POST /api/retiros` | dueño | Pedir el depósito |
| `GET /api/admin/retiros` | administrador | La cola por pagar, con la cuenta completa |
| `POST /api/admin/retiros/:id/estado` | administrador | Marcar en proceso, pagado o rechazado |
| `POST /api/admin/negocios/:id/resolver` | administrador | Verificar o rechazar un negocio |

Un cobro se consulta **por su código**, nunca por su id interno: el código es lo
que va en el QR y lo que se dicta en voz alta, y no revela cuántas ventas lleva
el negocio.

## Probarlo

```sh
# Servidor
PORT=3399 ADMIN_EMAIL=admin@ordenglobal.link ADMIN_PASSWORD=… JWT_SECRET=… npm start

# Las pruebas del dominio, contra el servidor real
ADMIN_EMAIL=admin@ordenglobal.link ADMIN_PASSWORD=… node --test pruebas/caja.test.mjs
```

Diez comprobaciones, y no prueban «la función devuelve lo que espero» sino lo
que puede costar dinero: que una parte no se pague dos veces, que dos personas
no paguen la misma porción, que nadie retire más de lo que tiene, que el número
de cuenta no vuelva completo, y que el panel de administración **no exista**
para quien no es administrador.

## Lo que falta

- **Base de datos.** Todo vive en memoria: un despliegue borra los cobros. Es lo
  primero que hay que cambiar antes de que un comercio real cobre.
- **Avisar al comercio** cuando entra un pago o se deposita un retiro. Hoy hay
  que mirar la pantalla.
- **Comprobar el hash en la cadena.** Hoy se confía en el comprobante que manda
  la app. Verificarlo contra la 8532 —que el monto y el destino cuadren— cierra
  el círculo.
- **Genesis ID de verdad.** La verificación del negocio la aprueba un
  administrador a mano; conectarla al motor que ya existe es el siguiente paso.
