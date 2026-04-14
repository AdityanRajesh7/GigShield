import { pgTable, uuid, decimal, boolean, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const gpsHistoryTable = pgTable("gps_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  worker_id: uuid("worker_id").notNull(),
  lat: decimal("lat", { precision: 9, scale: 6 }).notNull(),
  lng: decimal("lng", { precision: 9, scale: 6 }).notNull(),
  accuracy: real("accuracy").notNull().default(10.0),
  cell_lat: decimal("cell_lat", { precision: 9, scale: 6 }),
  cell_lng: decimal("cell_lng", { precision: 9, scale: 6 }),
  session_active: boolean("session_active").default(true).notNull(),
  zone_id: uuid("zone_id"),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
});

export const insertGpsHistorySchema = createInsertSchema(gpsHistoryTable).omit({ id: true });
export type InsertGpsHistory = z.infer<typeof insertGpsHistorySchema>;
export type GpsHistory = typeof gpsHistoryTable.$inferSelect;
