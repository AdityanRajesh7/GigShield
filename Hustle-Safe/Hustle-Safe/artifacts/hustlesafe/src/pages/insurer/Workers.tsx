import { AppLayout } from "@/components/layout/AppLayout";
import { useListWorkers } from "@workspace/api-client-react";
import { Search } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";

function fs(val: unknown): number {
  return parseFloat(String(val ?? 0));
}

export function InsurerWorkers() {
  const { data: workersData } = useListWorkers({ limit: 100 });
  const [search, setSearch] = useState("");
  const [zoneFilter, setZoneFilter] = useState("all");

  const zones = ["all", "koramangala", "indiranagar", "whitefield", "electronic_city", "hsr_layout", "btm_layout", "marathahalli", "jayanagar"];

  const filtered = (workersData?.workers || []).filter(w => {
    const matchSearch = !search || w.name.toLowerCase().includes(search.toLowerCase()) || w.phone.includes(search);
    const matchZone = zoneFilter === "all" || w.zone_id === zoneFilter;
    return matchSearch && matchZone;
  });

  return (
    <AppLayout>
      <div className="space-y-6 pb-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold">Worker Registry</h1>
            <p className="text-muted-foreground mt-1">{workersData?.total ?? 0} insured delivery partners</p>
          </div>
          <div className="flex gap-3">
            <div className="relative w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by name or phone..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all shadow-sm"
              />
            </div>
            <select
              value={zoneFilter}
              onChange={e => setZoneFilter(e.target.value)}
              className="bg-card border border-border rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none shadow-sm"
            >
              {zones.map(z => (
                <option key={z} value={z}>{z === "all" ? "All Zones" : z.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-card rounded-3xl border border-border shadow-sm overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-6 py-5">Partner</th>
                <th className="px-6 py-5">Zone</th>
                <th className="px-6 py-5">Platform</th>
                <th className="px-6 py-5">Tier</th>
                <th className="px-6 py-5 text-center">Fraud Score</th>
                <th className="px-6 py-5">Rating</th>
                <th className="px-6 py-5">Join Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filtered.map(worker => {
                const score = fs(worker.fraud_score);
                const rating = parseFloat(String(worker.platform_rating ?? 4.5));
                return (
                  <tr key={worker.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                          {worker.name?.charAt(0) || 'U'}
                        </div>
                        <div>
                          <div className="font-bold text-foreground">{worker.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{worker.phone}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-medium text-xs">
                      {(worker.zone_id || 'UNKNOWN').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </td>
                    <td className="px-6 py-4">
                      <span className="capitalize text-xs font-bold text-muted-foreground bg-muted px-2 py-1 rounded-md">
                        {worker.platform}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-bold px-2 py-1 rounded-md ${
                        worker.policy_tier === 'pro' ? 'bg-primary/10 text-primary' :
                        worker.policy_tier === 'standard' ? 'bg-accent text-accent-foreground' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {worker.policy_tier?.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2.5 py-1 rounded-md font-mono text-xs font-bold ${
                        score > 0.7 ? 'bg-destructive/10 text-destructive' :
                        score > 0.4 ? 'bg-warning/10 text-warning' :
                        'bg-success/10 text-success'
                      }`}>
                        {score.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-bold text-warning">★ {rating.toFixed(1)}</span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {format(new Date(worker.created_at), 'MMM dd, yyyy')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-16 text-center text-muted-foreground text-sm">
              No workers match your search.
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
