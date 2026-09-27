# Pulse2Chat · el relevo de mensajes

Producto de mensajería de Orden Global: hilos 1:1 y grupos, adjuntos, avisos
push, llamadas (TURN). **No es Ultron** (asistente de la junta) y **no es el
tablero del cerebro** (ops). Comparte máquina hoy; el producto es propio.

## Piezas

| Pieza | Dónde | Qué hace |
|---|---|---|
| Relévo | `servidor.py` | Alta por correo+llave, bandeja, grupos, archivos, turno ICE |
| Cliente web | `apps-web/veta-wallet/chat.js` | Habla con el relevo; las pantallas viven en `app.js` |
| Despliegue | `desplegar-pulse2chat.py` | S3 + SSM al nodo; `desplegar-mensajes.py` es alias |
| Respaldo | `respaldo-mensajes.sh` | Copia de datos del relevo |
| Pruebas | `pruebas/` | Suites del relevo |

## Identidad

- Alta: correo → llave aleatoria.
- Cada petición firma con esa llave atada al correo.
- No hay E2E en esta versión; no se promete en la interfaz.

## Dónde corre hoy (compat)

Sigue expuesto en el nodo del cerebro, detrás de Caddy:

```
https://cerebro.ordenscan.com/mensajes
```

Salud pública: `GET …/mensajes/salud` → 200 sin contraseña del tablero.
Puerto local del servicio: `8390`. Datos: `/srv/mensajes/`.

El cliente acepta override:

```js
window.OG_MENSAJES_API = 'https://…'  // antes de cargar chat.js
```

Por omisión apunta a la URL de arriba. Un corte a un host propio
(`pulse2chat.…`) es trabajo aparte con Cloud — este paquete ya no vive
dentro de `infra/cerebro/`.

## Qué no es

- **Cerebro** (`infra/cerebro/`): tablero FLUX / ops.
- **Ultron** (`infra/ultron/`): asistente de la junta (Vizion).
- **AU-RA** (`infra/aura/`): línea WhatsApp / voz al público.

## Historia del path

Antes: `infra/mensajes/`. Esa carpeta queda con un `LEEME.md` que apunta aquí.
