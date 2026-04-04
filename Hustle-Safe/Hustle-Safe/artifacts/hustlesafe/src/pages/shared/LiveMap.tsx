import { AppLayout } from "@/components/layout/AppLayout";
import { useListZones } from "@workspace/api-client-react";
import { useEffect, useState } from "react";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Circle, Popup, Tooltip, useMap } from "react-leaflet";

const ZONE_COORDS: Record<string, [number, number]> = {
  koramangala:    [12.9352, 77.6245],
  indiranagar:    [12.9784, 77.6408],
  whitefield:     [12.9698, 77.7499],
  electronic_city:[12.8399, 77.6770],
  hsr_layout:     [12.9116, 77.6741],
  btm_layout:     [12.9166, 77.6101],
  marathahalli:   [12.9591, 77.6971],
  jayanagar:      [12.9252, 77.5938],
};

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
    if (zones.length > 0) {
      map.setView([12.9252, 77.6490], 12);
    }
  }, []);
  return null;
}

export function LiveMap() {
  const { data: zonesData } = useListZones({ query: { refetchInterval: 3000 } as any });
  const [selectedZone, setSelectedZone] = useState<any>(null);
  const zones = zonesData?.zones || [];

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-8rem)] gap-0">
        {/* Header */}
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
              Real-time Grid Disruption Scores across Bangalore • Refreshes every 3s
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-bold">
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

        {/* Map + Sidebar */}
        <div className="flex-1 flex gap-4 min-h-0">
          {/* Left: Zone Cards */}
          <div className="w-64 shrink-0 flex flex-col gap-2 overflow-y-auto pr-1">
            {zones.map(zone => {
              const color = gdsColor(zone.gds_score);
              const isSelected = selectedZone?.id === zone.id;
              return (
                <button
                  key={zone.id}
                  onClick={() => setSelectedZone(isSelected ? null : zone)}
                  className={`text-left w-full rounded-2xl border p-3.5 transition-all shadow-sm ${
                    isSelected
                      ? "border-primary bg-primary/5 shadow-md"
                      : "border-border bg-card hover:border-primary/30 hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      {zone.name}
                    </span>
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <span
                      className="text-3xl font-display font-bold leading-none"
                      style={{ color }}
                    >
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
                      {zone.active_workers} workers
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right: Leaflet Map */}
          <div className="flex-1 min-w-0 rounded-3xl overflow-hidden border border-border shadow-sm relative">
            <MapContainer
              center={[12.9252, 77.6490]}
              zoom={12}
              style={{ height: "100%", width: "100%" }}
              zoomControl={true}
              attributionControl={false}
            >
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              />
              <AutoFitBounds zones={zones} />

              {zones.map(zone => {
                const coords = ZONE_COORDS[zone.id];
                if (!coords) return null;
                const color = gdsColor(zone.gds_score);
                const isActive = zone.gds_score >= 60;

                return (
                  <Circle
                    key={zone.id}
                    center={coords}
                    radius={1800}
                    pathOptions={{
                      color,
                      fillColor: color,
                      fillOpacity: zone.gds_score >= 80 ? 0.55 : zone.gds_score >= 60 ? 0.40 : zone.gds_score >= 40 ? 0.30 : 0.20,
                      weight: isActive ? 3 : 1.5,
                      dashArray: isActive ? undefined : "4 4",
                    }}
                    eventHandlers={{ click: () => setSelectedZone(zone) }}
                  >
                    <Tooltip permanent direction="center" className="zone-label-tooltip" offset={[0, 0]}>
                      <div style={{ textAlign: "center", fontFamily: "'DM Sans', sans-serif" }}>
                        <div style={{ fontSize: "11px", fontWeight: 700, color: "#374151", lineHeight: 1.2 }}>
                          {zone.name}
                        </div>
                        <div style={{ fontSize: "18px", fontWeight: 800, color, lineHeight: 1.1, fontFamily: "'Playfair Display', serif" }}>
                          {zone.gds_score}
                        </div>
                      </div>
                    </Tooltip>
                    <Popup>
                      <div style={{ fontFamily: "'DM Sans', sans-serif", minWidth: 200, padding: "4px 0" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                          <strong style={{ fontSize: 15, fontFamily: "'Playfair Display', serif" }}>{zone.name}</strong>
                          <span style={{
                            padding: "2px 8px",
                            borderRadius: 20,
                            fontSize: 10,
                            fontWeight: 700,
                            backgroundColor: color + "20",
                            color,
                          }}>
                            {gdsLabel(zone.gds_score).toUpperCase()}
                          </span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 12px", fontSize: 12 }}>
                          <div><div style={{ color: "#9CA3AF", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>GDS Score</div><div style={{ fontWeight: 800, fontSize: 20, color, fontFamily: "serif" }}>{zone.gds_score}</div></div>
                          <div><div style={{ color: "#9CA3AF", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Workers</div><div style={{ fontWeight: 700, fontSize: 16 }}>{zone.active_workers}</div></div>
                          <div><div style={{ color: "#9CA3AF", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Rainfall</div><div style={{ fontWeight: 600 }}>{parseFloat(String(zone.rainfall_mm)).toFixed(1)} mm</div></div>
                          <div><div style={{ color: "#9CA3AF", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Traffic</div><div style={{ fontWeight: 600 }}>{parseFloat(String(zone.traffic_score)).toFixed(1)} / 10</div></div>
                          <div><div style={{ color: "#9CA3AF", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>AQI</div><div style={{ fontWeight: 600 }}>{zone.aqi}</div></div>
                          <div><div style={{ color: "#9CA3AF", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Demand Drop</div><div style={{ fontWeight: 600 }}>{zone.demand_drop_pct}%</div></div>
                        </div>
                        {zone.govt_alert && (
                          <div style={{ marginTop: 10, padding: "6px 10px", borderRadius: 8, backgroundColor: "#FEF3C7", color: "#92400E", fontSize: 11, fontWeight: 700 }}>
                            ⚠ Government Alert Active
                          </div>
                        )}
                      </div>
                    </Popup>
                  </Circle>
                );
              })}
            </MapContainer>

            {/* Map overlay: selected zone detail */}
            {selectedZone && (
              <div className="absolute top-4 right-4 z-[1000] bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-border p-4 w-64 pointer-events-none">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-0.5">{selectedZone.name}</div>
                    <div
                      className="text-4xl font-display font-bold"
                      style={{ color: gdsColor(selectedZone.gds_score) }}
                    >
                      {selectedZone.gds_score}
                    </div>
                  </div>
                  <span
                    className="text-[10px] font-bold px-2 py-1 rounded-full mt-1"
                    style={{
                      backgroundColor: gdsColor(selectedZone.gds_score) + "20",
                      color: gdsColor(selectedZone.gds_score),
                    }}
                  >
                    {gdsLabel(selectedZone.gds_score).toUpperCase()}
                  </span>
                </div>
                <div className="space-y-2 text-xs">
                  {[
                    { label: "🌧 Rainfall", val: `${parseFloat(String(selectedZone.rainfall_mm)).toFixed(1)} mm` },
                    { label: "🚗 Traffic", val: `${parseFloat(String(selectedZone.traffic_score)).toFixed(1)} / 10` },
                    { label: "🌫 AQI", val: selectedZone.aqi },
                    { label: "📦 Demand Drop", val: `${selectedZone.demand_drop_pct}%` },
                    { label: "👷 Active Workers", val: selectedZone.active_workers },
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
