import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/store/auth";
import { useGetZone, useListClaims } from "@workspace/api-client-react";
import { GDSGauge } from "@/components/GDSGauge";
import { ClaimBadge } from "@/components/ClaimBadge";
import { format } from "date-fns";
import { AlertTriangle, Clock, ShieldCheck, X, CloudRain, Sun, Cloud, Info, Zap, Wallet, ArrowUpRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useWalletBalance } from "@/hooks/useWallet";
import { useLocation } from "wouter";

const fallbackHourlyForecast = [
  { time: '08:00', Koramangala: 32, Indiranagar: 28, Whitefield: 20, Electronic_City: 15, HSR_Layout: 25, BTM_Layout: 30, Marathahalli: 22, Jayanagar: 18 },
  { time: '10:00', Koramangala: 35, Indiranagar: 30, Whitefield: 22, Electronic_City: 18, HSR_Layout: 28, BTM_Layout: 32, Marathahalli: 25, Jayanagar: 20 },
  { time: '12:00', Koramangala: 40, Indiranagar: 35, Whitefield: 25, Electronic_City: 20, HSR_Layout: 30, BTM_Layout: 35, Marathahalli: 28, Jayanagar: 22 },
  { time: '14:00', Koramangala: 55, Indiranagar: 45, Whitefield: 30, Electronic_City: 25, HSR_Layout: 40, BTM_Layout: 45, Marathahalli: 35, Jayanagar: 28 },
  { time: '16:00', Koramangala: 86, Indiranagar: 78, Whitefield: 45, Electronic_City: 35, HSR_Layout: 65, BTM_Layout: 75, Marathahalli: 50, Jayanagar: 40 },
  { time: '18:00', Koramangala: 60, Indiranagar: 55, Whitefield: 35, Electronic_City: 28, HSR_Layout: 45, BTM_Layout: 50, Marathahalli: 40, Jayanagar: 35 },
  { time: '20:00', Koramangala: 45, Indiranagar: 40, Whitefield: 28, Electronic_City: 22, HSR_Layout: 35, BTM_Layout: 40, Marathahalli: 30, Jayanagar: 25 },
  { time: '22:00', Koramangala: 30, Indiranagar: 28, Whitefield: 20, Electronic_City: 15, HSR_Layout: 25, BTM_Layout: 30, Marathahalli: 22, Jayanagar: 18 },
];

const fallbackPremium = {
  current_premium: 28.50,
  base_premium: 25.00,
  zone_adjustment: 5.50,
  worker_adjustment: -2.00,
  explanation: "Your premium is ₹28.50 this week because high disruption (GDS 86) is forecasted in your zone.",
};

const getRiskIcon = (score: number) => {
  if (score >= 80) return <AlertTriangle className="w-6 h-6 text-destructive" />;
  if (score >= 60) return <CloudRain className="w-6 h-6 text-warning" />;
  if (score >= 40) return <Cloud className="w-6 h-6 text-muted-foreground" />;
  return <Sun className="w-6 h-6 text-success" />;
};

// Robust matcher to sync the UI zone name with the Python AI dictionary keys
const getScoreForZone = (hourData: any, zoneName: string, fallback: number) => {
  if (!zoneName || !hourData) return fallback;
  const normalized = zoneName.toLowerCase().replace(/ /g, '_');
  const matchedKey = Object.keys(hourData).find(k => k.toLowerCase() === normalized);
  return matchedKey ? hourData[matchedKey] : fallback;
};

// Robust function to rotate the 24-hour array so the current time is exactly at index [0]
const getRotatedForecast = (data: any[]) => {
  if (!data || data.length === 0) return [];
  const currentHour = new Date().getHours();
  let activeIdx = 0;
  let maxPastHour = -1;

  for (let i = 0; i < data.length; i++) {
    const bucketHour = parseInt(data[i].time.split(':')[0], 10);
    if (bucketHour <= currentHour && bucketHour > maxPastHour) {
      maxPastHour = bucketHour;
      activeIdx = i;
    }
  }
  // Wrap around if it's earlier than the first bucket
  if (maxPastHour === -1) activeIdx = data.length - 1;

  return [...data.slice(activeIdx), ...data.slice(0, activeIdx)];
};

