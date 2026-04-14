import { Router } from "express";
import { db, zonesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/zones", async (req, res) => {
  try {
    const zones = await db.select().from(zonesTable).orderBy(zonesTable.name);
    return res.json({ zones });
  } catch (err) {
    req.log.error({ err }, "Failed to list zones");
    return res.status(500).json({ error: "Failed to list zones" });
  }
});

router.get("/zones/:id", async (req, res) => {
  try {
    const [zone] = await db.select().from(zonesTable).where(eq(zonesTable.id, req.params.id));
    if (!zone) return res.status(404).json({ error: "Zone not found" });
    return res.json(zone);
  } catch (err) {
    req.log.error({ err }, "Failed to get zone");
    return res.status(500).json({ error: "Failed to get zone" });
  }
});

router.patch("/zones/:id", async (req, res) => {
  try {
    const { gds_score, status, rainfall_mm, traffic_score, aqi, demand_drop_pct, govt_alert, active_workers } = req.body;
    const updates: Record<string, unknown> = { last_updated: new Date() };
    if (gds_score !== undefined) updates.gds_score = gds_score;
    if (status !== undefined) updates.status = status;
    if (rainfall_mm !== undefined) updates.rainfall_mm = rainfall_mm.toString();
    if (traffic_score !== undefined) updates.traffic_score = traffic_score.toString();
    if (aqi !== undefined) updates.aqi = aqi;
    if (demand_drop_pct !== undefined) updates.demand_drop_pct = demand_drop_pct;
    if (govt_alert !== undefined) updates.govt_alert = govt_alert;
    if (active_workers !== undefined) updates.active_workers = active_workers;

    const [updated] = await db.update(zonesTable).set(updates).where(eq(zonesTable.id, req.params.id)).returning();
    if (!updated) return res.status(404).json({ error: "Zone not found" });
    return res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update zone");
    return res.status(500).json({ error: "Failed to update zone" });
  }
});

export default router;
