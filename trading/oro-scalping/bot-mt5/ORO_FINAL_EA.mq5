//+------------------------------------------------------------------+
//|                                                 ORO_FINAL_EA.mq5 |
//|     🥇 ORO FINAL · Bot automático de scalping XAUUSD             |
//|                    versión 3.00 · LISTO PARA ENCENDER            |
//|                                                                  |
//|  PRECONFIGURADO — no hace falta tocar nada para arrancar:        |
//|    · Servidor GMT+0  ·  Londres 07:00-10:00  ·  NY 12:30-15:30   |
//|    · Modo TURBO (umbral 62 = más entradas, no objetivos lejanos) |
//|    · Objetivos de SCALPING: TP1 0.8R (cierra 60%) · TP2 1.6R     |
//|    · Cierre por tiempo: 8 velas sin TP1 y fuera (no estar trabado)|
//|    · Riesgo 10% real por operación (5% x2 del Turbo)             |
//|    · Máximo 10 operaciones al día                                |
//|    · SE DETIENE A LAS 3 PÉRDIDAS SEGUIDAS (o 5 totales)          |
//|    · Objetivo del día +20% -> cierra y descansa                  |
//|    · Push al móvil: entradas, TP, SL, salidas y latido cada 2 h  |
//|                                                                  |
//|  UNICO REQUISITO: confirma que tu servidor sea GMT+0 comparando  |
//|  la hora del Market Watch con la hora UTC. Si no coincide, ajusta|
//|  los 4 horarios de las killzones.                                |
//|                                                                  |
//|  Estrategia: score de confluencia 0-100 (10 factores + castigos) |
//|  · Entra solo en killzones (configurable) · SL estructura + ATR  |
//|  · TP1 cierra 50% y stop a entrada · TP2 con trailing por ATR    |
//|  · Salida inteligente por salud de la operación                  |
//|                                                                  |
//|  Protecciones: una posición · siempre con SL · filtro de spread  |
//|  · freno diario por pérdida % (sobrevive a reinicios) · objetivo |
//|  diario opcional · bloqueo de ventanas de noticias · cierre de   |
//|  viernes · límites de operaciones y pérdidas por día             |
//|                                                                  |
//|  v2.10 (revisión de trader pro): órdenes por TICKET (sin choque  |
//|  con trading manual) · break-even con colchón (cubre spread)     |
//|  · distancia mínima del SL (0.6×ATR) · TP2 limitado por la       |
//|  estructura de 4 h · chequeo de margen antes de abrir            |
//|  v2.00 (auditoría): rango de apertura por VELAS (sobrevive a     |
//|  reinicios del VPS) · selección de posición por magic (compatible|
//|  con trading manual en paralelo) · score una vez por vela con    |
//|  flanco consistente · VWAP cacheado · baseline diario persistente|
//|  · respeto del stops-level del broker · gracia antes de la salida|
//|  inteligente · limpieza de variables globales · log de errores   |
//+------------------------------------------------------------------+
#property copyright   "ORO FINAL"
#property version     "3.40"
#property description "ORO FINAL v3.00 - Preconfigurado TURBO: servidor GMT+0, 10 operaciones/dia, corte a las 3 perdidas seguidas. Pegar, compilar y encender."

#include <Trade/Trade.mqh>

//──────────────────────────── INPUTS ────────────────────────────
input group "⚙️ General"
input long     InpMagic          = 20250823;   // Magic number del bot
input int      InpThreshold      = 70;         // Score mínimo (62 agresivo · 70 normal · 78 conservador)
input int      InpMode           = 0;          // Ventana: 0=Solo killzones · 1=Londres+NY · 2=24 horas
input int      InpCooldownMin    = 40;         // Minutos mínimos entre entradas (Turbo lo reduce a la mitad = 20)
input int      InpThrOutside     = 70;         // Score mínimo FUERA de killzone (0 = no operar fuera)

input group "🕐 Sesiones (HORA DEL SERVIDOR del broker)"
input string   InpLdnStart       = "07:00";    // Killzone Londres: inicio  [servidor GMT+0]
input string   InpLdnEnd         = "10:00";    // Killzone Londres: fin
input string   InpNyStart        = "12:30";    // Killzone Nueva York: inicio
input string   InpNyEnd          = "15:30";    // Killzone Nueva York: fin
input string   InpFullStart      = "06:00";    // Londres+NY completo: inicio
input string   InpFullEnd        = "21:00";    // Londres+NY completo: fin
input int      InpOrbMinutes     = 15;         // Duración del rango de apertura (min)
input string   InpNewsBlock      = "";         // Ventanas bloqueadas "HH:MM-HH:MM" separadas por comas (opcional)
input bool     InpCloseFriday    = true;       // Cerrar todo el viernes a la hora indicada
input string   InpFridayTime     = "20:00";    // Hora de cierre del viernes (servidor)

input group "🎚 Lote y agresividad"
input int      InpLotMode        = 0;          // Lote: 0 = automático por % de riesgo · 1 = lote FIJO manual
input double   InpFixedLot       = 0.10;       // Lote fijo manual (se usa con Lote = 1)
input double   InpMaxRiskCapPct  = 5.0;        // Tope de seguridad del lote fijo (% máx. del equity en riesgo por operación)
input int      InpAggro          = 2;          // Agresividad: 0 = Normal · 1 = Agresivo · 2 = TURBO

input group "💰 Riesgo y protección de la cuenta"
input double   InpRiskPct        = 5.0;        // Riesgo por operación (%) — Turbo lo multiplica x2 = 10% REAL
input int      InpMaxTradesDay   = 10;         // Máximo de operaciones por día
input int      InpMaxLossStreak  = 3;          // Máximo de PÉRDIDAS SEGUIDAS (se reinicia con cada ganadora)
input int      InpMaxLossesDay   = 5;          // Máximo de pérdidas totales por día (red de seguridad)
input double   InpMaxDailyDD     = 30.0;       // Freno de emergencia: pérdida diaria máx. (%) — 3 seguidas al 10% = -27%
input double   InpDailyTarget    = 20.0;       // Objetivo diario en % (al lograrlo se detiene; 0 = apagado)
input double   InpDailyTargetUSD = 0.0;        // Objetivo diario en $ (0 = apagado). Se detiene con el primero que se cumpla
input double   InpDailyLossUSD   = 0.0;        // Límite de pérdida diaria en $ (0 = usar solo el % del freno)
input bool     InpCloseOnTarget  = true;       // Al llegar a objetivo o límite: cerrar también la posición abierta
input double   InpMaxSpreadUSD   = 0.35;       // Spread máximo aceptado ($ por onza)
input int      InpSlippagePts    = 30;         // Desviación máxima (puntos)

input group "🔄 Motor 2 · Reversión a la media (rangos y horas tranquilas)"
input bool     InpUseReversion   = false;      // Activar el segundo motor (pruébalo en el Probador antes)
input string   InpRevSession     = "21:00-06:00"; // Ventana del motor de reversión (servidor) — Asia por defecto
input double   InpRevAdxMax      = 20.0;       // ADX máximo: por encima hay tendencia y este motor no opera
input double   InpRevVwapAtr     = 2.0;        // Extensión mínima del VWAP para considerar el rebote (× ATR)
input int      InpRevRsi         = 72;         // RSI de agotamiento (72 arriba / 28 abajo)
input double   InpRevMinRR       = 1.0;        // Relación riesgo/beneficio mínima para aceptar la entrada
input double   InpRevRiskMult    = 0.5;        // Riesgo de este motor respecto del principal (0.5 = la mitad)

input group "🎯 SL / TP"
input int      InpAtrPeriod      = 14;         // Periodo ATR
input double   InpSlBufAtr       = 0.5;        // Colchón del SL (× ATR)
input double   InpMaxSlAtr       = 1.5;        // Distancia máxima del SL (× ATR)
input int      InpSwingBars      = 6;          // Velas para el swing del SL
input double   InpRR1            = 0.8;        // TP1 (× riesgo) — objetivo rápido, cierra la mayor parte
input int      InpTP1Percent     = 60;         // % de la posición que se cierra en TP1 (scalping: 60-70)
input double   InpRR2            = 1.6;        // TP2 (× riesgo) — cierre total (el oro en M5 rara vez da más)
input bool     InpUseTrail       = true;       // Trailing por ATR después del TP1
input double   InpTrailAtr       = 1.0;        // Trailing (× ATR) — ceñido: asegura rápido
input double   InpMinSlAtr       = 0.6;        // Distancia mínima del SL (× ATR)
input double   InpBeBufAtr       = 0.1;        // Colchón del break-even (× ATR, cubre spread/comisión)
input bool     InpUseStructTP    = true;       // TP2 limitado por la estructura (swing de 4 h)
input double   InpStructBufAtr   = 0.2;        // Colchón del TP estructural (× ATR)

input group "🚪 Salida inteligente"
input bool     InpUseSmart       = true;       // Vigilar salud y cerrar si el mercado se gira
input int      InpHealthExit     = 45;         // Salud mínima antes de cerrar (0-100)
input int      InpGraceBars      = 2;          // Velas de gracia antes de poder salir por salud
input bool     InpUseTimeStop    = true;       // Contar estancamiento (~2 h sin TP1)
input int      InpStallMinutes   = 45;         // Minutos de estancamiento (penaliza la salud)
input int      InpMaxBarsNoTP1   = 8;          // CIERRE POR TIEMPO: velas sin llegar a TP1 (0 = apagado)

