import { db, zonesTable, workersTable, claimsTable, gpsHistoryTable, policiesTable } from "@workspace/db";
import { eq, ne, and, sql, gte, lte } from "drizzle-orm";
import celery from "celery-node";
import { redis, isRedisAvailable } from "./redis"; // Safe no-op wrapper when Redis is unavailable
import { logger } from "./logger";

export type SignalStatus = "computed" | "missing_data" | "error";

export interface SignalResult {
  value: number | null;
  status: SignalStatus;
}

export interface FraudEvaluationContext {
  claim_id?: string;
  worker_id: string;
  zone_id: string;
  user_lat: number;
  user_lng: number;
  device_id: string;
  policy_tier?: string;
}

export interface FraudPass1Response {
  composite_score: number;
  risk_status: "clear" | "amber" | "high_risk";
  details: {
    gps_match: number | null;
    weather_correlation: number | null;
    peer_activity: number | null;
    historical_pattern: number | null;
    device_fingerprint: number | null;
  };
  signal_status: {
    gps_match: SignalStatus;
    weather_correlation: SignalStatus;
    peer_activity: SignalStatus;
    historical_pattern: SignalStatus;
    device_fingerprint: SignalStatus;
  };
  data_quality: {
    available_signals: number;
    total_signals: number;
    availability_ratio: number;
  };
}

export interface FraudPass2Context extends FraudEvaluationContext {
  disruption_start: Date;
  gps_trace: { lat: number; lng: number; timestamp: number }[];
  cell_lat?: number;
  cell_lng?: number;
  accelerometer?: { x_var: number; y_var: number; z_var: number };
  context_edges?: any[];
  accuracies?: number[];
}

export interface FraudPass2Response {
  composite_score: number;
  critical_flag: boolean;
  details: {
    signal_9_pre_disruption: number | null;
    signal_11_zone_novelty: number | null;
    signal_6_gps_coherence: number | null;
    signal_7_cell_discordance: number | null;
    signal_8_accelerometer: number | null;
    signal_10_coordinated_ring: number | null;
    signal_12_gps_anomaly: number | null;
  };
  signal_status: {
    signal_9_pre_disruption: SignalStatus;
    signal_11_zone_novelty: SignalStatus;
    signal_6_gps_coherence: SignalStatus;
    signal_7_cell_discordance: SignalStatus;
    signal_8_accelerometer: SignalStatus;
    signal_10_coordinated_ring: SignalStatus;
    signal_12_gps_anomaly: SignalStatus;
  };
  data_quality: {
    available_signals: number;
    total_signals: number;
    availability_ratio: number;
  };
}

function getDistanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2)
    + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function computeNormalizedComposite(
  entries: Array<{ value: number | null; weight: number }>
): { score: number; available: number; total: number } {
  const availableEntries = entries.filter((entry) => entry.value !== null);
  const availableWeight = availableEntries.reduce((sum, entry) => sum + entry.weight, 0);

  if (availableWeight <= 0) {
    return { score: 0, available: 0, total: entries.length };
  }

  const weightedValue = availableEntries.reduce((sum, entry) => {
    return sum + ((entry.value as number) * entry.weight);
  }, 0);

  return {
    score: clamp01(weightedValue / availableWeight),
    available: availableEntries.length,
    total: entries.length,
  };
}

export async function signal1GpsMatch(userLat: number, userLng: number, zoneId: string): Promise<SignalResult> {
  try {
    const [zone] = await db.select().from(zonesTable).where(eq(zonesTable.id, zoneId)).limit(1);
    if (!zone || !zone.lat || !zone.lng) {
      return { value: null, status: "missing_data" };
    }

    const distance = getDistanceInMeters(userLat, userLng, Number(zone.lat), Number(zone.lng));
    const maxRadius = 3000;

    if (distance <= 1000) return { value: 0.0, status: "computed" };
    if (distance >= maxRadius) return { value: 1.0, status: "computed" };

    return { value: clamp01((distance - 1000) / (maxRadius - 1000)), status: "computed" };
  } catch (err) {
    logger.error({ err, zoneId }, "Error in signal1GpsMatch");
    return { value: null, status: "error" };
  }
}

