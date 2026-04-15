import { Router } from "express";
import { db, claimsTable, workersTable, zonesTable, walletsTable, fraudAuditLogTable } from "@workspace/db";
import { eq, sql, and, desc } from "drizzle-orm";
import { broadcastNotification } from "./notifications.js";
import { creditWallet } from "../lib/wallet.js";

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
      zone_gds: zonesTable.gds_score,
      audit: {
        pass1_composite: fraudAuditLogTable.pass1_composite,
        pass2_composite: fraudAuditLogTable.pass2_composite,
        xgboost_score: fraudAuditLogTable.xgboost_score,
        resolution_tier: fraudAuditLogTable.resolution_tier,
        signals: fraudAuditLogTable.signals,
      }
    })
      .from(claimsTable)
      .leftJoin(workersTable, eq(claimsTable.worker_id, workersTable.id))
      .leftJoin(zonesTable, eq(claimsTable.zone_id, zonesTable.id))
      .leftJoin(fraudAuditLogTable, eq(claimsTable.id, fraudAuditLogTable.claim_id))
      .where(whereClause)
      .orderBy(sql`${claimsTable.created_at} DESC`)
      .limit(parseInt(limit))
      .offset(parseInt(offset));

    const claims = claimsRaw.map(({ claim, worker_name, zone_name, zone_gds, audit }) => ({
      ...claim,
      worker_name,
      zone_name,
      zone_gds: zone_gds ?? null,
      pass1_composite: audit?.pass1_composite ?? null,
      pass2_composite: audit?.pass2_composite ?? null,
      xgboost_score: audit?.xgboost_score ?? null,
      resolution_tier: audit?.resolution_tier ?? null,
      audit_signals: audit?.signals ?? null,
    }));

    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(claimsTable).where(whereClause);
    return res.json({ claims, total: Number(count) });
  } catch (err) {
    req.log.error({ err }, "Failed to list claims");
    return res.status(500).json({ error: "Failed to list claims" });
  }
});

