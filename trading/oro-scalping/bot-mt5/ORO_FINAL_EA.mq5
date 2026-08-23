//+------------------------------------------------------------------+
//|                                                 ORO_FINAL_EA.mq5 |
//|        🥇 ORO FINAL · Bot automático de scalping XAUUSD          |
//|                                                                  |
//|  Misma lógica que el indicador ORO FINAL de TradingView:         |
//|   · Score de entrada 0-100 con 10 factores + penalizaciones     |
//|   · Solo opera en killzones (configurable a 24h)                 |
//|   · SL por estructura + ATR · TP1 cierra 50% y stop a entrada    |
//|   · TP2 con trailing por ATR · Salida inteligente por salud      |
//|   · Lote calculado por % de riesgo · Límites diarios             |
//|                                                                  |
//|  Protecciones de cuenta (pensadas para brokers como Exness):     |
//|   · Máx. 4 operaciones/día, sin martingala, sin grid             |
//|   · Siempre con Stop Loss · Filtro de spread máximo              |
//|   · Freno de emergencia por pérdida diaria (% de equity)         |
//|   · Una sola posición a la vez · Magic number propio             |
//+------------------------------------------------------------------+
#property copyright   "ORO FINAL"
#property version     "1.00"
#property description "Bot de scalping XAUUSD con score de confluencia, gestión 50/50 y salida inteligente"

#include <Trade/Trade.mqh>

//──────────────────────────── INPUTS ────────────────────────────
input group "⚙️ General"
input long     InpMagic          = 20250823;             // Magic number (identifica las órdenes del bot)
input int      InpThreshold      = 70;                   // Score mínimo para entrar (62 agresivo · 70 normal · 78 conservador)
input int      InpMode           = 0;                    // Ventana: 0=Solo killzones · 1=Londres+NY · 2=24 horas
input int      InpCooldownMin    = 60;                   // Minutos mínimos entre entradas

input group "🕐 Sesiones (HORA DEL SERVIDOR del broker — verifica la tuya)"
input string   InpLdnStart       = "08:00";              // Killzone Londres: inicio
input string   InpLdnEnd         = "11:00";              // Killzone Londres: fin
input string   InpNyStart        = "13:30";              // Killzone Nueva York: inicio
input string   InpNyEnd          = "16:30";              // Killzone Nueva York: fin
input string   InpFullStart      = "07:00";              // Londres+NY completo: inicio
input string   InpFullEnd        = "22:00";              // Londres+NY completo: fin
input int      InpOrbMinutes     = 15;                   // Duración del rango de apertura (min)

input group "💰 Riesgo y protección de la cuenta"
input double   InpRiskPct        = 0.5;                  // Riesgo por operación (% del equity)
input int      InpMaxTradesDay   = 4;                    // Máximo de operaciones por día
input int      InpMaxLossesDay   = 2;                    // Máximo de pérdidas por día
input double   InpMaxDailyDD     = 3.0;                  // Freno de emergencia: pérdida diaria máx. (% del balance)
input double   InpMaxSpreadUSD   = 0.35;                 // Spread máximo aceptado ($ por onza)
input int      InpSlippagePts    = 30;                   // Desviación máxima permitida (puntos)

input group "🎯 SL / TP"
input int      InpAtrPeriod      = 14;                   // Periodo ATR
input double   InpSlBufAtr       = 0.5;                  // Colchón del SL (× ATR)
input double   InpMaxSlAtr       = 1.5;                  // Distancia máxima del SL (× ATR)
input int      InpSwingBars      = 6;                    // Velas para el swing del SL
input double   InpRR1            = 1.0;                  // TP1 (× riesgo) — cierra 50% y stop a entrada
input double   InpRR2            = 2.0;                  // TP2 (× riesgo) — cierre total
input bool     InpUseTrail       = true;                 // Trailing por ATR después del TP1
input double   InpTrailAtr       = 1.5;                  // Trailing (× ATR)