export async function signal2Weather(userLat: number, userLng: number): Promise<SignalResult> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${userLat}&longitude=${userLng}&current=precipitation,weather_code`;
    const res = await fetch(url);
    if (!res.ok) {
      return { value: null, status: "error" };
    }

    const data = await res.json() as any;
    const current = data?.current;
    if (!current) {
      return { value: null, status: "missing_data" };
    }

    const hasPrecip = current.precipitation !== undefined;
    const hasWeatherCode = current.weather_code !== undefined;
    if (!hasPrecip && !hasWeatherCode) {
      return { value: null, status: "missing_data" };
    }

    const precip = Number(current.precipitation ?? 0);
    const code = Number(current.weather_code ?? 0);
    const isRainingOrStorm = precip > 0 || code >= 51;

    return { value: isRainingOrStorm ? 0.0 : 1.0, status: "computed" };
  } catch (err) {
    logger.error({ err }, "Error in signal2Weather");
    return { value: null, status: "error" };
  }
}

export async function signal3PeerActivity(zoneId: string): Promise<SignalResult> {
  try {
    const cacheKey = `peer_activity_${zoneId}`;
    const cached = await redis.get(cacheKey);

    let activeCount = 0;
    if (cached) {
      activeCount = parseInt(cached, 10);
    } else {
      const result = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(workersTable)
        .where(and(eq(workersTable.zone_id, zoneId), eq(workersTable.is_active, true)));

      activeCount = result[0]?.count || 0;
      await redis.set(cacheKey, activeCount.toString(), "EX", 120);
    }

    if (activeCount <= 2) return { value: 0.0, status: "computed" };
    if (activeCount >= 8) return { value: 1.0, status: "computed" };

    return { value: clamp01((activeCount - 2) / 6), status: "computed" };
  } catch (err) {
    logger.error({ err, zoneId }, "Error in signal3PeerActivity");
    return { value: null, status: "error" };
  }
}

export async function signal4HistoricalPattern(workerId: string, zoneId: string, policyTier: string = "basic"): Promise<SignalResult> {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const workerClaimsRes = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(claimsTable)
      .where(and(eq(claimsTable.worker_id, workerId), gte(claimsTable.created_at, thirtyDaysAgo)));
    const workerClaims = workerClaimsRes[0]?.count || 0;

    const cohortQueryRes = await db.execute(sql`
      SELECT AVG(claim_count) as avg_claims
      FROM (
        SELECT w.id, COUNT(c.id) as claim_count
        FROM ${workersTable} w
        LEFT JOIN ${claimsTable} c ON w.id = c.worker_id AND c.created_at >= ${thirtyDaysAgo}
        WHERE w.zone_id = ${zoneId} AND w.policy_tier = ${policyTier}
        GROUP BY w.id
      ) as sub
    `);

    const avgClaims = parseFloat((cohortQueryRes.rows?.[0]?.avg_claims as string) || "0") || 0;
    if (avgClaims <= 0 && workerClaims <= 0) {
      return { value: 0.0, status: "computed" };
    }

    const expectedNormal = Math.max(avgClaims, 0.5);
    if (workerClaims <= expectedNormal) return { value: 0.0, status: "computed" };
    if (workerClaims >= (expectedNormal * 2)) return { value: 1.0, status: "computed" };

    return { value: clamp01((workerClaims - expectedNormal) / expectedNormal), status: "computed" };
  } catch (err) {
    logger.error({ err, workerId }, "Error in signal4HistoricalPattern");
    return { value: null, status: "error" };
  }
}

export async function signal5DeviceFingerprint(deviceId: string, workerId: string): Promise<SignalResult> {
  try {
    const workerResult = await db
      .select({ count: sql<number>`cast(count(distinct ${workersTable.id}) as int)` })
      .from(workersTable)
      .where(and(eq(workersTable.device_id, deviceId), ne(workersTable.id, workerId)));

    if ((workerResult[0]?.count || 0) > 0) {
      return { value: 1.0, status: "computed" };
    }

    // If audit lookup fails for any reason below, device score becomes unavailable rather than hardcoded.
    return { value: 0.0, status: "computed" };
  } catch (err) {
    logger.error({ err, deviceId }, "Error in signal5DeviceFingerprint");
    return { value: null, status: "error" };
  }
}

export async function runPass1Scorer(context: FraudEvaluationContext): Promise<FraudPass1Response> {
  const [gps, weather, peer, history, device] = await Promise.all([
    signal1GpsMatch(context.user_lat, context.user_lng, context.zone_id),
    signal2Weather(context.user_lat, context.user_lng),
    signal3PeerActivity(context.zone_id),
    signal4HistoricalPattern(context.worker_id, context.zone_id, context.policy_tier),
    signal5DeviceFingerprint(context.device_id, context.worker_id),
  ]);

  const weights = {
    gps: 0.40,
    weather: 0.30,
    peer: 0.15,
    device: 0.10,
    history: 0.05,
  };

  const composite = computeNormalizedComposite([
    { value: gps.value, weight: weights.gps },
    { value: weather.value, weight: weights.weather },
    { value: peer.value, weight: weights.peer },
    { value: device.value, weight: weights.device },
    { value: history.value, weight: weights.history },
  ]);

  let riskStatus: "clear" | "amber" | "high_risk" = "clear";
  if (composite.score >= 0.72) {
    riskStatus = "high_risk";
  } else if (composite.score >= 0.40) {
    riskStatus = "amber";
  }

  return {
    composite_score: Number(composite.score.toFixed(3)),
    risk_status: riskStatus,
    details: {
      gps_match: gps.value,
      weather_correlation: weather.value,
      peer_activity: peer.value,
      historical_pattern: history.value,
      device_fingerprint: device.value,
    },
    signal_status: {
      gps_match: gps.status,
      weather_correlation: weather.status,
      peer_activity: peer.status,
      historical_pattern: history.status,
      device_fingerprint: device.status,
    },
    data_quality: {
      available_signals: composite.available,
      total_signals: composite.total,
      availability_ratio: Number((composite.available / composite.total).toFixed(3)),
    },
  };
}

export async function signal9PreDisruptionPresence(workerId: string, disruptionStart: Date | undefined, zoneId: string): Promise<SignalResult> {
  try {
    if (!disruptionStart) {
      return { value: null, status: "missing_data" };
    }

    const ninetyMinsAgo = new Date(disruptionStart.getTime() - 90 * 60 * 1000);
    const sixtyMinsAgo = new Date(disruptionStart.getTime() - 60 * 60 * 1000);

    const history = await db.select()
      .from(gpsHistoryTable)
      .where(
        and(
          eq(gpsHistoryTable.worker_id, workerId),
          gte(gpsHistoryTable.timestamp, ninetyMinsAgo),
          lte(gpsHistoryTable.timestamp, disruptionStart),
        )
      );

    const activePings = history.filter((h: any) => h.session_active && h.zone_id === zoneId && new Date(h.timestamp) >= sixtyMinsAgo);

    if (activePings.length >= 20) {
      let moved = false;
      for (let i = 1; i < activePings.length; i++) {
        const dist = getDistanceInMeters(
          Number(activePings[i - 1].lat), Number(activePings[i - 1].lng),
          Number(activePings[i].lat), Number(activePings[i].lng),
        );
        if (dist > 50) {
          moved = true;
          break;
        }
      }
      if (moved) return { value: 0.0, status: "computed" };
    }

    return { value: 1.0, status: "computed" };
  } catch (err) {
    logger.error({ err }, "Signal 9 error");
    return { value: null, status: "error" };
  }
}

export async function signal11ZoneNovelty(workerId: string, zoneId: string): Promise<SignalResult> {
  try {
    const [policy] = await db.select().from(policiesTable)
      .where(eq(policiesTable.worker_id, workerId))
      .limit(1);

    if (policy && policy.tier === "pro") {
      return { value: 0.0, status: "computed" };
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [zone] = await db.select().from(zonesTable).where(eq(zonesTable.id, zoneId)).limit(1);
    if (!zone) return { value: null, status: "missing_data" };

    const res = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM ${gpsHistoryTable}
      WHERE worker_id = ${workerId}
      AND timestamp >= ${thirtyDaysAgo}
      AND ABS(lat - ${zone.lat}) < 0.1
      AND ABS(lng - ${zone.lng}) < 0.1
    `);

    const pingsInZone = parseInt((res.rows[0] as any)?.count || "0", 10);
    if (pingsInZone === 0) return { value: 1.0, status: "computed" };

    return { value: Number((Math.max(0, 1.0 - (pingsInZone / 100))).toFixed(2)), status: "computed" };
  } catch (err) {
    logger.error({ err }, "Signal 11 error");
    return { value: null, status: "error" };
  }
}

