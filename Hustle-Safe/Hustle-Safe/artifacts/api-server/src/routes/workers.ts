import { Router } from "express";
import { db, workersTable, policiesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
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
    res.json({ workers, total: Number(count) });
  } catch (err) {
    req.log.error({ err }, "Failed to list workers");
    res.status(500).json({ error: "Failed to list workers" });
  }
});

router.get("/workers/phone/:phone", async (req, res) => {
  try {
    const phone = decodeURIComponent(req.params.phone);
    const [worker] = await db.select().from(workersTable).where(eq(workersTable.phone, phone));
    if (!worker) return res.status(404).json({ error: "Worker not found" });
    res.json(worker);
  } catch (err) {
    req.log.error({ err }, "Failed to get worker by phone");
    res.status(500).json({ error: "Failed to get worker" });
  }
});

router.get("/workers/:id", async (req, res) => {
  try {
    const [worker] = await db.select().from(workersTable).where(eq(workersTable.id, req.params.id));
    if (!worker) return res.status(404).json({ error: "Worker not found" });
    res.json(worker);
  } catch (err) {
    req.log.error({ err }, "Failed to get worker");
    res.status(500).json({ error: "Failed to get worker" });
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

    res.status(201).json(worker);
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to create worker");
    if ((err as { code?: string }).code === "23505") {
      return res.status(409).json({ error: "Phone number already registered" });
    }
    res.status(500).json({ error: "Failed to create worker" });
  }
});

export default router;
