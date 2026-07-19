//+------------------------------------------------------------------+
//| ORB_DualRange.mq5                                                 |
//| Dual-range Opening Range Breakout - visual signals + alerts.      |
//| Mirrors orb/strategy.py: OR15 breakout from minute 15-30,         |
//| falling back to the wider OR30 from minute 30-40 if OR15 didn't   |
//| break out. Signals-only: it never places orders, only draws       |
//| the ranges/arrows and raises alerts. You execute the trade        |
//| yourself in the platform.                                         |
//+------------------------------------------------------------------+
#property copyright ""
#property version   "1.00"
#property indicator_chart_window
#property indicator_buffers 4
#property indicator_plots   4

#property indicator_label1  "OR15 High"
#property indicator_type1   DRAW_LINE
#property indicator_color1  clrDodgerBlue
#property indicator_style1  STYLE_SOLID
#property indicator_width1  1

#property indicator_label2  "OR15 Low"
#property indicator_type2   DRAW_LINE
#property indicator_color2  clrDodgerBlue
#property indicator_style2  STYLE_SOLID
#property indicator_width2  1

#property indicator_label3  "OR30 High"
#property indicator_type3   DRAW_LINE
#property indicator_color3  clrOrange
#property indicator_style3  STYLE_SOLID
#property indicator_width3  1

#property indicator_label4  "OR30 Low"
#property indicator_type4   DRAW_LINE
#property indicator_color4  clrOrange
#property indicator_style4  STYLE_SOLID
#property indicator_width4  1

input group "Session (BROKER/SERVER time, not your local time)"
input int    SessionStartHour   = 9;    // Session start hour (server time)
input int    SessionStartMinute = 30;   // Session start minute (server time)

input group "ORB parameters"
input int    PrimaryRangeMinutes  = 15;
input int    ExtendedRangeMinutes = 30;
input int    MaxEntryMinutes      = 40;
input double RewardRiskRatio      = 2.0;
input double BreakoutBufferPct    = 0.05;  // percent

input group "Alerts"
input bool   EnablePopupAlert       = true;
input bool   EnablePushNotification = false;  // needs MetaQuotes ID set in Tools > Options > Notifications
input bool   EnableEmailAlert       = false;  // needs email set in Tools > Options > Email

double OR15HighBuf[], OR15LowBuf[], OR30HighBuf[], OR30LowBuf[];

datetime g_sessionDay      = 0;
double   g_orHigh, g_orLow, g_extHigh, g_extLow;
bool     g_orReady, g_extReady, g_tradeTaken;
datetime g_lastAlertBarTime = 0;

//+------------------------------------------------------------------+
int OnInit()
{
   SetIndexBuffer(0, OR15HighBuf, INDICATOR_DATA);
   SetIndexBuffer(1, OR15LowBuf,  INDICATOR_DATA);
   SetIndexBuffer(2, OR30HighBuf, INDICATOR_DATA);
   SetIndexBuffer(3, OR30LowBuf,  INDICATOR_DATA);

   for(int p = 0; p < 4; p++)
      PlotIndexSetDouble(p, PLOT_EMPTY_VALUE, EMPTY_VALUE);

   IndicatorSetString(INDICATOR_SHORTNAME, "Dual-Range ORB (15/30)");
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   ObjectsDeleteAll(0, "ORB_");
}

//+------------------------------------------------------------------+
datetime SessionOpenFor(datetime barTime)
{
   MqlDateTime t;
   TimeToStruct(barTime, t);
   t.hour = SessionStartHour;
   t.min  = SessionStartMinute;
   t.sec  = 0;
   return StructToTime(t);
}

datetime DayKey(datetime barTime)
{
   MqlDateTime t;
   TimeToStruct(barTime, t);
   t.hour = 0; t.min = 0; t.sec = 0;
   return StructToTime(t);
}

void DrawSignal(datetime t, bool isLong, double entry, double stop, double target, double barHigh, double barLow)
{
   string name = "ORB_" + (isLong ? "L_" : "S_") + TimeToString(t, TIME_DATE | TIME_MINUTES);
   if(ObjectFind(0, name) >= 0) return;

   double y = isLong ? barLow : barHigh;
   ObjectCreate(0, name, OBJ_ARROW, 0, t, y);
   ObjectSetInteger(0, name, OBJPROP_ARROWCODE, isLong ? 233 : 234);
   ObjectSetInteger(0, name, OBJPROP_COLOR, isLong ? clrLime : clrRed);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, 2);

   string label = (isLong ? "LONG" : "SHORT") +
                  "\nEntry "  + DoubleToString(entry, _Digits) +
                  "\nStop "   + DoubleToString(stop, _Digits) +
                  "\nTarget " + DoubleToString(target, _Digits);

   string textName = name + "_txt";
   ObjectCreate(0, textName, OBJ_TEXT, 0, t, isLong ? y - 10 * _Point : y + 10 * _Point);
   ObjectSetString(0, textName, OBJPROP_TEXT, label);
   ObjectSetInteger(0, textName, OBJPROP_COLOR, isLong ? clrLime : clrRed);
   ObjectSetInteger(0, textName, OBJPROP_FONTSIZE, 8);
}

