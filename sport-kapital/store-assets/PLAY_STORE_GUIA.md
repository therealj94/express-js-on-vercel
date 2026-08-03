# 🚀 Guía completa: subir Sport Kapital a Google Play

Todo lo que necesitas está en esta carpeta `store-assets/`. Sigue los pasos en orden.
Tiempo estimado: 1–2 horas la primera vez (+ la revisión de Google, que tarda de horas a ~7 días).

---

## ⚠️ ANTES DE EMPEZAR — 2 avisos importantes

### 1. La música con derechos de autor (RIESGO REAL)
La app incluye 3 canciones comerciales (John Newman, Shakira/Burna Boy, Avicii).
**Publicarlas sin licencia viola la política de propiedad intelectual de Google Play**: la app puede ser
rechazada, retirada después de publicada, o generar un strike en tu cuenta de desarrollador (una cuenta
nueva con strikes puede ser cerrada).

**Recomendación fuerte: reemplaza los 3 MP3 antes de subir.** Es solo reemplazar archivos con el mismo nombre:
- `assets/music/track1.mp3`, `track2.mp3`, `track3.mp3`
- Música gratis y legal para usar: **Pixabay Music** (pixabay.com/music) o **YouTube Audio Library**
  (studio.youtube.com → Biblioteca de audio). Descarga 3 pistas electrónicas/épicas que te gusten,
  renómbralas y cópialas encima. Después me dices los nombres de las canciones y actualizo las etiquetas del menú.

### 2. Nombres de equipos reales
La app usa nombres de equipos reales (FC Barcelona, Real Madrid, selecciones). Para un simulador esto
normalmente se tolera (como apps de fantasy), pero es un riesgo menor de marca registrada que debes conocer.
Si algún día un club reclama, se cambia el nombre y listo.

---

## PASO 1 — Publicar la política de privacidad (obligatorio)

Google exige una URL pública con tu política de privacidad. Ya está escrita (español + inglés) en
`store-assets/hosting/public/privacy.html`, y tu proyecto de Firebase incluye hosting gratis.

En tu computadora (una sola vez):
```
npm install -g firebase-tools
firebase login
cd store-assets/hosting
firebase deploy --only hosting
```

Al terminar, tu política queda en:
**`https://sport-kapital-b0dc6.web.app/privacy.html`** ← esta es la URL que pega en la consola.

> La app ya tiene un enlace a esta URL en Perfil → Privacidad y cuenta.
> Revisa el correo de contacto dentro de `privacy.html` (puse mjoseenamorado1994@gmail.com — cámbialo si prefieres otro).

## PASO 2 — Compilar el AAB de producción

```
eas build --platform android --profile production
```
- El perfil `production` ya genera **app-bundle (AAB)**, que es lo que exige Play (no APK).
- El `versionCode` sube solo en cada build (autoIncrement).
- Ya configuré **targetSdkVersion 35 (Android 15)** — requisito de Google para apps nuevas en 2026.
  Si este build fallara por el cambio a SDK 35, avísame: el plan B es actualizar Expo a SDK 52+.

Descarga el `.aab` cuando termine (link en la terminal o en expo.dev).

## PASO 3 — Crear la app en Play Console

