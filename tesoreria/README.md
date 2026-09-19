# Tesorería de Orden Global

Tres plataformas web que comparten un mismo estado y una sola regla:
**ningún token sale al mercado sin respaldo certificado detrás.**

| Página | Qué es | Acento |
|---|---|---|
| `index.html` | Portal de entrada y explicación del flujo | oro |
| `origen.html` | **Autoridad de Emisión de ORIGEN** — la que decide | violeta |
| `security.html` | Tesorería de Security Tokens (ONDK, MPLE, VTRE) | oro |
| `utility.html` | Tesorería de Utility Tokens (VETA, OGS, MTP) | cian |

Todo es HTML/CSS/JS sin dependencias ni build. Se abre con doble clic o se sirve
como estático. El estado vive en `localStorage` mientras no exista backend, y se
comparte entre las tres páginas: lo que se autoriza en ORIGEN aparece al instante
en las otras dos.

---

## 1. El modelo: por qué esto no es cripto

En una cripto normal el token nace primero y el mercado le busca precio. Aquí es al revés:

```
Activo real → certificación de un tercero → aforo por riesgo → ORIGEN → autorización → token
```

1. **Activo real.** Un bien que existe: mineral, inmueble, caja, cuenta por cobrar.
2. **Certificación.** Un auditor o valuador independiente lo certifica con folio y vigencia.
3. **Aforo (haircut).** Descuento por riesgo de realización. Un mineral in situ no vale
   lo mismo que el efectivo. Solo el valor *después* del aforo respalda.
4. **ORIGEN.** La Autoridad emite unidades de respaldo contra esa reserva. `1 ORIGEN = 1 USD`
   de reserva certificada admisible.
5. **Autorización.** La tesorería pide emitir con causa, evidencia y firmas. Sin ORIGEN libre, se niega.
6. **Emisión.** Salen solo los tokens que el valor certificado aguanta, al precio establecido.

### Las invariantes que el sistema hace cumplir

Están implementadas en `app/nucleo.js` y se evalúan en cada render, no solo al guardar:

| Invariante | Dónde |
|---|---|
| `ORIGEN emitido ≤ Σ reservas certificadas × (1 − aforo)` | `respaldo()` |
| Un certificado vencido o en revisión vale **cero** | `valorAdmisible()` |
| `ORIGEN comprometido ≤ ORIGEN emitido` → el resto es *libre* | `respaldo()` |
| No se aprueba emisión si `origenRequerido > libre` o el ratio cae bajo el mínimo | `puedeEmitir()` |
| Security: `emitidos × precio ≤ valuación certificada` y `≤ ORIGEN asignado` | `saludSecurity()` |
| Utility: `circulante ≤ capacidad de servicio` y `pasivo redimible ≤ ORIGEN asignado` | `saludUtility()` |
| Emitir exige cabecera autorizada **y** respaldo, valuación y capacidad suficientes | `emitirTokens()` |
| Toda mutación se asienta en un libro encadenado por hash | `accion()` / `verificarLibro()` |

Quemar tokens libera el ORIGEN proporcional y lo devuelve al pozo libre (`quemar()`).

### Security vs Utility

| | Utility | Security |
|---|---|---|
| Qué entrega | Acceso a un servicio | Derecho patrimonial |
| Precio | Anclado al costo del servicio | Valuación independiente certificada |
| Por qué se emite | Hay capacidad contratada y consumo | Hay activo certificado |
| Rendimiento | Ninguno | Dividendo o participación |
| Secundario | Libre entre usuarios | Ventanas, banda de precio y acreditados |
| Respaldo ORIGEN | Solo la parte redimible | El total del valor emitido |

---

## 2. Qué hace cada plataforma

### Autoridad de Emisión de ORIGEN (`origen.html`)

- **Panel de respaldo** — ratio en vivo, holgura, composición por reserva, alertas de
  certificados vencidos o por vencer, freno de emergencia global.
- **Cola de emisión** — cada solicitud con su dictamen automático (hay respaldo / no hay),
  causa invocada, evidencias, firmas del Consejo (M-de-N) y ventana de objeción.
  Se puede **firmar, autorizar, objetar o rechazar**; el botón de autorizar está
  deshabilitado mientras falten firmas o falte respaldo.
- **Emitir / quemar ORIGEN** — contra una reserva concreta, con el ratio resultante
  calculado antes de confirmar. Solo se puede quemar ORIGEN libre.
- **Reservas** — registro maestro: alta, revaluación, certificar, poner en revisión, retirar.
- **Prueba de reservas** — documento público imprimible con el sello del libro.
- **Política y Consejo** — ratio objetivo y mínimo, firmas requeridas, días de objeción,
  banda del secundario. Exportar o reiniciar el estado.