void FireAlert(bool isLong, double entry, double stop, double target)
{
   string msg = StringFormat("ORB %s %s | entry=%s stop=%s target=%s",
                              isLong ? "LONG" : "SHORT",
                              _Symbol,
                              DoubleToString(entry, _Digits),
                              DoubleToString(stop, _Digits),
                              DoubleToString(target, _Digits));

   if(EnablePopupAlert)       Alert(msg);
   if(EnablePushNotification) SendNotification(msg);
   if(EnableEmailAlert)       SendMail("ORB Signal", msg);
}

//+------------------------------------------------------------------+
int OnCalculate(const int rates_total,
                const int prev_calculated,
                const datetime &time[],
                const double &open[],
                const double &high[],
                const double &low[],
                const double &close[],
                const long &tick_volume[],
                const long &volume[],
                const int &spread[])
{
   if(rates_total < 2) return(0);

   int closedBars = rates_total - 1;  // exclude the still-forming last bar from state/alerts
   int start = (prev_calculated > 1) ? prev_calculated - 1 : 0;

   double buf = BreakoutBufferPct / 100.0;

   for(int i = start; i < rates_total; i++)
   {
      datetime day = DayKey(time[i]);
      if(day != g_sessionDay)
      {
         g_sessionDay = day;
         g_orHigh = -DBL_MAX; g_orLow = DBL_MAX;
         g_extHigh = -DBL_MAX; g_extLow = DBL_MAX;
         g_orReady = false; g_extReady = false; g_tradeTaken = false;
      }

      bool isClosedBar = (i < closedBars);

      if(isClosedBar)
      {
         datetime sessionOpen = SessionOpenFor(time[i]);
         double minutesFromOpen = (double)(time[i] - sessionOpen) / 60.0;

         bool inPrimaryBuild  = minutesFromOpen >= 0 && minutesFromOpen < PrimaryRangeMinutes;
         bool inExtendedBuild = minutesFromOpen >= 0 && minutesFromOpen < ExtendedRangeMinutes;
         bool inPrimaryEntry  = minutesFromOpen >= PrimaryRangeMinutes && minutesFromOpen < ExtendedRangeMinutes;
         bool inExtendedEntry = minutesFromOpen >= ExtendedRangeMinutes && minutesFromOpen < MaxEntryMinutes;

         if(inPrimaryBuild)
         {
            g_orHigh = MathMax(g_orHigh, high[i]);
            g_orLow  = MathMin(g_orLow, low[i]);
            g_orReady = true;
         }
         if(inExtendedBuild)
         {
            g_extHigh = MathMax(g_extHigh, high[i]);
            g_extLow  = MathMin(g_extLow, low[i]);
            g_extReady = true;
         }

         if(!g_tradeTaken)
         {
            bool longSig = false, shortSig = false, usedPrimary = false;

            if(inPrimaryEntry && g_orReady)
            {
               if(close[i] > g_orHigh * (1 + buf))      { longSig  = true; usedPrimary = true; }
               else if(close[i] < g_orLow * (1 - buf))  { shortSig = true; usedPrimary = true; }
            }
            if(!longSig && !shortSig && inExtendedEntry && g_extReady)
            {
               if(close[i] > g_extHigh * (1 + buf))      longSig  = true;
               else if(close[i] < g_extLow * (1 - buf))  shortSig = true;
            }

            if(longSig || shortSig)
            {
               g_tradeTaken = true;
               double entry  = close[i];
               double stop   = longSig ? (usedPrimary ? g_orLow : g_extLow) : (usedPrimary ? g_orHigh : g_extHigh);
               double risk   = MathAbs(entry - stop);
               double target = longSig ? entry + RewardRiskRatio * risk : entry - RewardRiskRatio * risk;

               DrawSignal(time[i], longSig, entry, stop, target, high[i], low[i]);

               // Only alert for genuinely fresh breakouts, not the replay that happens
               // when the indicator (re)computes the full history on load.
               bool isRecentBar = (TimeCurrent() - time[i]) < 2 * PeriodSeconds();
               if(isRecentBar && g_lastAlertBarTime != time[i])
               {
                  g_lastAlertBarTime = time[i];
                  FireAlert(longSig, entry, stop, target);
               }
            }
         }
      }

      OR15HighBuf[i] = g_orReady  ? g_orHigh  : EMPTY_VALUE;
      OR15LowBuf[i]  = g_orReady  ? g_orLow   : EMPTY_VALUE;
      OR30HighBuf[i] = g_extReady ? g_extHigh : EMPTY_VALUE;
      OR30LowBuf[i]  = g_extReady ? g_extLow  : EMPTY_VALUE;
   }

   return(rates_total);
}
