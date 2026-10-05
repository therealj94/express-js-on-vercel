# Dr Electrum FP · tráiler para empresas mineras y gobierno: guion v1

**Estado:** solo guion. No se ha generado nada todavía. Se revisa y aprueba antes de pasar a imágenes, audio y video.

## 1. Qué es Dr Electrum (investigado el 5 de octubre)

Las fuentes son el código de la rama `claude/ultron-fp-premium-s46jxx` y las herramientas reales de Dr Electrum, consultadas en vivo hoy.

- **Qué es:** «Estación de trabajo minera. Mapa, expedientes, especialistas y un doctor que lo explica todo.» (`docs/ELECTRUM.md`)
  - Las notas de versión lo resumen así: «AU-RA FP es la mesa de la junta. **Dr Electrum FP es la estación minera.**»
- **Relación con AURA:** comparte el *cuerpo* de AURA (nodo Qwen 27B, voz, oído, visión, sesiones). Tiene cerebro, memoria, manos, usuarios y llaves propios. Estar en la junta de AURA no da acceso a Electrum, ni al revés.
  - Lo correcto es decir «con el motor de AU-RA» o «de la familia AU-RA FP».
  - No es correcto decir que es «un modo de AURA».
- **Para quién es:**
  - empresas mineras e inversionistas;
  - instituciones como INHGEOMIN, MiAmbiente e ICF, para *fiscalizar* (tablero nacional);
  - **no** es para el usuario común.
- **Personaje:**
  - Un geólogo veterano, «un viejo de la minería» con 40 años de campo. Habla corto, claro y sin vender.
  - Su trabajo es deshacer tres confusiones:
    - recurso inferido ≠ reserva;
    - ley de sondaje ≠ ley de mina;
    - valor in situ ≠ riqueza.
  - Imagen: un prospector 3D con sombrero, chaleco y tableta (`public/electrum-oficina/media/base.jpg`), en una oficina con rocas y mapas. Tiene animación de entrada (`entrada.mp4`).
  - Logo: el medallón dorado del prospector. Color de marca: **ámbar mineral `#FFAE3B`**.
- **Voz:** ElevenLabs «Jorge» (`Rt1JHkPO27QCUX6Nd5bV`), latino neutro, maduro y grave.
- **Equipo:**
  - **Don Chema:** metalurgista de Olancho.
  - **Ing. Tatiana:** ingeniera civil y ambiental.
  - Un panel de 8 especialistas: geólogo, ingeniero de minas, civil, metalurgista, SIG, ambiental, derecho minero y economista. Llama como mucho a 2 por pregunta.
- **Dónde se usa:**
  - web (`/electrum.html`) y la «oficina» de voz a pantalla completa;
  - app Android propia (`link.ordenglobal.drelectrumfp`), con modo campo: GPS, cámara y dictado;
  - bot de Telegram;
  - servidor MCP de solo lectura.

### Datos reales, consultados en vivo hoy

| Pregunta | Respuesta real de Dr Electrum |
|---|---|
| ¿Qué tiene el catastro? | «DERECHOS MINEROS EN HONDURAS A JUNIO 2026»: **1.076 concesiones, 163.580 ha**. 26 pisan áreas protegidas, 44 pisan microcuencas y 168 tienen caseríos dentro (446 caseríos). |
| ¿Hay traslapes? | 93 marcados. **64 son entre titulares distintos (454 ha), "a verificar con INHGEOMIN"**. 29 son el mismo derecho repetido. «No lo presentes como pleito.» |
| «Estoy parado aquí, ¿de quién es esto?» | «Ese punto no cae dentro de ninguna concesión. A menos de 5 km: [concesión] a 1,8 km.» |
| Semáforo de una concesión | **ROJO**. Pisa una microcuenca declarada que *abastece a 2.748 personas*, más 5 aldeas dentro, «Art. 48 a) LGM». «Es una guía para priorizar, no un dictamen: se confirma con ICF e INHGEOMIN.» |
| Geología | Rocas, intrusivos, fallas y rumbos; tracto USGS de pórfido de cobre; 11 yacimientos a menos de 10 km; muestras JICA. Satélite Sentinel-2: alteración argílica y óxidos de hierro. «Un indicio no es un recurso.» |
| Expedientes | 446 documentos, 208 capas y 12.266 fragmentos. Responde **citando la página** (por ejemplo, «JICA-MMAJ 2003, Fase III, p. 47: Au 340 ppb…»). |
| Cuenta de mina | 250.000 t a 3,4 g/t con 90 % de recuperación → 27.328 oz contenidas, **24.595 oz recuperables**. A US$4.146/oz → **US$102 millones**. «Ojo: es valor bruto, no ganancia.» |
| Precio del oro | US$4.145,50 por onza (gold-api.com). |

