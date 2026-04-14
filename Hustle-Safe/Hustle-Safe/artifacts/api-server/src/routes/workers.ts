import { Router } from "express";
import { db, workersTable, gpsHistoryTable, policiesTable, claimsTable } from "@workspace/db";
import { eq, sql, and, desc } from "drizzle-orm";
import { provisionWallet } from "../lib/wallet.js";

const router = Router();

router.get("/workers", async (req, res) => {
  try {
    const { zone_id, tier, limit = "50", offset = "0" } = req.query as Record<string, string>;
    let query = db.select().from(workersTable);
    const conditions = [];
    if (zone_id) conditions.push(eq(workersTable.zone_id, zone_id));
    if (tier) conditions.push(eq(workersTable.policy_tier, tier));

    const workers = await db.select().from(workersTable)
      .where(conditions.length > 0 ? (conditions.length === 1 ? conditions[0] : sql`${conditions[0]} AND ${conditions[1]}`) : undefined)
      .limit(parseInt(limit))
      .offset(parseInt(offset));

    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(workersTable);
    return res.json({ workers, total: Number(count) });
  } catch (err) {
    req.log.error({ err }, "Failed to list workers");
    return res.status(500).json({ error: "Failed to list workers" });
  }
});

router.get("/workers/phone/:phone", async (req, res) => {
  try {
    const phone = decodeURIComponent(req.params.phone);
    const [worker] = await db.select().from(workersTable).where(eq(workersTable.phone, phone));
    if (!worker) return res.status(404).json({ error: "Worker not found" });
    return res.json(worker);
  } catch (err) {
    req.log.error({ err }, "Failed to get worker by phone");
    return res.status(500).json({ error: "Failed to get worker" });
  }
});

router.get("/workers/:id", async (req, res) => {
  try {
    const [worker] = await db.select().from(workersTable).where(eq(workersTable.id, req.params.id));
    if (!worker) return res.status(404).json({ error: "Worker not found" });
    return res.json(worker);
  } catch (err) {
    req.log.error({ err }, "Failed to get worker");
    return res.status(500).json({ error: "Failed to get worker" });
  }
});

router.get("/workers/:id/statistics", async (req, res) => {
  try {
    const { id } = req.params;

    const [stats] = await db.select({
      total_payouts_ytd: sql<number>`COALESCE(SUM(payout_amount::numeric), 0)`,
      events_this_year: sql<number>`COUNT(*) FILTER (WHERE status = 'paid')`,
    })
      .from(claimsTable)
      .where(and(
        eq(claimsTable.worker_id, id),
        sql`EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE)`
      ));

    const [policy] = await db.select()
      .from(policiesTable)
      .where(and(eq(policiesTable.worker_id, id), eq(policiesTable.status, "active")))
      .limit(1);

    return res.json({
      total_payouts_ytd: Number(stats?.total_payouts_ytd || 0),
      events_this_year: Number(stats?.events_this_year || 0),
      coverage_cap: policy ? parseFloat(policy.coverage_cap) : 800,
      policy_tier: policy?.tier || "Standard"
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get worker statistics");
    return res.status(500).json({ error: "Failed to get statistics" });
  }
});

router.post("/workers", async (req, res) => {
  try {
    const { name, phone, email, platform, zone_id, upi_id, policy_tier } = req.body;
    if (!name || !phone || !platform || !zone_id || !policy_tier) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const [worker] = await db.insert(workersTable).values({
      name, phone, email, platform, zone_id, upi_id, policy_tier,
      platform_rating: "4.5",
      is_active: true,
      fraud_score: "0.05",
      account_age_days: 1,
    }).returning();
    // Auto-provision a zero-balance wallet for this worker
    provisionWallet(worker.id).catch((err) =>
      req.log.error({ err, workerId: worker.id }, "Failed to provision wallet for new worker")
    );

    // Auto-provision a default active policy so the disruption simulator can generate claims
    const tierCaps: Record<string, string> = { basic: "400.00", standard: "800.00", pro: "1500.00" };
    const tierPremiums: Record<string, string> = { basic: "15.00", standard: "28.50", pro: "45.00" };
    db.insert(policiesTable).values({
      worker_id: worker.id,
      tier: policy_tier,
      weekly_premium: tierPremiums[policy_tier] || "28.50",
      coverage_cap: tierCaps[policy_tier] || "800.00",
      status: "active",
      zone_id: zone_id,
    }).catch((err) =>
      req.log.error({ err, workerId: worker.id }, "Failed to auto-provision policy")
    );

    return res.status(201).json(worker);
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to create worker");
    if ((err as { code?: string }).code === "23505") {
      return res.status(409).json({ error: "Phone number already registered" });
    }
    return res.status(500).json({ error: "Failed to create worker" });
  }
});

router.post("/workers/:id/ping", async (req, res) => {
  try {
    const { lat, lng, accuracy, cell_lat, cell_lng, session_active, zone_id } = req.body;
    
    await db.insert(gpsHistoryTable).values({
      worker_id: req.params.id as any,
      lat: String(lat),
      lng: String(lng),
      accuracy: accuracy ? Number(accuracy) : 10.0,
      cell_lat: cell_lat ? String(cell_lat) : null,
      cell_lng: cell_lng ? String(cell_lng) : null,
      session_active: session_active !== undefined ? !!session_active : true,
      zone_id: zone_id as any,
      timestamp: new Date(),
    });

    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to record worker ping");
    return res.status(500).json({ error: "Telemetry ingestion failed" });
  }
});

export default router;
