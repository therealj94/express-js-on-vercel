# Lee esto antes de decidir nada

**Regla de José, 1-sep-2026.** Da igual que la sesión se reinicie o que empieces
de cero: primero se lee esto entero, se entiende cómo funciona todo, y **después**
se toman decisiones. Nada de encender máquinas, gastar dinero ni prometer plazos
antes de haber leído.

Esta regla existe porque se incumplió. Repasé la lista de errores pasados, dije
que estaba todo comprobado, y aun así encendí con el puerto equivocado y di por
muerta una máquina que seguía facturando. Un documento que hay que acordarse de
leer no basta, así que además hay un programa que se niega a encender:
`video-pipeline/tools/preflight.py`.

---

## Cómo trabaja José

- Escribe desde el móvil o el iPad, en español, a veces con prisa y sin tildes.
  Entiende perfectamente; lo que no tolera es que le hagan perder tiempo o dinero.
- **Nunca abre ComfyUI ni una terminal.** Si un plan exige que él toque una
  interfaz, el plan está mal. Su parte es decidir historia y elegir tomas.
- Pega las claves directamente en el chat: *«no ocupo esconder el api»*. Se usan
  desde variables de entorno y **no se commitean jamás**.
- Cuando algo falla quiere el dato concreto —qué línea del log, cuánto costó—,
  no un resumen suavizado. Ha pagado hosts rotos y agradece el diagnóstico seco.
- Pide criticar de verdad. Si algo no funciona, se dice, aunque lo haya
  propuesto él.

---

## Lo que YA está hecho

Cinco piezas terminadas. **No se rehacen; se parte de ellas.**

| Pieza | Duración | Qué es |
|---|---|---|
| `anuncio_1_lallave.mp4` | 74 s | 1985→hoy, la casa que ya no se compra |
| `anuncio_2_lamesa.mp4` | 59 s | 1985→hoy, la mesa que se vacía |
| `anuncio_3_undia.mp4` | 66 s | Un día de una cajera; «¿Tiene que ser así?» |
| `pelicula2_ecosistema.mp4` | 43 s | El ecosistema en logos, **hecho en local, coste 0** |
| `pelicula1_animatica.mp4` | 52 s | Animática de tiempos de *Cincuenta* |

> **Peligro.** Viven en el scratchpad de la sesión, que es temporal. Lo primero
> que hay que hacer con una pieza terminada es subirla a Hugging Face, que es el
> único canal de entrega verificado (ida y vuelta con MD5). Si no está en HF, no
> existe.

**Pendiente de generar:** *Cincuenta* (película 1), 14 planos, en
`video-pipeline/prompts/pelicula1_cincuenta.json`.

---

## Cómo se hicieron

**Imagen.** MiniMax H3 (`Comfy-Org/MiniMax-H3`) en una GPU alquilada en Vast.ai,
con el LoRA `h3-realism-people` a 0.8. El instalador **no baja FLUX**: H3 hace
imagen fija además de vídeo, lo que ahorra 35 GB y hace que el still y el clip
compartan estética. Un still es H3 con `length=1`.

**Voz.** ElevenLabs, modelo `eleven_v3`, plan **creator** (las voces de la
biblioteca exigen creator o superior; en el plan gratis la API las rechaza con
402). Reparto en `montaje/voces_el.py`:

- **narrador** — Maico, `aviXFY7Zd7b9DnCUwaCh`. Latinoamericano, cálido y seco.
- **testigo** — Diego, `J3JSkWXJwqClE1dIxQM9`. Solo dice «¿Tiene que ser así?».

El cierre lo dice **el mismo narrador**. Se probó con una voz joven distinta y
no funciona: tras un minuto con una voz, cambiarla en la última frase se oye
como un corte. Y no basta con devolver la voz —con `style` 0.30 seguía sonando
a locutor institucional—; el tono de cierre baja a 0.10.

**Música.** Compuesta aquí, sin licencias. `musica_cine.py` es la cama emocional;
`musica_erosion.py` le añade un motivo de cinco notas que va perdiendo notas
según pasan las épocas; `musica_lanzamiento.py` es percusiva y va a 88,9 bpm
porque los bloques del ecosistema cambian cada 2,7 s y así cada corte cae en el
tiempo fuerte.

**Mezcla.** `mezcla4.sh`, con ducking real por `sidechaincompress`. La música
queda a −15,8 dBFS en los huecos; antes iba a −33,6 y era inaudible en un móvil.

---

## Las reglas duras

1. **`preflight.py` antes de cada encendido.** Si da un solo PARA, no se
   enciende. Ninguna excepción.
2. **El guardián se arranca ANTES de crear la instancia**, nunca después.
   `HORAS=8 PISO=12 ID=<id> ./guardian.sh &`
3. **Destruir, no detener.** Detener sigue cobrando el disco. Y confirmar
   siempre con `status`, nunca de memoria.
4. **Planificar es gratis; generar cuesta por hora.** Todo lo que pueda
   decidirse con la GPU apagada se decide antes.
5. **Verificar el efecto, no la llamada.** Cinco de los ocho fallos de la
   primera sesión fueron entradas mal formadas que la API aceptó sin quejarse.
6. **Antes de gastar**, pasar el guion por `lint.py` y por `auditar.py`. La
   auditoría del 1-sep encontró que pedir «pantalla completamente negra» mataba
   el brillo sobre la piel; eso solo se ve leyendo, no generando.