## 2. Lo que NO se puede decir (revisión crítica)

1. **Vencimientos:** la herramienta existe, pero el padrón cargado no trae fechas de vencimiento. Hoy contesta «no puedo decirlo». Las alertas de vencimiento por Telegram quedan **fuera** hasta que se cargue esa columna.
2. **Sin señal:** no funciona offline, así que no se puede mostrar al geólogo trabajando sin señal en el monte.
3. **Windows:** no hay app de Windows para Electrum.
4. **Dictámenes:** nada de «dictamen», «certificado», «reservas» ni «encuentra oro». Lo correcto es decir **guía, indicio, a verificar**. Dr Electrum mismo dice: «no sustituye a una Persona Calificada ni a un informe firmado».
5. **Prospectividad:** está calculada solo en 85 de 1.076 concesiones. Se puede mostrar una ficha, pero no decir «califica todo el país».
6. **Datos de clientes:** la carpeta «INDEXSA SEP 2026» y su cartera son documentos de un cliente. **No pueden salir en pantalla.** En el video, nombres de concesiones, empresas y expedientes se **anonimizan** («Concesión Las Lomas», «Empresa Minera del Norte»). Las cifras nacionales (1.076 concesiones, 163.580 ha) son agregadas y sí se pueden mostrar.
7. **App móvil:** no se ha probado en un teléfono real. En el video se muestra como pantalla y no se afirma «ya en Play Store».
8. **Traslapes:** se dicen siempre «a verificar», nunca «conflicto» ni «pleito».

## 3. Guion propuesto (unos 95 s, español)

**Formato:** recomiendo **16:9**, porque es para presentaciones a juntas, ministerios e inversionistas, y luego un corte 9:16 para redes.

**Voces:**
- Dr Electrum («Jorge») es la voz del sistema y lleva el hilo.
- El cliente pregunta con otra voz, como en el tráiler de AURA: una ingeniera de campo y un funcionario.
- Don Chema e Ing. Tatiana aparecen una vez cada uno.
- Todas las voces llevan etiquetas de audio.

**Imágenes:**
- **Con IA** (ElevenLabs, a partir de las imágenes reales del personaje y de la oficina): montaña hondureña al amanecer, núcleos de perforación, la oficina de Dr Electrum y un geólogo con casco y tableta en un afloramiento.
- **Por código:** el mapa 3D de Honduras, las concesiones, el semáforo, la geología, el satélite y los números. Todos los datos que aparecen salen de la herramienta real.