input group "📈 Indicadores"
input int      InpEmaFast        = 9;          // EMA rápida
input int      InpEmaSlow        = 21;         // EMA lenta
input int      InpEmaBias        = 200;        // EMA de sesgo
input int      InpRsiPeriod      = 14;         // RSI
input int      InpAdxPeriod      = 14;         // ADX
input int      InpRsiExtreme     = 76;         // RSI extremo (penaliza entrar tarde)
input double   InpVwapExtAtr     = 2.0;        // Extensión máxima del VWAP (× ATR)
input double   InpVolStrong      = 1.3;        // Volumen fuerte (× media de 20)

input group "🔔 Notificaciones"
input bool     InpPushNotify     = true;       // Push al móvil (configura tu MetaQuotes ID en Herramientas→Opciones→Notificaciones)
input bool     InpPopupAlert     = false;      // Ventana de alerta sonora en el terminal
input int      InpHeartbeatMin   = 120;       // Latido "sigo vivo" al movil cada X minutos (0 = apagado)
input bool     InpNotifySession  = true;      // Avisar al abrir y cerrar cada killzone

//──────────────────────────── ESTADO ────────────────────────────
CTrade    trade;
int       hEmaF, hEmaS, hEmaB, hRsi, hAtr, hAdx;
int       hM15F, hM15S, hH1F, hH1S;
datetime  lastBarTime   = 0;
datetime  lastEntryTime = 0;
datetime  dayStart      = 0;
double    dayStartBalance = 0;
// Score con flanco consistente (una sola evaluación por vela)
double    prevScL = -1, prevScS = -1;
bool      scoreWarm = false;
// Cache de VWAP y volumen relativo (una vez por vela)
datetime  cacheBar = 0;
double    cVwap = 0, cRelVol = 1.0;
// Última posición gestionada (para limpieza y resumen al cierre)
long      lastPid = 0;
datetime  lastBeat = 0;      // ultimo latido enviado
double    sesMaxL = 0;       // score LONG mas alto alcanzado en la killzone en curso
double    sesMaxS = 0;       // score SHORT mas alto alcanzado en la killzone en curso
int       sesBars = 0;       // velas vigiladas dentro de la killzone
bool      wasKzBeat = false; // estado anterior de la killzone (para avisar apertura/cierre)
// Parámetros efectivos según agresividad (se fijan en OnInit)
int       g_thr = 70, g_maxTrades = 4, g_cooldownMin = 60;
double    g_rr2 = 2.0, g_trail = 1.5, g_risk = 0.5;

//──────────────────────────── UTILIDADES ────────────────────────────
double Buf(int handle, int shift)
{
   double b[1];
   if(CopyBuffer(handle, 0, shift, 1, b) != 1) return 0.0;
   return b[0];
}

void Notify(string msg)
{
   // MetaQuotes rechaza los push de más de 255 caracteres: si se pasa, NO LLEGA NADA.
   // Se recorta para garantizar que el aviso siempre se entregue.
   if(StringLen(msg) > 250) msg = StringSubstr(msg, 0, 247) + "...";
   if(InpPushNotify)
   {
      if(!SendNotification(msg))
         Print("⚠️ Push no enviado (error ", GetLastError(),
               "). Revisa MetaQuotes ID en Herramientas->Opciones->Notificaciones.");
   }
   if(InpPopupAlert) Alert(msg);
}

// Convierte una distancia de precio en dinero real para el lote indicado
double MoneyFor(double priceDist, double lot)
{
   double tv = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   double ts = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   if(ts <= 0) return 0.0;
   return MathAbs(priceDist) / ts * tv * lot;
}

// Estrellas de calidad de la senal segun el score
string estrella(double v)
{
   if(v >= 90) return "***";
   if(v >= 80) return "**";
   if(v >= 70) return "*";
   return "";
}

// Formato compacto de dinero con signo: +$48 / -$100
string Money(double v)
{
   return (v >= 0 ? "+$" : "-$") + DoubleToString(MathAbs(v), 2);
}

bool InRange(string s, string e)
{
   datetime now = TimeCurrent();
   datetime ts  = StringToTime(s);   // hoy a las HH:MM hora del servidor
   datetime te  = StringToTime(e);
   if(ts <= te) return (now >= ts && now < te);
   return (now >= ts || now < te);   // la ventana cruza la medianoche (p. ej. 21:00-06:00)
}

// Ventana propia del motor de reversión ("HH:MM-HH:MM")
bool InRevSession()
{
   string se[];
   if(StringSplit(InpRevSession, '-', se) != 2) return false;
   return InRange(se[0], se[1]);
}

bool KzLondon()  { return InRange(InpLdnStart, InpLdnEnd); }
bool KzNewYork() { return InRange(InpNyStart,  InpNyEnd);  }
bool KzActive()  { return KzLondon() || KzNewYork(); }

bool TradeWindow()
{
   if(InpMode == 2) return true;
   if(InpMode == 1) return InRange(InpFullStart, InpFullEnd);
   if(KzActive()) return true;
   // Modo killzones: si hay umbral definido para fuera, se amplía a la ventana Londres+NY
   return InpThrOutside > 0 && InRange(InpFullStart, InpFullEnd);
}

// Umbral que aplica AHORA: dentro de killzone el normal, fuera uno más exigente
int ThrNow()
{
   if(KzActive()) return g_thr;
   return InpThrOutside > 0 ? InpThrOutside : 9999;   // 9999 = imposible de alcanzar
}

// Ventanas de noticias bloqueadas: "13:25-13:40,19:55-20:10"
bool NewsBlocked()
{
   if(InpNewsBlock == "") return false;
   string parts[];
   int n = StringSplit(InpNewsBlock, ',', parts);
   for(int i = 0; i < n; i++)
   {
      string se[];
      if(StringSplit(parts[i], '-', se) == 2)
         if(InRange(se[0], se[1])) return true;
   }
   return false;
}

// Minutos hasta el inicio de la próxima killzone
int MinsToNextKz()
{
   datetime now = TimeCurrent();
   datetime a = StringToTime(InpLdnStart);
   datetime b = StringToTime(InpNyStart);
   if(a <= now) a += 86400;
   if(b <= now) b += 86400;
   datetime nxt = (a < b) ? a : b;
   return (int)((nxt - now) / 60);
}

// Panel de estado en el gráfico cuando el bot está vigilando sin operar.
// Sin esto el gráfico se ve vacío fuera de horario y parece que el bot no corre.
void StatusIdle(string motivo)
{
   int m = MinsToNextKz();
   Comment("🥇 ORO FINAL v3.40 · ", _Symbol, " ", EnumToString(_Period),
           "\n✅ BOT ACTIVO — ", motivo,
           "\n🕐 Hora del servidor: ", TimeToString(TimeCurrent(), TIME_MINUTES),
           "\n🔥 Killzones: ", InpLdnStart, "-", InpLdnEnd, "  y  ", InpNyStart, "-", InpNyEnd,
           "\n⏳ Próxima killzone en ", m / 60, "h ", m % 60, "m",
           "\n📅 Resultado del día: $", DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY) - dayStartBalance, 2));
}

bool IsFridayStop()
{
   if(!InpCloseFriday) return false;
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   return dt.day_of_week == 5 && TimeCurrent() >= StringToTime(InpFridayTime);
}

// Selecciona SOLO la posición de este bot (por símbolo + magic).
// Compatible con trading manual u otros EAs en la misma cuenta.
bool SelectOwnPosition()
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) == _Symbol &&
         PositionGetInteger(POSITION_MAGIC) == InpMagic)
         return true;   // queda seleccionada
   }
   return false;
}

// VWAP de la sesión diaria y volumen relativo, cacheados una vez por vela
void RefreshCache()
{
   datetime bt = iTime(_Symbol, PERIOD_CURRENT, 0);
   if(bt == cacheBar) return;
   cacheBar = bt;

   datetime d0 = StringToTime("00:00");
   MqlRates r[];
   int n = CopyRates(_Symbol, PERIOD_CURRENT, d0, TimeCurrent(), r);
   if(n > 0)
   {
      double pv = 0, vv = 0;
      for(int i = 0; i < n; i++)
      {
         double tp  = (r[i].high + r[i].low + r[i].close) / 3.0;
         double vol = (double)r[i].tick_volume;
         pv += tp * vol;
         vv += vol;
      }
      cVwap = vv > 0 ? pv / vv : SymbolInfoDouble(_Symbol, SYMBOL_BID);
   }
   else cVwap = SymbolInfoDouble(_Symbol, SYMBOL_BID);

   long v[];
   int m = CopyTickVolume(_Symbol, PERIOD_CURRENT, 1, 21, v);
   if(m == 21)
   {
      double avg = 0;
      for(int i = 0; i < 20; i++) avg += (double)v[i];   // velas 21..2
      avg /= 20.0;
      cRelVol = avg > 0 ? (double)v[20] / avg : 1.0;     // vela cerrada más reciente
   }
   else cRelVol = 1.0;
}

// Rango de apertura calculado desde las VELAS de la killzone activa.
// Determinista: da lo mismo si el EA se reinició a mitad de sesión.
bool GetORB(double &hi, double &lo)
{
   hi = 0; lo = 0;
   string s = KzLondon() ? InpLdnStart : (KzNewYork() ? InpNyStart : "");
   if(s == "") return false;
   datetime t0   = StringToTime(s);
   datetime tEnd = t0 + InpOrbMinutes * 60;
   if(TimeCurrent() < tEnd) return false;          // rango aún en formación
   for(int sh = 0; sh < 1000; sh++)
   {
      datetime bt = iTime(_Symbol, PERIOD_CURRENT, sh);
      if(bt == 0 || bt < t0) break;
      if(bt < tEnd)
      {
         double h = iHigh(_Symbol, PERIOD_CURRENT, sh);
         double l = iLow(_Symbol, PERIOD_CURRENT, sh);
         if(hi == 0 || h > hi) hi = h;
         if(lo == 0 || l < lo) lo = l;
      }
   }
   return hi > 0;
}

