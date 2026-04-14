import { pgTable, text, uuid, decimal, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const workersTable = pgTable("workers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  phone: text("phone").unique().notNull(),
  email: text("email"),
  platform: text("platform").notNull(),
  zone_id: text("zone_id").notNull(),
  upi_id: text("upi_id"),
  platform_rating: decimal("platform_rating", { precision: 2, scale: 1 }).default("4.5").notNull(),
  policy_tier: text("policy_tier").notNull(),
  is_active: boolean("is_active").default(true).notNull(),
  fraud_score: decimal("fraud_score", { precision: 3, scale: 2 }).default("0.0").notNull(),
  account_age_days: integer("account_age_days").default(0).notNull(),
  device_id: text("device_id"),
  trust_score: decimal("trust_score", { precision: 3, scale: 2 }).default("0.5").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertWorkerSchema = createInsertSchema(workersTable).omit({ id: true, created_at: true });
export type InsertWorker = z.infer<typeof insertWorkerSchema>;
export type Worker = typeof workersTable.$inferSelect;
