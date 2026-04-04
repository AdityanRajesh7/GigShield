import { useAuth } from "@/store/auth";
import { useGetZone, useListClaims } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { GDSGauge } from "@/components/GDSGauge";
import { ClaimBadge } from "@/components/ClaimBadge";
import { format } from "date-fns";
import { AlertTriangle, Clock, Wallet, ShieldCheck, X } from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function WorkerDashboard() {
  const { worker } = useAuth();
  const [hideAlert, setHideAlert] = useState(false);

  // Poll zone every 3s to simulate real-time
  const { data: zone } = useGetZone(worker?.zone_id || 'koramangala', {
    query: { refetchInterval: 3000, enabled: !!worker } as any
  });

  const { data: claimsData } = useListClaims({ worker_id: worker?.id }, {
    query: { refetchInterval: 5000, enabled: !!worker } as any
  });

  const isDanger = zone && zone.gds_score >= 60;
  
  useEffect(() => {
    // Show alert again if danger state changes to true
    if (isDanger) setHideAlert(false);
  }, [isDanger]);

  return (
    <AppLayout>
      <div className="space-y-8 pb-12">
        <div>
          <h1 className="text-3xl font-display font-bold">Overview</h1>
          <p className="text-muted-foreground mt-1">Real-time status for your active delivery zone.</p>
        </div>

        <AnimatePresence>
          {isDanger && !hideAlert && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-destructive text-destructive-foreground rounded-2xl p-4 flex items-start gap-4 shadow-lg shadow-destructive/20 relative">
                <div className="animate-pulse bg-background/20 p-2 rounded-full mt-0.5">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="pr-8">
                  <h3 className="font-bold text-lg">DISRUPTION ACTIVE — Income Protection ON</h3>
                  <p className="text-destructive-foreground/80 mt-1 font-medium">
                    Grid Disruption Score has crossed safe levels in {zone.name.replace('_', ' ').toUpperCase()}. Wait times are excluded from your rating and payouts are generating automatically.
                  </p>
                </div>
                <button 
                  onClick={() => setHideAlert(true)}
                  className="absolute top-4 right-4 text-destructive-foreground/50 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-card rounded-3xl p-6 border border-border shadow-sm flex flex-col items-center justify-center min-h-[240px]">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-6">Zone Status</h3>
            <GDSGauge score={zone?.gds_score || 25} size={160} />
          </div>

          <div className="md:col-span-2 grid grid-cols-2 gap-4">
            <div className="bg-card rounded-3xl p-6 border border-border shadow-sm flex flex-col justify-between">
              <div className="w-10 h-10 rounded-xl bg-success/10 text-success flex items-center justify-center mb-4">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground font-bold uppercase tracking-widest mb-1">Active Policy</div>
                <div className="text-2xl font-display font-bold">Standard Tier</div>
                <div className="text-sm text-success font-medium mt-1">₹800/day coverage cap</div>
              </div>
            </div>
            
            <div className="bg-card rounded-3xl p-6 border border-border shadow-sm flex flex-col justify-between">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground font-bold uppercase tracking-widest mb-1">YTD Payouts</div>
                <div className="text-2xl font-display font-bold">₹2,450</div>
                <div className="text-sm text-muted-foreground font-medium mt-1">3 events this year</div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-display font-bold">Recent Claims</h2>
            <button className="text-sm font-bold text-primary hover:underline">View All</button>
          </div>
          <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Event Type</th>
                  <th className="px-6 py-4 text-right">Amount</th>
                  <th className="px-6 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {claimsData?.claims?.slice(0, 5).map(claim => (
                  <tr key={claim.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-medium">
                      {format(new Date(claim.created_at), 'MMM dd, yyyy')}
                    </td>
                    <td className="px-6 py-4">
                      {claim.disruption_type?.replace('_', ' ').toUpperCase() || 'UNKNOWN'}
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
                    <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                      No claims history found. Your income is protected.
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
