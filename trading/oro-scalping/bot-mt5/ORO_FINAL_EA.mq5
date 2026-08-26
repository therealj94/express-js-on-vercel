//+------------------------------------------------------------------+
//|                                                 ORO_FINAL_EA.mq5 |
//|     🥇 ORO FINAL ULTIMATE · Bot automático de scalping XAUUSD    |
//|                          versión 2.00                            |
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
#property version     "2.80"
#property description "Bot de scalping XAUUSD: confluencia 0-100, gestión 50/50, salida inteligente y protecciones de cuenta"

#include <Trade/Trade.mqh>

//──────────────────────────── INPUTS ────────────────────────────
input group "⚙️ General"
input long     InpMagic          = 20250823;   // Magic number del bot
input int      InpThreshold      = 70;         // Score mínimo (62 agresivo · 70 normal · 78 conservador)
input int      InpMode           = 0;          // Ventana: 0=Solo killzones · 1=Londres+NY · 2=24 horas
input int      InpCooldownMin    = 60;         // Minutos mínimos entre entradas

input group "🕐 Sesiones (HORA DEL SERVIDOR del broker)"
input string   InpLdnStart       = "08:00";    // Killzone Londres: inicio
input string   InpLdnEnd         = "11:00";    // Killzone Londres: fin
input string   InpNyStart        = "13:30";    // Killzone Nueva York: inicio
input string   InpNyEnd          = "16:30";    // Killzone Nueva York: fin
input string   InpFullStart      = "07:00";    // Londres+NY completo: inicio
input string   InpFullEnd        = "22:00";    // Londres+NY completo: fin
input int      InpOrbMinutes     = 15;         // Duración del rango de apertura (min)
input string   InpNewsBlock      = "";         // Ventanas bloqueadas "HH:MM-HH:MM" separadas por comas (opcional)
input bool     InpCloseFriday    = true;       // Cerrar todo el viernes a la hora indicada
input string   InpFridayTime     = "20:00";    // Hora de cierre del viernes (servidor)

input group "🎚 Lote y agresividad"
input int      InpLotMode        = 0;          // Lote: 0 = automático por % de riesgo · 1 = lote FIJO manual
input double   InpFixedLot       = 0.10;       // Lote fijo manual (se usa con Lote = 1)
input double   InpMaxRiskCapPct  = 5.0;        // Tope de seguridad del lote fijo (% máx. del equity en riesgo por operación)
input int      InpAggro          = 0;          // Agresividad: 0 = Normal · 1 = Agresivo · 2 = Turbo

input group "💰 Riesgo y protección de la cuenta"
input double   InpRiskPct        = 0.5;        // Riesgo por operación (% del equity)
input int      InpMaxTradesDay   = 4;          // Máximo de operaciones por día
input int      InpMaxLossesDay   = 2;          // Máximo de pérdidas por día
input double   InpMaxDailyDD     = 3.0;        // Freno de emergencia: pérdida diaria máx. (% del balance)
input double   InpDailyTarget    = 0.0;        // Objetivo diario en % (al lograrlo se detiene; 0 = apagado)
input double   InpDailyTargetUSD = 0.0;        // Objetivo diario en $ (0 = apagado). Se detiene con el primero que se cumpla
input double   InpDailyLossUSD   = 0.0;        // Límite de pérdida diaria en $ (0 = usar solo el % del freno)
input bool     InpCloseOnTarget  = true;       // Al llegar a objetivo o límite: cerrar también la posición abierta
input double   InpMaxSpreadUSD   = 0.35;       // Spread máximo aceptado ($ por onza)
input int      InpSlippagePts    = 30;         // Desviación máxima (puntos)

input group "🎯 SL / TP"
input int      InpAtrPeriod      = 14;         // Periodo ATR
input double   InpSlBufAtr       = 0.5;        // Colchón del SL (× ATR)
input double   InpMaxSlAtr       = 1.5;        // Distancia máxima del SL (× ATR)
input int      InpSwingBars      = 6;          // Velas para el swing del SL
input double   InpRR1            = 1.0;        // TP1 (× riesgo) — cierra 50% y stop a entrada
input double   InpRR2            = 2.0;        // TP2 (× riesgo) — cierre total
input bool     InpUseTrail       = true;       // Trailing por ATR después del TP1
input double   InpTrailAtr       = 1.5;        // Trailing (× ATR)
input double   InpMinSlAtr       = 0.6;        // Distancia mínima del SL (× ATR)
input double   InpBeBufAtr       = 0.1;        // Colchón del break-even (× ATR, cubre spread/comisión)
input bool     InpUseStructTP    = true;       // TP2 limitado por la estructura (swing de 4 h)
input double   InpStructBufAtr   = 0.2;        // Colchón del TP estructural (× ATR)