router.get("/claims/:id", async (req, res) => {
  try {
    const [claimRaw] = await db.select({
      claim: claimsTable,
      worker_name: workersTable.name,
      zone_name: zonesTable.name,
      audit: {
        pass1_composite: fraudAuditLogTable.pass1_composite,
        pass2_composite: fraudAuditLogTable.pass2_composite,
        xgboost_score: fraudAuditLogTable.xgboost_score,
        resolution_tier: fraudAuditLogTable.resolution_tier,
        signals: fraudAuditLogTable.signals,
      }
    })
      .from(claimsTable)
      .leftJoin(workersTable, eq(claimsTable.worker_id, workersTable.id))
      .leftJoin(zonesTable, eq(claimsTable.zone_id, zonesTable.id))
      .leftJoin(fraudAuditLogTable, eq(claimsTable.id, fraudAuditLogTable.claim_id))
      .where(eq(claimsTable.id, req.params.id));

    if (!claimRaw) return res.status(404).json({ error: "Claim not found" });

    return res.json({
      ...claimRaw.claim,
      worker_name: claimRaw.worker_name,
      zone_name: claimRaw.zone_name,
      pass1_composite: claimRaw.audit?.pass1_composite ?? null,
      pass2_composite: claimRaw.audit?.pass2_composite ?? null,
      xgboost_score: claimRaw.audit?.xgboost_score ?? null,
      resolution_tier: claimRaw.audit?.resolution_tier ?? null,
      audit_signals: claimRaw.audit?.signals ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get claim");
    return res.status(500).json({ error: "Failed to get claim" });
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

    // When a claim is marked paid, credit the worker's wallet atomically
    if (status === "paid" && updated.payout_amount && parseFloat(updated.payout_amount) > 0) {
      try {
        const [wallet] = await db
          .select()
          .from(walletsTable)
          .where(eq(walletsTable.worker_id, updated.worker_id))
          .limit(1);

        if (wallet) {
          await creditWallet(
            wallet.id,
            updated.worker_id,
            updated.payout_amount,
            "claim_payout",
            updated.id,
            `Claim payout — ${updated.disruption_type?.replace(/_/g, " ") || "disruption event"}`
          );
        } else {
          req.log.warn({ workerId: updated.worker_id }, "No wallet found for worker — skipping credit");
        }
      } catch (walletErr) {
        // Non-fatal: claim is already marked paid, just log the wallet error
        req.log.error({ err: walletErr, claimId: updated.id }, "Failed to credit wallet for paid claim");
      }
    }

    broadcastNotification({
      id: updated.id,
      title: `Claim ${updated.status.replace(/_/g, ' ').toUpperCase()}`,
      message: `A claim update was processed for ${updated.disruption_type?.replace(/_/g, ' ') || 'unknown'}.`,
      role: "all",
      timestamp: new Date().toISOString()
    });

    return res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update claim");
    return res.status(500).json({ error: "Failed to update claim" });
  }
});

router.get("/claims/:id/fraud-context", async (req, res) => {
  try {
    const { id } = req.params;
    const [claim] = await db.select({
      fraud_score: claimsTable.fraud_score,
      status: claimsTable.status,
      zone_gds: zonesTable.gds_score,
      worker_trust: workersTable.trust_score,
    })
      .from(claimsTable)
      .leftJoin(zonesTable, eq(claimsTable.zone_id, zonesTable.id))
      .leftJoin(workersTable, eq(claimsTable.worker_id, workersTable.id))
      .where(eq(claimsTable.id, id));

    if (!claim) return res.status(404).json({ error: "Claim not found" });

    const [latestAudit] = await db
      .select({
        audit_signals: fraudAuditLogTable.signals,
        pass1_composite: fraudAuditLogTable.pass1_composite,
        pass2_composite: fraudAuditLogTable.pass2_composite,
        xgboost_score: fraudAuditLogTable.xgboost_score,
        resolution_tier: fraudAuditLogTable.resolution_tier,
      })
      .from(fraudAuditLogTable)
      .where(eq(fraudAuditLogTable.claim_id, id))
      .orderBy(desc(fraudAuditLogTable.timestamp))
      .limit(1);

    const signals = ((latestAudit?.audit_signals || {}) as Record<string, unknown>);
    const criticalSignalKeys = ["signal_7_cell_discordance", "signal_10_coordinated_ring", "signal_12_gps_anomaly"];
    const flags = criticalSignalKeys.filter((k) => Number(signals[k]) >= 0.9);

    let analysis = "Fraud context unavailable: no audit log found for this claim yet.";
    if (Object.keys(signals).length > 0) {
      const pass1 = Number(latestAudit?.pass1_composite ?? 0);
      const pass2 = Number(latestAudit?.pass2_composite ?? 0);
      const xgb = Number(latestAudit?.xgboost_score ?? 0);

      if (flags.length > 0) {
        analysis = `Critical flags fired (${flags.join(", ")}); claim routed to insurer review.`;
      } else if (pass1 < 0.4) {
        analysis = `Pass 1 clean (${pass1.toFixed(3)}); Pass 2 bypassed. XGBoost=${xgb.toFixed(3)}.`;
      } else {
        analysis = `Pass 1 elevated (${pass1.toFixed(3)}), Pass 2=${pass2.toFixed(3)}, XGBoost=${xgb.toFixed(3)}, tier=${String(latestAudit?.resolution_tier || "UNKNOWN")}.`;
      }
    }

    return res.json({
      analysis_summary: analysis,
      worker_trust: claim.worker_trust != null ? Number(claim.worker_trust).toFixed(2) : null,
      zone_gds: claim.zone_gds ?? null,
      critical_flags: flags
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get fraud context");
    return res.status(500).json({ error: "Failed to get fraud context" });
  }
});

export default router;
