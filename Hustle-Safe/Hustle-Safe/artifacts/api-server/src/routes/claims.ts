import { Router } from "express";
import { db, claimsTable, workersTable, zonesTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import { broadcastNotification } from "./notifications.js";

const router = Router();

router.get("/claims", async (req, res) => {
  try {
    const { worker_id, status, zone_id, limit = "50", offset = "0" } = req.query as Record<string, string>;

    const conditions = [];
    if (worker_id) conditions.push(eq(claimsTable.worker_id, worker_id));
    if (status) conditions.push(eq(claimsTable.status, status));
    if (zone_id) conditions.push(eq(claimsTable.zone_id, zone_id));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const claimsRaw = await db.select({
      claim: claimsTable,
      worker_name: workersTable.name,
      zone_name: zonesTable.name,
    })
      .from(claimsTable)
      .leftJoin(workersTable, eq(claimsTable.worker_id, workersTable.id))
      .leftJoin(zonesTable, eq(claimsTable.zone_id, zonesTable.id))
      .where(whereClause)
      .orderBy(sql`${claimsTable.created_at} DESC`)
      .limit(parseInt(limit))
      .offset(parseInt(offset));

    const claims = claimsRaw.map(({ claim, worker_name, zone_name }) => ({
      ...claim,
      worker_name,
      zone_name,
    }));

    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(claimsTable).where(whereClause);
    res.json({ claims, total: Number(count) });
  } catch (err) {
    req.log.error({ err }, "Failed to list claims");
    res.status(500).json({ error: "Failed to list claims" });
  }
});

router.get("/claims/:id", async (req, res) => {
  try {
    const [claimRaw] = await db.select({
      claim: claimsTable,
      worker_name: workersTable.name,
      zone_name: zonesTable.name,
    })
      .from(claimsTable)
      .leftJoin(workersTable, eq(claimsTable.worker_id, workersTable.id))
      .leftJoin(zonesTable, eq(claimsTable.zone_id, zonesTable.id))
      .where(eq(claimsTable.id, req.params.id));

    if (!claimRaw) return res.status(404).json({ error: "Claim not found" });
    res.json({ ...claimRaw.claim, worker_name: claimRaw.worker_name, zone_name: claimRaw.zone_name });
  } catch (err) {
    req.log.error({ err }, "Failed to get claim");
    res.status(500).json({ error: "Failed to get claim" });
  }
});

router.patch("/claims/:id", async (req, res) => {
  try {
    const { status, resolution_notes } = req.body;
    const updates: Record<string, unknown> = {};
    if (status) updates.status = status;
    if (resolution_notes) updates.resolution_notes = resolution_notes;
    if (status === "paid") updates.paid_at = new Date();

    const [updated] = await db.update(claimsTable).set(updates).where(eq(claimsTable.id, req.params.id)).returning();
    if (!updated) return res.status(404).json({ error: "Claim not found" });

    broadcastNotification({
      id: updated.id,
      title: `Claim ${updated.status.replace(/_/g, ' ').toUpperCase()}`,
      message: `A claim update was processed for ${updated.disruption_type?.replace(/_/g, ' ') || 'unknown'}.`,
      role: "all",
      timestamp: new Date().toISOString()
    });

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update claim");
    res.status(500).json({ error: "Failed to update claim" });
  }
});

export default router;