| s | Imagen | Audio |
|---|---|---|
| **0–7 · Arranque** | Negro. Un golpe de martillo de geólogo sobre una roca. Chispa ámbar. Toma aérea de la sierra de Honduras al amanecer, con niebla en los valles. | Dr Electrum, grave, sin música: «[seriously] En minería… la mentira que arruina gente casi nunca es un número inventado.» Pausa. «[firmly] Es un número mal entendido.» |
| **7–13 · El problema** | Torre de expedientes en papel, *shapefiles*, informes JICA de 1980 amarillentos, leyes subrayadas. Un reloj acelera: «semanas». | Ingeniera de campo, cansada: «[sighs] Tres semanas de escritorio… para saber si se puede pedir una zona.» |
| **13–20 · Entra Dr Electrum** | La puerta de la oficina se abre (`entrada.mp4` real) y Dr Electrum camina hacia cámara con su tableta. Título: **DR ELECTRUM FP** · *Estación de trabajo minera*. Debajo, pequeño: *con el motor de AU-RA*. | «[warmly] Buenas. Soy Dr Electrum. Cuarenta años de campo… y todo el catastro de Honduras, aquí.» |
| **20–28 · El país en un mapa** | La tableta se vuelve el mapa 3D de Honduras en relieve real. Se encienden **1.076** concesiones (contador) y **163.580 ha**. Vuelo a Olancho. | Funcionario: «¿Cuántas concesiones hay en Olancho?» · Dr Electrum: «Ciento dieciocho. Le muestro cuáles están en exploración.» |
| **28–36 · En el campo** | Geóloga en un afloramiento con la app de campo y GPS. El punto cae en el mapa y se dibuja un círculo de 5 km. | Geóloga: «Estoy parada aquí… ¿de quién es esto?» · Dr Electrum: «De nadie. La concesión más cercana está a un kilómetro ochocientos.» |
| **36–47 · El semáforo** | Ficha de la concesión (nombre anonimizado). El lindero toca una microcuenca y el semáforo pasa a **ROJO**. Aparecen las capas de áreas protegidas, microcuencas y caseríos, con la cita «Art. 48 a) Ley General de Minería». | Dr Electrum: «[seriously] Esa pisa una microcuenca que le da agua a dos mil setecientas personas. Roja.» Ing. Tatiana: «Y es lo primero que va a preguntar MiAmbiente.» Rótulo: *Guía para priorizar · se confirma con ICF e INHGEOMIN*. |
| **47–56 · Geología y satélite** | Mapa litológico con fallas y la roseta de rumbos. Luego el timelapse de Sentinel-2 desde 2018: la vegetación cae y aparecen manchas de alteración (arcillas, óxidos). | Dr Electrum: «Roca intrusiva, una falla a dos kilómetros, alteración vista desde el satélite… [firmly] Eso es un indicio. No es un recurso.» |
| **56–64 · Los expedientes, con cita** | Lluvia de 446 documentos que se ordenan en una biblioteca. Pregunta en voz y respuesta con la cita **[JICA 2003 · p. 47]** resaltada en la página escaneada original. | Ingeniera: «¿Qué dicen los estudios viejos de esta zona?» · Dr Electrum: «Japón la muestreó en 2003. Página cuarenta y siete: oro, trescientas cuarenta partes por billón.» |
| **64–73 · La cuenta honesta** | Núcleos de perforación (IA). Las cifras se arman en pantalla: 250.000 t × 3,4 g/t × 90 % → **24.595 oz** × US$4.146 = **US$102 M**. Un sello ámbar tacha «ganancia» y escribe «valor bruto». | Don Chema: «[excited] ¡Cien millones, doctor!» · Dr Electrum: «[dryly] Valor bruto, Chema. Falta la mina, la planta y el tiempo.» |
| **73–82 · Para quien fiscaliza** | Tablero nacional: **64 traslapes entre titulares (a verificar)**, **26 en áreas protegidas**, **168 con caseríos dentro**. Cambia el ángulo y la escena pasa a ser para gobierno. | Dr Electrum: «Para quien fiscaliza: cada traslape, cada área protegida, cada caserío. [calmly] A verificar… no a adivinar.» |
| **82–90 · Se lleva a la reunión** | Sale una ficha en PDF de la impresora y la exportación KML, GeoJSON y DXF entra a otro SIG. Escudo con los niveles de acceso: *lee · escribe · mando*. «Cada organización ve solo lo suyo.» Pantallas de web, app y Telegram. | Dr Electrum: «Un PDF se imprime… y se lleva a la reunión.» |
| **90–95 · Cierre** | Dr Electrum en su oficina, con el panel de 8 especialistas a su alrededor como siluetas. Logo del medallón dorado → **DR ELECTRUM FP** · *con el motor de AU-RA* · **POWERED BY ORDEN GLOBAL**. | Dr Electrum: «[warmly] Estamos a sus órdenes. Pregúntenos lo que quiera.» Golpe de martillo final. |