//──────────────────────────── SCORE 0-100 ────────────────────────────
void GetScores(double &scL, double &scS)
{
   int shift = 1;   // siempre sobre la vela cerrada
   double emaF = Buf(hEmaF, shift), emaS = Buf(hEmaS, shift), emaB = Buf(hEmaB, shift);
   double rsi  = Buf(hRsi,  shift), atr  = Buf(hAtr,  shift), adx  = Buf(hAdx, shift);
   double m15F = Buf(hM15F, 1),     m15S = Buf(hM15S, 1);
   double h1F  = Buf(hH1F,  1),     h1S  = Buf(hH1S,  1);
   double vwap = cVwap;
   double relV = cRelVol;

   double c = iClose(_Symbol, PERIOD_CURRENT, shift);
   double o = iOpen(_Symbol, PERIOD_CURRENT, shift);
   double h = iHigh(_Symbol, PERIOD_CURRENT, shift);
   double l = iLow(_Symbol, PERIOD_CURRENT, shift);

   double W_T = 15, W_H1 = 8, W_H2 = 7, W_M = 13, W_B = 12, W_A = 10, W_S = 12, W_C = 8, W_V = 7, W_R = 4;
   double maxPts = W_T + W_H1 + W_H2 + W_M + W_B + W_A + W_S + W_C + W_V + W_R;

   bool trendFullL = emaF > emaS && c > emaB;
   bool trendFullS = emaF < emaS && c < emaB;

   // Ruptura: rango de apertura en killzone; máximo/mínimo de la última hora fuera
   bool brkL = false, brkS = false;
   double oHi, oLo;
   if(KzActive())
   {
      if(GetORB(oHi, oLo)) { brkL = c > oHi; brkS = c < oLo; }
   }
   else
   {
      int barsHour = (int)MathMax(5, 3600 / PeriodSeconds(PERIOD_CURRENT));
      int iH = iHighest(_Symbol, PERIOD_CURRENT, MODE_HIGH, barsHour, shift + 1);
      int iL = iLowest(_Symbol, PERIOD_CURRENT, MODE_LOW,  barsHour, shift + 1);
      if(iH >= 0 && iL >= 0)
      {
         brkL = c > iHigh(_Symbol, PERIOD_CURRENT, iH);
         brkS = c < iLow(_Symbol, PERIOD_CURRENT, iL);
      }
   }

   double rng = MathMax(h - l, _Point);
   bool candBull = c > o && (c - o) / rng >= 0.5;
   bool candBear = c < o && (o - c) / rng >= 0.5;

   double pA = MathMin(adx, 40.0) / 40.0 * W_A;
   double pS = KzActive() ? W_S : (InRange(InpFullStart, InpFullEnd) ? W_S * 0.55 : W_S * 0.2);
   double pV = relV >= InpVolStrong ? W_V : (relV >= 1.0 ? W_V * 0.5 : 0.0);

   // Régimen de volatilidad: ATR actual vs su media de 100 velas
   double pR = W_R;
   double atrArr[];
   if(CopyBuffer(hAtr, 0, 1, 100, atrArr) == 100)
   {
      double atrAvg = 0;
      for(int i = 0; i < 100; i++) atrAvg += atrArr[i];
      atrAvg /= 100.0;
      if(atrAvg > 0 && (atr < atrAvg * 0.5 || atr > atrAvg * 2.5)) pR = W_R * 0.25;
   }

   bool extended = MathAbs(c - vwap) > InpVwapExtAtr * atr;
   double penL = (rsi > InpRsiExtreme ? 12.0 : 0.0) + (extended && c > vwap ? 8.0 : 0.0);
   double penS = (rsi < 100 - InpRsiExtreme ? 12.0 : 0.0) + (extended && c < vwap ? 8.0 : 0.0);

   double rawL = (trendFullL ? W_T : (emaF > emaS ? W_T * 0.5 : 0.0))
               + (m15F > m15S ? W_H1 : 0.0) + (h1F > h1S ? W_H2 : 0.0)
               + (c > vwap ? 7.0 : 0.0) + (rsi > 50 ? 6.0 : 0.0)
               + (brkL ? W_B : 0.0) + pA + pS + (candBull ? W_C : 0.0) + pV + pR;
   double rawS = (trendFullS ? W_T : (emaF < emaS ? W_T * 0.5 : 0.0))
               + (m15F < m15S ? W_H1 : 0.0) + (h1F < h1S ? W_H2 : 0.0)
               + (c < vwap ? 7.0 : 0.0) + (rsi < 50 ? 6.0 : 0.0)
               + (brkS ? W_B : 0.0) + pA + pS + (candBear ? W_C : 0.0) + pV + pR;

   scL = MathMax(0.0, MathMin(100.0, rawL / maxPts * 100.0 - penL));
   scS = MathMax(0.0, MathMin(100.0, rawS / maxPts * 100.0 - penS));
}

//──────────────────────── SALUD DE LA OPERACIÓN ────────────────────────
double TradeHealth(bool isLong, bool t1Done, datetime openTime, string &motivo)
{
   double emaF = Buf(hEmaF, 1), emaS = Buf(hEmaS, 1);
   double rsi  = Buf(hRsi, 1),  adx  = Buf(hAdx, 1);
   double vwap = cVwap;
   double c = iClose(_Symbol, PERIOD_CURRENT, 1);
   double o = iOpen(_Symbol, PERIOD_CURRENT, 1);
   double h = iHigh(_Symbol, PERIOD_CURRENT, 1);
   double l = iLow(_Symbol, PERIOD_CURRENT, 1);
   double rng = MathMax(h - l, _Point);
   bool candBull = c > o && (c - o) / rng >= 0.5;
   bool candBear = c < o && (o - c) / rng >= 0.5;
   bool stalled  = InpUseTimeStop && !t1Done && (TimeCurrent() - openTime) > InpStallMinutes * 60;

   double s = 100.0;
   motivo = "";
   bool vwapAgainst = isLong ? c < vwap : c > vwap;
   bool emaAgainst  = isLong ? emaF < emaS : emaF > emaS;
   bool rsiAgainst  = isLong ? rsi < 45 : rsi > 55;
   bool candAgainst = isLong ? candBear : candBull;
   if(emaAgainst)  { s -= 30; motivo += "EMAs en contra · "; }
   if(vwapAgainst) { s -= 25; motivo += "VWAP en contra · "; }
   if(rsiAgainst)  { s -= 15; motivo += "RSI en contra · "; }
   if(candAgainst) { s -= 10; motivo += "vela en contra · "; }
   if(adx < 15)    { s -= 10; motivo += "sin fuerza (ADX) · "; }
   if(stalled)     { s -= 20; motivo += "estancada sin TP1 · "; }
   return MathMax(0.0, s);
}

//──────────────────────────── LOTE POR RIESGO ────────────────────────────
double RiskLot(double slDistance, bool isLong, double px, double riskMult = 1.0)
{
   double tickVal  = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   if(tickVal <= 0 || tickSize <= 0 || slDistance <= 0) return 0.0;
   double lossPerLot = slDistance / tickSize * tickVal;
   double lot;
   if(InpLotMode == 1)
   {
      // LOTE FIJO MANUAL — con tope de seguridad: si con este SL el lote fijo
      // arriesga más del InpMaxRiskCapPct% del equity, se recorta a ese tope.
      lot = InpFixedLot;
      double capUSD = AccountInfoDouble(ACCOUNT_EQUITY) * InpMaxRiskCapPct / 100.0;
      if(lossPerLot > 0 && lot * lossPerLot > capUSD)
      {
         lot = capUSD / lossPerLot;
         Print("⚠️ ORO FINAL: el lote fijo arriesgaba más del ", DoubleToString(InpMaxRiskCapPct, 1),
               "% del equity con este SL — recortado a ", DoubleToString(lot, 2), " lotes");
      }
   }
   else
   {
      double riskUSD = AccountInfoDouble(ACCOUNT_EQUITY) * g_risk / 100.0 * riskMult;
      lot = riskUSD / lossPerLot;
   }
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double vmin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double vmax = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   lot = MathFloor(lot / step) * step;
   lot = MathMin(lot, vmax);
   // Sanidad de margen: si el margen libre no alcanza, reducir el lote
   ENUM_ORDER_TYPE ot = isLong ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   double freeM = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   double need  = 0;
   while(lot >= vmin)
   {
      if(OrderCalcMargin(ot, _Symbol, lot, px, need) && need <= freeM * 0.8) break;
      lot -= step;
   }
   if(lot < vmin) return 0.0;   // ni el lote mínimo es viable con este riesgo/margen: no forzar
   return lot;
}

