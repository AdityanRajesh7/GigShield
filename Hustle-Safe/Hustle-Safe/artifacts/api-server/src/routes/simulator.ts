import { Router } from "express";
import { db, zonesTable, workersTable, policiesTable, claimsTable, disruptionEventsTable, walletsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { broadcastNotification } from "./notifications.js";
import { creditWallet } from "../lib/wallet.js";
import { evaluateFraudClaim } from "../lib/fraud_pipeline.js";
import { randomUUID } from "crypto";

const router = Router();

function gdsToStatus(gds: number): string {
  if (gds < 40) return "normal";
  if (gds < 60) return "elevated";
  if (gds < 80) return "high";
  return "shutdown";
}

function computeSignalsFromEventType(eventType: string, gds: number): Record<string, unknown> {
  const maps: Record<string, Record<string, unknown>> = {
    heavy_rain: { rainfall_mm: (35 + gds * 0.3).toFixed(2), traffic_score: "7.5", demand_drop_pct: 55, govt_alert: false },
    flood: { rainfall_mm: (65 + gds * 0.2).toFixed(2), traffic_score: "9.2", demand_drop_pct: 80, govt_alert: true },
    curfew: { rainfall_mm: "0", traffic_score: "8.0", demand_drop_pct: 90, govt_alert: true },
    platform_outage: { rainfall_mm: "0", traffic_score: "2.0", demand_drop_pct: 95, govt_alert: false },
    strike: { rainfall_mm: "0", traffic_score: "6.5", demand_drop_pct: 70, govt_alert: true },
    aqi_hazard: { rainfall_mm: "0", traffic_score: "5.0", demand_drop_pct: 40, govt_alert: false, aqi: 280 },
  };
  return maps[eventType] || {};
}

function generateFraudSignals(fraudScore: number): Record<string, unknown> {
  const signals = [
    { name: "GPS Location Match", weight: 0.20 },
    { name: "Weather Correlation", weight: 0.18 },
    { name: "Peer Activity Check", weight: 0.15 },
    { name: "Historical Pattern Score", weight: 0.12 },
    { name: "Device Fingerprint", weight: 0.10 },
    { name: "Cell Tower Concordance", weight: 0.08 },
    { name: "Claim Frequency", weight: 0.07 },
    { name: "Zone Density Match", weight: 0.06 },
    { name: "Platform Login Activity", weight: 0.04 },
  ];

  const result: Record<string, { contribution: number; pass: boolean; flag: boolean }> = {};
  let remaining = fraudScore;
  for (const sig of signals) {
    const contribution = Math.min(remaining, sig.weight * (fraudScore > 0.7 ? 1.4 : 0.6));
    result[sig.name] = {
      contribution: parseFloat(contribution.toFixed(3)),
      pass: contribution < sig.weight * 0.5,
      flag: contribution > sig.weight * 0.8,
    };
    remaining -= contribution;
  }
  return result;
}

function generateFraudScore(worker: { account_age_days: number; fraud_score: string }): number {
  const base = parseFloat(worker.fraud_score) || 0.05;
  const ageBonus = Math.max(0, (365 - Number(worker.account_age_days)) / 365) * 0.1;
  const noise = (Math.random() - 0.5) * 0.1;
  const score = Math.max(0.02, Math.min(0.99, base + ageBonus + noise));
  // 10% chance of being a demo fraud case
  if (Math.random() < 0.1) return parseFloat((0.75 + Math.random() * 0.2).toFixed(2));
  return parseFloat(score.toFixed(2));
}

router.post("/simulator/trigger", async (req, res) => {
  try {
    const { zone_id, event_type, gds_target, duration_minutes = 45 } = req.body;
    if (!zone_id || !event_type || gds_target === undefined) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // 1. Create disruption event
    const [disruption] = await db.insert(disruptionEventsTable).values({
      zone_id,
      event_type,
      gds_target,
      duration_minutes,
      triggered_by: "simulator",
      is_active: true,
      started_at: new Date(),
    }).returning();

    // 2. Update zone signals
    const signals = computeSignalsFromEventType(event_type, gds_target);
    const [zone] = await db.update(zonesTable).set({
      gds_score: gds_target,
      status: gdsToStatus(gds_target),
      last_updated: new Date(),
      ...signals,
    }).where(eq(zonesTable.id, zone_id)).returning();

    if (!zone) return res.status(404).json({ error: "Zone not found" });

    // 3. Find workers in zone with active policies
    const workers = await db.select().from(workersTable)
      .where(and(eq(workersTable.zone_id, zone_id), eq(workersTable.is_active, true)));

    let claimsCreated = 0;
    const tierCaps: Record<string, string> = { basic: "400.00", standard: "800.00", pro: "1500.00" };
    const tierPremiums: Record<string, string> = { basic: "15.00", standard: "28.50", pro: "45.00" };

    for (const worker of workers) {
      try {
        let [policy] = await db.select().from(policiesTable)
          .where(and(eq(policiesTable.worker_id, worker.id), eq(policiesTable.status, "active")));

        // Auto-provision a policy if the worker doesn't have one yet
        if (!policy) {
          try {
            [policy] = await db.insert(policiesTable).values({
              worker_id: worker.id,
              tier: worker.policy_tier || "standard",
              weekly_premium: tierPremiums[worker.policy_tier] || "28.50",
              coverage_cap: tierCaps[worker.policy_tier] || "800.00",
              status: "active",
              zone_id: zone_id,
            }).returning();
          } catch (policyErr) {
            req.log.error({ err: policyErr, workerId: worker.id }, "Failed to auto-provision policy during disruption");
            continue;
          }
        }

        const hoursAffected = (duration_minutes / 60).toFixed(2);
        const coverageCap = parseFloat(policy.coverage_cap);
        const payout = Math.min(parseFloat(hoursAffected) * 90, coverageCap);
        
        const claimId = randomUUID();

        // Use the actual fraud pipeline for simulation
        const fraudResult = await evaluateFraudClaim({
          claim_id: claimId,
          worker_id: worker.id,
          zone_id,
          user_lat: parseFloat(zone.lat || "12.9716"),
          user_lng: parseFloat(zone.lng || "77.5946"),
          device_id: worker.device_id || "demo-device",
          disruption_start: disruption.started_at || new Date(),
          gps_trace: [], // Mock empty for pass 1 exit / baseline
          policy_tier: worker.policy_tier
        });

        await db.insert(claimsTable).values({
          id: claimId,
          worker_id: worker.id,
          policy_id: policy.id,
          zone_id,
          disruption_type: event_type,
          disruption_start: new Date(),
          hours_affected: hoursAffected,
          hourly_rate: "90.00",
          payout_amount: payout.toFixed(2),
          fraud_score: fraudResult.final_score.toFixed(2),
          status: fraudResult.resolution_tier.toLowerCase().replace(/_/g, '_'),
          fraud_signals: fraudResult.individual_signal_scores,
        });
        claimsCreated++;
      } catch (workerErr) {
        req.log.error({ workerErr, workerId: worker.id }, "Failed to generate claim for worker during simulation");
      }
    }

    broadcastNotification({
      id: disruption.id,
      title: "Zone Disruption Triggered",
      message: `${event_type.replace(/_/g, ' ').toUpperCase()} initiated in ${zone.name}. ${claimsCreated > 0 ? claimsCreated + ' claims auto-generated.' : ''}`,
      role: "all",
      timestamp: new Date().toISOString()
    });

    return res.json({
      success: true,
      disruption,
      zone,
      claims_created: claimsCreated,
      message: `Disruption triggered in ${zone.name}. ${claimsCreated} claims auto-generated.`,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to trigger disruption");
    return res.status(500).json({ error: "Failed to trigger disruption" });
  }
});

router.post("/simulator/resolve/:zoneId", async (req, res) => {
  try {
    const { zoneId } = req.params;

    // End active disruptions
    await db.update(disruptionEventsTable).set({
      is_active: false,
      ended_at: new Date(),
    }).where(and(eq(disruptionEventsTable.zone_id, zoneId), eq(disruptionEventsTable.is_active, true)));

    // Restore zone to normal
    const normalGds = 15 + Math.floor(Math.random() * 15);
    const [zone] = await db.update(zonesTable).set({
      gds_score: normalGds,
      status: "normal",
      rainfall_mm: "2.5",
      traffic_score: "3.0",
      aqi: 80,
      demand_drop_pct: 5,
      govt_alert: false,
      last_updated: new Date(),
    }).where(eq(zonesTable.id, zoneId)).returning();

    if (!zone) return res.status(404).json({ error: "Zone not found" });

    // Mark auto_approved claims as paid and credit wallets
    const claimsToPay = await db.update(claimsTable).set({
      status: "paid",
      paid_at: new Date(),
    }).where(and(eq(claimsTable.zone_id, zoneId), eq(claimsTable.status, "auto_approved"))).returning();

    for (const claim of claimsToPay) {
      if (claim.payout_amount && parseFloat(claim.payout_amount) > 0) {
        try {
          const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.worker_id, claim.worker_id)).limit(1);
          if (wallet) {
            await creditWallet(
              wallet.id,
              claim.worker_id,
              claim.payout_amount,
              "claim_payout",
              claim.id,
              `Claim payout — ${claim.disruption_type?.replace(/_/g, " ") || "disruption event"}`
            );
          }
        } catch (walletErr) {
          req.log.error({ err: walletErr, claimId: claim.id }, "Failed to credit wallet during simulation resolve");
        }
      }
    }

    broadcastNotification({
      id: Date.now().toString(),
      title: "Disruption Resolved",
      message: `Zone ${zone.name} has been restored to normal operations.`,
      role: "all",
      timestamp: new Date().toISOString()
    });

    return res.json({
      success: true,
      zone,
      message: `Disruption resolved in ${zone.name}. Zone restored to normal.`,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to resolve disruption");
    return res.status(500).json({ error: "Failed to resolve disruption" });
  }
});

router.get("/disruptions", async (req, res) => {
  try {
    const { is_active, zone_id } = req.query as Record<string, string>;
    const conditions = [];
    if (is_active !== undefined) conditions.push(eq(disruptionEventsTable.is_active, is_active === "true"));
    if (zone_id) conditions.push(eq(disruptionEventsTable.zone_id, zone_id));

    const disruptions = await db.select().from(disruptionEventsTable)
      .where(conditions.length > 0 ? (conditions.length === 1 ? conditions[0] : and(...conditions)) : undefined)
      .orderBy(disruptionEventsTable.created_at);
    return res.json({ disruptions });
  } catch (err) {
    req.log.error({ err }, "Failed to list disruptions");
    return res.status(500).json({ error: "Failed to list disruptions" });
  }
});

export default router;