input group "🚪 Salida inteligente"
input bool     InpUseSmart       = true;       // Vigilar salud y cerrar si el mercado se gira
input int      InpHealthExit     = 40;         // Salud mínima antes de cerrar (0-100)
input int      InpGraceBars      = 2;          // Velas de gracia antes de poder salir por salud
input bool     InpUseTimeStop    = true;       // Contar estancamiento (~2 h sin TP1)
input int      InpStallMinutes   = 120;        // Minutos de estancamiento

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
input bool     InpPushNotify     = false;      // Push al móvil (app MetaTrader; configura tu MetaQuotes ID en Herramientas→Opciones→Notificaciones)
input bool     InpPopupAlert     = false;      // Ventana de alerta sonora en el terminal

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
   if(InpPushNotify) SendNotification(msg);
   if(InpPopupAlert) Alert(msg);
}

bool InRange(string s, string e)
{
   datetime now = TimeCurrent();
   datetime ts  = StringToTime(s);   // hoy a las HH:MM hora del servidor
   datetime te  = StringToTime(e);
   return (now >= ts && now < te);
}

bool KzLondon()  { return InRange(InpLdnStart, InpLdnEnd); }
bool KzNewYork() { return InRange(InpNyStart,  InpNyEnd);  }
bool KzActive()  { return KzLondon() || KzNewYork(); }