1. [play.google.com/console](https://play.google.com/console) → pagar registro de desarrollador ($25 USD, una vez).
2. **Crear app**:
   - Nombre: `Sport Kapital`
   - Idioma predeterminado: `Español (Latinoamérica)`
   - Tipo: `Aplicación` · Precio: `Gratis`
   - Acepta las declaraciones.

## PASO 4 — Ficha de la tienda (Store listing)

Textos listos para copiar/pegar:

**Nombre de la app (30):** `Sport Kapital`

**Descripción corta ES (80):**
`Simulador de trading con equipos de fútbol. Capital 100% virtual. Sin apuestas.`

**Descripción larga ES:**
```
⚽📈 Ya no se apuesta. Se invierte.

Sport Kapital es un SIMULADOR educativo de trading donde los activos son equipos de fútbol: Mundial 2026, LaLiga y la Liga Nacional de Honduras. Compra y vende tokens de tu equipo con capital 100% VIRTUAL — aquí no hay apuestas ni dinero real.

🕯️ VELAS JAPONESAS PROFESIONALES
Gráficos de velas con zoom, arrastre táctil, varias temporalidades y volumen, como en un exchange real.

⚡ LOS PARTIDOS MUEVEN EL MERCADO
Goles, tiros, tarjetas: cada evento impacta el precio en vivo. La liquidez fluye entre rivales — cuando uno sube, el otro baja.

💼 GESTIONA TU CARTERA
P&L en vivo, cierre total o parcial de posiciones con un toque, historial completo y ranking de traders.

📅 CALENDARIO REAL
Próximos partidos y resultados del Mundial 2026, LaLiga y Liga Nacional.

🎨 A TU GUSTO
4 temas visuales (Neón, Trader Pro, Claro y Vibrante), español e inglés, música opcional y alertas de gol.

🎓 100% EDUCATIVO
Capital virtual de práctica. Sin dinero real, sin premios, sin apuestas. Ideal para aprender los conceptos del trading (velas, P&L, liquidez, comisiones) con la emoción del fútbol.

Solo para mayores de 18 años.
```

**Short description EN (80):**
`Football team trading simulator. 100% virtual capital. No betting, no real money.`

**Full description EN:**
```
⚽📈 No more betting. Now you invest.

Sport Kapital is an educational trading SIMULATOR where the assets are football teams: World Cup 2026, LaLiga and the Honduran National League. Buy and sell team tokens with 100% VIRTUAL capital — no betting, no real money.

🕯️ PRO CANDLESTICK CHARTS
Candles with zoom, touch panning, multiple timeframes and volume, just like a real exchange.

⚡ MATCHES MOVE THE MARKET
Goals, shots, cards: every event hits the price live. Liquidity flows between rivals — one goes up, the other goes down.

💼 MANAGE YOUR PORTFOLIO
Live P&L, one-tap full or partial position close, full history and trader rankings.

📅 REAL SCHEDULE
Upcoming matches and results from World Cup 2026, LaLiga and the National League.

🎨 YOUR STYLE
4 visual themes, Spanish & English, optional music and goal alerts.

🎓 100% EDUCATIONAL
Virtual practice capital. No real money, no prizes, no gambling. Learn trading concepts (candles, P&L, liquidity, fees) with football excitement.

18+ only.
```

**Gráficos** (en `store-assets/`):
| Recurso | Archivo | Tamaño |
|---|---|---|
| Icono de la app | `graphics/icon-512.png` | 512×512 |
| Gráfico destacado | `graphics/feature-graphic-1024x500.png` | 1024×500 |
| Capturas de teléfono (mín. 2) | `screenshots/01…07.png` | 1080×1920 |

**Categoría:** Aplicación → `Finanzas` NO ❌ — usa **`Simulación`** (juego) o **`Educación`**.
Recomendado: **Juegos → Simulación** (evita el escrutinio de apps financieras reales).
**Correo de contacto:** el tuyo. **Sitio web:** puedes usar la misma URL de la política.

## PASO 5 — Declaraciones de "Contenido de la app" (las hago fácil)

### 5.1 Política de privacidad
URL: `https://sport-kapital-b0dc6.web.app/privacy.html`

### 5.2 Acceso a la app (App access)
La app requiere cuenta. Elige **"Toda o parte de la app está restringida"** y agrega instrucciones:
- Crea una cuenta de prueba TÚ MISMO antes (regístrate en la app con un correo tipo `revisor.playstore@gmail.com` / `Test1234`).
- Pon: usuario `revisor.playstore@gmail.com`, contraseña `Test1234`, nota: "Sign up is free and instant; this test account is pre-created. All money in the app is virtual (simulation)."

### 5.3 Anuncios
**No, la app no contiene anuncios.**

### 5.4 Clasificación de contenido (cuestionario IARC)
- Correo: el tuyo. Categoría: **Juego** (si elegiste Simulación).
- Violencia / miedo / sexo / lenguaje / drogas: **No** a todo.
- **¿Apuestas con dinero real?: NO.**
- **¿Contenido que simula apuestas (simulated gambling)?: NO** — es simulación de TRADING (compra/venta de activos), no un casino ni apuestas deportivas: no se apuesta al resultado, se compran tokens como acciones. Si el formulario pregunta por "intercambio de bienes virtuales": Sí, hay moneda virtual SIN valor real y SIN compras dentro de la app.
- ¿Compras digitales?: **No** (no hay in-app purchases).
- Resultado esperado: apto para adolescentes/E10+; con tu restricción propia de 18+ no hay conflicto.

### 5.5 Público objetivo
- Grupo de edad: **18 en adelante** (solo ese).
- ¿Atrae a niños?: **No**.

### 5.6 Seguridad de los datos (Data safety) — copia esta tabla
**¿Recopila o comparte datos?** Sí, recopila. **¿Comparte con terceros?** No.
**¿Cifrado en tránsito?** Sí. **¿Se pueden eliminar los datos?** Sí (en la app y por correo).

| Tipo de dato | ¿Recopilado? | ¿Compartido? | ¿Opcional? | Propósito |
|---|---|---|---|---|
| Información personal → Nombre | Sí | No | No | Administración de la cuenta |
| Información personal → Correo electrónico | Sí | No | No | Administración de la cuenta |
| Información personal → Número de teléfono | Sí | No | No | Administración de la cuenta |
| Información personal → Fecha de nacimiento (Otra info) | Sí | No | No | Administración de la cuenta (verificar 18+) |
| Otro contenido generado por el usuario (progreso del juego, alias) | Sí | No | No | Funcionalidad de la app |

Todo lo demás (ubicación, financieros, fotos, contactos, identificadores, etc.): **No se recopila**.
URL de eliminación de cuenta (te la pide aquí o en "Cuentas"): `https://sport-kapital-b0dc6.web.app/privacy.html#eliminar-cuenta`

### 5.7 Funciones financieras
**"Mi app no ofrece funciones financieras"** — es una simulación con moneda virtual sin valor real,
no da préstamos, no gestiona dinero, no es exchange real.

### 5.8 Apps del gobierno / Noticias / COVID
No a todo.

## PASO 6 — Subir el AAB y publicar

1. **Primero prueba interna** (recomendado): Testing → Internal testing → Create release → sube el `.aab` →
   agrega tu correo como tester → instala desde el link y verifica que todo funciona en tu teléfono.
2. Cuando estés conforme: **Production → Create release** → sube el mismo `.aab` → notas de la versión:
   ```
   es-419: Primera versión: simulador de trading con equipos de fútbol.
   en-US: First release: football team trading simulator.
   ```
3. Países: selecciona todos (o Latinoamérica + España + EE.UU.).
4. **Enviar para revisión**. Primera revisión: puede tardar de 1 a 7 días.

## ✅ Checklist final antes de enviar

- [ ] Música reemplazada por pistas libres de derechos (o riesgo asumido conscientemente)
- [ ] `firebase deploy` hecho y `https://sport-kapital-b0dc6.web.app/privacy.html` abre bien
- [ ] Correo de contacto revisado dentro de privacy.html
- [ ] Cuenta de prueba para revisores creada en la app
- [ ] AAB de producción compilado (targetSdk 35) y probado en prueba interna
- [ ] Data safety, clasificación y público objetivo llenados como arriba

## Qué YA está hecho en el código (no tienes que tocarlo)

- ✅ Eliminación de cuenta DENTRO de la app (Perfil → Privacidad y cuenta → Eliminar cuenta):
  borra Firestore + Firebase Auth + datos locales, con confirmación por contraseña. **Requisito obligatorio de Google desde 2024.**
- ✅ Enlace a la política de privacidad dentro de la app.
- ✅ targetSdkVersion 35 (requisito 2026 para apps nuevas).
- ✅ AAB (app-bundle) en el perfil production + versionCode automático.
- ✅ Sin SDKs de publicidad ni analytics (declaraciones simples).
- ✅ Aviso de riesgo 18+ con aceptación registrada, en ES y EN.
- ✅ Permisos mínimos (solo MODIFY_AUDIO_SETTINGS + notificaciones).
