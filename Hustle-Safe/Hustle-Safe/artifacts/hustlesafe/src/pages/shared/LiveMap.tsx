import { AppLayout } from "@/components/layout/AppLayout";
import { useListZones } from "@workspace/api-client-react";
import { useEffect, useState } from "react";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Circle, Popup, Tooltip, useMap } from "react-leaflet";
import { Clock } from "lucide-react";

const ZONE_COORDS: Record<string, [number, number]> = {
  koramangala: [12.9352, 77.6245],
  indiranagar: [12.9784, 77.6408],
  whitefield: [12.9698, 77.7499],
  electronic_city: [12.8399, 77.6770],
  hsr_layout: [12.9116, 77.6741],
  btm_layout: [12.9166, 77.6101],
  marathahalli: [12.9591, 77.6971],
  jayanagar: [12.9252, 77.5938],
};

// ── Identical fallback to Dashboard ──────────────────────────────────────────
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

function gdsColor(gds: number): string {
  if (gds < 40) return "#10B981";
  if (gds < 60) return "#F59E0B";
  if (gds < 80) return "#EF4444";
  return "#1E1B4B";
}

function gdsLabel(gds: number): string {
  if (gds < 40) return "Normal";
  if (gds < 60) return "Elevated";
  if (gds < 80) return "High Risk";
  return "Shutdown";
}

function AutoFitBounds({ zones }: { zones: any[] }) {
  const map = useMap();
  useEffect(() => {
    if (zones && zones.length > 0) {
      map.setView([12.9252, 77.6490], 12);
    }
  }, [zones]);
  return null;
}