//──────────────────────────── CONTADORES DEL DÍA ────────────────────────────
void CountToday(int &nTrades, int &nLosses, int &lossStreak)
{
   nTrades = 0; nLosses = 0; lossStreak = 0;
   datetime d0 = StringToTime("00:00");
   if(!HistorySelect(d0, TimeCurrent())) return;
   int total = HistoryDealsTotal();
   double   posProfit[];
   long     posIds[];
   datetime posClose[];

   // PASO 1 — posiciones ABIERTAS por este bot (los deals de entrada sí llevan el magic)
   for(int i = 0; i < total; i++)
   {
      ulong dTicket = HistoryDealGetTicket(i);
      if(HistoryDealGetInteger(dTicket, DEAL_MAGIC) != InpMagic) continue;
      if(HistoryDealGetInteger(dTicket, DEAL_ENTRY) != DEAL_ENTRY_IN) continue;
      long pid = HistoryDealGetInteger(dTicket, DEAL_POSITION_ID);
      bool seen = false;
      for(int k = 0; k < ArraySize(posIds); k++) if(posIds[k] == pid) { seen = true; break; }
      if(!seen)
      {
         int sz = ArraySize(posIds);
         ArrayResize(posIds, sz + 1);
         ArrayResize(posProfit, sz + 1);
         ArrayResize(posClose, sz + 1);
         posIds[sz] = pid; posProfit[sz] = 0; posClose[sz] = 0;
         nTrades++;   // una posición = una operación, aunque se llene en varios fills
      }
   }

   // PASO 2 — resultado de esas posiciones, sumando TODOS sus deals de salida.
   // No se filtra por magic: cuando el SERVIDOR ejecuta un Stop Loss o un Take Profit,
   // el deal resultante puede venir con magic 0 y quedarse fuera del conteo. Ese era el
   // motivo por el que las pérdidas no se contaban y el límite diario nunca se activaba.
   for(int i = 0; i < total; i++)
   {
      ulong dTicket = HistoryDealGetTicket(i);
      if(HistoryDealGetInteger(dTicket, DEAL_ENTRY) != DEAL_ENTRY_OUT) continue;
      long pid = HistoryDealGetInteger(dTicket, DEAL_POSITION_ID);
      int idx = -1;
      for(int k = 0; k < ArraySize(posIds); k++) if(posIds[k] == pid) { idx = k; break; }
      if(idx < 0) continue;   // no es una posición nuestra
      posProfit[idx] += HistoryDealGetDouble(dTicket, DEAL_PROFIT)
                      + HistoryDealGetDouble(dTicket, DEAL_SWAP)
                      + HistoryDealGetDouble(dTicket, DEAL_COMMISSION);
      datetime dtc = (datetime)HistoryDealGetInteger(dTicket, DEAL_TIME);
      if(dtc > posClose[idx]) posClose[idx] = dtc;   // hora del ultimo cierre de la posicion
   }
   // PASO 3 — quedarse solo con las posiciones YA CERRADAS y ordenarlas por hora de cierre
   datetime cerrHora[];
   bool     cerrPerd[];
   for(int k = 0; k < ArraySize(posIds); k++)
   {
      bool stillOpen = false;
      for(int i = PositionsTotal() - 1; i >= 0; i--)
      {
         ulong tk = PositionGetTicket(i);
         if(tk != 0 && PositionGetInteger(POSITION_IDENTIFIER) == posIds[k]) { stillOpen = true; break; }
      }
      if(stillOpen) continue;
      if(posProfit[k] < 0) nLosses++;
      int sz = ArraySize(cerrHora);
      ArrayResize(cerrHora, sz + 1);
      ArrayResize(cerrPerd, sz + 1);
      cerrHora[sz] = posClose[k];
      cerrPerd[sz] = (posProfit[k] < 0);
   }

   // Orden ascendente por hora de cierre (insercion simple: pocas operaciones al dia)
   int n = ArraySize(cerrHora);
   for(int i = 1; i < n; i++)
   {
      datetime h = cerrHora[i];
      bool     pd = cerrPerd[i];
      int j = i - 1;
      while(j >= 0 && cerrHora[j] > h)
      {
         cerrHora[j + 1] = cerrHora[j];
         cerrPerd[j + 1] = cerrPerd[j];
         j--;
      }
      cerrHora[j + 1] = h;
      cerrPerd[j + 1] = pd;
   }

   // PASO 4 — RACHA de perdidas seguidas: se cuenta desde la ultima operacion
   // hacia atras y se corta en cuanto aparece una ganadora.
   for(int i = n - 1; i >= 0; i--)
   {
      if(!cerrPerd[i]) break;
      lossStreak++;
   }
}

//──────────────────── BASELINE DIARIO PERSISTENTE ────────────────────
// Sobrevive a reinicios del VPS: el freno del día no se resetea al recargar el EA
string DayKey()
{
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   return StringFormat("ORO_BAL_%s_%04d%02d%02d", _Symbol, dt.year, dt.mon, dt.day);
}

void LoadDayBaseline()
{
   string k = DayKey();
   if(GlobalVariableCheck(k))
      dayStartBalance = GlobalVariableGet(k);
   else
   {
      dayStartBalance = AccountInfoDouble(ACCOUNT_BALANCE);
      GlobalVariableSet(k, dayStartBalance);
   }
}

//──────────────────── PARADA DEL DÍA POR OBJETIVO / PÉRDIDA ────────────────────
// Al cumplirse el objetivo (en % o en $) o el límite de pérdida (en % o en $),
// el día queda BLOQUEADO con un candado persistente: ni un reinicio del VPS ni
// un retroceso del equity lo reabren. Mañana se libera solo.
string DayStopKey()
{
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   return StringFormat("ORO_STOP_%s_%04d%02d%02d", _Symbol, dt.year, dt.mon, dt.day);
}

bool DayStopped(string &why)
{
   string k = DayStopKey();
   if(GlobalVariableCheck(k))
   {
      why = GlobalVariableGet(k) > 1.5 ? "limite" : "objetivo";
      return true;
   }
   double pnl = AccountInfoDouble(ACCOUNT_EQUITY) - dayStartBalance;
   bool profitHit = (InpDailyTarget > 0 && pnl >= dayStartBalance * InpDailyTarget / 100.0)
                 || (InpDailyTargetUSD > 0 && pnl >= InpDailyTargetUSD);
   bool lossHit   = (InpMaxDailyDD > 0 && -pnl >= dayStartBalance * InpMaxDailyDD / 100.0)
                 || (InpDailyLossUSD > 0 && -pnl >= InpDailyLossUSD);
   if(profitHit)
   {
      GlobalVariableSet(k, 1);
      why = "objetivo";
      Print("🏆 ORO FINAL: OBJETIVO DEL DÍA logrado (+$", DoubleToString(pnl, 2), ") — el bot descansa hasta mañana");
      Notify("🏆 ORO: objetivo del día logrado (+$" + DoubleToString(pnl, 2) + ") — el bot descansa hasta mañana");
      return true;
   }
   if(lossHit)
   {
      GlobalVariableSet(k, 2);
      why = "limite";
      Print("🛑 ORO FINAL: límite de pérdida del día ($", DoubleToString(pnl, 2), ") — el bot descansa hasta mañana");
      Notify("🛑 ORO: límite de pérdida del día ($" + DoubleToString(pnl, 2) + ") — el bot descansa hasta mañana");
      return true;
   }
   return false;
}

// Resultado neto real de una posición ya cerrada (suma todos sus deals de salida)
bool GetClosedResult(long pid, double &profit)
{
   profit = 0;
   if(!HistorySelectByPosition(pid)) return false;
   int n = HistoryDealsTotal();
   bool found = false;
   for(int i = 0; i < n; i++)
   {
      ulong t = HistoryDealGetTicket(i);
      if(t == 0) continue;
      if(HistoryDealGetInteger(t, DEAL_ENTRY) != DEAL_ENTRY_OUT) continue;
      profit += HistoryDealGetDouble(t, DEAL_PROFIT)
              + HistoryDealGetDouble(t, DEAL_SWAP)
              + HistoryDealGetDouble(t, DEAL_COMMISSION);
      found = true;
   }
   return found;
}

// Informe del día al cerrar la última killzone: el resumen que de verdad importa
void SendDailyReport()
{
   datetime d0 = StringToTime("00:00");
   if(!HistorySelect(d0, TimeCurrent())) return;
   int total = HistoryDealsTotal();
   double posProfit[];
   long   posIds[];
   for(int i = 0; i < total; i++)   // posiciones abiertas hoy por este bot
   {
      ulong t = HistoryDealGetTicket(i);
      if(HistoryDealGetInteger(t, DEAL_MAGIC) != InpMagic) continue;
      if(HistoryDealGetInteger(t, DEAL_ENTRY) != DEAL_ENTRY_IN) continue;
      long pid = HistoryDealGetInteger(t, DEAL_POSITION_ID);
      bool seen = false;
      for(int k = 0; k < ArraySize(posIds); k++) if(posIds[k] == pid) { seen = true; break; }
      if(seen) continue;
      int sz = ArraySize(posIds);
      ArrayResize(posIds, sz + 1); ArrayResize(posProfit, sz + 1);
      posIds[sz] = pid; posProfit[sz] = 0;
   }
   for(int i = 0; i < total; i++)   // resultado de cada una
   {
      ulong t = HistoryDealGetTicket(i);
      if(HistoryDealGetInteger(t, DEAL_ENTRY) != DEAL_ENTRY_OUT) continue;
      long pid = HistoryDealGetInteger(t, DEAL_POSITION_ID);
      for(int k = 0; k < ArraySize(posIds); k++)
         if(posIds[k] == pid)
         {
            posProfit[k] += HistoryDealGetDouble(t, DEAL_PROFIT)
                          + HistoryDealGetDouble(t, DEAL_SWAP)
                          + HistoryDealGetDouble(t, DEAL_COMMISSION);
            break;
         }
   }
   int n = ArraySize(posIds);
   if(n == 0)
   {
      Notify("📊 CIERRE DEL DIA " + _Symbol + " | Sin operaciones hoy | Balance $"
             + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2));
      return;
   }
   int win = 0, los = 0;
   double tot = 0, best = -99999, worst = 99999;
   for(int k = 0; k < n; k++)
   {
      tot += posProfit[k];
      if(posProfit[k] >= 0) win++; else los++;
      if(posProfit[k] > best)  best  = posProfit[k];
      if(posProfit[k] < worst) worst = posProfit[k];
   }
   double pct = dayStartBalance > 0 ? tot / dayStartBalance * 100.0 : 0;
   Notify("📊 CIERRE DEL DIA " + _Symbol + " | " + IntegerToString(n) + " ops: "
          + IntegerToString(win) + "G/" + IntegerToString(los) + "P ("
          + DoubleToString(n > 0 ? 100.0 * win / n : 0, 0) + "%) | " + Money(tot)
          + " (" + DoubleToString(pct, 1) + "%) | Mejor " + Money(best)
          + " Peor " + Money(worst) + " | Balance $"
          + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2));
}

