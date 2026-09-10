# El cerebro — estado a 14 de agosto

Dónde está esto, para poder continuar sin releer la sesión entera.

---

## 1 · Qué es

`infra/cerebro/index.html` es un fichero único de ~4.200 líneas que se sirve
en **cerebro.ordenscan.com**. Dos usos en el mismo sitio:

| Modo | Quién entra | Qué ve |
|---|---|---|
| **Interno** | la Junta, con contraseña propia | el parte del día, los 7 agentes, el estado de 13 sistemas, los bots |
| **Invitado** (`/demo`) | un inversionista, sin contraseña | el recorrido narrado, sin nada interno en pantalla ni una sola petición a rutas privadas |

El asistente se llama **FLUX**. Habla español e inglés, se le puede
interrumpir, contesta y vuelve exactamente donde iba.

---

## 2 · Cómo funciona la voz

Es la pieza con más historia detrás, y la que más se ha roto.

- **Grabada de antemano con Piper** (`voz/rendir.py`), en nuestras máquinas:
  `es_MX-claude-high` y `en_US-ryan-high`, con `length_scale 1.12 ·
  noise_scale 0.75 · noise_w_scale 1.0` — elegido de oído entre cinco
  variantes.
- **655 frases** grabadas y servidas en `cerebro.ordenscan.com/voz/`.
- El nombre de cada fichero es un **FNV-1a de 32 bits** de `voz|texto`, con la
  misma función escrita en Python y en JS. Si el texto cambia una coma, la
  clave cambia, no se encuentra el audio y **cae sola a la voz del
  navegador**. Eso es a propósito: mejor la voz de siempre que un audio que
  diga algo distinto del subtítulo.
- La **respiración va horneada dentro del mp3**: cada frase se parte por sus
  juntas, se sintetiza por trozos y se pegan con su silencio.
- Las frases a grabar salen de tres fuentes: los guiones, `FRASES_FIJAS()` y
  **un barrido del propio fichero** (`literalesDelFichero()`), que entró
  después de descubrir 101 frases que nadie grababa y sonaban a robot.

**Regla para quien siga:** si escribes una frase nueva que FLUX pueda decir,
no hace falta apuntarla en ningún sitio — el barrido la coge. Lo que sí hace
falta es **volver a grabar y desplegar**, o esa frase saldrá con la voz del
navegador.

```
node infra/cerebro/voz/sacar-frases.cjs > frases.json
python3 infra/cerebro/voz/rendir.py frases.json salida/     # incremental
python3 infra/cerebro/voz/desplegar-voz.py salida/
python3 infra/cerebro/desplegar.py                          # el html
```

Los modelos Piper (61 y 120 MB) **no van en el repositorio**; se bajan de
`huggingface.co/rhasspy/piper-voices` a `voz/modelos/`. El caché de audio
sobrevive en S3 (`og-5550-arranque-548380372606/cerebro/voz.tar.gz`): si se
pierde el contenedor, se recupera de ahí y solo se graba lo nuevo.

---

## 3 · Qué sabe

| Bloque | Dónde | Contenido |
|---|---|---|
| Recorrido | `guionPresentacion()` | 8 capítulos: quién soy · qué hay · la capa uno · Genesis ID · los productos · el dinero · las máquinas · la prueba |
| Segundo acto | `segundoActo()` | lo que viste · el origen · a dónde va · la historia · el cierre |
| Inversionista | `INVERSOR` | 25 preguntas con su respuesta, incluidas las 3 de minería |
| Saber | `SABER` | ecosistema · apps · webs · infra · tokens · minería · minas · flujo |
| Minería | `conocimiento/portafolio-minero.md` | fuente entregada por la compañía |
| Legal · voz | `conocimiento/legal.json` | 12 bloques y las 8 decisiones para la Junta — Secretaría, 14/08/2026 |
| Legal · detalle | `conocimiento/legal-detalle.md` | el respaldo largo: sociedad, licencias, tesoro, riesgos |
| Choques | `conocimiento/legal-contradicciones.md` | **dónde lo legal desmiente lo que publicamos**, con citas y rutas |

