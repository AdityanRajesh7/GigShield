import {
  pgTable,
  uuid,
  text,
  decimal,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workersTable } from "./workers";
import { claimsTable } from "./claims";

// ---------------------------------------------------------------------------
// wallets — one row per worker, holds the running balance
// ---------------------------------------------------------------------------
export const walletsTable = pgTable("wallets", {
  id: uuid("id").primaryKey().defaultRandom(),
  worker_id: uuid("worker_id")
    .notNull()
    .unique()
    .references(() => workersTable.id, { onDelete: "cascade" }),
  balance: decimal("balance", { precision: 12, scale: 2 }).default("0.00").notNull(),
  currency: text("currency").default("INR").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// wallet_transactions — immutable ledger rows
// ---------------------------------------------------------------------------
export const walletTransactionsTable = pgTable("wallet_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  wallet_id: uuid("wallet_id")
    .notNull()
    .references(() => walletsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // 'credit' | 'debit'
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  reference_type: text("reference_type").notNull(), // 'stripe_payment' | 'claim_payout' | 'withdrawal'
  reference_id: text("reference_id"), // claim UUID or Stripe charge ID (nullable)
  status: text("status").default("completed").notNull(), // 'pending' | 'completed' | 'failed'
  description: text("description"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------
export const walletsRelations = relations(walletsTable, ({ one, many }) => ({
  worker: one(workersTable, {
    fields: [walletsTable.worker_id],
    references: [workersTable.id],
  }),
  transactions: many(walletTransactionsTable),
}));

export const walletTransactionsRelations = relations(
  walletTransactionsTable,
  ({ one }) => ({
    wallet: one(walletsTable, {
      fields: [walletTransactionsTable.wallet_id],
      references: [walletsTable.id],
    }),
  })
);

// ---------------------------------------------------------------------------
// Insert schemas & types
// ---------------------------------------------------------------------------
export const insertWalletSchema = createInsertSchema(walletsTable).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertWallet = z.infer<typeof insertWalletSchema>;
export type Wallet = typeof walletsTable.$inferSelect;

export const insertWalletTransactionSchema = createInsertSchema(
  walletTransactionsTable
).omit({ id: true, created_at: true });
export type InsertWalletTransaction = z.infer<
  typeof insertWalletTransactionSchema
>;
export type WalletTransaction = typeof walletTransactionsTable.$inferSelect;