//══════════ MOTOR 2 · REVERSIÓN A LA MEDIA ══════════
// El motor principal caza RUPTURAS con tendencia. Este hace lo contrario: busca
// precio muy estirado del VWAP en un mercado SIN tendencia y apuesta al regreso.
// La clave: las condiciones que el motor 1 PENALIZA (RSI extremo, precio lejos
// del VWAP) son exactamente las que este motor necesita. Por eso se complementan
// en vez de estorbarse, y por eso opera en horas distintas.
bool CheckReversion(bool &goLong, bool &goShort, double &slOut, double &tpOut)
{
   goLong = false; goShort = false; slOut = 0; tpOut = 0;
   if(!InpUseReversion) return false;
   if(!InRevSession())  return false;          // solo dentro de su propia ventana horaria
   if(Bars(_Symbol, PERIOD_CURRENT) < 250) return false;

   double adx = Buf(hAdx, 1);
   if(adx <= 0 || adx > InpRevAdxMax) return false;   // si hay tendencia, este motor no opera

   double atr = Buf(hAtr, 1);
   if(atr <= 0) return false;
   double rsi = Buf(hRsi, 1);
   double c = iClose(_Symbol, PERIOD_CURRENT, 1);
   double o = iOpen(_Symbol, PERIOD_CURRENT, 1);
   double h = iHigh(_Symbol, PERIOD_CURRENT, 1);
   double l = iLow(_Symbol, PERIOD_CURRENT, 1);
   double rng = MathMax(h - l, _Point);
   double dist = c - cVwap;                     // distancia al VWAP de la sesión

   // VENTA: precio muy por ENCIMA del VWAP, sobrecomprado y con mecha de rechazo arriba
   if(dist > InpRevVwapAtr * atr && rsi > InpRevRsi && (h - MathMax(c, o)) / rng >= 0.30)
   {
      goShort = true;
      slOut   = h + InpSlBufAtr * atr;
      tpOut   = cVwap;                          // objetivo: el regreso al VWAP
   }
   // COMPRA: espejo exacto, precio muy por DEBAJO del VWAP
   else if(-dist > InpRevVwapAtr * atr && rsi < (100 - InpRevRsi) && (MathMin(c, o) - l) / rng >= 0.30)
   {
      goLong = true;
      slOut  = l - InpSlBufAtr * atr;
      tpOut  = cVwap;
   }
   return (goLong || goShort);
}

//────────────── AVISO DE ESTADO AL MOVIL ("el bot sigue vivo") ──────────────
// La app de MetaTrader no puede mostrar si un robot esta activo, asi que el bot
// lo dice el mismo: manda una notificacion push con su estado completo.
void SendStatusPush(string tipo)
{
   if(!InpPushNotify && !InpPopupAlert) return;
   if(Bars(_Symbol, PERIOD_CURRENT) < 250) return;   // sin datos suficientes todavia

   double scL2 = 0, scS2 = 0;
   GetScores(scL2, scS2);
   int nT2 = 0, nL2 = 0, nS2 = 0;
   CountToday(nT2, nL2, nS2);
   double pnlD = AccountInfoDouble(ACCOUNT_EQUITY) - dayStartBalance;

   string cab = tipo == "apertura" ? "🔥 KILLZONE ABIERTA"
              : tipo == "cierre"   ? "🌙 Killzone cerrada"
              : tipo == "inicio"   ? "🚀 ORO FINAL iniciado"
              : "💚 ORO FINAL sigue activo";

   string est = "sin posicion";
   if(SelectOwnPosition())
      est = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY ? "EN OPERACION LONG" : "EN OPERACION SHORT");

   string ventana = KzActive() ? "killzone activa" : ("proxima killzone en " + IntegerToString(MinsToNextKz() / 60)
                    + "h " + IntegerToString(MinsToNextKz() % 60) + "m");

   // Al cerrar la killzone se informa el score MAXIMO alcanzado: asi se sabe si el
   // mercado nunca dio confluencia suficiente o si algo bloqueo la entrada.
   string resumen = "";
   if(tipo == "cierre")
   {
      double mx = MathMax(sesMaxL, sesMaxS);
      resumen = " | Maximo de la sesion L" + DoubleToString(sesMaxL, 0) + " S" + DoubleToString(sesMaxS, 0)
              + " en " + IntegerToString(sesBars) + " velas"
              + (sesBars == 0 ? " -> EL BOT NO VIGILO ESTA SESION (arrancó tarde)"
                 : mx < g_thr ? " -> nunca alcanzo el minimo de " + IntegerToString(g_thr)
                 : " -> hubo confluencia suficiente");
   }

   Notify(cab + " · " + _Symbol + " " + TimeToString(TimeCurrent(), TIME_MINUTES)
          + " | Score L" + DoubleToString(scL2, 0) + " S" + DoubleToString(scS2, 0)
          + " (min " + IntegerToString(g_thr) + ")"
          + " | " + est
          + " | Hoy " + IntegerToString(nT2) + " ops / " + IntegerToString(nL2) + " perd"
          + (nS2 > 0 ? " (" + IntegerToString(nS2) + " seguidas)" : "")
          + " | Dia $" + DoubleToString(pnlD, 2)
          + " | " + ventana + resumen);
   if(tipo == "cierre") Print("📊 Cierre de killzone -", resumen);
}

//──────────────────────────── INIT ────────────────────────────
int OnInit()
{
   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(InpSlippagePts);
   trade.SetTypeFillingBySymbol(_Symbol);

   // Agresividad efectiva:
   //  Agresivo: umbral -5, +2 ops/día, TP2 ≥ 2.5R, trailing más ceñido, riesgo ×1.5
   //  Turbo:    umbral -8, +4 ops/día, TP2 ≥ 3R, cooldown a la mitad, riesgo ×2
   g_thr         = InpThreshold - (InpAggro == 1 ? 5 : InpAggro == 2 ? 8 : 0);
   g_maxTrades   = InpMaxTradesDay;   // tu número manda: la agresividad ya no lo modifica
   g_cooldownMin = InpAggro == 2 ? (int)MathMax(15, InpCooldownMin / 2) : InpCooldownMin;
   // La agresividad da MÁS ENTRADAS, no objetivos más lejanos: en scalping alargar
   // el TP solo consigue devolver ganancias ya conseguidas. El objetivo lo fijas tú.
   g_rr2         = InpRR2;
   g_trail       = InpAggro >= 1 ? MathMin(InpTrailAtr, 0.9) : InpTrailAtr;
   g_risk        = InpRiskPct * (InpAggro == 1 ? 1.5 : InpAggro == 2 ? 2.0 : 1.0);

   hEmaF = iMA(_Symbol, PERIOD_CURRENT, InpEmaFast, 0, MODE_EMA, PRICE_CLOSE);
   hEmaS = iMA(_Symbol, PERIOD_CURRENT, InpEmaSlow, 0, MODE_EMA, PRICE_CLOSE);
   hEmaB = iMA(_Symbol, PERIOD_CURRENT, InpEmaBias, 0, MODE_EMA, PRICE_CLOSE);
   hRsi  = iRSI(_Symbol, PERIOD_CURRENT, InpRsiPeriod, PRICE_CLOSE);
   hAtr  = iATR(_Symbol, PERIOD_CURRENT, InpAtrPeriod);
   hAdx  = iADX(_Symbol, PERIOD_CURRENT, InpAdxPeriod);
   hM15F = iMA(_Symbol, PERIOD_M15, 21, 0, MODE_EMA, PRICE_CLOSE);
   hM15S = iMA(_Symbol, PERIOD_M15, 50, 0, MODE_EMA, PRICE_CLOSE);
   hH1F  = iMA(_Symbol, PERIOD_H1, 21, 0, MODE_EMA, PRICE_CLOSE);
   hH1S  = iMA(_Symbol, PERIOD_H1, 50, 0, MODE_EMA, PRICE_CLOSE);
   if(hEmaF == INVALID_HANDLE || hEmaS == INVALID_HANDLE || hEmaB == INVALID_HANDLE ||
      hRsi == INVALID_HANDLE || hAtr == INVALID_HANDLE || hAdx == INVALID_HANDLE ||
      hM15F == INVALID_HANDLE || hM15S == INVALID_HANDLE || hH1F == INVALID_HANDLE || hH1S == INVALID_HANDLE)
   {
      Print("ORO FINAL: error creando indicadores");
      return INIT_FAILED;
   }
   dayStart = StringToTime("00:00");
   LoadDayBaseline();
   wasKzBeat = KzActive();
   lastBeat  = TimeCurrent();
   StatusIdle("recién iniciado, esperando el primer tick");
   SendStatusPush("inicio");
   Print("🥇 ORO FINAL ULTIMATE v3.40 iniciado | ", _Symbol, " ", EnumToString(_Period),
         " | Umbral ", g_thr, InpAggro == 1 ? " (AGRESIVO)" : InpAggro == 2 ? " (TURBO)" : "",
         " | Lote ", InpLotMode == 1 ? "FIJO " + DoubleToString(InpFixedLot, 2) : "auto " + DoubleToString(g_risk, 2) + "%",
         " | TP2 ", DoubleToString(g_rr2, 1), "R | Baseline $", DoubleToString(dayStartBalance, 2));
   // Resumen de protecciones: de un vistazo confirmas que TODA la configuración quedó bien
   Print("   🛡 Protecciones: freno diario ", DoubleToString(InpMaxDailyDD, 1), "%",
         InpDailyLossUSD > 0 ? " / $" + DoubleToString(InpDailyLossUSD, 0) : "",
         " | objetivo diario ", InpDailyTarget > 0 ? DoubleToString(InpDailyTarget, 1) + "%" : "apagado",
         InpDailyTargetUSD > 0 ? " / $" + DoubleToString(InpDailyTargetUSD, 0) : "",
         " | máx ", InpMaxTradesDay, " ops · ", InpMaxLossStreak, " pérdidas SEGUIDAS · ",
         InpMaxLossesDay, " totales",
         " | salida por salud <", InpHealthExit,
         " | spread máx $", DoubleToString(InpMaxSpreadUSD, 2));
   Print("   🕐 Killzones (servidor): ", InpLdnStart, "-", InpLdnEnd, " y ", InpNyStart, "-", InpNyEnd,
         " | ventana ", InpMode == 0 ? (InpThrOutside > 0 ? "killzones + fuera con umbral " + IntegerToString(InpThrOutside) : "solo killzones")
                       : InpMode == 1 ? "Londres+NY" : "24 horas",
         InpUseReversion ? " | 🔄 MOTOR 2 activo " + InpRevSession + " (riesgo x" + DoubleToString(InpRevRiskMult, 2) + ")" : " | motor 2 apagado",
         " | hora actual del servidor ", TimeToString(TimeCurrent(), TIME_MINUTES));
   // Aviso si el freno diario es tan bajo que se activaría con una sola pérdida
   if(InpLotMode == 0 && InpMaxDailyDD > 0 && InpMaxDailyDD <= g_risk * InpMaxLossStreak * 0.95)
      Print("⚠️ ATENCIÓN: tu freno diario (", DoubleToString(InpMaxDailyDD, 1),
            "%) es igual o menor que el riesgo por operación (", DoubleToString(g_risk, 2),
            "%) es menor de lo que costarían ", InpMaxLossStreak,
            " pérdidas seguidas. El bot se detendría antes de agotar la racha. Súbelo a ",
            DoubleToString(g_risk * InpMaxLossStreak * 1.1, 0), "% o más.");
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason) { Comment(""); }