## 4. Decisiones para José

1. **AURA:** dijiste «siempre usando AURA», pero en el código Electrum es plataforma hermana, no un modo de AURA. Propongo una de dos:
   - **A** (recomendada): «Dr Electrum FP · con el motor de AU-RA», como en el guion.
   - **B:** abrir con el orbe de AURA diciendo «Para la minería… te presento a Dr Electrum», y cerrar con los dos logos.
2. **Formato:** 16:9 (recomendado) o 9:16.
3. **Personaje:** usar al prospector actual de la oficina (`base.jpg`) tal cual, o modernizarlo con IA. El ícono de la app móvil es un orbe cian que no coincide con la marca ámbar; hay que decidir cuál es el oficial.
4. **Nombres reales:** anonimizar todo (recomendado) o tener permiso explícito para mostrar algún nombre real.
5. **Inglés:** hacer también versión en inglés para inversionistas extranjeros, después de la española.

## 5. Costo estimado (cuando se apruebe)

| Concepto | Costo |
|---|---|
| Imágenes clave con IA (6–8) | ≈ 1,5–2,5 USD |
| Tomas de video H3 Max (6–8 × 0,40) | ≈ 2,4–3,2 USD |
| Voces | incluidas en el plan |
| Música | ≈ 0,5 USD |
| **Total** | **≈ 5–7 USD** |

## Producción v1 (5 de octubre)

**Decisiones de José:**
- AURA es el cerebro de Orden Global funcionando dentro de Dr Electrum.
- Los nombres van anónimos.
- Formato 16:9.
- Prospector mejorado.
- La versión en inglés se hace al final.

**Imágenes:**
- **10 imágenes clave** con gpt-image-2. Las referencias son el personaje y el logo reales, publicados en `electrum/ref/`.
- **10 tomas** animadas con MiniMax H3 Max:
  - martillazo y vista aérea de la sierra;
  - papeleo;
  - Dr Electrum como héroe;
  - mapa en holograma;
  - ingeniera en el campo;
  - núcleos de perforación;
  - sala de gobierno;
  - reporte impreso;
  - «aprende».

**Voces:** el elenco real de la app.
- Dr Electrum: «Jorge».
- Ing. Tatiana: `irla3teuChAApguKnzms`.
- Don Chema: `wfTWLJ20rcMqvU8gIiAB`.
- Narrador: `sDh3eviBhiuHKi0MjTNq`.
- Llevan etiquetas de audio.
- «JICA» se cambió por «la cooperación japonesa» para que se pronuncie bien.

**Composición por código** (`electrum/electrum.html`, 1920×1080):
- mapa con el contorno real de Honduras (Natural Earth, del repo), con las 1.076 concesiones como visualización estilizada;
- GPS, semáforo, geología con satélite, expedientes con cita, la cuenta honesta, tablero para fiscalizar, entregables y «aprende»;
- rótulos de personajes, subtítulos y la marca **ANTES / AHORA** en cada herramienta.

**Errores encontrados en Dr Electrum:** `catastro_contar` con filtro de departamento devuelve 0 (Olancho, Choluteca), aunque el resumen sí da cifras por departamento. El filtro `clase` parece ignorarse.

**Costo:**

| Concepto | Costo |
|---|---|
| Imágenes | ≈ 0,7 USD |
| Tomas | 4,0 USD |
| Música | ≈ 0,5 USD |
| Efectos | ≈ 0,03 USD |
| **Total** | **≈ 5,2 USD** |