input group "🚪 Salida inteligente"
input bool     InpUseSmart       = true;                 // Vigilar salud y cerrar si el mercado se gira
input int      InpHealthExit     = 40;                   // Salud mínima antes de cerrar (0-100)
input bool     InpUseTimeStop    = true;                 // Contar estancamiento (~2 h sin TP1)
input int      InpStallMinutes   = 120;                  // Minutos de estancamiento

input group "📈 Indicadores"
input int      InpEmaFast        = 9;                    // EMA rápida
input int      InpEmaSlow        = 21;                   // EMA lenta
input int      InpEmaBias        = 200;                  // EMA de sesgo
input int      InpRsiPeriod      = 14;                   // RSI
input int      InpAdxPeriod      = 14;                   // ADX
input int      InpRsiExtreme     = 76;                   // RSI extremo (penaliza entrar tarde)
input double   InpVwapExtAtr     = 2.0;                  // Extensión máxima del VWAP (× ATR)
input double   InpVolStrong      = 1.3;                  // Volumen fuerte (× media de 20)

//──────────────────────────── ESTADO ────────────────────────────
CTrade    trade;
int       hEmaF, hEmaS, hEmaB, hRsi, hAtr, hAdx;
int       hM15F, hM15S, hH1F, hH1S;
datetime  lastBarTime   = 0;
datetime  lastEntryTime = 0;
datetime  dayStart      = 0;
double    dayStartBalance = 0;
int       tradesToday   = 0;
// Rango de apertura
datetime  kzOpenTime    = 0;
double    orbHigh = 0, orbLow = 0;
bool      wasInKz       = false;