//──────────────────────────── LÓGICA PRINCIPAL ────────────────────────────
void OnTick()
{
   //── Nuevo día
   datetime d0 = StringToTime("00:00");
   if(d0 != dayStart)
   {
      dayStart = d0;
      GlobalVariablesDeleteAll("ORO_STOP_");   // libera el candado de días anteriores
      LoadDayBaseline();
   }

   RefreshCache();

   //── Latido al movil: confirma desde el telefono que el bot sigue corriendo
   if(InpHeartbeatMin > 0 && TimeCurrent() - lastBeat >= InpHeartbeatMin * 60)
   {
      lastBeat = TimeCurrent();
      SendStatusPush("latido");
   }

   //── Aviso de apertura y cierre de cada killzone
   bool kzBeatNow = KzActive();
   if(kzBeatNow != wasKzBeat)
   {
      if(InpNotifySession) SendStatusPush(kzBeatNow ? "apertura" : "cierre");
      // Al cerrar la ULTIMA killzone del dia (la de NY) se envia el informe completo
      if(!kzBeatNow && TimeCurrent() >= StringToTime(InpNyEnd)) SendDailyReport();
      if(kzBeatNow) { sesMaxL = 0; sesMaxS = 0; sesBars = 0; }   // arranca una sesion nueva
      wasKzBeat = kzBeatNow;
   }

   //── Parada del día: si se logró el objetivo o se tocó el límite, asegurar y descansar
   string dayWhy0;
   if(DayStopped(dayWhy0) && InpCloseOnTarget && SelectOwnPosition())
   {
      ulong tk0 = (ulong)PositionGetInteger(POSITION_TICKET);
      if(trade.PositionClose(tk0))
         Print("🏁 ORO FINAL: día detenido (", dayWhy0 == "objetivo" ? "objetivo logrado" : "límite de pérdida", ") — posición cerrada para asegurar el resultado");
   }

   //── Gestión de la posición abierta (cada tick)
   bool havePos = SelectOwnPosition();
   if(havePos)
      ManagePosition();
   else if(lastPid != 0)
   {
      // La posición se cerró (TP2/SL del servidor o cierre nuestro): resumen y limpieza
      double prof = 0;
      string kR = "ORO_RUSD_" + (string)lastPid;
      double rUsd0 = GlobalVariableCheck(kR) ? GlobalVariableGet(kR) : 0;
      if(GetClosedResult(lastPid, prof))
      {
         int nTc = 0, nLc = 0, nSc = 0;
         CountToday(nTc, nLc, nSc);
         double eqc = AccountInfoDouble(ACCOUNT_EQUITY);
         Notify((prof >= 0 ? "✅ CERRADA EN GANANCIA " : "❌ CERRADA EN PERDIDA ") + _Symbol
                + "\nResultado " + Money(prof)
                + (rUsd0 > 0 ? "  (" + DoubleToString(prof / rUsd0, 2) + "R)" : "")
                + "\nDia " + Money(eqc - dayStartBalance) + " · " + IntegerToString(nTc) + "/"
                + IntegerToString(g_maxTrades) + " ops · " + IntegerToString(nLc) + " perd"
                + " · racha " + IntegerToString(nSc) + "/" + IntegerToString(InpMaxLossStreak)
                + "\nBalance $" + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2));
         Print("🥇 Posición ", lastPid, " cerrada | ", Money(prof),
               rUsd0 > 0 ? " (" + DoubleToString(prof / rUsd0, 2) + "R)" : "");
      }
      GlobalVariableDel("ORO_TP1_" + (string)lastPid);
      GlobalVariableDel("ORO_T1D_" + (string)lastPid);
      GlobalVariableDel("ORO_OPN_" + (string)lastPid);
      GlobalVariableDel(kR);
      lastPid = 0;
   }

   //── Entradas: solo al abrir vela nueva (señal de vela cerrada, sin repintado)
   datetime bt = iTime(_Symbol, PERIOD_CURRENT, 0);
   if(bt == lastBarTime) return;
   lastBarTime = bt;

   //── Score una vez por vela, con flanco consistente
   double scL, scS;
   GetScores(scL, scS);
   double pL = prevScL, pS_ = prevScS;
   prevScL = scL; prevScS = scS;
   if(KzActive())
   {
      sesBars++;
      if(scL > sesMaxL) sesMaxL = scL;
      if(scS > sesMaxS) sesMaxS = scS;
   }
   if(!scoreWarm)
   {
      scoreWarm = true;
      StatusIdle("calibrando la primera vela");
      return;   // primera vela tras el arranque: solo calibrar
   }

   if(havePos) return;                             // una posición a la vez
   if(IsFridayStop())
   {
      StatusIdle("viernes: cierre de la semana, sin nuevas entradas");
      return;
   }
   if(NewsBlocked())
   {
      StatusIdle("ventana de noticias bloqueada");
      return;
   }
   if(!TradeWindow())
   {
      StatusIdle("fuera del horario de operación — vigilando");
      return;
   }
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) || !MQLInfoInteger(MQL_TRADE_ALLOWED))
   {
      Comment("⚠️ ORO FINAL · TRADING ALGORÍTMICO DESACTIVADO\n",
              "Activa el botón \"Algo Trading\" (debe estar VERDE) y en\n",
              "Herramientas → Opciones → Asesores Expertos marca\n",
              "\"Permitir trading algorítmico\". El bot no puede operar así.");
      return;
   }

   //── Protecciones
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   if(ask - bid > InpMaxSpreadUSD)
   {
      Comment("🥇 ORO FINAL | ⏸ Spread alto: $", DoubleToString(ask - bid, 2), " (máx. ", DoubleToString(InpMaxSpreadUSD, 2), ")");
      return;
   }
   string dayWhy;
   if(DayStopped(dayWhy))
   {
      double pnlDay = AccountInfoDouble(ACCOUNT_EQUITY) - dayStartBalance;
      Comment(dayWhy == "objetivo"
              ? "🏆 ORO FINAL | OBJETIVO DEL DÍA LOGRADO (+$" + DoubleToString(pnlDay, 2) + ") — descansando hasta mañana"
              : "🛑 ORO FINAL | LÍMITE DE PÉRDIDA DEL DÍA ($" + DoubleToString(pnlDay, 2) + ") — descansando hasta mañana");
      return;
   }
   int nT, nL, nStreak;
   CountToday(nT, nL, nStreak);
   if(InpMaxLossStreak > 0 && nStreak >= InpMaxLossStreak)
   {
      Comment("🛑 ORO FINAL | ", nStreak, " PÉRDIDAS SEGUIDAS — el bot se detiene hasta mañana.\n",
              "Hoy: ", nT, " operaciones, ", nL, " pérdidas | Día $",
              DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY) - dayStartBalance, 2));
      return;
   }
   if(nT >= g_maxTrades || nL >= InpMaxLossesDay)
   {
      Comment("🛑 ORO FINAL | Límite diario: ", nT, "/", g_maxTrades, " operaciones, ",
              nL, "/", InpMaxLossesDay, " pérdidas.");
      return;
   }
   if(lastEntryTime > 0 && (TimeCurrent() - lastEntryTime) < g_cooldownMin * 60) return;

   int thrAhora = ThrNow();   // dentro de killzone el umbral normal, fuera uno más exigente
   bool goLong  = scL >= thrAhora && scL > scS && pL < thrAhora;
   bool goShort = scS >= thrAhora && scS > scL && pS_ < thrAhora;

   if(!goLong && !goShort)
   {
      // ── MOTOR 2 · REVERSIÓN: solo si el motor principal no encontró nada ──
      bool rL, rS;
      double rSl, rTp;
      if(CheckReversion(rL, rS, rSl, rTp))
      {
         double pxR   = rL ? ask : bid;
         double riskR = MathAbs(pxR - rSl);
         double rewR  = MathAbs(rTp - pxR);
         if(riskR > 0 && rewR / riskR >= InpRevMinRR)
         {
            double minStopR = (double)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * _Point;
            double atrR = Buf(hAtr, 1);
            Print("🔄 MOTOR 2 (reversión): ", rL ? "COMPRA" : "VENTA",
                  " | precio estirado del VWAP | objetivo VWAP ", DoubleToString(rTp, _Digits),
                  " | R:R ", DoubleToString(rewR / riskR, 2));
            OpenTrade(rL, pxR, rSl, minStopR, atrR, 0, rTp, InpRevRiskMult, "REV");
            return;
         }
      }

      Comment("🥇 ORO FINAL v3.40 | Score L ", DoubleToString(scL, 0), " · S ", DoubleToString(scS, 0),
              " (mín. ", thrAhora, KzActive() ? " killzone" : " fuera", ")",
              InpUseReversion && InRevSession() ? "  🔄 motor 2 vigilando" : "",
              "\nHoy: ", nT, "/", g_maxTrades, " ops · ", nL, "/", InpMaxLossesDay,
              " pérdidas · racha ", nStreak, "/", InpMaxLossStreak,
              "\nMáx. de la sesión: L", DoubleToString(sesMaxL, 0), " S", DoubleToString(sesMaxS, 0),
              " en ", sesBars, " velas",
              " | ", KzActive() ? "KILLZONE 🔥" : (TradeWindow() ? "ventana normal" : "fuera de horario"),
              "\nLote: ", InpLotMode == 1 ? "FIJO " + DoubleToString(InpFixedLot, 2) : "auto " + DoubleToString(g_risk, 2) + "%",
              InpAggro == 1 ? " · MODO AGRESIVO" : InpAggro == 2 ? " · MODO TURBO" : "",
              "\n📅 Día: $", DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY) - dayStartBalance, 2));
      return;
   }

   //── SL por estructura + ATR, respetando el stops-level del broker
   double atr = Buf(hAtr, 1);
   if(atr <= 0) return;
   int iLo = iLowest(_Symbol, PERIOD_CURRENT, MODE_LOW,  InpSwingBars, 1);
   int iHi = iHighest(_Symbol, PERIOD_CURRENT, MODE_HIGH, InpSwingBars, 1);
   if(iLo < 0 || iHi < 0) return;
   double swingLo = iLow(_Symbol, PERIOD_CURRENT, iLo);
   double swingHi = iHigh(_Symbol, PERIOD_CURRENT, iHi);
   double minStop = (double)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * _Point;

   if(goLong)
      OpenTrade(true, ask, MathMax(swingLo - InpSlBufAtr * atr, ask - InpMaxSlAtr * atr), minStop, atr, scL);
   else
      OpenTrade(false, bid, MathMin(swingHi + InpSlBufAtr * atr, bid + InpMaxSlAtr * atr), minStop, atr, scS);
}