export function WorkerDashboard() {
  const { worker } = useAuth();
  const [, navigate] = useLocation();
  const [hideAlert, setHideAlert] = useState(false);

  const { data: zone } = useGetZone(worker?.zone_id || 'koramangala', { query: { refetchInterval: 3000, enabled: !!worker } as any });
  const { data: claimsData } = useListClaims({ worker_id: worker?.id }, { query: { refetchInterval: 5000, enabled: !!worker } as any });
  const { wallet } = useWalletBalance(worker?.id);

  const [hourlyForecast, setHourlyForecast] = useState<any[]>([]);
  const [premiumData, setPremiumData] = useState<any>(fallbackPremium);

  const workerZone = worker?.zone_id ? worker.zone_id.replace("_", " ") : "Koramangala";

  useEffect(() => {
    const fetchWorkerData = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const [premiumRes, forecastRes] = await Promise.all([
          fetch(`/api/premium/history/${worker?.id || 'worker-123'}`, { signal: controller.signal }).catch(() => null),
          fetch('/api/zones/forecast/24-hour', { signal: controller.signal }).catch(() => null)
        ]);
        clearTimeout(timeoutId);

        if (premiumRes && premiumRes.ok) {
          const data = await premiumRes.json();
          setPremiumData(data);
        }

        let rawHourlyData = fallbackHourlyForecast;
        if (forecastRes && forecastRes.ok) {
          const data = await forecastRes.json();
          if (data.forecast) rawHourlyData = data.forecast;
        }

        setHourlyForecast(getRotatedForecast(rawHourlyData));
      } catch (error) {
        setHourlyForecast(getRotatedForecast(fallbackHourlyForecast));
      }
    };
    fetchWorkerData();
  }, [worker]);

  // Determine the current risk score:
  // - The live zone.gds_score (refreshed every 3s from backend) reflects REAL disruptions triggered by the simulator
  // - The AI hourly forecast is a prediction — it should never mask an active disruption
  // So we use whichever is higher: the real backend score or the AI prediction
  const backendScore = zone?.gds_score ?? 25;
  const forecastScore = hourlyForecast.length > 0
    ? getScoreForZone(hourlyForecast[0], workerZone, 0)
    : 0;
  const currentAIScore = Math.max(backendScore, forecastScore);

  const isDanger = currentAIScore >= 60;

  useEffect(() => {
    if (isDanger) setHideAlert(false);
  }, [isDanger]);

  return (
    <AppLayout>
      <div className="space-y-8 pb-12">

        {/* Full Width Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold">Hello, {worker?.name || 'Rajesh'}!</h1>
            <p className="text-muted-foreground text-sm flex items-center gap-1 mt-1">
              <Zap className="w-4 h-4 text-primary" /> Active in {workerZone.toUpperCase()}
            </p>
          </div>
          <div className="bg-success/10 text-success p-3 rounded-full hidden md:block">
            <ShieldCheck className="w-8 h-8" />
          </div>
        </div>

        <AnimatePresence>
          {isDanger && !hideAlert && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="bg-destructive text-destructive-foreground rounded-2xl p-4 md:p-6 flex items-start gap-4 shadow-lg shadow-destructive/20 relative">
                <div className="animate-pulse bg-background/20 p-2 md:p-3 rounded-full mt-0.5">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="pr-8">
                  <h3 className="font-bold text-lg md:text-xl">DISRUPTION ACTIVE — Income Protection ON</h3>
                  <p className="text-destructive-foreground/80 text-sm md:text-base mt-1 font-medium">
                    Payouts are generating automatically for {workerZone}. Wait times excluded from your rating.
                  </p>
                </div>
                <button onClick={() => setHideAlert(true)} className="absolute top-4 right-4 text-destructive-foreground/50 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* WIDE GRID LAYOUT: Premium and Forecast side-by-side on desktop */}
        <div className="grid md:grid-cols-2 gap-6">

          {/* XGBOOST PREMIUM BOX */}
          <div className="bg-card border border-primary/20 rounded-3xl p-6 md:p-8 shadow-sm relative overflow-hidden flex flex-col justify-center">
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-primary/5 rounded-full blur-3xl pointer-events-none"></div>

            <div className="flex justify-between items-start mb-6 relative z-10">
              <div className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                This Week's Premium
              </div>
              <span className="text-[10px] font-bold bg-primary text-primary-foreground px-2.5 py-1 rounded-full uppercase tracking-wider">
                AI Priced
              </span>
            </div>

            <div className="flex items-end gap-2 mb-6 relative z-10">
              <div className="text-5xl font-display font-bold text-foreground">
                ₹{premiumData.current_premium.toFixed(2)}
              </div>
              <div className="text-base font-bold text-muted-foreground pb-1.5">/ week</div>
            </div>

            <div className="bg-muted/50 p-4 rounded-xl border border-border/50 flex gap-3 items-start relative z-10">
              <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground font-medium leading-relaxed">
                {premiumData.explanation}
              </p>
            </div>
          </div>

          {/* LSTM 24-HOUR FORECAST */}
          <div className="bg-card border border-border rounded-3xl p-6 md:p-8 shadow-sm flex flex-col justify-center">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Clock className="w-5 h-5" /> Next 24 Hours ({workerZone})
              </h2>
            </div>

            <div className="bg-muted/30 rounded-2xl border border-border/50 p-4">
              <div className="flex gap-4 overflow-x-auto pb-2 pt-1 custom-scrollbar">
                {hourlyForecast.map((hour, idx) => {
                  const score = getScoreForZone(hour, workerZone, 25);
                  const isNow = idx === 0;

                  return (
                    <div
                      key={hour.time}
                      className={`min-w-[75px] flex-shrink-0 flex flex-col items-center p-3.5 rounded-2xl transition-colors ${isNow ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted/50 border border-transparent'
                        }`}
                    >
                      <div className={`text-xs font-bold mb-3 ${isNow ? 'text-primary' : 'text-muted-foreground'}`}>
                        {isNow ? 'NOW' : hour.time}
                      </div>

                      <div className="mb-3">
                        {getRiskIcon(score)}
                      </div>

                      <div className="flex flex-col items-center">
                        <span className={`text-base font-display font-bold ${score >= 80 ? 'text-destructive' :
                          score >= 60 ? 'text-warning' : 'text-foreground'
                          }`}>
                          {score}
                        </span>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase mt-0.5">GDS</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

        </div>

        {/* BOTTOM METRICS */}
        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-card rounded-3xl p-6 border border-border shadow-sm flex flex-col items-center justify-center min-h-[240px]">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-6">Live Risk Zone</h3>
            {/* Driven strictly by the true AI score from the 0-index bucket */}
            <GDSGauge score={currentAIScore} size={160} />
          </div>

          <div className="md:col-span-2 grid grid-cols-2 gap-6">
            <div className="bg-card rounded-3xl p-6 border border-border shadow-sm flex flex-col justify-center">
              <div className="w-12 h-12 rounded-xl bg-success/10 text-success flex items-center justify-center mb-6">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground font-bold uppercase tracking-widest mb-1.5">Active Policy</div>
                <div className="text-3xl font-display font-bold">{worker?.policy_tier || 'Standard'} Tier</div>
                <div className="text-sm text-success font-medium mt-2">₹800/day coverage cap</div>
              </div>
            </div>

            <div className="bg-card rounded-3xl p-6 border border-border shadow-sm flex flex-col justify-center cursor-pointer group hover:border-primary/30 hover:shadow-md transition-all" onClick={() => navigate('/wallet')}>
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-6 group-hover:scale-105 transition-transform">
                <Wallet className="w-6 h-6" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground font-bold uppercase tracking-widest mb-1.5">Wallet Balance</div>
                <div className="text-3xl font-display font-bold">
                  {wallet ? `₹${parseFloat(wallet.balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                </div>
                <div className="text-sm text-primary font-medium mt-2 flex items-center gap-1 group-hover:gap-2 transition-all">
                  View & Withdraw <ArrowUpRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CLAIMS TABLE */}
        <div>
          <div className="flex items-center justify-between mb-4 mt-2">
            <h2 className="text-xl font-display font-bold">Recent Claims</h2>
          </div>
          <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground font-bold uppercase tracking-wider text-xs">
                <tr>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4 text-right">Amount</th>
                  <th className="px-6 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {claimsData?.claims?.slice(0, 4).map(claim => (
                  <tr key={claim.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-medium">
                      {format(new Date(claim.created_at), 'MMM dd')}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-foreground">
                      ₹{claim.payout_amount}
                    </td>
                    <td className="px-6 py-4">
                      <ClaimBadge status={claim.status} />
                    </td>
                  </tr>
                ))}
                {!claimsData?.claims?.length && (
                  <tr>
                    <td colSpan={3} className="px-6 py-12 text-center text-muted-foreground">
                      No claims history found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}