- **Libro sellado** — asientos encadenados con verificación de integridad.

### Tesorería de Security Tokens (`security.html`)

- Panel con valor en circulación, valuación certificada, tenedores, alertas y
  calendario de obligaciones (revisiones, lock-ups, ventanas, reportes vencidos).
- Expediente por emisión: supply y los tres techos (valuación, ORIGEN, autorizado),
  valuación con historial y Comité, distribuciones, mercado, cumplimiento, cap table
  y el expediente ante la Autoridad.
- **Solicitar emisión** — asistente con catálogo de causas, evidencia y dictamen
  anticipado de lo que responderá la Autoridad.
- **Nueva valuación** — con firmas del Comité; revaluar no emite nada, solo mueve el techo.
- **Mercado secundario** — libro de órdenes con banda de precio (una orden fuera de banda
  se rechaza), cruce manual, régimen abierto / por ventanas / suspendido.
- **Transfer agent** — transferencias que verifican Genesis ID, acreditación y lock-up.

### Tesorería de Utility Tokens (`utility.html`)

- Panel con circulante, capacidad comprometida, pasivo redimible y cobertura de servicio.
- Expediente por token: supply con los tres techos (capacidad, ORIGEN, techo duro),
  contrato de capacidad, parámetros económicos, grifos, sumideros y vesting.
- **Prueba de utilidad** — capacidad contratada contra tokens vivos, con vigencias.
- **Economía** — rotación real, quema por consumo, telemetría del periodo.
- Solicitar emisión (con la capacidad nueva que la respalda), emitir, quemar.

---

## 3. Archivos

```
tesoreria/
├── index.html          portal
├── origen.html         autoridad de emisión
├── security.html       tesorería security
├── utility.html        tesorería utility
└── app/
    ├── estilo.css      sistema visual (teal + oro, claro/oscuro, responsive)
    ├── datos.js        semilla de datos = contrato de la API
    ├── nucleo.js       estado, reglas, libro sellado, chasis de UI
    ├── origen.js       vistas de la Autoridad
    ├── security.js     vistas de security
    └── utility.js      vistas de utility
```

---

## 4. Contrato para el backend

`app/datos.js` es la forma exacta de los datos. Al construir el backend, estas rutas
reemplazan al `localStorage` sin tocar las vistas:

| Método | Ruta | Reemplaza a |
|---|---|---|
| `GET` | `/api/tesoreria/estado` | `T.cargar()` |
| `GET` | `/api/origen/respaldo` | `T.respaldo()` |
| `GET/POST` | `/api/origen/reservas` | alta y listado de reservas |
| `PATCH` | `/api/origen/reservas/:id` | revaluar, certificar, retirar |
| `POST` | `/api/origen/emitir` · `/quemar` | emisión y quema de ORIGEN |
| `GET/POST` | `/api/solicitudes` | cola de autorización |
| `POST` | `/api/solicitudes/:id/firmar` · `/aprobar` · `/rechazar` · `/objetar` | dictamen |
| `GET` | `/api/securities` · `/:id` | emisiones |
| `POST` | `/api/securities/:id/emitir` · `/valuacion` · `/ordenes` · `/transferir` | operación |
| `GET` | `/api/utilities` · `/:id` | tokens de servicio |
| `POST` | `/api/utilities/:id/emitir` · `/quemar` · `/capacidad` | operación |
| `GET` | `/api/libro` · `/api/libro/verificar` | libro sellado |
| `GET` | `/api/prueba-de-reservas` | documento público |

Notas para quien lo implemente:

- Las funciones `respaldo()`, `puedeEmitir()`, `saludSecurity()` y `saludUtility()` de
  `nucleo.js` son la especificación de negocio: hay que portarlas al servidor y
  **volver a validarlas ahí**. El front valida para explicar, el backend valida para impedir.
- `hash()` es un FNV-1a de 64 bits, suficiente para encadenar en el navegador.
  En el servidor debe ser **SHA-256** y las firmas del Consejo, criptográficas de verdad
  (una llave por consejero), no un nombre en una lista.
- Ningún endpoint de emisión debe aceptar un monto sin releer el respaldo dentro de la
  misma transacción: el ratio se calcula en la escritura, no antes.

---

## 5. Probar en local

```bash
# doble clic en tesoreria/index.html, o:
npx http-server tesoreria -p 8080
```

Servido desde este repo (Express), la carpeta queda en `/tesoreria`.

El botón **Reiniciar a la semilla** en `origen.html#politica` devuelve los datos de
demostración cuando la exploración deja el estado hecho un nudo.
