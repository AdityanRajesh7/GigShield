import { motion } from "framer-motion";
import {
  Users,
  CloudRain,
  ShieldAlert,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Zone } from "@workspace/api-client-react";

interface ZoneCardProps {
  zone: Zone;
  onClick?: () => void;
  selected?: boolean;
  hasTimer?: boolean;
}

export function ZoneCard({ zone, onClick, selected, hasTimer }: ZoneCardProps) {
  const isDanger = zone.gds_score >= 60;

  let statusColor = "bg-success/10 text-success border-success/20";
  let statusDot = "bg-success";

  if (zone.status === "shutdown") {
    statusColor = "bg-foreground text-background border-foreground";
    statusDot = "bg-background";
  } else if (zone.status === "high") {
    statusColor = "bg-destructive/10 text-destructive border-destructive/20";
    statusDot = "bg-destructive";
  } else if (zone.status === "elevated") {
    statusColor = "bg-warning/10 text-warning border-warning/20";
    statusDot = "bg-warning";
  }

  return (
    <motion.button
      whileHover={{ y: -4, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        "relative text-left w-full min-h-[180px] h-auto p-5 rounded-2xl flex flex-col justify-between transition-all duration-300",
        "bg-card shadow-sm border",
        selected
          ? "ring-2 ring-primary border-transparent shadow-md"
          : "border-border hover:shadow-md hover:border-primary/30",
        isDanger && "pulsing-danger",
      )}
    >
      <div className="flex justify-between items-start w-full gap-2 overflow-hidden">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground truncate min-w-0">
          {zone.name.replace("_", " ")}
        </h3>
        <div className="flex items-center gap-2 shrink-0">
          {hasTimer && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
              <Clock className="w-3 h-3" />
              <span className="text-[10px] font-bold uppercase">Auto</span>
            </div>
          )}
          <span
            className={cn(
              "px-2 py-1 rounded-full text-[10px] font-bold uppercase flex items-center gap-1.5 whitespace-nowrap",
              statusColor,
            )}
          >
            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", statusDot)} />
            {zone.status}
          </span>
        </div>
      </div>

      <div className="flex items-end justify-between w-full">
        <div>
          <div className="text-xs text-muted-foreground mb-1 font-medium">
            GDS SCORE
          </div>
          <div
            className={cn(
              "text-5xl font-display font-bold leading-none tracking-tighter",
              zone.gds_score >= 80
                ? "text-foreground"
                : zone.gds_score >= 60
                  ? "text-destructive"
                  : zone.gds_score >= 40
                    ? "text-warning"
                    : "text-success",
            )}
          >
            {zone.gds_score}
          </div>
        </div>
      </div>

      <div className="flex items-center flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground w-full pt-4 border-t border-border/50 mt-auto">
        <div className="flex items-center gap-1.5 shrink-0">
          <Users className="w-4 h-4" />
          <span className="font-semibold text-foreground">
            {zone.active_workers}
          </span>
        </div>

        {zone.rainfall_mm > 10 && (
          <div className="flex items-center gap-1.5 text-primary shrink-0">
            <CloudRain className="w-4 h-4" />
            <span className="font-semibold">{zone.rainfall_mm}mm</span>
          </div>
        )}

        {zone.govt_alert && (
          <div className="flex items-center gap-1.5 text-destructive shrink-0">
            <ShieldAlert className="w-4 h-4" />
            <span className="font-semibold text-[10px] uppercase">Alert</span>
          </div>
        )}
      </div>
    </motion.button>
  );
}
