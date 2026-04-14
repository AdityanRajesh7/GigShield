import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/store/auth";
import { useWalletBalance, useWalletTransactions } from "@/hooks/useWallet";
import { format } from "date-fns";
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  IndianRupee,
  Banknote,
  ShieldCheck,
  CreditCard,
  ChevronDown,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Settings,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useLocation } from "wouter";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const formatCurrency = (amount: string | number, currency = "INR") => {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

const REF_TYPE_META: Record<
  string,
  { label: string; icon: React.ElementType; color: string }
> = {
  claim_payout: {
    label: "Claim Payout",
    icon: ShieldCheck,
    color: "text-success bg-success/10",
  },
  stripe_payment: {
    label: "Stripe Payment",
    icon: CreditCard,
    color: "text-primary bg-primary/10",
  },
  withdrawal: {
    label: "Withdrawal",
    icon: Banknote,
    color: "text-warning bg-warning/10",
  },
};

const getRefMeta = (type: string) =>
  REF_TYPE_META[type] ?? {
    label: type.replace(/_/g, " "),
    icon: IndianRupee,
    color: "text-muted-foreground bg-muted",
  };

// ---------------------------------------------------------------------------
// WithdrawModal
// ---------------------------------------------------------------------------
function WithdrawModal({
  balance,
  upiId,
  workerId,
  onClose,
  onSuccess,
}: {
  balance: string;
  upiId: string | null | undefined;
  workerId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [, navigate] = useLocation();
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const maxAmount = parseFloat(balance);

  const handleWithdraw = async () => {
    const num = parseFloat(amount);
    if (!num || num <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    if (num > maxAmount) {
      toast.error("Amount exceeds available balance");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/wallet/${workerId}/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: num }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "NO_UPI_ID") {
          toast.error("No UPI ID found. Please set one in Settings.");
          onClose();
          navigate("/settings");
          return;
        }
        throw new Error(data.error || "Withdrawal failed");
      }
      toast.success(data.message || "Withdrawal initiated successfully!");
      onSuccess();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />

      {/* Sheet */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        className="relative z-10 w-full sm:max-w-md bg-card rounded-t-3xl sm:rounded-3xl border border-border shadow-2xl p-6 sm:p-8"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-display font-bold">Withdraw Funds</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!upiId ? (
          <div className="text-center py-6">
            <div className="w-14 h-14 rounded-full bg-warning/10 text-warning flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-7 h-7" />
            </div>
            <h3 className="font-bold text-lg mb-2">No UPI ID Configured</h3>
            <p className="text-muted-foreground text-sm mb-6">
              Please add your UPI ID in Settings before you can withdraw funds.
            </p>
            <button
              onClick={() => {
                onClose();
                navigate("/settings");
              }}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-primary/90 transition-colors"
            >
              <Settings className="w-4 h-4" />
              Go to Settings
            </button>
          </div>
        ) : (
          <>
            {/* UPI Destination */}
            <div className="flex items-center gap-3 bg-muted/50 rounded-2xl p-4 mb-6">
              <div className="w-10 h-10 rounded-xl bg-success/10 text-success flex items-center justify-center shrink-0">
                <Banknote className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-0.5">
                  Withdrawing to
                </div>
                <div className="font-bold text-foreground">{upiId}</div>
              </div>
            </div>

            {/* Available Balance */}
            <div className="text-center mb-6">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                Available Balance
              </div>
              <div className="text-3xl font-display font-bold text-foreground">
                {formatCurrency(balance)}
              </div>
            </div>

            {/* Amount Input */}
            <div className="mb-6">
              <label className="block text-sm font-bold text-foreground mb-2">
                Amount to Withdraw
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">
                  ₹
                </span>
                <input
                  type="number"
                  min="1"
                  max={maxAmount}
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-8 pr-4 py-3.5 rounded-2xl border border-border bg-background text-foreground font-bold text-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                />
              </div>
              <div className="flex gap-2 mt-2">
                {[25, 50, 100].map((pct) => (
                  <button
                    key={pct}
                    onClick={() =>
                      setAmount((maxAmount * (pct / 100)).toFixed(2))
                    }
                    className="flex-1 text-xs font-bold py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {pct}%
                  </button>
                ))}
                <button
                  onClick={() => setAmount(maxAmount.toFixed(2))}
                  className="flex-1 text-xs font-bold py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
                >
                  Max
                </button>
              </div>
            </div>

            <button
              onClick={handleWithdraw}
              disabled={loading || !amount || parseFloat(amount) <= 0}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3.5 rounded-2xl font-bold text-sm hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowUpRight className="w-4 h-4" />
              )}
              {loading ? "Processing…" : "Confirm Withdrawal"}
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Transaction Row
// ---------------------------------------------------------------------------
function TxnRow({ txn }: { txn: ReturnType<typeof useWalletTransactions>["transactions"][0] }) {
  const meta = getRefMeta(txn.reference_type);
  const Icon = meta.icon;
  const isCredit = txn.type === "credit";

  return (
    <motion.tr
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className="hover:bg-muted/30 transition-colors group"
    >
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-[13px] shrink-0 ${meta.color}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div>
            <div className="font-semibold text-sm text-foreground leading-tight">
              {txn.description || meta.label}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {format(new Date(txn.created_at), "d MMM yyyy, h:mm a")}
            </div>
          </div>
        </div>
      </td>
      <td className="px-5 py-4">
        <span
          className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${meta.color}`}
        >
          <Icon className="w-3 h-3" />
          {meta.label}
        </span>
      </td>
      <td className="px-5 py-4 text-right">
        <span
          className={`text-base font-display font-bold ${
            isCredit ? "text-success" : "text-destructive"
          }`}
        >
          {isCredit ? "+" : "−"}
          {formatCurrency(txn.amount)}
        </span>
      </td>
      <td className="px-5 py-4">
        <span
          className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${
            txn.status === "completed"
              ? "text-success bg-success/10"
              : txn.status === "pending"
              ? "text-warning bg-warning/10"
              : "text-destructive bg-destructive/10"
          }`}
        >
          <CheckCircle2 className="w-3 h-3" />
          {txn.status.charAt(0).toUpperCase() + txn.status.slice(1)}
        </span>
      </td>
    </motion.tr>
  );
}

// ---------------------------------------------------------------------------
// Main Wallet Dashboard
// ---------------------------------------------------------------------------
export function WorkerWallet() {
  const { worker } = useAuth();
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [liveIndicator, setLiveIndicator] = useState(false);

  const { wallet, loading: balLoading, refetch: refetchBalance } = useWalletBalance(worker?.id);
  const {
    transactions,
    total,
    loading: txnLoading,
    loadingMore,
    hasMore,
    loadMore,
  } = useWalletTransactions(worker?.id);

  // Flash live indicator on SSE update
  const handleSSEUpdate = () => {
    setLiveIndicator(true);
    setTimeout(() => setLiveIndicator(false), 2000);
  };

  // Compute quick stats from loaded transactions
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const monthTransactions = transactions.filter(
    (t) => new Date(t.created_at) >= monthStart
  );
  const monthCredits = monthTransactions
    .filter((t) => t.type === "credit")
    .reduce((s, t) => s + parseFloat(t.amount), 0);
  const monthDebits = monthTransactions
    .filter((t) => t.type === "debit")
    .reduce((s, t) => s + parseFloat(t.amount), 0);

  const balance = wallet?.balance ?? "0.00";

  return (
    <AppLayout>
      <div className="space-y-8 pb-12">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold">My Wallet</h1>
            <p className="text-muted-foreground text-sm flex items-center gap-1.5 mt-1">
              <span
                className={`w-2 h-2 rounded-full transition-colors ${
                  liveIndicator ? "bg-success animate-pulse" : "bg-muted-foreground/40"
                }`}
              />
              {liveIndicator ? "Balance updated" : "Real-time ledger"}
            </p>
          </div>
          <button
            onClick={() => refetchBalance()}
            className="flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-xl hover:bg-muted"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {/* Balance Hero + Quick Stats */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* Balance Card */}
          <div className="md:col-span-2 relative overflow-hidden bg-gradient-to-br from-primary via-primary/90 to-indigo-700 rounded-3xl p-8 text-primary-foreground shadow-xl shadow-primary/20">
            {/* Decorative orbs */}
            <div className="absolute -right-12 -top-12 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -left-6 -bottom-10 w-36 h-36 bg-white/5 rounded-full blur-2xl pointer-events-none" />

            <div className="relative z-10 flex flex-col h-full justify-between">
              <div className="flex items-start justify-between mb-8">
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-primary-foreground/60 mb-1">
                    Available Balance
                  </div>
                  <div className="text-xs font-medium text-primary-foreground/60">
                    {worker?.name} · {wallet?.currency ?? "INR"}
                  </div>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center">
                  <Wallet className="w-6 h-6" />
                </div>
              </div>

              {balLoading ? (
                <div className="h-16 flex items-center">
                  <Loader2 className="w-8 h-8 animate-spin opacity-60" />
                </div>
              ) : (
                <div className="text-5xl sm:text-6xl font-display font-bold tracking-tight mb-8">
                  {formatCurrency(balance, wallet?.currency)}
                </div>
              )}

              <button
                onClick={() => setShowWithdraw(true)}
                className="self-start inline-flex items-center gap-2 bg-white text-primary px-6 py-3 rounded-2xl font-bold text-sm hover:bg-white/90 transition-all shadow-lg"
              >
                <ArrowUpRight className="w-4 h-4" />
                Withdraw Funds
              </button>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="flex flex-col gap-6">
            <div className="flex-1 bg-card border border-border rounded-3xl p-6 flex flex-col justify-between shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Credited This Month
                </div>
                <div className="w-9 h-9 rounded-xl bg-success/10 text-success flex items-center justify-center shrink-0">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-display font-bold text-success">
                +{formatCurrency(monthCredits)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {monthTransactions.filter((t) => t.type === "credit").length} transactions
              </div>
            </div>

            <div className="flex-1 bg-card border border-border rounded-3xl p-6 flex flex-col justify-between shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Withdrawn This Month
                </div>
                <div className="w-9 h-9 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                  <TrendingDown className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-display font-bold text-destructive">
                −{formatCurrency(monthDebits)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {monthTransactions.filter((t) => t.type === "debit").length} transactions
              </div>
            </div>
          </div>
        </div>

        {/* Transaction Ledger */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-display font-bold">Transaction History</h2>
            <span className="text-sm text-muted-foreground font-medium">
              {total} total
            </span>
          </div>

          <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
            {txnLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin mr-3" />
                Loading transactions…
              </div>
            ) : transactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
                  <IndianRupee className="w-6 h-6" />
                </div>
                <div className="font-bold text-foreground mb-1">No transactions yet</div>
                <div className="text-sm">
                  Your claim payouts and withdrawals will appear here.
                </div>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-muted/50 text-muted-foreground font-bold uppercase tracking-wider text-xs">
                      <tr>
                        <th className="px-5 py-4">Transaction</th>
                        <th className="px-5 py-4">Type</th>
                        <th className="px-5 py-4 text-right">Amount</th>
                        <th className="px-5 py-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      <AnimatePresence initial={false}>
                        {transactions.map((txn) => (
                          <TxnRow key={txn.id} txn={txn} />
                        ))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>

                {hasMore && (
                  <div className="p-4 border-t border-border/50">
                    <button
                      onClick={loadMore}
                      disabled={loadingMore}
                      className="w-full flex items-center justify-center gap-2 py-3 text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all disabled:opacity-50"
                    >
                      {loadingMore ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                      {loadingMore ? "Loading…" : `Load more (${total - transactions.length} remaining)`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Withdraw Modal */}
      <AnimatePresence>
        {showWithdraw && (
          <WithdrawModal
            balance={balance}
            upiId={worker?.upi_id}
            workerId={worker?.id ?? ""}
            onClose={() => setShowWithdraw(false)}
            onSuccess={() => {
              refetchBalance();
              handleSSEUpdate();
            }}
          />
        )}
      </AnimatePresence>
    </AppLayout>
  );
}