---

## Trampas que ya han costado dinero

- **`/api/v0/instances/` MIENTE.** Vast movió `instances` a **v1**; el v0
  contesta 200 con una lista vacía en vez de dar error. Con eso di por muerta
  una máquina que seguía encendida a $0.904/h y sin guardián. Usar siempre v1.
- **El puerto.** ComfyUI escucha solo en `127.0.0.1:9000`; quien atiende desde
  fuera es nginx, en `UI_PORT` (8188 por defecto). Publicar el 9000 deja un pod
  que parece muerto estando perfecto.
- **Un puerto se declara con la cadena entera como clave:** `{"-p 8188:8188": "1"}`.
  Con `{"-p": "8188:8188"}` el backend no da error y no mapea nada.
- **Sin `"target_state": "running"`** la instancia se reserva, cobra disco y
  nunca ejecuta el onstart.
- **El `onstart` va comprimido**, gzip+base64 dentro de un arranque
  autoextraíble: el límite de la API son 16.384 caracteres y el script solo ya
  ocupa 14 KB.
- **Los prompts nunca se recortan.** Una tanda salió vacía porque un script
  cortaba la descripción en la primera coma: 45 de 1.100 caracteres.
- **Descripciones cortas dan escenarios vacíos.** Por debajo de 250 caracteres,
  desconfiar.
- **Los stills heredan 1280x720.** Las piezas son verticales: hay que fijar
  720x1280 en `defaults` o se exploran 100 composiciones inservibles.
- **`ffprobe` no está** en este contenedor, aunque `ffmpeg` sí. Las duraciones
  se miden con `soundfile`.
- **`drawtext` no está** (ffmpeg sin freetype). Todos los rótulos se dibujan
  como PNG con Pillow.

---

## Lo que NO se puede decir en un vídeo

Sale del acta de Junta del 14-08-2026 y del documento `ECOSISTEMA`. No es
opinión: es lo que convierte una campaña en un problema legal.

- **ORIGEN, AUKA y AGKA no están respaldadas.** Son *referenciadas*, y **no hay
  oro en bóveda**. Cuidado: en dos pruebas de público el espectador dedujo solo
  «está respaldada en oro» sin que nadie lo dijera. No basta con no decir la
  palabra; hay que no construirla.
- **Nunca** «registrados», «regulados» ni «licenciados», ni el nombre de la
  regulación de ningún país.
- Ningún precio futuro, ninguna proyección, ninguna ganancia.
- **Nada de «de la gente y para la gente»** ni «es de los miembros»: hoy no hay
  votación, ni gobernanza, ni reparto. La frase de cierre acordada es
  **«Orden Global. Un sistema financiero que se puede comprobar.»**
- No se graban: el directorio de comercios (los treinta son de muestra), Ordenex
  como mercado (cero operaciones en su historia), ni ahorro en grupo (no existe).
- La tarjeta Visa **sí** existe y está activa.

---

## Lo que el público dijo, y ningún vídeo arregla

Dos pruebas a ciegas con espectadores sin contexto. Merece la pena releerlas
antes de proponer nada:

- El dorado y el logo formándose: *«parece de una secta»*.
- El oro y la cadena: *«me huele a estafa de criptomonedas»*.
- Un coste de 0,001 $ anunciado como alarde: *«mentira, nadie regala nada»*.
  Quedó **último** en credibilidad, por detrás de no decir nada. Va como una
  línea del comprobante, no como rótulo.
- Explicar la moneda: *«no entendí ni un carajo»*.
- Y lo que de verdad decide: *«pregunto en el grupo de WhatsApp si alguien ya la
  usó; **yo no voy a ser el primer tonto**»*. La confianza con el dinero aquí es
  **social y física**, no tecnológica. Eso se arregla en el producto —alguien
  real a quien reclamar, y los primeros usuarios contándolo—, no en el montaje.

---

## Herramientas

**Antes de encender:** `preflight.py` · `lint.py` · `auditar.py` · `look.py` ·
`shotlist.py` · `costo.py` · `plan.py`

**La máquina:** `vast_api.py` (search/create/status/logs/destroy) ·
`guardian.sh` · `cloud/onstart.sh` · `cloud/selftest.py` · `03_run_queue.py`

**El montaje:** `voces_el.py` · `musica_cine.py` · `musica_erosion.py` ·
`musica_lanzamiento.py` · `ecosistema.py` (película 2 entera, sin GPU) ·
`animatica.py` (ritmo antes de gastar) · `mezcla4.sh`

**Comprobar lo hecho:** `oir.py` (transcribe la mezcla y la compara con el
guion) · `ver.py` (se lo enseña a Gemini) · `post.py qc`

**Documentación larga:** `POSTMORTEM.md` (los ocho fallos que costaron $7.91) ·
`COSTOS_REALES.md` · `VEREDICTO.md` · `CALIDAD.md` ·
`.claude/skills/video-trailer/`

---

## Claves

Ninguna se commitea. José las pega en el chat cuando hacen falta; si se pierden
al reiniciar la sesión, **están en el transcripto** —`grep` antes de pedírselas
otra vez, que ya se las hice repetir una vez y con razón se molestó.

`VAST_API_KEY` · `HF_TOKEN` (entrega verificada) · `EL_KEY` (ElevenLabs, plan
creator) · `GEMINI_API_KEY` (auditoría y pruebas de público)
