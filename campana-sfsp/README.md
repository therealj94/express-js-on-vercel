# Campaña SFSP · primer correo

El primer correo a los contactos del «SFSP · Directorio de contacto» (25-09-2026). Sale desde
José (`j.ordonez@ordenglobal.org`) en el idioma de cada persona. Lleva el video, la presentación y
un botón de WhatsApp.

| Archivo | Qué hace |
|---|---|
| `plantilla.mjs` | El correo en ES y EN (HTML y texto) |
| `depurar.mjs` | Pasa `contactos.csv` a `envios.csv`: estado, saludo y lote de cada contacto |
| `enviar.mjs` | Vista previa, prueba y envío por lotes con Amazon SES |

**Los datos no están en el repositorio**, porque es público. `contactos.csv`, `envios.csv`,
`registro.jsonl` y `bajas.txt` se guardan fuera y se copian a esta carpeta para trabajar.

## Reglas (del directorio)

- **15 correos por día como máximo.** Van en lotes, empezando por la prioridad A.
- **Una persona por organización** en la primera ola. Las demás quedan en `segunda_ola`.
- **Sin adjuntos.** El video y el PDF van como enlaces, y el envío se detiene si alguno no responde.
- **Nunca se promete** «regulado», «licenciado» ni rendimientos. El pie repite el aviso de la
  presentación.
- **Quien pide no recibir más** va a `bajas.txt` y no se le vuelve a escribir. Los correos llevan
  el encabezado `List-Unsubscribe`.

## Uso

```sh
node depurar.mjs                          # contactos.csv → envios.csv
node enviar.mjs vista                     # vista/<n>.html, no envía nada
node enviar.mjs prueba tu@correo.com 001  # el correo del #001, solo a ti
node enviar.mjs lote 1                    # quiénes van en el lote 1
node enviar.mjs lote 1 --confirmo         # envía el lote 1, uno cada 30 s
```

Variables: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` y `AWS_REGION`. Opcionales:
`PRESENTACION_ES` y `PRESENTACION_EN`, las direcciones públicas de los PDF (por defecto
`https://ordenglobal.org/sfsp/…`).
