import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  useListZones,
  useTriggerDisruption,
  useResolveDisruption,
  useListClaims,
} from "@workspace/api-client-react";
import { ZoneCard } from "@/components/ZoneCard";
import { ClaimBadge } from "@/components/ClaimBadge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { Activity, Power, Zap, Ban } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export function InsurerDashboard() {
  const queryClient = useQueryClient();
  const { data: zonesData } = useListZones({
    query: { refetchInterval: 3000 },
  });
  const { data: claimsData } = useListClaims(
    { limit: 8 },
    { query: { refetchInterval: 3000 } },
  );

  const triggerMutation = useTriggerDisruption();
  const resolveMutation = useResolveDisruption();

  const [selectedZone, setSelectedZone] = useState("");
  const [eventType, setEventType] = useState<any>("heavy_rain");
  const [gdsTarget, setGdsTarget] = useState(82);
  const [duration, setDuration] = useState(45);
  const [activeTimers, setActiveTimers] = useState<
    Record<string, NodeJS.Timeout>
  >({});
  const timersRef = useRef<Record<string, NodeJS.Timeout>>({});

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const handleTrigger = async () => {
    if (!selectedZone) return toast.error("Select a zone first");

    try {
      await triggerMutation.mutateAsync({
        data: {
          zone_id: selectedZone,
          event_type: eventType,
          gds_target: gdsTarget,
          duration_minutes: duration,
        },
      });

      // Clear any existing timer for this zone
      if (timersRef.current[selectedZone]) {
        clearTimeout(timersRef.current[selectedZone]);
      }

      // Set up auto-resolve timer
      const timer = setTimeout(
        async () => {
          try {
            await resolveMutation.mutateAsync({ zoneId: selectedZone });
            toast.success("Disruption Auto-Resolved", {
              description: `Zone ${zonesData?.zones?.find((z: any) => z.id === selectedZone)?.name || selectedZone} returned to normal.`,
            });
            queryClient.invalidateQueries({ queryKey: ["/api/zones"] });

            // Clean up timer reference
            setActiveTimers((prev) => {
              const newTimers = { ...prev };
              delete newTimers[selectedZone];
              return newTimers;
            });
            delete timersRef.current[selectedZone];
          } catch (e) {
            console.error("Failed to auto-resolve disruption:", e);
          }
        },
        duration * 60 * 1000,
      ); // Convert minutes to milliseconds

      // Store timer reference
      timersRef.current[selectedZone] = timer;
      setActiveTimers((prev) => ({ ...prev, [selectedZone]: timer }));

      toast.success("Disruption Triggered", {
        description: `Zone signals updated. Auto-resolve in ${duration} minutes.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/zones"] });
    } catch (e) {
      toast.error("Failed to trigger disruption");
    }
    return;
  };

  const handleEndAll = async () => {
    const activeZones =
      zonesData?.zones?.filter((z) => z.gds_score >= 60) || [];

    // Clear all timers
    Object.values(timersRef.current).forEach((timer) => clearTimeout(timer));
    timersRef.current = {};
    setActiveTimers({});

    for (const zone of activeZones) {
      await resolveMutation.mutateAsync({ zoneId: zone.id });
    }
    toast.success("All events resolved", {
      description: "Zones returned to normal state.",
    });
    queryClient.invalidateQueries({ queryKey: ["/api/zones"] });
  };

  return (
    <AppLayout>
      <div className="space-y-8 pb-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold">Command Center</h1>
            <p className="text-muted-foreground mt-1">
              System-wide monitoring and manual overrides.
            </p>
          </div>
          <Button
            variant="destructive"
            className="rounded-xl font-bold"
            onClick={handleEndAll}
            disabled={resolveMutation.isPending}
          >
            <Ban className="w-4 h-4 mr-2" /> END ALL EVENTS
          </Button>
        </div>

        {/* 5 KPI Tiles */}
        <div className="grid grid-cols-5 gap-4">
          {[
            { label: "Active Workers", value: "2,847", sub: "Online" },
            { label: "Zones Monitored", value: "8 / 8", sub: "Live" },
            {
              label: "Active Disruptions",
              value:
                zonesData?.zones?.filter((z) => z.gds_score >= 60).length || 0,
              sub: "Zones",
            },
            { label: "MTD Claims", value: "₹4.7L", sub: "Paid out" },
            { label: "Loss Ratio", value: "62%", sub: "Target 60%" },
          ].map((kpi, i) => (
            <div
              key={i}
              className="bg-card border border-border rounded-2xl p-4 shadow-sm"
            >
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                {kpi.label}
              </div>
              <div className="text-2xl font-display font-bold text-foreground mb-1">
                {kpi.value}
              </div>
              <div className="text-[10px] font-bold text-primary uppercase">
                {kpi.sub}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-8">
          {/* Main Map Grid */}
          <div className="col-span-2 space-y-6">
            <h2 className="text-xl font-display font-bold flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" /> Live Zone Grid
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {zonesData?.zones?.map((zone) => (
                <ZoneCard
                  key={zone.id}
                  zone={zone}
                  selected={selectedZone === zone.id}
                  hasTimer={!!activeTimers[zone.id]}
                  onClick={() => setSelectedZone(zone.id)}
                />
              ))}
            </div>

            <div className="bg-card rounded-3xl border border-border p-6 shadow-sm">
              <h2 className="text-lg font-display font-bold mb-4">
                Live Claims Feed
              </h2>
              <div className="space-y-3">
                {claimsData?.claims?.map((claim) => (
                  <div
                    key={claim.id}
                    className="flex items-center justify-between p-3 rounded-xl hover:bg-muted transition-colors"
                  >
                    <div>
                      <div className="font-bold text-sm">
                        {claim.worker_name || "Worker"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {claim.zone_name?.replace("_", " ").toUpperCase() ||
                          "ZONE"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">₹{claim.payout_amount}</div>
                      <ClaimBadge status={claim.status} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Simulator Panel */}
          <div className="space-y-6">
            <div className="bg-foreground text-background rounded-3xl p-6 shadow-xl relative overflow-hidden">
              <div className="absolute right-0 top-0 w-32 h-32 bg-primary/30 rounded-full blur-3xl"></div>

              <h2 className="text-xl font-display font-bold mb-6 flex items-center gap-2 relative z-10">
                <Zap className="w-5 h-5 text-primary" /> Disruption Simulator
              </h2>

              <div className="space-y-6 relative z-10">
                <div>
                  <label className="text-xs font-bold text-white/60 uppercase tracking-wider mb-2 block">
                    Target Zone
                  </label>
                  <select
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none"
                    value={selectedZone}
                    onChange={(e) => setSelectedZone(e.target.value)}
                  >
                    <option value="" className="bg-foreground text-white">
                      Select a zone...
                    </option>
                    {zonesData?.zones?.map((z) => (
                      <option
                        key={z.id}
                        value={z.id}
                        className="bg-foreground text-white"
                      >
                        {z.name.replace("_", " ").toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-white/60 uppercase tracking-wider mb-3 block">
                    Event Type
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {["heavy_rain", "flood", "curfew", "platform_outage"].map(
                      (type) => (
                        <button
                          key={type}
                          onClick={() => setEventType(type)}
                          className={`py-2 px-3 text-xs font-bold rounded-lg border transition-all ${eventType === type ? "bg-primary border-primary text-white" : "border-white/20 text-white/60 hover:bg-white/5"}`}
                        >
                          {type.replace("_", " ").toUpperCase()}
                        </button>
                      ),
                    )}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-3">
                    <label className="text-xs font-bold text-white/60 uppercase tracking-wider block">
                      GDS Target
                    </label>
                    <span className="font-display font-bold text-xl">
                      {gdsTarget}
                    </span>
                  </div>
                  <Slider
                    value={[gdsTarget]}
                    onValueChange={(v) => setGdsTarget(v[0])}
                    max={100}
                    step={1}
                    className="py-2"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-3">
                    <label className="text-xs font-bold text-white/60 uppercase tracking-wider block">
                      Duration (Mins)
                    </label>
                    <span className="font-bold">{duration}m</span>
                  </div>
                  <Slider
                    value={[duration]}
                    onValueChange={(v) => setDuration(v[0])}
                    max={120}
                    min={15}
                    step={5}
                    className="py-2"
                  />
                </div>

                <Button
                  onClick={handleTrigger}
                  disabled={triggerMutation.isPending}
                  className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-bold text-base rounded-xl mt-4"
                >
                  {triggerMutation.isPending
                    ? "Triggering..."
                    : "TRIGGER DISRUPTION"}
                </Button>
              </div>
            </div>

            <div className="bg-card rounded-3xl p-6 border border-border shadow-sm">
              <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground mb-4">
                Reserve Health
              </h3>
              <div className="mb-2 flex justify-between items-end">
                <span className="text-2xl font-display font-bold">₹8.4L</span>
                <span className="text-sm font-medium text-muted-foreground">
                  Target: ₹12L
                </span>
              </div>
              <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full w-[70%]"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
