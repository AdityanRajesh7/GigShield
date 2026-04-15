import { Router, Request, Response } from "express";
import { db, walletsTable, walletTransactionsTable, workersTable } from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";
import {
  getWalletByWorker,
  creditWallet,
  debitWallet,
  registerWalletSSEClient,
  removeWalletSSEClient,
} from "../lib/wallet.js";

const router = Router();

// ---------------------------------------------------------------------------
// GET /wallet/:workerId — wallet balance + metadata
// ---------------------------------------------------------------------------
router.get("/wallet/:workerId", async (req: Request, res: Response): Promise<void> => {
  try {
    const workerId = String(req.params.workerId);
    const wallet = await getWalletByWorker(workerId);
    if (!wallet) {
      // Auto-provision if missing (e.g. legacy workers created before wallet feature)
      const { provisionWallet } = await import("../lib/wallet.js");
      const provisioned = await provisionWallet(workerId);
      res.json(provisioned);
      return;
    }
    res.json(wallet);
  } catch (err) {
    req.log.error({ err }, "Failed to get wallet");
    res.status(500).json({ error: "Failed to get wallet" });
  }
});

// ---------------------------------------------------------------------------
// GET /wallet/:workerId/transactions — paginated transaction ledger
// ---------------------------------------------------------------------------
router.get("/wallet/:workerId/transactions", async (req: Request, res: Response): Promise<void> => {
  try {
    const workerId = String(req.params.workerId);
    const { limit = "20", offset = "0" } = req.query as Record<string, string>;

    const wallet = await getWalletByWorker(workerId);
    if (!wallet) {
      res.status(404).json({ error: "Wallet not found" });
      return;
    }

    const transactions = await db
      .select()
      .from(walletTransactionsTable)
      .where(eq(walletTransactionsTable.wallet_id, wallet.id))
      .orderBy(desc(walletTransactionsTable.created_at))
      .limit(parseInt(limit))
      .offset(parseInt(offset));

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(walletTransactionsTable)
      .where(eq(walletTransactionsTable.wallet_id, wallet.id));

    res.json({ transactions, total: Number(count), wallet_id: wallet.id });
  } catch (err) {
    req.log.error({ err }, "Failed to list wallet transactions");
    res.status(500).json({ error: "Failed to list wallet transactions" });
  }
});

// ---------------------------------------------------------------------------
// POST /wallet/:workerId/withdraw — initiate UPI withdrawal
// ---------------------------------------------------------------------------
router.post("/wallet/:workerId/withdraw", async (req: Request, res: Response): Promise<void> => {
  try {
    const workerId = String(req.params.workerId);
    const { amount } = req.body as { amount?: number | string };

    if (!amount || parseFloat(String(amount)) <= 0) {
      res.status(400).json({ error: "A positive amount is required" });
      return;
    }

    // Verify worker exists and has a UPI ID
    const [worker] = await db
      .select()
      .from(workersTable)
      .where(eq(workersTable.id, workerId))
      .limit(1);

    if (!worker) {
      res.status(404).json({ error: "Worker not found" });
      return;
    }

    if (!worker.upi_id) {
      res.status(400).json({
        error: "No UPI ID configured. Please update your UPI ID in Settings before withdrawing.",
        code: "NO_UPI_ID",
      });
      return;
    }

    const wallet = await getWalletByWorker(workerId);
    if (!wallet) {
      res.status(404).json({ error: "Wallet not found" });
      return;
    }

    const amountStr = parseFloat(String(amount)).toFixed(2);
    const result = await debitWallet(
      wallet.id,
      workerId,
      amountStr,
      "withdrawal",
      worker.upi_id,
      `UPI withdrawal to ${worker.upi_id}`
    );

    if (!result) {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }

    res.json({
      message: `₹${amountStr} successfully initiated to ${worker.upi_id}`,
      transaction: result.transaction,
      new_balance: result.wallet.balance,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to process withdrawal");
    res.status(500).json({ error: "Failed to process withdrawal" });
  }
});

// ---------------------------------------------------------------------------
// GET /wallet/:workerId/stream — SSE stream for real-time wallet events
// ---------------------------------------------------------------------------
router.get("/wallet/:workerId/stream", (req: Request, res: Response) => {
  const workerId = String(req.params.workerId);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Send initial connected event with current balance
  getWalletByWorker(workerId)
    .then((wallet) => {
      res.write(
        `data: ${JSON.stringify({
          type: "WALLET_CONNECTED",
          balance: wallet?.balance ?? "0.00",
          currency: wallet?.currency ?? "INR",
        })}\n\n`
      );
    })
    .catch(() => {
      res.write(`data: ${JSON.stringify({ type: "WALLET_CONNECTED" })}\n\n`);
    });

  const clientId = `${workerId}-${Date.now()}`;
  registerWalletSSEClient(clientId, workerId, res);

  // Heartbeat every 25s to keep connection alive through proxies
  const heartbeat = setInterval(() => {
    try {
      res.write(`: ping\n\n`);
    } catch {
      clearInterval(heartbeat);
    }
  }, 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    removeWalletSSEClient(clientId);
  });
});

export default router;
