import { Router } from "express";
import { db, policiesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const TIER_CONFIG = {
  basic: { weekly_premium: "15.00", coverage_cap: "600.00" },
  standard: { weekly_premium: "25.00", coverage_cap: "1200.00" },
  pro: { weekly_premium: "40.00", coverage_cap: "1750.00" },
};

const router = Router();

router.get("/policies", async (req, res) => {
  try {
    const { worker_id, status } = req.query as Record<string, string>;
    const conditions = [];
    if (worker_id) conditions.push(eq(policiesTable.worker_id, worker_id));
    if (status) conditions.push(eq(policiesTable.status, status));

    const policies = await db.select().from(policiesTable)
      .where(conditions.length > 0 ? (conditions.length === 1 ? conditions[0] : sql`${conditions[0]} AND ${conditions[1]}`) : undefined)
      .orderBy(policiesTable.created_at);

    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(policiesTable);
    return res.json({ policies, total: Number(count) });
  } catch (err) {
    req.log.error({ err }, "Failed to list policies");
    return res.status(500).json({ error: "Failed to list policies" });
  }
});

router.get("/policies/:id", async (req, res) => {
  try {
    const [policy] = await db.select().from(policiesTable).where(eq(policiesTable.id, req.params.id));
    if (!policy) return res.status(404).json({ error: "Policy not found" });
    return res.json(policy);
  } catch (err) {
    req.log.error({ err }, "Failed to get policy");
    return res.status(500).json({ error: "Failed to get policy" });
  }
});

router.post("/policies", async (req, res) => {
  try {
    const { worker_id, tier, zone_id } = req.body;
    if (!worker_id || !tier) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const tierConfig = TIER_CONFIG[tier as keyof typeof TIER_CONFIG];
    if (!tierConfig) return res.status(400).json({ error: "Invalid tier" });

    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    const [policy] = await db.insert(policiesTable).values({
      worker_id,
      tier,
      zone_id,
      weekly_premium: tierConfig.weekly_premium,
      coverage_cap: tierConfig.coverage_cap,
      status: "active",
      expires_at: expiresAt,
    }).returning();
    return res.status(201).json(policy);
  } catch (err) {
    req.log.error({ err }, "Failed to create policy");
    return res.status(500).json({ error: "Failed to create policy" });
  }
});

export default router;
