# Honduras Secreta — «Vení tranquilo» (v1, 2:25, 9:16)

Idea: «La mejor campaña turística de Honduras sería poder decir: vení tranquilo». Sin regañar a quien viaja afuera y sin nombrar políticos.

## Datos verificados
- El Diario de Hoy (5/10/2026): MITUR de El Salvador proyecta 58.522 visitantes hondureños en Semana Morazánica 2026 (48.768 en 2025).
- Cita usada en pantalla: «Encontramos seguridad» (viajero hondureño entrevistado en San Salvador).
- Los comentarios del inicio y del final son ilustrativos y anónimos.

## Estructura
| Tiempo | Escena | Sonido |
|---|---|---|
| 0–7 s | Comentarios malos suben; la guara toma el micrófono; acople | C1 tensión |
| 7–37 s | Discurso: 58.522, pregunta, cita, familia | C2 discurso |
| 37–52 s | «Mirá lo que tenemos»: montaje de país | C3 maravilla |
| 52–68 s | Carretera, emergencia, noche, nosotros | C4 realidad |
| 68–94 s | Llamado a los que gobiernan; «una Morazánica…» | C5 crescendo |
| 94–111 s | «Si aman a Honduras… escuchen»; comentarios buenos; «Vení tranquilo» | C6 clímax y esperanza |
| 107–116 s | Drop the mic: suelta el micrófono, golpe, se va, se apaga el foco | Mic drop, acople, clunk; sin música |
| 112–136 s | La voz real de Romeo (@romeo_and_nando_adventures): a oscuras por el PA, luego de día en Los Naranjos, Lago de Yojoa | C7 himno; su pico cae en «vení» |
| 136–145 s | VENÍ TRANQUILO, pregunta final, logo y crédito | Riser, impacto, C8 acorde sostenido |

## Piezas
- Guara: voz clonada «Jose latam», lipsync OmniHuman 1.5, tomas minimax-h3-max.
- Música: partitura original en 8 cues (eleven_music_v2_5), elegidos en `codigo/elegidos.json`.
- Romeo: audio y video enviados por él; no se suben a este repo (público).
- Logos y textos compuestos en código, no por IA.

## Código (`vt/codigo/`)
`montar_vt.py` (tiempos y lista de tomas) → `extraer.py` (cuadros de clips) → `vt.html` + `render_vt.py` (render cuadro a cuadro, `vigila.sh` relanza) → `mezcla_vt.py` (voz, efectos y música) → ffmpeg.

## Costo aproximado
Imágenes guara $4.01 · B-roll $9.12 · clips guara $1.60 · OmniHuman $13.54 · música y efectos iniciales $0.29 · drop the mic $3.21 · partitura y efectos del título $0.77 · **total ≈ $32.5**
