import { Router } from "express";
import { db, fraudAuditLogTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { evaluateFraudClaim } from "../lib/fraud_pipeline.js";

const router = Router();

router.post("/evaluate", async (req, res) => {
  try {
    const body = req.body;
    
    // Validate required standard fields
    const requiredFields = ["worker_id", "zone_id", "user_lat", "user_lng", "device_id"];
    const missingFields = requiredFields.filter(f => !body[f]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({ 
        error: "Missing required fraud context fields",
        missing: missingFields,
        received: Object.keys(body)
      });
    }

    // Provide defaults for advanced Pass 2 fields if missing from the request
    const context = {
      ...body,
      disruption_start: body.disruption_start ? new Date(body.disruption_start) : new Date(),
      gps_trace: body.gps_trace || [],
      accuracies: body.accuracies || (body.gps_accuracy ? [Number(body.gps_accuracy)] : []),
    };

    const result = await evaluateFraudClaim(context);
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to evaluate final fraud score pipeline");
    return res.status(500).json({ error: "Fraud pipeline evaluation failed" });
  }
});

router.get("/audit/:claim_id", async (req, res) => {
  try {
    const logs = await db.select().from(fraudAuditLogTable).where(eq(fraudAuditLogTable.claim_id, req.params.claim_id));
    return res.json(logs);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch audit logs");
    return res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

router.get("/signals/:worker_id", async (req, res) => {
  try {
    const logs = await db.select().from(fraudAuditLogTable)
      .where(eq(fraudAuditLogTable.worker_id, req.params.worker_id))
      .orderBy(desc(fraudAuditLogTable.timestamp))
      .limit(10);
    return res.json(logs);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch top signals");
    return res.status(500).json({ error: "Failed to fetch signals" });
  }
});

export default router;