//──────────────────────────── UTILIDADES ────────────────────────────
double Buf(int handle, int shift)
{
   double b[1];
   if(CopyBuffer(handle, 0, shift, 1, b) != 1) return 0.0;
   return b[0];
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

// VWAP de la sesión diaria calculado a mano (MT5 no lo trae nativo)
double SessionVWAP()
{
   datetime d0 = StringToTime("00:00");
   MqlRates r[];
   int n = CopyRates(_Symbol, PERIOD_CURRENT, d0, TimeCurrent(), r);
   if(n <= 0) return SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double pv = 0, vv = 0;
   for(int i = 0; i < n; i++)
   {
      double tp  = (r[i].high + r[i].low + r[i].close) / 3.0;
      double vol = (double)r[i].tick_volume;
      pv += tp * vol;
      vv += vol;
   }
   return vv > 0 ? pv / vv : SymbolInfoDouble(_Symbol, SYMBOL_BID);
}

double RelVolume()
{
   long v[];
   int n = CopyTickVolume(_Symbol, PERIOD_CURRENT, 1, 21, v);
   if(n < 21) return 1.0;
   double avg = 0;
   for(int i = 0; i < 20; i++) avg += (double)v[i];
   avg /= 20.0;
   return avg > 0 ? (double)v[20] / avg : 1.0;   // v[20] = vela cerrada más reciente
}

//──────────────────────────── SCORE 0-100 ────────────────────────────
// 10 factores (sin DXY, que no está en MT5 de forma fiable) + penalizaciones
void GetScores(double &scL, double &scS, int shift)
{
   double emaF = Buf(hEmaF, shift), emaS = Buf(hEmaS, shift), emaB = Buf(hEmaB, shift);
   double rsi  = Buf(hRsi,  shift), atr  = Buf(hAtr,  shift), adx  = Buf(hAdx, shift);
   double m15F = Buf(hM15F, 1),     m15S = Buf(hM15S, 1);
   double h1F  = Buf(hH1F,  1),     h1S  = Buf(hH1S,  1);
   double vwap = SessionVWAP();
   double relV = RelVolume();

   double c = iClose(_Symbol, PERIOD_CURRENT, shift);
   double o = iOpen(_Symbol, PERIOD_CURRENT, shift);
   double h = iHigh(_Symbol, PERIOD_CURRENT, shift);
   double l = iLow(_Symbol, PERIOD_CURRENT, shift);

   // Pesos (reescalados sin el factor DXY)
   double W_T = 15, W_H1 = 8, W_H2 = 7, W_M = 13, W_B = 12, W_A = 10, W_S = 12, W_C = 8, W_V = 7, W_R = 4;
   double maxPts = W_T + W_H1 + W_H2 + W_M + W_B + W_A + W_S + W_C + W_V + W_R;

   bool trendFullL = emaF > emaS && c > emaB;
   bool trendFullS = emaF < emaS && c < emaB;

   // Ruptura: rango de apertura en killzone, máximo/mínimo de la última hora fuera
   bool brkL = false, brkS = false;
   bool orbReady = KzActive() && kzOpenTime > 0 && (TimeCurrent() - kzOpenTime) >= InpOrbMinutes * 60 && orbHigh > 0;
   if(orbReady) { brkL = c > orbHigh; brkS = c < orbLow; }
   else if(!KzActive())
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
   double pR = W_R;   // percentil de ATR simplificado: activo si el ATR no es extremo
   double atrNow = atr, atrRef = Buf(hAtr, shift + 50);
   if(atrRef > 0 && (atrNow < atrRef * 0.4 || atrNow > atrRef * 3.0)) pR = W_R * 0.25;

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
double TradeHealth(bool isLong, bool t1Done, datetime openTime)
{
   double emaF = Buf(hEmaF, 1), emaS = Buf(hEmaS, 1);
   double rsi  = Buf(hRsi, 1),  adx  = Buf(hAdx, 1);
   double vwap = SessionVWAP();
   double c = iClose(_Symbol, PERIOD_CURRENT, 1);
   double o = iOpen(_Symbol, PERIOD_CURRENT, 1);
   double h = iHigh(_Symbol, PERIOD_CURRENT, 1);
   double l = iLow(_Symbol, PERIOD_CURRENT, 1);
   double rng = MathMax(h - l, _Point);
   bool candBull = c > o && (c - o) / rng >= 0.5;
   bool candBear = c < o && (o - c) / rng >= 0.5;
   bool stalled  = InpUseTimeStop && !t1Done && (TimeCurrent() - openTime) > InpStallMinutes * 60;

   double s = 100.0;
   if(isLong)
   {
      if(c < vwap)     s -= 25;
      if(emaF < emaS)  s -= 30;
      if(rsi < 45)     s -= 15;
      if(candBear)     s -= 10;
   }
   else
   {
      if(c > vwap)     s -= 25;
      if(emaF > emaS)  s -= 30;
      if(rsi > 55)     s -= 15;
      if(candBull)     s -= 10;
   }
   if(adx < 15) s -= 10;
   if(stalled)  s -= 20;
   return MathMax(0.0, s);
}

//──────────────────────────── LOTE POR RIESGO ────────────────────────────
double RiskLot(double slDistance)
{
   double riskUSD  = AccountInfoDouble(ACCOUNT_EQUITY) * InpRiskPct / 100.0;
   double tickVal  = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   if(tickVal <= 0 || tickSize <= 0 || slDistance <= 0) return 0.0;
   double lossPerLot = slDistance / tickSize * tickVal;
   double lot = riskUSD / lossPerLot;
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double vmin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double vmax = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   lot = MathFloor(lot / step) * step;
   if(lot < vmin) return 0.0;    // riesgo demasiado pequeño para el lote mínimo: no forzar
   return MathMin(lot, vmax);
}

//──────────────────────────── CONTADORES DEL DÍA ────────────────────────────
void CountToday(int &nTrades, int &nLosses)
{
   nTrades = 0; nLosses = 0;
   datetime d0 = StringToTime("00:00");
   if(!HistorySelect(d0, TimeCurrent())) return;
   int total = HistoryDealsTotal();
   double posProfit[]; long posIds[];
   for(int i = 0; i < total; i++)
   {
      ulong dTicket = HistoryDealGetTicket(i);
      if(HistoryDealGetInteger(dTicket, DEAL_MAGIC) != InpMagic) continue;
      long entry = HistoryDealGetInteger(dTicket, DEAL_ENTRY);
      long pid   = HistoryDealGetInteger(dTicket, DEAL_POSITION_ID);
      if(entry == DEAL_ENTRY_IN) nTrades++;
      if(entry == DEAL_ENTRY_OUT)
      {
         double pf = HistoryDealGetDouble(dTicket, DEAL_PROFIT)
                   + HistoryDealGetDouble(dTicket, DEAL_SWAP)
                   + HistoryDealGetDouble(dTicket, DEAL_COMMISSION);
         int idx = -1;
         for(int k = 0; k < ArraySize(posIds); k++) if(posIds[k] == pid) { idx = k; break; }
         if(idx < 0)
         {
            int sz = ArraySize(posIds);
            ArrayResize(posIds, sz + 1); ArrayResize(posProfit, sz + 1);
            posIds[sz] = pid; posProfit[sz] = 0; idx = sz;
         }
         posProfit[idx] += pf;
      }
   }
   // Una posición cuenta como pérdida solo si su resultado neto total fue negativo
   // (y solo si ya está cerrada: sin posición abierta con ese id)
   for(int k = 0; k < ArraySize(posIds); k++)
      if(posProfit[k] < 0 && !PositionSelectByTicket(posIds[k])) nLosses++;
}

//──────────────────────────── INIT / DEINIT ────────────────────────────
int OnInit()
{
   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(InpSlippagePts);
   trade.SetTypeFillingBySymbol(_Symbol);

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
   dayStartBalance = AccountInfoDouble(ACCOUNT_BALANCE);
   Print("🥇 ORO FINAL EA iniciado en ", _Symbol, " ", EnumToString(_Period),
         " | Umbral ", InpThreshold, " | Riesgo ", DoubleToString(InpRiskPct, 2), "%");
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason) {}

//──────────────────────────── LÓGICA PRINCIPAL ────────────────────────────
void OnTick()
{
   //── Nuevo día: resetear referencia del freno de emergencia
   datetime d0 = StringToTime("00:00");
   if(d0 != dayStart)
   {
      dayStart = d0;
      dayStartBalance = AccountInfoDouble(ACCOUNT_BALANCE);
   }

   //── Rango de apertura de la killzone
   bool inKz = KzActive();
   if(inKz && !wasInKz)
   {
      kzOpenTime = TimeCurrent();
      orbHigh = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      orbLow  = orbHigh;
   }
   if(inKz && kzOpenTime > 0 && (TimeCurrent() - kzOpenTime) < InpOrbMinutes * 60)
   {
      double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      if(bid > orbHigh) orbHigh = bid;
      if(bid < orbLow)  orbLow  = bid;
   }
   wasInKz = inKz;

   //── Gestión de la posición abierta (cada tick)
   ManagePosition();

   //── Entradas: solo al abrir una vela nueva (señal de vela cerrada, sin repintado)
   datetime bt = iTime(_Symbol, PERIOD_CURRENT, 0);
   if(bt == lastBarTime) return;
   lastBarTime = bt;

   if(PositionSelect(_Symbol) && PositionGetInteger(POSITION_MAGIC) == InpMagic) return; // una posición a la vez
   if(!TradeWindow()) return;
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) || !MQLInfoInteger(MQL_TRADE_ALLOWED)) return;

   //── Protecciones
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   if(ask - bid > InpMaxSpreadUSD) return;                       // spread demasiado alto (noticia/madrugada)
   double eq = AccountInfoDouble(ACCOUNT_EQUITY);
   if(eq < dayStartBalance * (1.0 - InpMaxDailyDD / 100.0))      // freno de emergencia diario
   {
      Comment("🛑 ORO FINAL: freno diario activado (pérdida > ", DoubleToString(InpMaxDailyDD, 1), "%). Sin nuevas entradas hoy.");
      return;
   }
   int nT, nL;
   CountToday(nT, nL);
   if(nT >= InpMaxTradesDay || nL >= InpMaxLossesDay)
   {
      Comment("🛑 ORO FINAL: límite diario alcanzado (", nT, " operaciones, ", nL, " pérdidas).");
      return;
   }
   if(lastEntryTime > 0 && (TimeCurrent() - lastEntryTime) < InpCooldownMin * 60) return;

   //── Score sobre la vela cerrada, con disparo por flanco
   double scL, scS, scLprev, scSprev;
   GetScores(scL, scS, 1);
   GetScores(scLprev, scSprev, 2);

   bool goLong  = scL >= InpThreshold && scL > scS && scLprev < InpThreshold;
   bool goShort = scS >= InpThreshold && scS > scL && scSprev < InpThreshold;
   if(!goLong && !goShort)
   {
      Comment("🥇 ORO FINAL | Score L ", DoubleToString(scL, 0), " · S ", DoubleToString(scS, 0),
              " (mín. ", InpThreshold, ") | Hoy: ", nT, " ops, ", nL, " pérdidas | ",
              inKz ? "KILLZONE 🔥" : "fuera de killzone");
      return;
   }

   //── SL por estructura + ATR
   double atr = Buf(hAtr, 1);
   if(atr <= 0) return;
   int iLo = iLowest(_Symbol, PERIOD_CURRENT, MODE_LOW,  InpSwingBars, 1);
   int iHi = iHighest(_Symbol, PERIOD_CURRENT, MODE_HIGH, InpSwingBars, 1);
   if(iLo < 0 || iHi < 0) return;
   double swingLo = iLow(_Symbol, PERIOD_CURRENT, iLo);
   double swingHi = iHigh(_Symbol, PERIOD_CURRENT, iHi);

   if(goLong)
   {
      double sl = MathMax(swingLo - InpSlBufAtr * atr, ask - InpMaxSlAtr * atr);
      double risk = ask - sl;
      if(risk <= 0) return;
      double tp1 = ask + InpRR1 * risk;
      double tp2 = ask + InpRR2 * risk;
      double lot = RiskLot(risk);
      if(lot <= 0) { Print("ORO FINAL: lote de riesgo menor que el mínimo — entrada omitida"); return; }
      if(trade.Buy(lot, _Symbol, 0, NormalizeDouble(sl, _Digits), NormalizeDouble(tp2, _Digits),
                   "ORO L " + DoubleToString(scL, 0) + "/100"))
      {
         lastEntryTime = TimeCurrent();
         if(PositionSelect(_Symbol))
         {
            long pid = PositionGetInteger(POSITION_IDENTIFIER);
            GlobalVariableSet("ORO_TP1_" + (string)pid, tp1);
            GlobalVariableSet("ORO_T1D_" + (string)pid, 0);
            GlobalVariableSet("ORO_OPN_" + (string)pid, (double)(long)TimeCurrent());
         }
         Print("🟢 ORO LONG | score ", DoubleToString(scL, 0), " | lote ", DoubleToString(lot, 2),
               " | SL ", DoubleToString(sl, _Digits), " | TP1 ", DoubleToString(tp1, _Digits),
               " | TP2 ", DoubleToString(tp2, _Digits));
      }
   }
   else if(goShort)
   {
      double sl = MathMin(swingHi + InpSlBufAtr * atr, bid + InpMaxSlAtr * atr);
      double risk = sl - bid;
      if(risk <= 0) return;
      double tp1 = bid - InpRR1 * risk;
      double tp2 = bid - InpRR2 * risk;
      double lot = RiskLot(risk);
      if(lot <= 0) { Print("ORO FINAL: lote de riesgo menor que el mínimo — entrada omitida"); return; }
      if(trade.Sell(lot, _Symbol, 0, NormalizeDouble(sl, _Digits), NormalizeDouble(tp2, _Digits),
                    "ORO S " + DoubleToString(scS, 0) + "/100"))
      {
         lastEntryTime = TimeCurrent();
         if(PositionSelect(_Symbol))
         {
            long pid = PositionGetInteger(POSITION_IDENTIFIER);
            GlobalVariableSet("ORO_TP1_" + (string)pid, tp1);
            GlobalVariableSet("ORO_T1D_" + (string)pid, 0);
            GlobalVariableSet("ORO_OPN_" + (string)pid, (double)(long)TimeCurrent());
         }
         Print("🔴 ORO SHORT | score ", DoubleToString(scS, 0), " | lote ", DoubleToString(lot, 2),
               " | SL ", DoubleToString(sl, _Digits), " | TP1 ", DoubleToString(tp1, _Digits),
               " | TP2 ", DoubleToString(tp2, _Digits));
      }
   }
}

