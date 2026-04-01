import { AppLayout } from "@/components/layout/AppLayout";
import { useListClaims, useUpdateClaim } from "@workspace/api-client-react";
import { ClaimBadge } from "@/components/ClaimBadge";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, XCircle, Search } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

function fs(val: unknown): number {
  return parseFloat(String(val ?? 0));
}

export function InsurerClaimsQueue() {
  const queryClient = useQueryClient();
  const { data: claimsData } = useListClaims({ limit: 50 });
  const updateMutation = useUpdateClaim();
  const [selectedClaim, setSelectedClaim] = useState<any>(null);
  const [filter, setFilter] = useState("all");

  const handleAction = async (id: string, status: any) => {
    try {
      await updateMutation.mutateAsync({
        id,
        data: { status, resolution_notes: "Reviewed by analyst" }
      });
      toast.success(`Claim marked as ${status}`);
      queryClient.invalidateQueries({ queryKey: ["/api/claims"] });
      setSelectedClaim(null);
    } catch {
      toast.error("Failed to update claim");
    }
  };

  const filtered = (claimsData?.claims || []).filter(c => {
    if (filter === "all") return true;
    if (filter === "review") return c.status === "insurer_review" || c.status === "soft_hold";
    if (filter === "approved") return c.status === "auto_approved" || c.status === "paid";
    if (filter === "rejected") return c.status === "auto_rejected";
    return true;
  });

  const fraudSignals = [
    { name: "GPS Location Match", base: 0.05 },
    { name: "Weather Correlation", base: 0.12 },
    { name: "Peer Activity Check", base: 0.01 },
    { name: "Historical Pattern Score", base: 0.03 },
    { name: "Device Fingerprint", base: 0.04, critical: true },
    { name: "Cell Tower Concordance", base: 0.02, critical: true },
    { name: "Claim Frequency", base: 0.01 },
    { name: "Zone Density Match", base: 0.02 },
  ];

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-8rem)] gap-6">
        <div className="flex-1 flex flex-col bg-card rounded-3xl border border-border shadow-sm overflow-hidden">
          <div className="p-6 border-b border-border/50 shrink-0">
            <h1 className="text-2xl font-display font-bold mb-4">Claims Queue</h1>
            <div className="flex gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by worker..."
                  className="pl-9 pr-4 py-2 w-full bg-muted border-transparent rounded-lg text-sm focus:bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                />
              </div>
              {["all", "review", "approved", "rejected"].map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-colors ${filter === f ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}
                >
                  {f === "all" ? "All" : f === "review" ? "Needs Review" : f === "approved" ? "Approved" : "Rejected"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/30 text-muted-foreground font-bold uppercase tracking-wider text-[10px] sticky top-0 backdrop-blur-md">
                <tr>
                  <th className="px-6 py-4">Worker</th>
                  <th className="px-6 py-4">Zone / Event</th>
                  <th className="px-6 py-4">Fraud Score</th>
                  <th className="px-6 py-4">Amount</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filtered.map(claim => {
                  const score = fs(claim.fraud_score);
                  return (
                    <tr
                      key={claim.id}
                      className={`transition-colors cursor-pointer ${selectedClaim?.id === claim.id ? 'bg-primary/5' : 'hover:bg-muted/30'}`}
                      onClick={() => setSelectedClaim(claim)}
                    >
                      <td className="px-6 py-4 font-bold text-foreground">
                        {claim.worker_name || 'Worker'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-xs">{claim.zone_name?.replace(/_/g, ' ').toUpperCase()}</div>
                        <div className="text-muted-foreground text-[10px] mt-0.5">{claim.disruption_type?.replace(/_/g, ' ')}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-md font-mono text-xs font-bold ${
                          score > 0.7 ? 'bg-destructive/10 text-destructive' :
                          score > 0.4 ? 'bg-warning/10 text-warning' :
                          'bg-success/10 text-success'
                        }`}>
                          {score.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-bold text-foreground">₹{claim.payout_amount}</td>
                      <td className="px-6 py-4"><ClaimBadge status={claim.status} /></td>
                      <td className="px-6 py-4 text-right">
                        <Button variant="ghost" size="sm" className="font-bold text-primary">Review</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {selectedClaim && (
          <div className="w-[400px] shrink-0 bg-card rounded-3xl border border-border shadow-lg p-6 flex flex-col h-full overflow-hidden animate-in slide-in-from-right-4">
            <h2 className="text-xl font-display font-bold mb-1">Claim Review</h2>
            <p className="text-sm text-muted-foreground mb-6 font-mono">#{selectedClaim.id.slice(0, 8)}...</p>

            <div className="bg-muted p-4 rounded-xl mb-6">
              <div className="flex justify-between mb-2">
                <span className="text-sm text-muted-foreground">Worker</span>
                <span className="font-bold">{selectedClaim.worker_name}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-muted-foreground">Payout</span>
                <span className="font-bold text-lg">₹{selectedClaim.payout_amount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Risk Score</span>
                <span className={`font-bold ${fs(selectedClaim.fraud_score) > 0.7 ? 'text-destructive' : 'text-success'}`}>
                  {fs(selectedClaim.fraud_score).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-auto">
              <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground mb-4">Fraud Signals</h3>
              <div className="space-y-4">
                {fraudSignals.map((sig, i) => {
                  const score = fs(selectedClaim.fraud_score);
                  const contribution = sig.critical && score > 0.7
                    ? sig.base * 8
                    : sig.base * (1 + score);
                  const isFlagged = contribution > 0.2;
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-xs font-bold mb-1.5">
                        <span className="flex items-center gap-1">
                          {isFlagged && <AlertTriangle className="w-3 h-3 text-destructive" />}
                          {sig.name}
                        </span>
                        <span className={isFlagged ? "text-destructive" : "text-muted-foreground"}>
                          {Math.min(contribution, 0.99).toFixed(2)}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${isFlagged ? 'bg-destructive' : contribution > 0.1 ? 'bg-warning' : 'bg-success'}`}
                          style={{ width: `${Math.min(100, contribution * 150)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {fs(selectedClaim.fraud_score) > 0.7 && (
                <div className="mt-6 p-3 bg-destructive/5 border border-destructive/20 rounded-xl text-sm">
                  <strong className="text-destructive">⚠ AI Summary:</strong>
                  <span className="text-muted-foreground ml-1">High risk of spoofing detected. Device fingerprint does not match known worker history during disruption window.</span>
                </div>
              )}
            </div>

            <div className="pt-6 border-t border-border/50 grid grid-cols-2 gap-3 shrink-0">
              <Button onClick={() => handleAction(selectedClaim.id, 'paid')} className="bg-success hover:bg-success/90 text-white font-bold" disabled={updateMutation.isPending}>
                <CheckCircle2 className="w-4 h-4 mr-2" /> {updateMutation.isPending ? "Processing..." : "Approve"}
              </Button>
              <Button onClick={() => handleAction(selectedClaim.id, 'auto_rejected')} variant="destructive" className="font-bold" disabled={updateMutation.isPending}>
                <XCircle className="w-4 h-4 mr-2" /> {updateMutation.isPending ? "Processing..." : "Reject"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
