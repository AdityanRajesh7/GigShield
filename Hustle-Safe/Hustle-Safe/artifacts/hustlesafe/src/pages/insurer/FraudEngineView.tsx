import { useState, useMemo, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useGetFraudAuditLog, useListClaims } from "@workspace/api-client-react";
import { 
  Zap, ShieldAlert, Cpu, Activity, 
  MapPin, CloudRain, Users, History, 
  Fingerprint, Navigation, Radio, Waves, 
  Clock, Share2, Search, CheckCircle2, 
  XCircle, AlertTriangle, ArrowRight, Layers
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type FraudContextResponse = {
  analysis_summary?: string;
  worker_trust?: string;
  zone_gds?: number;
  critical_flags?: string[];
};

type PipelineLogLine = {
  t: string;
  m: string;
};

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseNumeric(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function buildPipelineLogs(params: {
  claimId?: string;
  finalScore: number;
  pass1: number;
  pass2: number;
  xgb: number;
  tier: string;
  signalCount: number;
  hasAudit: boolean;
}): PipelineLogLine[] {
  if (!params.claimId) {
    return [{ t: "--:--:--", m: "Select a claim to inspect the fraud pipeline trace." }];
  }

  if (!params.hasAudit) {
    return [{ t: "--:--:--", m: "No fraud audit log found yet for this claim." }];
  }

  return [
    { t: "LIVE", m: `INGEST: Claim ${params.claimId.slice(0, 8)} received by fraud pipeline.` },
    { t: "LIVE", m: `PASS 1: Heuristic score computed at ${params.pass1.toFixed(3)}.` },
    {
      t: "LIVE",
      m: params.pass1 >= 0.4
        ? `PASS 2: Triggered with adversarial score ${params.pass2.toFixed(3)}.`
        : "PASS 2: Bypassed because Pass 1 score is below threshold 0.40."
    },
    { t: "LIVE", m: `ML: XGBoost fraud probability ${params.xgb.toFixed(3)}.` },
    { t: "LIVE", m: `SIGNALS: ${params.signalCount} individual signal scores captured.` },
    { t: "LIVE", m: `GATEKEEPER: Final score ${params.finalScore.toFixed(3)} => ${params.tier}.` },
  ];
}

const SIGNALS_META = [
  { id: "gps_match", name: "S1 — GPS Location Match", icon: MapPin, pass: 1, weight: 0.40, description: "Difference between centroid and live GPS." },
  { id: "weather_correlation", name: "S2 — Weather Correlation", icon: CloudRain, pass: 1, weight: 0.30, description: "Check if reported weather exists at GPS point." },
  { id: "peer_activity", name: "S3 — Peer Activity Check", icon: Users, pass: 1, weight: 0.15, description: "Delivery volume in zone vs expected." },
  { id: "device_fingerprint", name: "S5 — Device Fingerprint", icon: Fingerprint, pass: 1, weight: 0.10, description: "UPI/Device ID shared across accounts." },
  { id: "historical_pattern", name: "S4 — Historical Pattern", icon: History, pass: 1, weight: 0.05, description: "Claim frequency vs cohort baseline." },
  { id: "signal_6_gps_coherence", name: "S6 — GPS Coherence", icon: Navigation, pass: 2, weight: 0.15, description: "Trajectory alignment with road geometry." },
  { id: "signal_7_cell_discordance", name: "S7 — Cell Discordance", icon: Waves, pass: 2, weight: 0.20, critical: true, description: "1.5km+ gap between cell and GPS." },
  { id: "signal_8_accelerometer", name: "S8 — Accelerometer", icon: Activity, pass: 2, weight: 0.15, description: "Near-zero variance indicates stationary." },
  { id: "signal_9_pre_disruption", name: "S9 — Pre-shift Verif.", icon: Clock, pass: 2, weight: 0.15, description: "Presence check 60m before disruption." },
  { id: "signal_10_coordinated_ring", name: "S10 — Coordinated Ring", icon: Share2, pass: 2, weight: 0.10, critical: true, description: "Graph analysis for cluster detection." },
  { id: "signal_11_zone_novelty", name: "S11 — Zone Novelty", icon: Zap, pass: 2, weight: 0.15, description: "Operations in novel zones (Penalty)." },
  { id: "signal_12_gps_anomaly", name: "S12 — App Integrity", icon: Radio, pass: 2, weight: 0.10, critical: true, description: "Consistency checks for app telemetry integrity." },
];

export function InsurerFraudEngine() {
  const { data: claimsData } = useListClaims({ limit: 50 });
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [fraudContext, setFraudContext] = useState<FraudContextResponse | null>(null);
  const [showLogs, setShowLogs] = useState(false);

  const selectedClaim = useMemo(() => {
    return (claimsData?.claims?.find(c => c.id === selectedClaimId) || claimsData?.claims?.[0]) as any;
  }, [claimsData, selectedClaimId]);

  const claimId = selectedClaim?.id ?? "";
  const { data: auditLogs } = useGetFraudAuditLog(claimId, {
    query: {
      enabled: Boolean(claimId),
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    }
  });

  const latestAudit = useMemo(() => {
    if (auditLogs && auditLogs.length > 0) return auditLogs[0];
    return null;
  }, [auditLogs]);

  useEffect(() => {
    if (!claimId) {
      setFraudContext(null);
      return;
    }

    const fetchContext = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/claims/${claimId}/fraud-context`);
        if (res.ok) {
          const data = await res.json();
          setFraudContext(data);
        } else {
          setFraudContext(null);
        }
      } catch (err) {
        console.error("Failed to fetch fraud context", err);
        setFraudContext(null);
      }
    };

    fetchContext();
  }, [claimId]);

  const signals = ((latestAudit?.signals || {}) as Record<string, unknown>);
  const pass1ScoreRaw = parseNumeric(latestAudit?.pass1_composite);
  const pass2ScoreRaw = parseNumeric(latestAudit?.pass2_composite);
  const xgbScoreRaw = parseNumeric(latestAudit?.xgboost_score);
  const claimFinalScoreRaw = parseNumeric(selectedClaim?.fraud_score);
  const pass1ScoreValue = pass1ScoreRaw ?? 0;
  const pass2ScoreValue = pass2ScoreRaw ?? 0;
  const xgbScoreValue = xgbScoreRaw ?? 0;
  const finalScore = claimFinalScoreRaw ?? 0;
  const pass2Fired = pass1ScoreRaw !== null && pass1ScoreRaw >= 0.40;
  const resolutionTier = (latestAudit?.resolution_tier || "--") as string;
  const analysisSummary = fraudContext?.analysis_summary || "--";

  const pipelineLogs = useMemo(() => buildPipelineLogs({
    claimId,
    finalScore,
    pass1: pass1ScoreValue,
    pass2: pass2ScoreValue,
    xgb: xgbScoreValue,
    tier: resolutionTier,
    signalCount: Object.keys(signals).length,
    hasAudit: Boolean(latestAudit),
  }), [claimId, finalScore, pass1ScoreValue, pass2ScoreValue, xgbScoreValue, resolutionTier, signals, latestAudit]);

  return (
    <AppLayout>
      <div className="space-y-8 pb-12">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold">Fraud Detection Engine</h1>
            <p className="text-muted-foreground mt-1 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-primary" /> Multi-pass Adversarial Pipeline (V2.1 Aligned)
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input 
                type="text" 
                placeholder="Search by Claim ID..." 
                className="pl-9 pr-4 py-2 bg-card border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 outline-none w-[240px]"
              />
            </div>
            <Button 
              variant="outline" 
              className="font-bold border-primary text-primary hover:bg-primary/5"
              onClick={() => setShowLogs(true)}
            >
              Live Pipeline Logs
            </Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          
          {/* Left Column: Claims Queue / Sidebar */}
          <div className="space-y-6">
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
              <div className="p-4 bg-muted/50 border-b border-border flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Inbound Signals</span>
                <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-bold rounded">LIVE</span>
              </div>
              <div className="max-h-[600px] overflow-y-auto">
                {claimsData?.claims?.map(claim => (
                  <button
                    key={claim.id}
                    onClick={() => setSelectedClaimId(claim.id)}
                    className={cn(
                      "w-full text-left p-4 border-b border-border/50 transition-all hover:bg-muted/30",
                      selectedClaimId === claim.id && "bg-primary/[0.03] border-l-4 border-l-primary"
                    )}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-bold text-sm truncate max-w-[140px]">{claim.worker_name}</span>
                      <span className={cn(
                        "text-[10px] font-bold px-1.5 py-0.5 rounded",
                        parseFloat(String(claim.fraud_score)) > 0.7 
                          ? "bg-destructive/10 text-destructive" 
                          : parseFloat(String(claim.fraud_score)) > 0.4 
                            ? "bg-warning/10 text-warning" 
                            : "bg-success/10 text-success"
                      )}>
                        {parseFloat(String(claim.fraud_score || 0)).toFixed(2)}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-tight flex items-center gap-2">
                      <span>{claim.id.slice(0, 8)}</span>
                      <span>•</span>
                      <span>{claim.zone_name?.replace(/_/g, ' ')}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6">
              <h3 className="text-sm font-bold text-foreground mb-4">Baseline Resolution</h3>
              <p className="text-xs text-muted-foreground leading-relaxed mb-6">
                For amber-band claims where signals are frequency-related, the system recommends:
              </p>
              <Button className="w-full bg-primary text-primary-foreground font-bold hover:bg-primary/90 flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Resolve in Favour of Worker
              </Button>
              <p className="text-[10px] text-muted-foreground mt-4 text-center italic">
                *Primary insurer action for maintaining gig worker trust score.
              </p>
            </div>
          </div>

          {/* Right Column: Deep Engine Analysis */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Visual Pipeline Flow */}
            <div className="bg-card border border-border rounded-3xl p-8 shadow-sm">
              <div className="flex items-center gap-2 mb-8">
                <Layers className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-display font-bold">Two-Pass Evaluation Flow</h2>
              </div>
              
              <div className="relative flex flex-col md:flex-row items-center justify-between gap-4">
                {/* Connector Line */}
                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-border -translate-y-1/2 hidden md:block"></div>
                
                {/* PASS 1 */}
                <div className="relative z-10 bg-background border-2 border-primary/30 rounded-2xl p-5 w-full md:w-64 shadow-xl">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold uppercase text-primary">Pass 1: Heuristics</span>
                    <ShieldAlert className="w-4 h-4 text-primary" />
                  </div>
                  <div className="text-2xl font-display font-bold">{pass1ScoreRaw === null ? "--" : pass1ScoreValue.toFixed(2)}</div>
                  <div className="mt-4 space-y-2">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>Threshold for Pass 2: 0.40</span>
                      <span className={cn("font-bold", pass2Fired ? "text-destructive" : "text-success")}>
                        {pass2Fired ? "ELEVATED" : "CLEAN"}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${pass1ScoreValue * 100}%` }}
                        className={cn("h-full", pass2Fired ? "bg-destructive" : "bg-primary")}
                      />
                    </div>
                  </div>
                </div>

                <div className="z-10 bg-muted/50 rounded-full p-2">
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </div>

                {/* PASS 2 */}
                <div className={cn(
                  "relative z-10 bg-background border-2 rounded-2xl p-5 w-full md:w-64 shadow-xl transition-all",
                  pass2Fired ? "border-amber-400 grayscale-0 opacity-100" : "border-border grayscale opacity-50"
                )}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold uppercase text-amber-500">Pass 2: Adversarial</span>
                    <Activity className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="text-2xl font-display font-bold">
                    {pass2Fired && pass2ScoreRaw !== null ? pass2ScoreValue.toFixed(2) : "--"}
                  </div>
                  <div className="mt-4">
                    <p className="text-[9px] text-muted-foreground font-medium">
                      {pass2Fired ? "Adversarial Check Active" : "Bypassed (Pass 1 Clean)"}
                    </p>
                  </div>
                </div>

                <div className="z-10 bg-muted/50 rounded-full p-2">
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </div>

                {/* FINAL TIER */}
                <div className={cn(
                  "relative z-10 bg-background border-2 rounded-2xl p-5 w-full md:w-64 shadow-2xl transition-all",
                  selectedClaim?.status.includes('reject') ? "border-destructive" : "border-success"
                )}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold uppercase text-foreground">Resolution Tier</span>
                    <CheckCircle2 className="w-4 h-4 text-success" />
                  </div>
                  <div className="text-lg font-display font-bold uppercase tracking-tight truncate">
                    {resolutionTier.replace(/_/g, ' ')}
                  </div>
                  <div className="mt-2">
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded",
                      finalScore > 0.7 ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"
                    )}>
                      {claimFinalScoreRaw === null ? "--" : `${finalScore.toFixed(2)} FINAL`}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Signal Grid */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Pass 1 Signals */}
              <div className="bg-card border border-border rounded-3xl p-6 shadow-sm">
                <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-6">Pass 1: Primary Signals</h3>
                <div className="space-y-6">
                  {SIGNALS_META.filter(s => s.pass === 1).map(sig => {
                    const rawVal = parseNumeric(signals[sig.id]);
                    const val = Math.min(Math.max(rawVal ?? 0, 0), 1);
                    return (
                      <div key={sig.id} className="group cursor-help relative">
                        <div className="flex justify-between items-center mb-1.5">
                          <div className="flex items-center gap-2">
                            <sig.icon className="w-4 h-4 text-primary" />
                            <span className="text-xs font-bold">{sig.name}</span>
                          </div>
                          <span className={cn("text-xs font-mono font-bold", val > 0.6 ? "text-destructive" : val > 0.3 ? "text-warning" : "text-success")}>
                            {rawVal === null ? "--" : val.toFixed(2)}
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${val * 100}%` }}
                            className={cn("h-full", val > 0.6 ? "bg-destructive" : val > 0.3 ? "bg-warning" : "bg-success")}
                          />
                        </div>
                        {/* Tooltip */}
                        <div className="absolute bottom-full left-0 mb-2 w-full p-3 bg-foreground text-background text-[10px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                          <div className="font-bold mb-1">Pass 1 Heuristic: Weight {sig.weight * 100}%</div>
                          {sig.description}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Pass 2 Signals */}
              <div className="bg-card border border-border rounded-3xl p-6 shadow-sm">
                <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-6">Pass 2: Adversarial Checks</h3>
                <div className="space-y-6">
                  {SIGNALS_META.filter(s => s.pass === 2).map(sig => {
                    const rawVal = parseNumeric(signals[sig.id]);
                    const val = Math.min(Math.max(rawVal ?? 0, 0), 1);
                    const isCritical = sig.critical;
                    const isFired = val >= 0.9;
                    
                    return (
                      <div key={sig.id} className="group cursor-help relative">
                        <div className="flex justify-between items-center mb-1.5">
                          <div className={cn("flex items-center gap-2", isCritical ? "text-amber-500" : "")}>
                            <sig.icon className="w-4 h-4" />
                            <span className="text-xs font-bold">{sig.name}</span>
                            {isCritical && <ShieldAlert className="w-3 h-3" />}
                          </div>
                          <span className={cn("text-xs font-mono font-bold", isFired ? "text-destructive" : val > 0.3 ? "text-warning" : "text-success")}>
                            {rawVal === null ? "--" : (isFired ? "CRITICAL" : val.toFixed(2))}
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${val * 100}%` }}
                            className={cn("h-full", isFired ? "bg-destructive animate-pulse" : val > 0.3 ? "bg-warning" : "bg-success")}
                          />
                        </div>
                        {/* Tooltip */}
                        <div className="absolute bottom-full left-0 mb-2 w-full p-3 bg-foreground text-background text-[10px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                          <div className="font-bold mb-1">
                            Pass 2 Adversarial {isCritical && "[CRITICAL FLAG]"}
                          </div>
                          {sig.description}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Analysis Box */}
            <div className="bg-muted/30 border border-border rounded-2xl p-6">
              <h4 className="text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4" /> Neural Analysis Summary
              </h4>
              <div className="text-sm text-foreground space-y-3">
                <p className={cn(
                  "border-l-4 pl-4 italic",
                  finalScore > 0.7 ? "border-l-destructive" : "border-l-success"
                )}>
                  "{analysisSummary}"
                </p>
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mt-6">
                  <div className="p-3 bg-background rounded-xl border border-border shadow-sm">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase">Worker Trust</div>
                    <div className="text-xl font-display font-bold text-success">
                      {fraudContext?.worker_trust !== undefined ? fraudContext.worker_trust : "--"}
                    </div>
                  </div>
                  <div className="p-3 bg-background rounded-xl border border-border shadow-sm">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase">Zone GDS</div>
                    <div className="text-xl font-display font-bold text-destructive">
                      {fraudContext?.zone_gds !== undefined ? fraudContext.zone_gds : "--"}
                    </div>
                  </div>
                  <div className="p-3 bg-background rounded-xl border border-border shadow-sm">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase">Pass 1: Heuristic</div>
                    <div className="text-xl font-display font-bold">
                      {pass1ScoreRaw === null ? "--" : pass1ScoreValue.toFixed(2)}
                    </div>
                  </div>
                  <div className="p-3 bg-background rounded-xl border border-border shadow-sm">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase">XGBoost Score</div>
                    <div className={cn("text-xl font-display font-bold", xgbScoreValue > 0.7 ? "text-destructive" : "text-primary")}>
                      {xgbScoreRaw === null ? "--" : xgbScoreValue.toFixed(2)}
                    </div>
                  </div>
                  <div className="p-3 bg-background rounded-xl border border-border shadow-sm overflow-hidden">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase text-nowrap">Resolution Tier</div>
                    <div className="text-sm font-bold uppercase tracking-tight text-primary truncate">
                      {resolutionTier.replace(/_/g, ' ')}
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
        <AnimatePresence>
          {showLogs && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
              onClick={() => setShowLogs(false)}
            >
              <motion.div 
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                className="bg-card border border-border rounded-3xl w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl"
                onClick={e => e.stopPropagation()}
              >
                <div className="p-6 border-b border-border flex items-center justify-between">
                  <h3 className="text-xl font-display font-bold">Live Pipeline Logs</h3>
                  <Button variant="ghost" size="sm" onClick={() => setShowLogs(false)}>Close</Button>
                </div>
                <div className="p-6 overflow-y-auto space-y-4 font-mono text-[11px]">
                  {pipelineLogs.map((log, i) => (
                    <div key={i} className="flex gap-4 border-b border-border/30 pb-2">
                      <span className="text-primary opacity-50">{log.t}</span>
                      <span className="text-foreground">{log.m}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppLayout>
  );
}
