# Campaña SFSP · primer correo

El primer correo a los contactos del «SFSP · Directorio de contacto» (25-09-2026). Sale desde el
buzón de José (`j.ordonez@ordenglobal.org`) en el idioma de cada persona, con el video, la
presentación y un botón de WhatsApp.

| Archivo | Qué hace |
|---|---|
| `plantilla.mjs` | El correo en ES y EN (HTML y texto) |
| `depurar.mjs` | Pasa `contactos.csv` a `envios.csv`: estado, saludo y tanda de cada contacto |
| `enviar.mjs` | Vista previa, prueba y envío pausado por el SMTP del buzón |

**Los datos no están en el repositorio**, porque es público. `contactos.csv`, `envios.csv`,
`registro.jsonl` y `bajas.txt` se guardan fuera y se copian a esta carpeta para trabajar.

## Por qué por el buzón y no por Amazon SES

La cuenta de SES de Orden Global está aprobada para correos de servicio a usuarios registrados de
Veta Wallet y Genesis ID. Amazon no permite en SES correo a quien no lo pidió. Si la cuenta se
suspende, dejan de llegar las confirmaciones y los enlaces de contraseña de Veta.

Por eso el correo sale por el servidor de correo del dominio (`mail.ordenglobal.org`, con SPF y
DKIM), como cualquier correo que José escribe a mano. Así las respuestas quedan en su buzón.

## Reglas

- **Ritmo:** 30 por hora como máximo (`POR_HORA`), con pausas de ±20 % al azar. `--max` limita
  cuántos salen en cada corrida.
- **Una persona por organización** en la primera ola. Las demás quedan en `segunda_ola`.
- **Sin adjuntos.** El video y el PDF van como enlaces, y el envío se detiene si alguno no responde.
  Los PDF viven en `https://www.ordenglobal.org/sfsp/` (ver `sitio-ordenglobal/`).
- **Nunca se promete** «regulado», «licenciado» ni rendimientos. El pie repite el aviso de la
  presentación.
- **Quien pide no recibir más** va a `bajas.txt` y no se le vuelve a escribir. Los correos llevan
  el encabezado `List-Unsubscribe`.
- **Tres fallos seguidos** detienen el envío.

## Uso

```sh
npm install
node depurar.mjs                                   # contactos.csv → envios.csv
node enviar.mjs vista                              # vista/<n>.html, no envía nada
SMTP_CLAVE=... node enviar.mjs prueba tu@correo.com 001
node enviar.mjs cola --max 30                      # quiénes van, no envía
SMTP_CLAVE=... node enviar.mjs cola --max 30 --confirmo
```

Variables: `SMTP_CLAVE` (obligatoria), `SMTP_HOST`, `SMTP_PUERTO`, `SMTP_USUARIO`, `POR_HORA`,
`COPIA_A`, `PRESENTACION_ES` y `PRESENTACION_EN`.