//──────────────────────────── GESTIÓN DE LA POSICIÓN ────────────────────────────
void ManagePosition()
{
   if(!PositionSelect(_Symbol)) return;
   if(PositionGetInteger(POSITION_MAGIC) != InpMagic) return;

   long   pid    = PositionGetInteger(POSITION_IDENTIFIER);
   bool   isLong = PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY;
   double entry  = PositionGetDouble(POSITION_PRICE_OPEN);
   double curSL  = PositionGetDouble(POSITION_SL);
   double curTP  = PositionGetDouble(POSITION_TP);
   double vol    = PositionGetDouble(POSITION_VOLUME);
   double bid    = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask    = SymbolInfoDouble(_Symbol, SYMBOL_ASK);

   string kTP1 = "ORO_TP1_" + (string)pid;
   string kT1D = "ORO_T1D_" + (string)pid;
   string kOPN = "ORO_OPN_" + (string)pid;
   double tp1     = GlobalVariableCheck(kTP1) ? GlobalVariableGet(kTP1) : 0;
   bool   t1Done  = GlobalVariableCheck(kT1D) && GlobalVariableGet(kT1D) > 0.5;
   datetime opnT  = GlobalVariableCheck(kOPN) ? (datetime)(long)GlobalVariableGet(kOPN) : (datetime)PositionGetInteger(POSITION_TIME);

   //── Cierre por fin de ventana operable (sin posiciones nocturnas)
   if(InpMode != 2 && !TradeWindow())
   {
      trade.PositionClose(_Symbol);
      Print("ORO FINAL: cierre por fin de ventana operable");
      return;
   }

   //── TP1: cerrar 50% y mover el stop al punto de entrada
   if(!t1Done && tp1 > 0)
   {
      bool hit = isLong ? (bid >= tp1) : (ask <= tp1);
      if(hit)
      {
         double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
         double vmin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
         double half = MathFloor(vol / 2.0 / step) * step;
         if(half >= vmin && vol - half >= vmin)
            trade.PositionClosePartial(_Symbol, half);
         trade.PositionModify(_Symbol, NormalizeDouble(entry, _Digits), curTP);
         GlobalVariableSet(kT1D, 1);
         Print("🎯 ORO FINAL: TP1 alcanzado — 50% cerrado, stop en la entrada (sin riesgo)");
         return;
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
            double newSL = bid - InpTrailAtr * atr;
            if(newSL > curSL + _Point * 5)
               trade.PositionModify(_Symbol, NormalizeDouble(newSL, _Digits), curTP);
         }
         else
         {
            double newSL = ask + InpTrailAtr * atr;
            if(curSL == 0 || newSL < curSL - _Point * 5)
               trade.PositionModify(_Symbol, NormalizeDouble(newSL, _Digits), curTP);
         }
      }
   }

   //── Salida inteligente: solo se evalúa una vez por vela
   static datetime lastHealthBar = 0;
   datetime bt = iTime(_Symbol, PERIOD_CURRENT, 0);
   if(InpUseSmart && bt != lastHealthBar)
   {
      lastHealthBar = bt;
      double salud = TradeHealth(isLong, t1Done, opnT);
      if(salud < InpHealthExit)
      {
         trade.PositionClose(_Symbol);
         Print("🚪 ORO FINAL: salida inteligente — salud ", DoubleToString(salud, 0),
               "/100, el mercado se giró antes del stop");
      }
      else
         Comment("🥇 ORO FINAL | EN OPERACIÓN ", isLong ? "LONG 🟢" : "SHORT 🔴",
                 " | Salud ", DoubleToString(salud, 0), "/100 ",
                 salud >= 65 ? "✅ MANTENER" : "⚠️ VIGILAR",
                 t1Done ? " | TP1 hecho — SIN RIESGO" : "");
   }
}
