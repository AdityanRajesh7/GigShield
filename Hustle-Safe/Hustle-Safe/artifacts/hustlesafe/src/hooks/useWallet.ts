import { useState, useEffect, useCallback, useRef } from "react";

const API_BASE = "/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface WalletData {
  id: string;
  worker_id: string;
  balance: string;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface WalletTransaction {
  id: string;
  wallet_id: string;
  type: "credit" | "debit";
  amount: string;
  reference_type: "stripe_payment" | "claim_payout" | "withdrawal" | string;
  reference_id: string | null;
  status: "pending" | "completed" | "failed";
  description: string | null;
  created_at: string;
}

export interface WalletSSEEvent {
  type: "WALLET_CONNECTED" | "balance_update" | "new_transaction";
  balance?: string;
  currency?: string;
  transaction?: WalletTransaction;
}

// ---------------------------------------------------------------------------
// useWalletSSE — shared SSE hook scoped to a specific workerId
// ---------------------------------------------------------------------------
export function useWalletSSE(
  workerId: string | undefined,
  onEvent: (event: WalletSSEEvent) => void
) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!workerId) return;

    let es: EventSource;
    let retryTimer: ReturnType<typeof setTimeout>;

    function connect() {
      es = new EventSource(`${API_BASE}/wallet/${workerId}/stream`);

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data) as WalletSSEEvent;
          onEventRef.current(data);
        } catch {
          // ignore malformed frames
        }
      };

      es.onerror = () => {
        es.close();
        // Reconnect after 3 seconds
        retryTimer = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      clearTimeout(retryTimer);
      es?.close();
    };
  }, [workerId]);
}

// ---------------------------------------------------------------------------
// useWalletBalance — fetches balance and keeps it live via SSE
// ---------------------------------------------------------------------------
export function useWalletBalance(workerId: string | undefined) {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initial fetch
  const fetchWallet = useCallback(async () => {
    if (!workerId) return;
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/wallet/${workerId}`);
      if (!res.ok) throw new Error("Failed to fetch wallet");
      const data: WalletData = await res.json();
      setWallet(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [workerId]);

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  // Live updates via SSE
  useWalletSSE(workerId, (event) => {
    if (
      (event.type === "balance_update" || event.type === "WALLET_CONNECTED") &&
      event.balance !== undefined
    ) {
      setWallet((prev) =>
        prev ? { ...prev, balance: event.balance!, currency: event.currency ?? prev.currency } : null
      );
    }
  });

  return { wallet, loading, error, refetch: fetchWallet };
}

// ---------------------------------------------------------------------------
// useWalletTransactions — fetches paginated txns + appends SSE ones
// ---------------------------------------------------------------------------
export function useWalletTransactions(workerId: string | undefined) {
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offsetRef = useRef(0);
  const PAGE_SIZE = 20;

  const fetchPage = useCallback(
    async (offset: number, isLoadMore = false) => {
      if (!workerId) return;
      isLoadMore ? setLoadingMore(true) : setLoading(true);
      try {
        const res = await fetch(
          `${API_BASE}/wallet/${workerId}/transactions?limit=${PAGE_SIZE}&offset=${offset}`
        );
        if (!res.ok) throw new Error("Failed to fetch transactions");
        const data: { transactions: WalletTransaction[]; total: number } =
          await res.json();
        setTotal(data.total);
        setTransactions((prev) =>
          isLoadMore ? [...prev, ...data.transactions] : data.transactions
        );
        offsetRef.current = offset + data.transactions.length;
      } catch (e: any) {
        setError(e.message);
      } finally {
        isLoadMore ? setLoadingMore(false) : setLoading(false);
      }
    },
    [workerId]
  );

  useEffect(() => {
    offsetRef.current = 0;
    setTransactions([]);
    fetchPage(0);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    fetchPage(offsetRef.current, true);
  }, [fetchPage]);

  // Prepend new transactions from SSE stream
  useWalletSSE(workerId, (event) => {
    if (event.type === "balance_update" && event.transaction) {
      setTransactions((prev) => {
        // Prevent duplicates
        if (prev.some((t) => t.id === event.transaction!.id)) return prev;
        return [event.transaction!, ...prev];
      });
      setTotal((t) => t + 1);
    }
  });

  const hasMore = transactions.length < total;

  return { transactions, total, loading, loadingMore, hasMore, loadMore, error };
}