**La regla que no se rompe:** lo medido se dice con su número y dónde
comprobarlo; lo abierto se dice como está. Nunca sale de ahí una cifra de
facturación, valoración, licencia, custodia del oro o términos de ronda,
porque ninguna está cerrada. `probar-inversor.cjs` tiene **11 guardias** que
se ponen rojos si alguien le quita el matiz a una de esas respuestas.

---

## 4 · Lo que se puede hacer en pantalla

- **Recorrido reanudable**: se para, se pregunta, se contesta y vuelve al
  mismo punto. Barra de capítulos para saltar.
- **Puntos de control**: cada capítulo pregunta «¿alguna pregunta o sigo?».
  A los 15 segundos de silencio, sigue.
- **Transacción en vivo** en la red de pruebas, con hash que se abre en el
  explorador desde el teléfono de quien mira.
- **Micrófono** pedido desde que se elige el idioma.
- **«Abre Veta Wallet»** y abre la web en otra pestaña. Igual con MyTokenPay,
  ordenscan, Genesis ID y la red de pruebas.
- Móvil comprobado con capturas.

---

## 5 · Las pruebas

12 ficheros en `pruebas/`, todos en verde. Se corren con
`node pruebas/probar-X.cjs` (Playwright, Chromium en `/opt/pw-browsers`).

La más importante es `probar-hasta-el-final.cjs`: recorre la presentación
**entera** —contestando en cada punto de control— hasta el cierre.

**Aviso para quien las toque:** cuatro de estas pruebas han fallado alguna
vez por medir mal, no porque fallara el producto. Las tres trampas conocidas:

1. **El subtítulo se vacía a propósito** entre frase y frase. Mirarlo en un
   instante acusa de mudo a quien está hablando: hay que acumular.
2. **La voz de mentira dura 4 ms**, así que el recorrido puede ir disparado y
   un panel pintarse y borrarse entre dos vistazos.
3. **Contestar al punto de control en el mismo instante en que empieza a
   preguntar** pisa la pregunta a medias. Hay que dejarle terminar (~900 ms).
   Con el botón de verdad no pasa: está comprobado aparte.

---

## 6 · Decisiones abiertas — de la Junta, no mías

- La **figura jurídica del respaldo en oro**: custodia, contrato, auditoría y
  derecho de canje. Hasta que se firme, FLUX no dice que la moneda esté
  respaldada. Detalle en `conocimiento/mineria-pendiente-legal.md`.
  **Resuelto por la Secretaría el 14/08: la figura es _referenciado_, y no hay
  oro en bóveda.** Lo que queda abierto es el dictamen escrito (Decisión 4) y
  corregir los textos que aún dicen lo contrario en la web, en las fichas
  públicas de AU-RA y en el PDF para inversionistas —
  `conocimiento/legal-contradicciones.md`, punto 1.
- El **destino de la comisión**. La de la casa sigue apagada
  (`OG_COMISION_ORIGEN` sin poner en Heroku); lo que sí cobra es el suelo de
  gas de la cadena, 93 gwei ≈ 0,001953 ORIGEN por envío, que va al validador.
  Comprobado el 16/08.
- **Crédito de Anthropic** para que FLUX tenga cerebro de reserva cuando la
  base local no cubra una pregunta. Sin crédito no hay forma de conectar un
  modelo: toda vía necesita credencial.
- Retirada de los nodos 1-2 (~138 USD/mes) y el resto de lo que está en el
  parte del contador.

---

## 7 · Lo que yo haría después

1. **Grabar una pasada de verdad** con alguien delante y anotar dónde se
   aburre. El guion está probado por máquina, no por una persona.
2. **Cerrar la figura del respaldo**, que es lo que hoy limita lo que se
   puede decir en una reunión.
3. Y lo grande, que va aparte: **meter todo el ecosistema en una sola app con
   GENESIS de asistente** — arquitectura en
   `infra/genesis-app/ARQUITECTURA.md`.