export function LiveMap() {
  const { data: zonesData } = useListZones({ query: { refetchInterval: 3000 } as any });
  const [selectedZone, setSelectedZone] = useState<any>(null);

  // ── Mirrors Dashboard: AI hourly data + time scrubber ────────────────────
  const [aiHourlyData, setAiHourlyData] = useState<any[]>(fallbackHourlyForecast);
  const [simulatedHour, setSimulatedHour] = useState<number | null>(null);
  const [liveZones, setLiveZones] = useState<any[]>([]);

  // Step 1 – fetch AI forecast once (same fetch logic as Dashboard)
  useEffect(() => {
    const fetchForecast = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const res = await fetch('/api/zones/forecast/24-hour', { signal: controller.signal }).catch(() => null);
        clearTimeout(timeoutId);

        if (res && res.ok) {
          const apiData = await res.json();
          if (apiData.forecast && apiData.forecast.length > 0) {
            setAiHourlyData(apiData.forecast);
          }
        }
      } catch {
        // silently fall back to static data already set
      }
    };
    fetchForecast();
  }, []);

  // Step 2 – Autonomous Synchronisation Engine (identical to Dashboard)
  // Re-runs whenever zones, AI data, or the simulated hour changes.
  useEffect(() => {
    if (!zonesData?.zones || aiHourlyData.length === 0) return;

    // Use real clock time unless the demo time scrubber is active
    const currentHour = simulatedHour !== null ? simulatedHour : new Date().getHours();

    // Find the closest hourly bucket that is <= currentHour (same logic as Dashboard)
    let currentHourData = aiHourlyData[0];
    for (const bucket of aiHourlyData) {
      const bucketHour = parseInt(bucket.time.split(':')[0], 10);
      if (currentHour >= bucketHour) {
        currentHourData = bucket;
      }
    }

    const updatedZones = zonesData.zones.map((zone: any) => {
      // Key lookup: "zone.name.replace(' ', '_')" — identical to Dashboard
      const safeKey = zone.name.replace(" ", "_");
      const aiScore = currentHourData[safeKey] || 0;

      // Use whichever is higher: real backend score (disruption) or AI prediction
      // This ensures triggered disruptions are NEVER hidden by lower AI forecasts
      const finalScore = Math.max(zone.gds_score, aiScore);

      return { ...zone, gds_score: finalScore };
    });

    setLiveZones(updatedZones);
  }, [zonesData, aiHourlyData, simulatedHour]);

  // Display zones: use liveZones once populated, otherwise raw API data
  const displayZones = liveZones.length > 0 ? liveZones : (zonesData?.zones || []);

  // Keep the selected zone overlay in sync with the latest live scores
  const activeSelectedZone = selectedZone
    ? displayZones.find((z: any) => z.id === selectedZone.id) || selectedZone
    : null;

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-8rem)] gap-0">
        <div className="flex items-center justify-between pb-4 shrink-0">
          <div>
            <h1 className="text-3xl font-display font-bold flex items-center gap-3">
              Live Risk Map{" "}
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive" />
              </span>
            </h1>
            <p className="text-muted-foreground mt-0.5 text-sm">
              Real-time AI Grid Disruption Scores across Bangalore • Synced with LSTM
            </p>
          </div>

          <div className="flex items-center gap-4">
            {/* ── Demo Time Scrubber (same as Dashboard) ── */}
            <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-lg border border-border">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] font-bold uppercase text-muted-foreground">Clock:</span>
              <select
                className="bg-transparent text-xs font-bold outline-none cursor-pointer"
                value={simulatedHour === null ? "real" : simulatedHour}
                onChange={(e) =>
                  setSimulatedHour(e.target.value === "real" ? null : parseInt(e.target.value))
                }
              >
                <option value="real">Live Time</option>
                <option value="12">12:00 PM (Calm)</option>
                <option value="14">2:00 PM (Rising Risk)</option>
                <option value="16">4:00 PM (Storm Hits)</option>
                <option value="18">6:00 PM (Recovery)</option>
              </select>
            </div>

            {/* Legend */}
            <div className="hidden md:flex items-center gap-4 text-xs font-bold">
              {[
                { color: "#10B981", label: "Normal (0-39)" },
                { color: "#F59E0B", label: "Elevated (40-59)" },
                { color: "#EF4444", label: "High Risk (60-79)" },
                { color: "#1E1B4B", label: "Shutdown (80+)" },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2 text-muted-foreground">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  {item.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 flex gap-4 min-h-0">
          <div className="w-64 shrink-0 flex flex-col gap-2 overflow-y-auto pr-1">
            {displayZones.map((zone: any) => {
              const color = gdsColor(zone.gds_score);
              const isSelected = activeSelectedZone?.id === zone.id;
              const safeName = zone?.name?.replace("_", " ") || "Unknown Zone";

              return (
                <button
                  key={zone.id}
                  onClick={() => setSelectedZone(isSelected ? null : zone)}
                  className={`text-left w-full rounded-2xl border p-3.5 transition-all shadow-sm ${isSelected
                      ? "border-primary bg-primary/5 shadow-md"
                      : "border-border bg-card hover:border-primary/30 hover:bg-muted/40"
                    }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground truncate mr-2">
                      {safeName}
                    </span>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  </div>
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-display font-bold leading-none" style={{ color }}>
                      {zone.gds_score}
                    </span>
                    <span className="text-[10px] font-bold pb-0.5 text-muted-foreground uppercase">GDS</span>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: color + "20", color }}
                    >
                      {gdsLabel(zone.gds_score)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {zone.active_workers || 0} workers
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex-1 min-w-0 rounded-3xl overflow-hidden border border-border shadow-sm relative z-0">
            <MapContainer
              center={[12.9252, 77.6490]}
              zoom={12}
              style={{ height: "100%", width: "100%", zIndex: 0 }}
              zoomControl={true}
              attributionControl={false}
            >
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              />
              <AutoFitBounds zones={displayZones} />

              {displayZones.map((zone: any) => {
                const zoneKey = (zone?.name || "").toLowerCase().replace(/ /g, '_');
                const coords = ZONE_COORDS[zone.id] || ZONE_COORDS[zoneKey];

                if (!coords) return null;

                const color = gdsColor(zone.gds_score);
                const isActive = zone.gds_score >= 60;
                const safeName = zone?.name?.replace("_", " ") || "Unknown Zone";

                return (
                  <Circle
                    key={zone.id}
                    center={coords}
                    radius={1800}
                    pathOptions={{
                      color,
                      fillColor: color,
                      fillOpacity:
                        zone.gds_score >= 80 ? 0.55
                          : zone.gds_score >= 60 ? 0.40
                            : zone.gds_score >= 40 ? 0.30
                              : 0.20,
                      weight: isActive ? 3 : 1.5,
                      dashArray: isActive ? undefined : "4 4",
                    }}
                    eventHandlers={{ click: () => setSelectedZone(zone) }}
                  >
                    <Tooltip permanent direction="center" className="zone-label-tooltip" offset={[0, 0]}>
                      <div style={{ textAlign: "center", fontFamily: "'DM Sans', sans-serif" }}>
                        <div style={{ fontSize: "11px", fontWeight: 700, color: "#374151", lineHeight: 1.2 }}>
                          {safeName}
                        </div>
                        <div style={{ fontSize: "18px", fontWeight: 800, color, lineHeight: 1.1, fontFamily: "'Playfair Display', serif" }}>
                          {zone.gds_score}
                        </div>
                      </div>
                    </Tooltip>
                    <Popup>
                      {(zone as any).nlp_event_cause && (zone as any).nlp_event_cause !== 'none' && (
                        <div style={{ marginTop: 10, padding: "6px 10px", borderRadius: 8, backgroundColor: "#EEF2FF", color: "#4F46E5", fontSize: 11, fontWeight: 700 }}>
                          🤖 AI NLP Cause: {(zone as any).nlp_event_cause.replace("_", " ").toUpperCase()}
                        </div>
                      )}
                      <div style={{ fontFamily: "'DM Sans', sans-serif", minWidth: 200, padding: "4px 0" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                          <strong style={{ fontSize: 15, fontFamily: "'Playfair Display', serif" }}>{safeName}</strong>
                          <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, backgroundColor: color + "20", color }}>
                            {gdsLabel(zone.gds_score).toUpperCase()}
                          </span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 12px", fontSize: 12 }}>
                          <div><div style={{ color: "#9CA3AF", fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>GDS Score</div><div style={{ fontWeight: 800, fontSize: 20, color, fontFamily: "serif" }}>{zone.gds_score}</div></div>
                          <div><div style={{ color: "#9CA3AF", fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>Workers</div><div style={{ fontWeight: 700, fontSize: 16 }}>{zone.active_workers || 0}</div></div>
                          <div><div style={{ color: "#9CA3AF", fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>Rainfall</div><div style={{ fontWeight: 600 }}>{parseFloat(String(zone.rainfall_mm || 0)).toFixed(1)} mm</div></div>
                          <div><div style={{ color: "#9CA3AF", fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>Traffic</div><div style={{ fontWeight: 600 }}>{parseFloat(String(zone.traffic_score || 0)).toFixed(1)} / 10</div></div>
                        </div>
                      </div>
                    </Popup>
                  </Circle>
                );
              })}
            </MapContainer>

            {activeSelectedZone && (
              <div className="absolute top-4 right-4 z-[1000] bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-border p-4 w-64 pointer-events-none">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-0.5">
                      {activeSelectedZone?.name?.replace("_", " ") || "Unknown Zone"}
                    </div>
                    <div className="text-4xl font-display font-bold" style={{ color: gdsColor(activeSelectedZone.gds_score) }}>
                      {activeSelectedZone.gds_score}
                    </div>
                  </div>
                  <span
                    className="text-[10px] font-bold px-2 py-1 rounded-full mt-1"
                    style={{ backgroundColor: gdsColor(activeSelectedZone.gds_score) + "20", color: gdsColor(activeSelectedZone.gds_score) }}
                  >
                    {gdsLabel(activeSelectedZone.gds_score).toUpperCase()}
                  </span>
                </div>
                <div className="space-y-2 text-xs">
                  {[
                    { label: "🌧 Rainfall", val: `${parseFloat(String(activeSelectedZone.rainfall_mm || 0)).toFixed(1)} mm` },
                    { label: "🚗 Traffic", val: `${parseFloat(String(activeSelectedZone.traffic_score || 0)).toFixed(1)} / 10` },
                    { label: "🌫 AQI", val: activeSelectedZone.aqi || 0 },
                    { label: "📦 Demand Drop", val: `${activeSelectedZone.demand_drop_pct || 0}%` },
                    { label: "👷 Active Workers", val: activeSelectedZone.active_workers || 0 },
                  ].map(row => (
                    <div key={row.label} className="flex justify-between">
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className="font-bold">{row.val}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}