bool TradeWindow()
{
   if(InpMode == 2) return true;
   if(InpMode == 1) return InRange(InpFullStart, InpFullEnd);
   return KzActive();
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
   Comment("🥇 ORO FINAL v2.80 · ", _Symbol, " ", EnumToString(_Period),
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
double RiskLot(double slDistance, bool isLong, double px)
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
      double riskUSD = AccountInfoDouble(ACCOUNT_EQUITY) * g_risk / 100.0;
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
void CountToday(int &nTrades, int &nLosses)
{
   nTrades = 0; nLosses = 0;
   datetime d0 = StringToTime("00:00");
   if(!HistorySelect(d0, TimeCurrent())) return;
   int total = HistoryDealsTotal();
   double posProfit[];
   long   posIds[];

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
         posIds[sz] = pid; posProfit[sz] = 0;
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
   }
   // Pérdida = posición CERRADA con resultado neto negativo
   for(int k = 0; k < ArraySize(posIds); k++)
   {
      if(posProfit[k] >= 0) continue;
      bool stillOpen = false;
      for(int i = PositionsTotal() - 1; i >= 0; i--)
      {
         ulong tk = PositionGetTicket(i);
         if(tk != 0 && PositionGetInteger(POSITION_IDENTIFIER) == posIds[k]) { stillOpen = true; break; }
      }
      if(!stillOpen) nLosses++;
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
   g_rr2         = InpAggro == 0 ? InpRR2 : (InpAggro == 1 ? MathMax(InpRR2, 2.5) : MathMax(InpRR2, 3.0));
   g_trail       = InpAggro >= 1 ? MathMin(InpTrailAtr, 1.2) : InpTrailAtr;
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
   StatusIdle("recién iniciado, esperando el primer tick");
   Print("🥇 ORO FINAL ULTIMATE v2.80 iniciado | ", _Symbol, " ", EnumToString(_Period),
         " | Umbral ", g_thr, InpAggro == 1 ? " (AGRESIVO)" : InpAggro == 2 ? " (TURBO)" : "",
         " | Lote ", InpLotMode == 1 ? "FIJO " + DoubleToString(InpFixedLot, 2) : "auto " + DoubleToString(g_risk, 2) + "%",
         " | TP2 ", DoubleToString(g_rr2, 1), "R | Baseline $", DoubleToString(dayStartBalance, 2));
   // Resumen de protecciones: de un vistazo confirmas que TODA la configuración quedó bien
   Print("   🛡 Protecciones: freno diario ", DoubleToString(InpMaxDailyDD, 1), "%",
         InpDailyLossUSD > 0 ? " / $" + DoubleToString(InpDailyLossUSD, 0) : "",
         " | objetivo diario ", InpDailyTarget > 0 ? DoubleToString(InpDailyTarget, 1) + "%" : "apagado",
         InpDailyTargetUSD > 0 ? " / $" + DoubleToString(InpDailyTargetUSD, 0) : "",
         " | máx ", InpMaxTradesDay, " ops · ", InpMaxLossesDay, " pérdidas",
         " | salida por salud <", InpHealthExit,
         " | spread máx $", DoubleToString(InpMaxSpreadUSD, 2));
   Print("   🕐 Killzones (servidor): ", InpLdnStart, "-", InpLdnEnd, " y ", InpNyStart, "-", InpNyEnd,
         " | ventana ", InpMode == 0 ? "solo killzones" : InpMode == 1 ? "Londres+NY" : "24 horas",
         " | hora actual del servidor ", TimeToString(TimeCurrent(), TIME_MINUTES));
   // Aviso si el freno diario es tan bajo que se activaría con una sola pérdida
   if(InpLotMode == 0 && InpMaxDailyDD > 0 && InpMaxDailyDD <= g_risk * 1.05)
      Print("⚠️ ATENCIÓN: tu freno diario (", DoubleToString(InpMaxDailyDD, 1),
            "%) es igual o menor que el riesgo por operación (", DoubleToString(g_risk, 2),
            "%). El bot se detendría tras la PRIMERA pérdida. Súbelo a ",
            DoubleToString(g_risk * 2.2, 0), "% o más para permitir ", InpMaxLossesDay, " pérdidas.");
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
      Print("🥇 ORO FINAL: posición ", lastPid, " cerrada. Revisa el historial para el resultado.");
      Notify("🥇 ORO: posición cerrada — revisa el resultado en el historial");
      GlobalVariableDel("ORO_TP1_" + (string)lastPid);
      GlobalVariableDel("ORO_T1D_" + (string)lastPid);
      GlobalVariableDel("ORO_OPN_" + (string)lastPid);
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
   int nT, nL;
   CountToday(nT, nL);
   if(nT >= g_maxTrades || nL >= InpMaxLossesDay)
   {
      Comment("🛑 ORO FINAL | Límite diario: ", nT, " operaciones, ", nL, " pérdidas.");
      return;
   }
   if(lastEntryTime > 0 && (TimeCurrent() - lastEntryTime) < g_cooldownMin * 60) return;

   bool goLong  = scL >= g_thr && scL > scS && pL < g_thr;
   bool goShort = scS >= g_thr && scS > scL && pS_ < g_thr;
   if(!goLong && !goShort)
   {
      Comment("🥇 ORO FINAL v2.80 | Score L ", DoubleToString(scL, 0), " · S ", DoubleToString(scS, 0),
              " (mín. ", g_thr, ")\nHoy: ", nT, "/", g_maxTrades, " ops · ", nL, "/", InpMaxLossesDay,
              " pérdidas | ", KzActive() ? "KILLZONE 🔥" : (TradeWindow() ? "ventana normal" : "fuera de horario"),
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
void OpenTrade(bool isLong, double px, double sl, double minStop, double atr, double score)
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
   double tp1 = isLong ? px + InpRR1 * risk : px - InpRR1 * risk;
   double tp2 = isLong ? px + g_rr2 * risk : px - g_rr2 * risk;

   // TP2 profesional: si el 2R queda detrás del swing de ~4 h, el objetivo se adelanta
   // a ese nivel (menos un colchón), siempre que deje al menos 1.3R
   if(InpUseStructTP)
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

   double lot = RiskLot(risk, isLong, px);
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

   string cmt = (isLong ? "ORO L " : "ORO S ") + DoubleToString(score, 0) + "/100";
   bool ok = isLong
      ? trade.Buy(lot, _Symbol, 0, NormalizeDouble(sl, _Digits), NormalizeDouble(tp2, _Digits), cmt)
      : trade.Sell(lot, _Symbol, 0, NormalizeDouble(sl, _Digits), NormalizeDouble(tp2, _Digits), cmt);
   if(!ok)
   {
      Print("ORO FINAL: fallo al abrir (", trade.ResultRetcode(), " ", trade.ResultRetcodeDescription(), ")");
      return;
   }
   lastEntryTime = TimeCurrent();
   if(SelectOwnPosition())
   {
      long pid = PositionGetInteger(POSITION_IDENTIFIER);
      lastPid = pid;
      GlobalVariableSet("ORO_TP1_" + (string)pid, tp1);
      GlobalVariableSet("ORO_T1D_" + (string)pid, 0);
      GlobalVariableSet("ORO_OPN_" + (string)pid, (double)(long)TimeCurrent());
   }
   Print(isLong ? "🟢 ORO LONG" : "🔴 ORO SHORT", " | score ", DoubleToString(score, 0),
         " | lote ", DoubleToString(lot, 2), " | SL ", DoubleToString(sl, _Digits),
         " | TP1 ", DoubleToString(tp1, _Digits), " | TP2 ", DoubleToString(tp2, _Digits));
   Notify((isLong ? "🟢 ORO LONG " : "🔴 ORO SHORT ") + DoubleToString(score, 0) + "/100 | Entrada " + DoubleToString(px, _Digits) + " | SL " + DoubleToString(sl, _Digits) + " | TP1 " + DoubleToString(tp1, _Digits) + " | TP2 " + DoubleToString(tp2, _Digits) + " | Lote " + DoubleToString(lot, 2));
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

   //── TP1: cerrar 50% y stop al punto de entrada
   if(!t1Done && tp1 > 0)
   {
      bool hit = isLong ? (bid >= tp1) : (ask <= tp1);
      if(hit)
      {
         double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
         double vmin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
         double half = MathFloor(vol / 2.0 / step) * step;
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
         Print("🎯 ORO FINAL: TP1 — 50% cerrado, stop en la entrada (sin riesgo)");
         Notify("🎯 ORO TP1 alcanzado — 50% cobrado, stop asegurado en la entrada");
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