//──────────────────────────── APERTURA ────────────────────────────
void OpenTrade(bool isLong, double px, double sl, double minStop, double atr, double score, double tpFijo = 0, double riskMult = 1.0, string etiqueta = "ORO")
{
   // Distancia mínima propia del SL: un stop demasiado ceñido muere con el ruido del spread
   if(isLong)  sl = MathMin(sl, px - InpMinSlAtr * atr);
   else        sl = MathMax(sl, px + InpMinSlAtr * atr);
   // Respetar la distancia mínima de stops del broker
   if(minStop > 0)
   {
      if(isLong  && px - sl < minStop) sl = px - minStop;
      if(!isLong && sl - px < minStop) sl = px + minStop;
   }
   double risk = isLong ? px - sl : sl - px;
   if(risk <= 0) return;
   double tp1, tp2;
   if(tpFijo > 0)
   {
      // Motor de reversión: el objetivo es un nivel concreto (el VWAP), no un múltiplo de R.
      // El TP1 se coloca a mitad de camino para asegurar la mitad de la posición.
      tp2 = tpFijo;
      tp1 = px + (tpFijo - px) * 0.5;
   }
   else
   {
      tp1 = isLong ? px + InpRR1 * risk : px - InpRR1 * risk;
      tp2 = isLong ? px + g_rr2 * risk : px - g_rr2 * risk;
   }

   // TP2 profesional: si el 2R queda detrás del swing de ~4 h, el objetivo se adelanta
   // a ese nivel (menos un colchón), siempre que deje al menos 1.3R
   if(InpUseStructTP && tpFijo <= 0)
   {
      int lookback = (int)MathMax(10, 14400 / PeriodSeconds(PERIOD_CURRENT));
      if(isLong)
      {
         int iH = iHighest(_Symbol, PERIOD_CURRENT, MODE_HIGH, lookback, 1);
         if(iH >= 0)
         {
            double tgt = iHigh(_Symbol, PERIOD_CURRENT, iH) - InpStructBufAtr * atr;
            if(tgt - px >= 1.3 * risk) tp2 = MathMin(tp2, tgt);
         }
      }
      else
      {
         int iL = iLowest(_Symbol, PERIOD_CURRENT, MODE_LOW, lookback, 1);
         if(iL >= 0)
         {
            double tgt = iLow(_Symbol, PERIOD_CURRENT, iL) + InpStructBufAtr * atr;
            if(px - tgt >= 1.3 * risk) tp2 = MathMax(tp2, tgt);
         }
      }
   }
   if(minStop > 0 && MathAbs(tp2 - px) < minStop) return;   // TP2 demasiado cerca: entrada inválida

   double lot = RiskLot(risk, isLong, px, riskMult);
   if(lot <= 0)
   {
      // Diagnóstico completo: te dice EXACTAMENTE qué te falta para poder operar
      double dTickVal  = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
      double dTickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
      double dVmin     = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
      double dEq       = AccountInfoDouble(ACCOUNT_EQUITY);
      double dLossMin  = (dTickSize > 0) ? risk / dTickSize * dTickVal * dVmin : 0;   // $ que arriesga el lote mínimo
      double dNeedPct  = (dEq > 0) ? dLossMin / dEq * 100.0 : 0;
      double dNeedEq   = (g_risk > 0) ? dLossMin / (g_risk / 100.0) : 0;
      string dMsg = InpLotMode == 1
         ? StringFormat("⚠️ ORO FINAL: entrada omitida — tu lote fijo (%.2f) es menor que el mínimo del broker (%.2f). Súbelo a %.2f.",
                        InpFixedLot, dVmin, dVmin)
         : StringFormat("⚠️ ORO FINAL: entrada omitida — el %.2f%% de riesgo no alcanza el lote mínimo.\n"
                        "   SL de esta señal: $%.2f por onza | lote mínimo %.2f = arriesga $%.2f\n"
                        "   Tu presupuesto de riesgo: $%.2f (equity $%.2f × %.2f%%)\n"
                        "   SOLUCIÓN: sube el riesgo a %.2f%% o más, o usa una cuenta con equity de $%.0f+",
                        g_risk, risk, dVmin, dLossMin, dEq * g_risk / 100.0, dEq, g_risk, dNeedPct, dNeedEq);
      Print(dMsg);
      Comment(dMsg);
      return;
   }

   string cmt = etiqueta + (isLong ? " L " : " S ") + DoubleToString(score, 0) + "/100";
   bool ok = isLong
      ? trade.Buy(lot, _Symbol, 0, NormalizeDouble(sl, _Digits), NormalizeDouble(tp2, _Digits), cmt)
      : trade.Sell(lot, _Symbol, 0, NormalizeDouble(sl, _Digits), NormalizeDouble(tp2, _Digits), cmt);
   if(!ok)
   {
      Print("ORO FINAL: fallo al abrir (", trade.ResultRetcode(), " ", trade.ResultRetcodeDescription(), ")");
      return;
   }
   lastEntryTime = TimeCurrent();
   double rUsd = MoneyFor(risk, lot);                       // lo que arriesgas en dinero
   double gT1  = MoneyFor(tp1 - px, lot) * InpTP1Percent / 100.0;   // ganancia del parcial
   double gT2  = MoneyFor(tp2 - px, lot) * (100.0 - InpTP1Percent) / 100.0;
   double eq   = AccountInfoDouble(ACCOUNT_EQUITY);
   if(SelectOwnPosition())
   {
      long pid = PositionGetInteger(POSITION_IDENTIFIER);
      lastPid = pid;
      GlobalVariableSet("ORO_TP1_" + (string)pid, tp1);
      GlobalVariableSet("ORO_T1D_" + (string)pid, 0);
      GlobalVariableSet("ORO_OPN_" + (string)pid, (double)(long)TimeCurrent());
      GlobalVariableSet("ORO_RUSD_" + (string)pid, rUsd);   // para calcular la R al cerrar
   }
   Print(isLong ? "🟢 ORO LONG" : "🔴 ORO SHORT", " | score ", DoubleToString(score, 0),
         " | lote ", DoubleToString(lot, 2), " | SL ", DoubleToString(sl, _Digits),
         " | TP1 ", DoubleToString(tp1, _Digits), " | TP2 ", DoubleToString(tp2, _Digits));
   int nTn = 0, nLn = 0, nSn = 0;
   CountToday(nTn, nLn, nSn);
   Notify((isLong ? "🟢 COMPRA " : "🔴 VENTA ") + "#" + IntegerToString(nTn) + " " + _Symbol
          + (etiqueta == "REV" ? " [reversion]" : " " + estrella(score))
          + (score > 0 ? " score " + DoubleToString(score, 0) : "")
          + "\nEntrada " + DoubleToString(px, _Digits) + " · Lote " + DoubleToString(lot, 2)
          + "\nSL " + DoubleToString(sl, _Digits) + " (" + Money(-rUsd) + " / "
          + DoubleToString(eq > 0 ? rUsd / eq * 100.0 : 0, 1) + "%)"
          + "\nTP1 " + DoubleToString(tp1, _Digits) + " (" + Money(gT1) + ")"
          + " · TP2 " + DoubleToString(tp2, _Digits) + " (" + Money(gT2) + ")"
          + "\nDia " + Money(eq - dayStartBalance) + " · " + IntegerToString(nTn) + "/"
          + IntegerToString(g_maxTrades) + " ops");
}

