import { pgTable, uuid, text, decimal, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const claimsTable = pgTable("claims", {
  id: uuid("id").primaryKey().defaultRandom(),
  worker_id: uuid("worker_id").notNull(),
  policy_id: uuid("policy_id"),
  zone_id: text("zone_id"),
  disruption_type: text("disruption_type"),
  disruption_start: timestamp("disruption_start", { withTimezone: true }),
  disruption_end: timestamp("disruption_end", { withTimezone: true }),
  hours_affected: decimal("hours_affected", { precision: 4, scale: 2 }),
  hourly_rate: decimal("hourly_rate", { precision: 8, scale: 2 }).default("90").notNull(),
  payout_amount: decimal("payout_amount", { precision: 10, scale: 2 }),
  fraud_score: decimal("fraud_score", { precision: 3, scale: 2 }).default("0.0").notNull(),
  status: text("status").default("pending").notNull(),
  fraud_signals: jsonb("fraud_signals").default({}).notNull(),
  resolution_notes: text("resolution_notes"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  paid_at: timestamp("paid_at", { withTimezone: true }),
});

export const insertClaimSchema = createInsertSchema(claimsTable).omit({ id: true, created_at: true });
export type InsertClaim = z.infer<typeof insertClaimSchema>;
export type Claim = typeof claimsTable.$inferSelect;

export const fraudAuditLogTable = pgTable("fraud_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  claim_id: uuid("claim_id").notNull(),
  worker_id: uuid("worker_id").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
  signals: jsonb("signals").notNull(),
  pass1_composite: decimal("pass1_composite", { precision: 4, scale: 3 }).notNull(),
  pass2_composite: decimal("pass2_composite", { precision: 4, scale: 3 }),
  xgboost_score: decimal("xgboost_score", { precision: 4, scale: 3 }).notNull(),
  resolution_tier: text("resolution_tier").notNull(),
  critical_flags: jsonb("critical_flags").notNull(),
  model_version: text("model_version").notNull(),
  adaptive_threshold_applied: decimal("adaptive_threshold_applied", { precision: 4, scale: 3 }).notNull(),
  device_id: text("device_id"),
});

export const insertFraudAuditLogSchema = createInsertSchema(fraudAuditLogTable).omit({ id: true, timestamp: true });
export type InsertFraudAuditLog = z.infer<typeof insertFraudAuditLogSchema>;
export type FraudAuditLog = typeof fraudAuditLogTable.$inferSelect;
