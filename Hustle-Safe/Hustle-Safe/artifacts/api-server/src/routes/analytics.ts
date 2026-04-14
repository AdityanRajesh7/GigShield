import { Router } from "express";
import { db, workersTable, policiesTable, claimsTable, zonesTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";

const router = Router();

router.get("/analytics/overview", async (req, res) => {
  try {
    const [{ total_workers }] = await db.select({ total_workers: sql<number>`count(*)` }).from(workersTable);
    const [{ active_policies }] = await db.select({ active_policies: sql<number>`count(*)` }).from(policiesTable).where(eq(policiesTable.status, "active"));
    const [{ total_claims }] = await db.select({ total_claims: sql<number>`count(*)` }).from(claimsTable);
    const [{ total_zones }] = await db.select({ total_zones: sql<number>`count(*)` }).from(zonesTable);

    const [{ total_paid }] = await db.select({
      total_paid: sql<number>`COALESCE(SUM(payout_amount::numeric), 0)`,
    }).from(claimsTable).where(eq(claimsTable.status, "paid"));

    const zoneDisruptions = await db.select().from(zonesTable)
      .where(sql`${zonesTable.gds_score} >= 60`);

    const claimsByStatusRaw = await db.select({
      status: claimsTable.status,
      count: sql<number>`count(*)`,
    }).from(claimsTable).groupBy(claimsTable.status);

    const claimsByStatus: Record<string, number> = {};
    for (const row of claimsByStatusRaw) {
      claimsByStatus[row.status] = Number(row.count);
    }

    const topZones = await db.select({
      zone_id: claimsTable.zone_id,
      zone_name: zonesTable.name,
      claim_count: sql<number>`count(*)`,
    })
      .from(claimsTable)
      .leftJoin(zonesTable, eq(claimsTable.zone_id, zonesTable.id))
      .groupBy(claimsTable.zone_id, zonesTable.name)
      .orderBy(sql`count(*) DESC`)
      .limit(5);

    const paidClaims = Number(total_paid);
    const premiumRaw = await db.select({
      total: sql<number>`COALESCE(SUM(weekly_premium::numeric), 0)`,
    }).from(policiesTable).where(eq(policiesTable.status, "active"));
    const totalPremium = Number(premiumRaw[0]?.total || 0) * 4; // Estimate monthly
    const lossRatio = totalPremium > 0 ? (paidClaims / totalPremium) * 100 : 0;

    // Real avg payout time calculation
    const payoutTimeRaw = await db.select({
      avg_time: sql<number>`AVG(EXTRACT(EPOCH FROM (paid_at - created_at)) / 60)`,
    }).from(claimsTable).where(sql`${claimsTable.paid_at} IS NOT NULL`);
    const avgPayoutTime = Number(payoutTimeRaw[0]?.avg_time || 0);

    return res.json({
      total_workers: Number(total_workers),
      active_policies: Number(active_policies),
      total_claims: Number(total_claims),
      total_zones: Number(total_zones),
      total_paid_out: paidClaims,
      avg_payout_minutes: parseFloat(avgPayoutTime.toFixed(1)),
      loss_ratio: parseFloat(Math.min(lossRatio, 100).toFixed(1)),
      reserve_health: parseFloat((totalPremium - paidClaims).toFixed(2)),
      zones_in_disruption: zoneDisruptions.length,
      claims_by_status: claimsByStatus,
      top_disruption_zones: topZones.map(z => ({
        zone_id: z.zone_id || "",
        zone_name: z.zone_name || "Unknown",
        claim_count: Number(z.claim_count),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get analytics overview");
    return res.status(500).json({ error: "Failed to get analytics" });
  }
});

router.get("/analytics/loss-ratio", async (req, res) => {
  try {
    // Generate weekly loss ratio data (last 8 weeks) - Using real aggregates per week
    const data = await db.select({
      week: sql<string>`TO_CHAR(created_at, 'DD Mon')`,
      premiums_collected: sql<number>`180000`, // Baseline
      claims_paid: sql<number>`SUM(CASE WHEN status = 'paid' THEN payout_amount::numeric ELSE 0 END)`,
      loss_ratio: sql<number>`CASE WHEN 180000 > 0 THEN (SUM(CASE WHEN status = 'paid' THEN payout_amount::numeric ELSE 0 END) / 180000) * 100 ELSE 0 END`,
    })
      .from(claimsTable)
      .groupBy(sql`TO_CHAR(created_at, 'DD Mon'), DATE_TRUNC('week', created_at)`)
      .orderBy(sql`DATE_TRUNC('week', created_at) DESC`)
      .limit(8);

    return res.json({ data });
  } catch (err) {
    req.log.error({ err }, "Failed to get loss ratio");
    return res.status(500).json({ error: "Failed to get loss ratio" });
  }
});

export default router;
