DÓNDE ESTÁ CADA COSA

El plano técnico. Las RUTAS no se buscan: se saben. Para el CONTENIDO están
`terminal` y `repo_leer` (caja «taller»).

Repositorio: `therealj94/express-js-on-vercel`, todo bajo `infra/`. Rama de
trabajo `claude/veta-wallet-phantom-design-7syah8`. OJO: `repo_buscar` solo mira
la rama principal, así que puede no encontrar código que sí existe; para eso
`terminal`, que corre sobre el código de verdad.

VOS · `infra/ultron/` — Heroku `ultron-fp` · ultron.ordenglobal.link
- `app.js` rutas del panel y la puerta · `lib/cerebro.js` enrutador nodo/Claude
- `lib/cerebros/nodo.js` el turno entero: prompt, bucle de herramientas, techo
  de tiempo, guardas y resumen del hilo
- `lib/herramientas.js` las 64 herramientas y las cajas · `lib/memoria.js` Mongo
- `lib/saber.js` + `saber/secciones.json` el saber y sus vectores
- `lib/cabecera-de-la-casa.md` las reglas (copia idéntica en AU-RA)
- `public/os.html` + `public/js/os.js` el tablero del teléfono
- `pruebas/` doce juegos · `bin/desplegar.mjs` · `bin/armar-saber.mjs`

EL MOTOR · `infra/ultron/nodo/`
- `ultron-motor.py` la puerta con secreto hacia el modelo (`ultron-motor.service`)
- `tarjeta/ogb-tarjeta.env` EL SITIO ÚNICO del modelo y la ventana
- `tarjeta/ollama-vigia.sh` reinicia ollama si se cuelga · `ogb-tibio.sh` el pulso
- Máquina `i-06530893af0dd0638`, us-east-1, g5.xlarge A10G. Modelo
  `orcarouter/Qwen3.8-27B-Uncensored`, ventana 24576, UNA ranura: la
  arquitectura qwen35 no admite paralelo, así que AU-RA y vos os turnáis.

AU-RA · `infra/aura/asistente.py` (`aura.service`, mismo modelo, misma tarjeta).

CADENAS · `infra/nodos/`, `infra/migracion-cadena/`. La 5550 viva con siete
validadores (node1..node7; node2 y node4 en us-east-2, el resto us-east-1). La
8532 congelada. Explorador: orden-global-scan-c4abe71e8024.herokuapp.com

LAS DEMÁS · `infra/veta-wallet-backend/` (vetawallet-1a2e38ac52b1) ·
`infra/ordenex-api/` (ordenex-api-ba4b27b8b51a) · `infra/aucorp-api/`
(aucorp-api-e70d3fd481ca) · `infra/genesis-app/` y `genesis-proxy/` identidad ·
`infra/mytokenpay-api/` cobros · `infra/mensajes/` el chat ·
`infra/cerebro/` el panel de doce regiones · `infra/equipo/` y `bots/` los
agentes · `infra/correo*/` SES · `infra/dns/` Route53.

CÓMO TE MEJORÁS: `terminal` para ver cómo está hoy · `repo_proponer_cambio`
para dejar el cambio (nunca directo a la principal) · `desplegarse` para subirte.
Antes de tocar `nodo.js` o `app.js`, correr `pruebas/`: cada guarda de ahí está
escrita contra un fallo que ya pasó, con su fecha. Si una se pone roja, casi
siempre el cambio reintrodujo el fallo — no que la prueba esté mal.
