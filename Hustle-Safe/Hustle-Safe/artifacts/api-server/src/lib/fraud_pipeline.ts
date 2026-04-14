import { db, workersTable, claimsTable, zonesTable, fraudAuditLogTable } from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";
import celery from "celery-node";
import { logger } from "./logger.js";
import { runPass1Scorer, runPass2Scorer, FraudPass2Context, SignalStatus } from "./fraud_logic.js";

interface FinalFraudEvaluationResult {
  final_score: number;
  resolution_tier: string;
  individual_signal_scores: Record<string, number | null>;
  signal_status: Record<string, SignalStatus>;
  critical_flags_fired: boolean;
  critical_flag_signals: string[];
  worker_trust_score: number;
  adaptive_threshold_used: number;
  primary_elevated_signal: string;
  pass2_triggered: boolean;
  pass2_trigger_reason: string;
  adversarial_elevated_count: number;
  data_quality: {
    available_signals: number;
    total_signals: number;
    availability_ratio: number;
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function getPrimaryElevatedSignal(signals: Record<string, number | null>): string {
  let highestKey = "none";
  let highestVal = 0;
  for (const [key, value] of Object.entries(signals)) {
    if (value !== null && value > highestVal && value >= 0.6) {
      highestVal = value;
      highestKey = key;
    }
  }
  return highestKey;
}

function normalizeWeightedScore(components: Array<{ value: number | null; weight: number }>): number {
  const available = components.filter((component) => component.value !== null);
  const totalWeight = available.reduce((sum, component) => sum + component.weight, 0);
  if (totalWeight <= 0) return 0;

  const weighted = available.reduce((sum, component) => {
    return sum + ((component.value as number) * component.weight);
  }, 0);

  return clamp01(weighted / totalWeight);
}

function signalAvailability(signalStatus: Record<string, SignalStatus>): { available: number; total: number; ratio: number } {
  const statuses = Object.values(signalStatus);
  const available = statuses.filter((status) => status === "computed").length;
  const total = statuses.length;
  return {
    available,
    total,
    ratio: total > 0 ? Number((available / total).toFixed(3)) : 0,
  };
}

function countAdversarialElevations(signals: Record<string, number | null>, threshold = 0.7): number {
  const adversarialKeys = [
    "signal_6_gps_coherence",
    "signal_7_cell_discordance",
    "signal_8_accelerometer",
    "signal_9_pre_disruption",
    "signal_10_coordinated_ring",
    "signal_11_zone_novelty",
    "signal_12_gps_anomaly",
  ];

  return adversarialKeys.reduce((count, key) => {
    return count + (((signals[key] ?? 0) >= threshold) ? 1 : 0);
  }, 0);
}

export async function computeAndUpdateTrustScore(workerId: string): Promise<number> {
  const [worker] = await db.select().from(workersTable).where(eq(workersTable.id, workerId)).limit(1);
  if (!worker) return 0.5;

  const rejectedQuery = await db.execute(sql`SELECT count(*) FROM ${claimsTable} WHERE worker_id = ${workerId} AND status IN ('rejected', 'fraudulent')`);
  const rejectedCount = Number(rejectedQuery.rows[0].count);

  if (rejectedCount > 0) {
    await db.update(workersTable).set({ trust_score: "0.10" }).where(eq(workersTable.id, workerId));
    return 0.1;
  }

  const approvedQuery = await db.execute(sql`SELECT count(*) FROM ${claimsTable} WHERE worker_id = ${workerId} AND status = 'paid'`);
  const approvedCount = Number(approvedQuery.rows[0].count);

  const ageBonus = Math.min(Number(worker.account_age_days) / 365 * 0.3, 0.3);
  const approvalBonus = Math.min(approvedCount * 0.05, 0.3);
  const finalTrust = Math.min(0.4 + ageBonus + approvalBonus, 1.0);

  await db.update(workersTable).set({ trust_score: finalTrust.toFixed(2) }).where(eq(workersTable.id, workerId));
  return finalTrust;
}

export async function evaluateFraudClaim(context: FraudPass2Context): Promise<FinalFraudEvaluationResult> {
  const pass1 = await runPass1Scorer(context);
  const pass1HighRisk = pass1.composite_score > 0.72;

  const signals: Record<string, number | null> = {
    gps_match: pass1.details.gps_match,
    weather_correlation: pass1.details.weather_correlation,
    peer_activity: pass1.details.peer_activity,
    historical_pattern: pass1.details.historical_pattern,
    device_fingerprint: pass1.details.device_fingerprint,
    signal_6_gps_coherence: null,
    signal_7_cell_discordance: null,
    signal_8_accelerometer: null,
    signal_9_pre_disruption: null,
    signal_10_coordinated_ring: null,
    signal_11_zone_novelty: null,
    signal_12_gps_anomaly: null,
  };

  const signalStatus: Record<string, SignalStatus> = {
    gps_match: pass1.signal_status.gps_match,
    weather_correlation: pass1.signal_status.weather_correlation,
    peer_activity: pass1.signal_status.peer_activity,
    historical_pattern: pass1.signal_status.historical_pattern,
    device_fingerprint: pass1.signal_status.device_fingerprint,
    signal_6_gps_coherence: "missing_data",
    signal_7_cell_discordance: "missing_data",
    signal_8_accelerometer: "missing_data",
    signal_9_pre_disruption: "missing_data",
    signal_10_coordinated_ring: "missing_data",
    signal_11_zone_novelty: "missing_data",
    signal_12_gps_anomaly: "missing_data",
  };

  let pass2: Awaited<ReturnType<typeof runPass2Scorer>> | null = null;
  let pass2Critical = false;
  let pass2Triggered = false;
  let pass2TriggerReason = "pass1_clear";

  const pass2Threshold = 0.40;
  if (pass1.composite_score >= pass2Threshold) {
    pass2Triggered = true;
    pass2TriggerReason = pass1HighRisk ? "pass1_high_risk" : "pass1_amber";
    pass2 = await runPass2Scorer(context);

    signals.signal_6_gps_coherence = pass2.details.signal_6_gps_coherence;
    signals.signal_7_cell_discordance = pass2.details.signal_7_cell_discordance;
    signals.signal_8_accelerometer = pass2.details.signal_8_accelerometer;
    signals.signal_9_pre_disruption = pass2.details.signal_9_pre_disruption;
    signals.signal_10_coordinated_ring = pass2.details.signal_10_coordinated_ring;
    signals.signal_11_zone_novelty = pass2.details.signal_11_zone_novelty;
    signals.signal_12_gps_anomaly = pass2.details.signal_12_gps_anomaly;

    signalStatus.signal_6_gps_coherence = pass2.signal_status.signal_6_gps_coherence;
    signalStatus.signal_7_cell_discordance = pass2.signal_status.signal_7_cell_discordance;
    signalStatus.signal_8_accelerometer = pass2.signal_status.signal_8_accelerometer;
    signalStatus.signal_9_pre_disruption = pass2.signal_status.signal_9_pre_disruption;
    signalStatus.signal_10_coordinated_ring = pass2.signal_status.signal_10_coordinated_ring;
    signalStatus.signal_11_zone_novelty = pass2.signal_status.signal_11_zone_novelty;
    signalStatus.signal_12_gps_anomaly = pass2.signal_status.signal_12_gps_anomaly;

    pass2Critical = pass2.critical_flag;
  }

  let xgbScore: number | null = null;
  try {
    const celeryClient = celery.createClient(
      process.env.REDIS_URL || "redis://localhost:6379/0",
      process.env.REDIS_URL || "redis://localhost:6379/0",
    );
    const task = celeryClient.createTask("tasks.evaluate_pipeline_xgb");
    const asyncResult = task.applyAsync([signals]);
    const mlResult = await asyncResult.get(5000);

    if (mlResult?.fraud_probability !== null && mlResult?.fraud_probability !== undefined) {
      const parsed = Number(mlResult.fraud_probability);
      xgbScore = Number.isFinite(parsed) ? clamp01(parsed) : null;
    }
  } catch (err) {
    logger.error({ err }, "XGB inference failed");
  }

  const trustScore = await computeAndUpdateTrustScore(context.worker_id);

  let adaptiveThreshold = 0.40;
  if (trustScore > 0.7) adaptiveThreshold = 0.35;
  else if (trustScore < 0.3) adaptiveThreshold = 0.45;

  const [zone] = await db.select().from(zonesTable).where(eq(zonesTable.id, context.zone_id)).limit(1);
  if (zone) {
    const isBlack = zone.gds_score > 80;
    if (isBlack) adaptiveThreshold -= 0.03;
    else adaptiveThreshold += 0.05;
  }

  const blendedScore = pass2
    ? normalizeWeightedScore([
      { value: pass1.composite_score, weight: 0.55 },
      { value: pass2.composite_score, weight: 0.45 },
    ])
    : pass1.composite_score;

  const finalScore = normalizeWeightedScore([
    { value: xgbScore, weight: 0.4 },
    { value: blendedScore, weight: 0.6 },
  ]);

  let tier = "AUTO_APPROVE";
  const primarySignal = getPrimaryElevatedSignal(signals);
  const criticalSignalKeys = ["signal_7_cell_discordance", "signal_10_coordinated_ring", "signal_12_gps_anomaly"];
  const criticalFlagSignals = criticalSignalKeys.filter((key) => (signals[key] ?? 0) >= 0.9);
  const adversarialElevatedCount = countAdversarialElevations(signals, 0.7);

  if (finalScore > 0.92 && pass2 !== null && adversarialElevatedCount >= 3) {
    tier = "AUTO_REJECT";
  }

  if (tier !== "AUTO_REJECT") {
    // Critical adversarial flags bypass amber and route to insurer review.
    if (criticalFlagSignals.length > 0 || pass2Critical) {
      tier = "INSURER_REVIEW";
    } else if (pass1HighRisk || finalScore > (adaptiveThreshold + 0.35) || (xgbScore ?? 0) > 0.85) {
      tier = "INSURER_REVIEW";
    } else if (finalScore >= adaptiveThreshold) {
      if (primarySignal === "historical_pattern" || primarySignal === "signal_11_zone_novelty") {
        tier = "SOFT_HOLD_LOW_FRICTION";
      } else if (primarySignal.includes("gps") || primarySignal.includes("weather") || primarySignal.includes("cell")) {
        tier = "SOFT_HOLD_EVIDENCE_REQUEST";
      } else {
        tier = "INSURER_REVIEW";
      }
    }
  }

  const quality = signalAvailability(signalStatus);
  const missingCriticalCount = criticalSignalKeys.filter((signal) => signalStatus[signal] !== "computed").length;

  // Safety gate: route to manual review when decision-critical telemetry is insufficient.
  // If only one critical signal is missing and pass1 is clean, keep low-friction review path.
  if (missingCriticalCount >= 2 || quality.ratio < 0.75) {
    if (missingCriticalCount === 1 && pass1.composite_score < 0.40 && criticalFlagSignals.length === 0 && tier !== "AUTO_REJECT") {
      tier = "SOFT_HOLD_LOW_FRICTION";
    } else {
      tier = "INSURER_REVIEW";
    }
  }

  try {
    await db.insert(fraudAuditLogTable).values({
      claim_id: context.claim_id || "00000000-0000-0000-0000-000000000000",
      worker_id: context.worker_id,
      signals: {
        ...signals,
        signal_status: signalStatus,
        data_quality: quality,
      },
      pass1_composite: pass1.composite_score.toString(),
      pass2_composite: pass2 ? pass2.composite_score.toString() : undefined,
      xgboost_score: (xgbScore ?? finalScore).toString(),
      resolution_tier: tier,
      critical_flags: {
        pass2Critical,
        critical_flag_signals: criticalFlagSignals,
        adversarial_elevated_count: adversarialElevatedCount,
        missing_critical_signals: missingCriticalCount,
      },
      model_version: "v2_status_aware",
      adaptive_threshold_applied: adaptiveThreshold.toString(),
      device_id: context.device_id,
    });
  } catch (err) {
    logger.error({ err }, "Audit log insert failed");
  }

  return {
    final_score: Number(finalScore.toFixed(3)),
    resolution_tier: tier,
    individual_signal_scores: signals,
    signal_status: signalStatus,
    critical_flags_fired: pass2Critical || criticalFlagSignals.length > 0,
    critical_flag_signals: criticalFlagSignals,
    worker_trust_score: trustScore,
    adaptive_threshold_used: Number(adaptiveThreshold.toFixed(3)),
    primary_elevated_signal: primarySignal,
    pass2_triggered: pass2Triggered,
    pass2_trigger_reason: pass2TriggerReason,
    adversarial_elevated_count: adversarialElevatedCount,
    data_quality: {
      available_signals: quality.available,
      total_signals: quality.total,
      availability_ratio: quality.ratio,
    },
  };
}