//──────────────────────────── GESTIÓN ────────────────────────────
void ManagePosition()
{
   // La posición propia ya está seleccionada por SelectOwnPosition()
   long   pid    = PositionGetInteger(POSITION_IDENTIFIER);
   bool   isLong = PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY;
   double entry  = PositionGetDouble(POSITION_PRICE_OPEN);
   double curSL  = PositionGetDouble(POSITION_SL);
   double curTP  = PositionGetDouble(POSITION_TP);
   double vol    = PositionGetDouble(POSITION_VOLUME);
   double bid    = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask    = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   ulong  ticket = (ulong)PositionGetInteger(POSITION_TICKET);
   lastPid = pid;

   string kTP1 = "ORO_TP1_" + (string)pid;
   string kT1D = "ORO_T1D_" + (string)pid;
   string kOPN = "ORO_OPN_" + (string)pid;
   double tp1    = GlobalVariableCheck(kTP1) ? GlobalVariableGet(kTP1) : 0;
   bool   t1Done = GlobalVariableCheck(kT1D) && GlobalVariableGet(kT1D) > 0.5;
   if(tp1 <= 0)
   {
      // Reconstrucción tras un reinicio que borró las variables globales:
      // derivar TP1 del SL original de la propia posición
      if(isLong ? (curSL > 0 && curSL < entry) : (curSL > entry))
      {
         double r0 = MathAbs(entry - curSL);
         tp1 = isLong ? entry + InpRR1 * r0 : entry - InpRR1 * r0;
         GlobalVariableSet(kTP1, tp1);
         GlobalVariableSet(kOPN, (double)(long)PositionGetInteger(POSITION_TIME));
         Print("ORO FINAL: TP1 reconstruido tras reinicio → ", DoubleToString(tp1, _Digits));
      }
      else if(!t1Done)
      {
         // El stop ya está en la entrada o mejor: tratar el TP1 como hecho
         GlobalVariableSet(kT1D, 1);
         t1Done = true;
      }
   }
   datetime opnT  = GlobalVariableCheck(kOPN) ? (datetime)(long)GlobalVariableGet(kOPN) : (datetime)PositionGetInteger(POSITION_TIME);

   //── Cierre por fin de ventana o cierre de viernes
   if((InpMode != 2 && !TradeWindow()) || IsFridayStop())
   {
      if(trade.PositionClose(ticket))
         Print("ORO FINAL: cierre por fin de ventana operable / viernes");
      return;
   }

   //── CIERRE POR TIEMPO — el alma del scalping: se vive del movimiento inmediato.
   // Si en N velas la operación no llegó ni al primer objetivo, la idea ya no funcionó:
   // mejor salir por poco que quedarse trabado esperando a que el stop decida.
   if(InpMaxBarsNoTP1 > 0 && !t1Done)
   {
      int barsOpen = (int)((TimeCurrent() - opnT) / PeriodSeconds(PERIOD_CURRENT));
      if(barsOpen >= InpMaxBarsNoTP1)
      {
         double pnlNow = PositionGetDouble(POSITION_PROFIT);
         if(trade.PositionClose(ticket))
         {
            Print("⏱ ORO FINAL: cierre por tiempo — ", barsOpen, " velas sin alcanzar TP1 | resultado $",
                  DoubleToString(pnlNow, 2));
            Notify("⏱ ORO cierre por tiempo — " + IntegerToString(barsOpen) +
                   " velas sin llegar al TP1 | $" + DoubleToString(pnlNow, 2));
         }
         return;
      }
   }

   //── TP1: cerrar el parcial y mover el stop al punto de entrada
   if(!t1Done && tp1 > 0)
   {
      bool hit = isLong ? (bid >= tp1) : (ask <= tp1);
      if(hit)
      {
         double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
         double vmin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
         double pct  = MathMax(10.0, MathMin(90.0, (double)InpTP1Percent));
         double half = MathFloor(vol * pct / 100.0 / step) * step;
         if(half >= vmin && vol - half >= vmin)
         {
            if(!trade.PositionClosePartial(ticket, half))
            {
               // Fallo transitorio (requote/off-quotes): NO marcar la bandera,
               // se reintenta completo en el siguiente tick
               Print("ORO FINAL: fallo en cierre parcial (", trade.ResultRetcode(), ") — reintento en el próximo tick");
               return;
            }
         }
         // Con lote mínimo no hay parcial: igual se protege con stop a entrada
         double atrBe = Buf(hAtr, 1);
         double bePx  = isLong ? entry + InpBeBufAtr * atrBe : entry - InpBeBufAtr * atrBe;
         if(!trade.PositionModify(ticket, NormalizeDouble(bePx, _Digits), curTP))
            Print("ORO FINAL: fallo moviendo stop a break-even (", trade.ResultRetcode(), ") — se reasegura en la gestión");
         GlobalVariableSet(kT1D, 1);
         Print("🎯 ORO FINAL: TP1 — ", DoubleToString(pct, 0), "% cerrado, stop en la entrada (sin riesgo)");
         double gan1 = MoneyFor(tp1 - entry, half);
         Notify("🎯 TP1 ALCANZADO " + _Symbol + " en " + DoubleToString(tp1, _Digits)
                + "\n" + Money(gan1) + " cobrado (" + DoubleToString(pct, 0) + "% de la posicion)"
                + "\n✅ Stop movido a la entrada: esta operacion YA NO PUEDE PERDER"
                + "\nResto " + DoubleToString(vol - half, 2) + " va a TP2 " + DoubleToString(curTP, _Digits)
                + "\nDia " + Money(AccountInfoDouble(ACCOUNT_EQUITY) - dayStartBalance));
         return;
      }
   }

   //── Asegurar el break-even si el modify falló en su momento
   if(t1Done)
   {
      bool needBe = isLong ? (curSL < entry) : (curSL == 0 || curSL > entry);
      if(needBe)
      {
         double atrBe2 = Buf(hAtr, 1);
         double beLvl  = isLong ? entry + InpBeBufAtr * atrBe2 : entry - InpBeBufAtr * atrBe2;
         if(trade.PositionModify(ticket, NormalizeDouble(beLvl, _Digits), curTP))
            curSL = beLvl;
      }
   }

   //── Trailing después del TP1
   if(t1Done && InpUseTrail)
   {
      double atr = Buf(hAtr, 1);
      if(atr > 0)
      {
         if(isLong)
         {
            double newSL = bid - g_trail * atr;
            if(newSL > curSL + _Point * 5)
               trade.PositionModify(ticket, NormalizeDouble(newSL, _Digits), curTP);
         }
         else
         {
            double newSL = ask + g_trail * atr;
            if(curSL == 0 || newSL < curSL - _Point * 5)
               trade.PositionModify(ticket, NormalizeDouble(newSL, _Digits), curTP);
         }
      }
   }

   //── Salida inteligente: una evaluación por vela, con velas de gracia
   static datetime lastHealthBar = 0;
   datetime bt = iTime(_Symbol, PERIOD_CURRENT, 0);
   if(InpUseSmart && bt != lastHealthBar)
   {
      lastHealthBar = bt;
      int barsSinceOpen = (int)((TimeCurrent() - opnT) / PeriodSeconds(PERIOD_CURRENT));
      if(barsSinceOpen >= InpGraceBars)
      {
         string motivo;
         double salud = TradeHealth(isLong, t1Done, opnT, motivo);
         if(salud < InpHealthExit)
         {
            if(trade.PositionClose(ticket))
            {
               Print("🚪 ORO FINAL: salida inteligente — salud ", DoubleToString(salud, 0), "/100 (", motivo, ")");
               Notify("🚪 ORO MEJOR SALIR ejecutado — salud " + DoubleToString(salud, 0) + "/100: " + motivo);
            }
            return;
         }
         Comment("🥇 ORO FINAL v2 | EN OPERACIÓN ", isLong ? "LONG 🟢" : "SHORT 🔴",
                 " | Salud ", DoubleToString(salud, 0), "/100 ",
                 salud >= 65 ? "✅ MANTENER" : "⚠️ VIGILAR",
                 motivo != "" ? "\nMotivo: " + motivo : "",
                 t1Done ? "\n🎯 TP1 hecho — SIN RIESGO, trailing activo" : "");
      }
   }
}