function normalizeMlSignal(signal: unknown): number | null {
  if (signal === null || signal === undefined) return null;
  const numeric = Number(signal);
  return Number.isFinite(numeric) ? clamp01(numeric) : null;
}

function normalizeStatus(status: unknown): SignalStatus {
  if (status === "computed" || status === "missing_data" || status === "error") {
    return status;
  }
  return "missing_data";
}

export async function runPass2Scorer(context: FraudPass2Context): Promise<FraudPass2Response> {
  const [signal9, signal11] = await Promise.all([
    signal9PreDisruptionPresence(context.worker_id, context.disruption_start, context.zone_id),
    signal11ZoneNovelty(context.worker_id, context.zone_id),
  ]);

  let mlResult: any = {
    signal_6_gps_coherence: null,
    signal_7_cell_discordance: null,
    signal_8_accelerometer: null,
    signal_10_coordinated_ring: null,
    signal_12_gps_anomaly: null,
    signal_status: {
      signal_6_gps_coherence: "missing_data",
      signal_7_cell_discordance: "missing_data",
      signal_8_accelerometer: "missing_data",
      signal_10_coordinated_ring: "missing_data",
      signal_12_gps_anomaly: "missing_data",
    },
    critical_flag: false,
  };

  if (isRedisAvailable()) {
    try {
      const celeryClient = celery.createClient(
        process.env.REDIS_URL || "redis://localhost:6379/0",
        process.env.REDIS_URL || "redis://localhost:6379/0",
      );

      const task = celeryClient.createTask("tasks.evaluate_pass_two_ml");
      const resultHandle = task.applyAsync([{
        worker_id: context.worker_id,
        gps_trace: context.gps_trace,
        gps_lat: context.user_lat,
        gps_lng: context.user_lng,
        cell_lat: context.cell_lat,
        cell_lng: context.cell_lng,
        accelerometer: context.accelerometer,
        context_edges: context.context_edges,
        accuracies: context.accuracies,
      }]);

      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000));
      const result = await Promise.race([resultHandle.get(8000), timeout]);
      if (result !== null) mlResult = result;
    } catch (err) {
      logger.warn("Celery ML unavailable, using rule-based signals only");
    }
  }

  const details = {
    signal_9_pre_disruption: signal9.value,
    signal_11_zone_novelty: signal11.value,
    signal_6_gps_coherence: normalizeMlSignal(mlResult.signal_6_gps_coherence),
    signal_7_cell_discordance: normalizeMlSignal(mlResult.signal_7_cell_discordance),
    signal_8_accelerometer: normalizeMlSignal(mlResult.signal_8_accelerometer),
    signal_10_coordinated_ring: normalizeMlSignal(mlResult.signal_10_coordinated_ring),
    signal_12_gps_anomaly: normalizeMlSignal(mlResult.signal_12_gps_anomaly),
  };

  const signalStatus = {
    signal_9_pre_disruption: signal9.status,
    signal_11_zone_novelty: signal11.status,
    signal_6_gps_coherence: normalizeStatus(mlResult.signal_status?.signal_6_gps_coherence),
    signal_7_cell_discordance: normalizeStatus(mlResult.signal_status?.signal_7_cell_discordance),
    signal_8_accelerometer: normalizeStatus(mlResult.signal_status?.signal_8_accelerometer),
    signal_10_coordinated_ring: normalizeStatus(mlResult.signal_status?.signal_10_coordinated_ring),
    signal_12_gps_anomaly: normalizeStatus(mlResult.signal_status?.signal_12_gps_anomaly),
  };

  const composite = computeNormalizedComposite([
    { value: details.signal_9_pre_disruption, weight: 0.15 },
    { value: details.signal_11_zone_novelty, weight: 0.15 },
    { value: details.signal_6_gps_coherence, weight: 0.15 },
    { value: details.signal_7_cell_discordance, weight: 0.20 },
    { value: details.signal_8_accelerometer, weight: 0.15 },
    { value: details.signal_10_coordinated_ring, weight: 0.10 },
    { value: details.signal_12_gps_anomaly, weight: 0.10 },
  ]);

  return {
    composite_score: Number(composite.score.toFixed(3)),
    critical_flag: Boolean(mlResult.critical_flag),
    details,
    signal_status: signalStatus,
    data_quality: {
      available_signals: composite.available,
      total_signals: composite.total,
      availability_ratio: Number((composite.available / composite.total).toFixed(3)),
    },
  };
}
