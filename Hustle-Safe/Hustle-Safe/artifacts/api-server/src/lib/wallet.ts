/**
 * Wallet Service — core business logic for wallet operations.
 *
 * All balance mutations happen inside a single Drizzle DB transaction so
 * reads and writes are atomic and race-safe.
 */
import { db, walletsTable, walletTransactionsTable, workersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { Response } from "express";

// ---------------------------------------------------------------------------
// SSE client registry — keyed by workerId so we can push to a specific user
// ---------------------------------------------------------------------------
type WalletSSEClient = { id: string; workerId: string; res: Response };
let walletClients: WalletSSEClient[] = [];

export function registerWalletSSEClient(
  clientId: string,
  workerId: string,
  res: Response
) {
  walletClients.push({ id: clientId, workerId, res });
}

export function removeWalletSSEClient(clientId: string) {
  walletClients = walletClients.filter((c) => c.id !== clientId);
}

export function broadcastWalletEvent(workerId: string, payload: object) {
  walletClients
    .filter((c) => c.workerId === workerId)
    .forEach((c) => {
      try {
        c.res.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch {
        removeWalletSSEClient(c.id);
      }
    });
}

// ---------------------------------------------------------------------------
// provisionWallet — idempotently creates a wallet row for a new worker
// ---------------------------------------------------------------------------
export async function provisionWallet(workerId: string) {
  // Use INSERT ON CONFLICT DO NOTHING so it's safe to call multiple times
  const existing = await db
    .select()
    .from(walletsTable)
    .where(eq(walletsTable.worker_id, workerId))
    .limit(1);

  if (existing.length > 0) return existing[0];

  const [wallet] = await db
    .insert(walletsTable)
    .values({ worker_id: workerId, balance: "0.00", currency: "INR" })
    .returning();

  return wallet;
}

// ---------------------------------------------------------------------------
// getWalletByWorker — fetch the wallet row for a worker
// ---------------------------------------------------------------------------
export async function getWalletByWorker(workerId: string) {
  const [wallet] = await db
    .select()
    .from(walletsTable)
    .where(eq(walletsTable.worker_id, workerId))
    .limit(1);
  return wallet ?? null;
}

// ---------------------------------------------------------------------------
// creditWallet — atomically insert a credit transaction and add to balance
// ---------------------------------------------------------------------------
export async function creditWallet(
  walletId: string,
  workerId: string,
  amount: string,
  referenceType: string,
  referenceId: string | null,
  description?: string
) {
  return db.transaction(async (tx) => {
    const [txn] = await tx
      .insert(walletTransactionsTable)
      .values({
        wallet_id: walletId,
        type: "credit",
        amount,
        reference_type: referenceType,
        reference_id: referenceId,
        status: "completed",
        description: description ?? null,
      })
      .returning();

    const [updated] = await tx
      .update(walletsTable)
      .set({
        balance: sql`${walletsTable.balance} + ${amount}::numeric`,
        updated_at: new Date(),
      })
      .where(eq(walletsTable.id, walletId))
      .returning();

    // Push SSE event to this worker's stream
    broadcastWalletEvent(workerId, {
      type: "balance_update",
      balance: updated.balance,
      transaction: txn,
    });

    return { wallet: updated, transaction: txn };
  });
}

// ---------------------------------------------------------------------------
// debitWallet — atomically insert a debit transaction and subtract from balance
// Returns null if insufficient funds
// ---------------------------------------------------------------------------
export async function debitWallet(
  walletId: string,
  workerId: string,
  amount: string,
  referenceType: string,
  referenceId: string | null,
  description?: string
): Promise<{ wallet: typeof walletsTable.$inferSelect; transaction: typeof walletTransactionsTable.$inferSelect } | null> {
  return db.transaction(async (tx) => {
    // Lock the wallet row for update
    const [current] = await tx
      .select()
      .from(walletsTable)
      .where(eq(walletsTable.id, walletId))
      .limit(1);

    if (!current) return null;

    const currentBalance = parseFloat(current.balance);
    const debitAmount = parseFloat(amount);

    if (currentBalance < debitAmount) return null; // insufficient funds

    const [txn] = await tx
      .insert(walletTransactionsTable)
      .values({
        wallet_id: walletId,
        type: "debit",
        amount,
        reference_type: referenceType,
        reference_id: referenceId,
        status: "completed",
        description: description ?? null,
      })
      .returning();

    const [updated] = await tx
      .update(walletsTable)
      .set({
        balance: sql`${walletsTable.balance} - ${amount}::numeric`,
        updated_at: new Date(),
      })
      .where(eq(walletsTable.id, walletId))
      .returning();

    // Push SSE event to this worker's stream
    broadcastWalletEvent(workerId, {
      type: "balance_update",
      balance: updated.balance,
      transaction: txn,
    });

    return { wallet: updated, transaction: txn };
  });
}
