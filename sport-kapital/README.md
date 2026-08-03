# Sport Kapital — Trading de Equipos

Exchange simulado de tokens de equipos de fútbol (Expo SDK 51 + React Native + TypeScript). Mercados con datos reales al 11 de julio de 2026: **Mundial 2026** (en semifinales), **LaLiga 2025/26** (Barcelona campeón) y **Liga Nacional de Honduras** (Motagua campeón del Clausura).

## Qué hace
- **Partidos en vivo simulados**: goles, tiros, faltas y tarjetas mueven el precio al instante.
- **Transferencia de liquidez**: cada evento que sube un token debita al rival (suma cero dentro del partido). Si un equipo sube, el otro baja.
- **Velas japonesas reales** (SVG propio, sin Skia): OHLC, mechas, volumen, eje de precios, temporalidades 1m/5m/15m/1H.
- **Noticias que mueven el mercado**: fichajes, lesiones y titulares con impacto de precio y flujo hacia rivales de liga.
- **Cuenta de usuario**: registro con nombre, correo y país (guardado local en el dispositivo).
- **Bono de bienvenida: 500 USDT.**
- **P&L completo**: no realizado por posición y total, realizado acumulado, ROI, precio con flash verde/rojo como MEXC/Binance.
- **Retiros LATAM**: USDT TRC20, PayPal o SWIFT, con país de destino, conversión a moneda local (HNL, MXN, GTQ, COP, ARS, etc.) y comisiones desglosadas.
- Aviso de riesgo obligatorio (scroll + casilla) y tutoriales guiados por pantalla.

## Cómo generar el APK (VS Code)
```bash
npm install
npm install -g eas-cli
eas login
eas init
```
En Windows, si Git no está instalado:
```powershell
$env:EAS_NO_VCS=1
eas build -p android --profile preview
```
Al terminar, abre el enlace del APK desde el navegador de tu Android e instálalo.

APK local (requiere Android Studio):
```bash
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
```

## Estructura
```
app/
  _layout.tsx           gating registro → onboarding → riesgo → tabs + motor de mercado
  register.tsx          crear cuenta (nombre, correo, país)
  onboarding.tsx        4 slides con transición 3D + bono 500 USDT
  risk.tsx              aviso de riesgo obligatorio
  (tabs)/dashboard.tsx  patrimonio, P&L, partidos en vivo, movers, noticias
  (tabs)/market.tsx     equipos por liga con buscador y filtros
  (tabs)/portfolio.tsx  posiciones con P&L no realizado/realizado
  (tabs)/news.tsx       feed de noticias con impacto
  (tabs)/wallet.tsx     depósitos y retiros LATAM
  team/[id].tsx         velas japonesas + stats reales + contexto + posición
  match/[id].tsx        partido en vivo con feed de eventos e impactos
  trade/[id].tsx        orden con comisión 0.4% y P&L en la confirmación
data/teams.ts           24 equipos con datos reales de la temporada
utils/matchEngine.ts    motor: ticks, partidos, liquidez suma-cero, noticias
store/useStore.ts       Zustand + MMKV
components/             CandleChart, TeamBadge, PriceFlash, LiveMatchCard, Icon…
```

Comisiones: trading 0.4% · retiro USDT 1% + 1 · PayPal 4.5% + 0.30 · SWIFT 1% + 25. Todo el capital es virtual.
