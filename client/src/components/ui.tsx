import { useEffect, useState, type ReactNode } from "react";
import { useWallet } from "@/lib/wallet";
import { CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { api, fmtSol, runInBatches, signSendConfirm, type BuiltTx, type RunResult } from "@/lib/api";

export function SolanaIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 397.7 311.7" style={{ fill: "#00FFA3" }} aria-hidden>
      <path d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z" />
      <path d="M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1L333.1,73.8c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z" />
      <path d="M333.1,120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8,0-8.7,7-4.6,11.1l62.7,62.7c2.4,2.4,5.7,3.8,9.2,3.8h317.4c5.8,0,8.7-7,4.6-11.1L333.1,120.1z" />
    </svg>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-purple-900/40 backdrop-blur-sm border border-purple-500/30 rounded-2xl p-4 md:p-6 ${className}`}>
      {children}
    </div>
  );
}

export function TokenAvatar({ src, label }: { src: string | null; label: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <div className="h-10 w-10 shrink-0 rounded-full bg-purple-700/60 flex items-center justify-center text-white text-xs font-bold">
        {label.slice(0, 2).toUpperCase()}
      </div>
    );
  }
  return <img src={src} alt="" onError={() => setBroken(true)} className="h-10 w-10 shrink-0 rounded-full object-cover bg-purple-800" />;
}

export function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="h-5 w-5 shrink-0 accent-purple-500 cursor-pointer"
    />
  );
}

let feeBpsCache: number | null = null;
export function useFeeBps() {
  const [bps, setBps] = useState<number | null>(feeBpsCache);
  useEffect(() => {
    if (feeBpsCache != null) return;
    api<{ feeBps: number }>("/api/config").then((c) => {
      feeBpsCache = c.feeBps;
      setBps(c.feeBps);
    }).catch(() => {});
  }, []);
  return bps;
}

type Status = { kind: "idle" } | { kind: "busy"; msg: string } | { kind: "ok"; msg: string } | { kind: "error"; msg: string };

/** Shared flow: build transactions on the server, sign in wallet, send, confirm. */
export function useTxRunner(onDone: (confirmedIds: string[]) => void) {
  const { signAllTransactions, signTransaction } = useWallet();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const progress = (msg: string) => setStatus({ kind: "busy", msg });

  /** Build everything at once and sign all transactions in one wallet prompt. */
  function run(build: () => Promise<{ transactions: BuiltTx[] }>, verb: string) {
    return execute(async () => {
      if (!signAllTransactions) throw new Error("No wallet connected");
      progress("Preparing transactions…");
      const { transactions } = await build();
      if (!transactions.length) throw new Error("Nothing left to process - try refreshing");
      return signSendConfirm(transactions, signAllTransactions, progress);
    }, verb);
  }

  /** Build, sign and confirm one batch at a time (one wallet prompt per batch). */
  function runBatched(ids: string[], batchSize: number, build: (chunk: string[]) => Promise<{ transactions: BuiltTx[] }>, verb: string) {
    return execute(async () => {
      if (!signTransaction) throw new Error("No wallet connected");
      return runInBatches(ids, batchSize, build, signTransaction, progress);
    }, verb);
  }

  async function execute(work: () => Promise<RunResult>, verb: string) {
    try {
      const result = await work();
      onDone(result.confirmedIds);
      if (result.confirmedIds.length === 0) throw new Error("Transactions were not confirmed - please try again");
      setStatus({
        kind: "ok",
        msg: `${verb} ${result.confirmedIds.length} item${result.confirmedIds.length > 1 ? "s" : ""} and received ${fmtSol(
          result.reclaimedLamports,
        )} SOL${result.failed ? ` (${result.failed} transaction${result.failed > 1 ? "s" : ""} failed)` : ""}${
          result.stoppedReason ? " - stopped early, click again to finish the rest" : ""
        }`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus({ kind: "error", msg: /reject|cancel|declin/i.test(msg) ? "Request cancelled in wallet" : msg });
    }
  }

  return { status, run, runBatched, busy: status.kind === "busy" };
}

export function StatusBar({ status }: { status: Status }) {
  if (status.kind === "idle") return null;
  const styles = {
    busy: "bg-purple-800/50 border-purple-400/40 text-purple-100",
    ok: "bg-green-900/40 border-green-500/40 text-green-200",
    error: "bg-red-900/40 border-red-500/40 text-red-200",
  }[status.kind];
  const Icon = { busy: Loader2, ok: CheckCircle2, error: XCircle }[status.kind];
  return (
    <div className={`mt-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${styles}`}>
      <Icon className={`h-4 w-4 shrink-0 ${status.kind === "busy" ? "animate-spin" : ""}`} />
      <span>{status.msg}</span>
    </div>
  );
}

export function ListHeader({
  title,
  count,
  allSelected,
  onToggleAll,
  onRefresh,
  loading,
}: {
  title: string;
  count: number;
  allSelected: boolean;
  onToggleAll: () => void;
  onRefresh: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 mb-3">
      <label className="flex items-center gap-2 text-white font-semibold cursor-pointer select-none">
        <Checkbox checked={allSelected && count > 0} onChange={onToggleAll} />
        {title} <span className="text-purple-300 font-normal">({count})</span>
      </label>
      <button
        onClick={onRefresh}
        disabled={loading}
        className="text-purple-200 hover:text-white disabled:opacity-50 flex items-center gap-1 text-sm"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
      </button>
    </div>
  );
}

export function EmptyState({ loading, error, text }: { loading: boolean; error: string | null; text: string }) {
  if (loading) {
    return (
      <div className="py-12 flex flex-col items-center gap-3 text-purple-200">
        <Loader2 className="h-8 w-8 animate-spin" /> Scanning your wallet…
      </div>
    );
  }
  if (error) return <div className="py-10 text-center text-red-300">{error}</div>;
  return <div className="py-10 text-center text-purple-200">{text}</div>;
}

export function Summary({
  label,
  grossLamports,
  feeBps,
  selectedCount,
  actionLabel,
  onAction,
  busy,
  danger = false,
}: {
  label: string;
  grossLamports: number;
  feeBps: number | null;
  selectedCount: number;
  actionLabel: string;
  onAction: () => void;
  busy: boolean;
  danger?: boolean;
}) {
  const fee = feeBps != null ? Math.floor((grossLamports * feeBps) / 10_000) : 0;
  return (
    <div className="mt-4 rounded-xl bg-slate-900/50 border border-purple-500/20 p-4">
      <div className="flex justify-between text-sm text-purple-200">
        <span>{label}</span>
        <span>{fmtSol(grossLamports, 5)} SOL</span>
      </div>
      {feeBps != null && (
        <div className="flex justify-between text-sm text-purple-300/80 mt-1">
          <span>Service fee ({(feeBps / 100).toFixed(1)}%)</span>
          <span>-{fmtSol(fee, 5)} SOL</span>
        </div>
      )}
      <div className="flex justify-between text-white font-semibold text-lg mt-2">
        <span>You receive</span>
        <span className="text-green-400">≈ {fmtSol(grossLamports - fee, 5)} SOL</span>
      </div>
      <button
        onClick={onAction}
        disabled={busy || selectedCount === 0}
        className={`mt-4 w-full rounded-full py-3 text-lg font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all ${
          danger
            ? "bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500"
            : "bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400"
        }`}
      >
        {busy ? "Working…" : `${actionLabel} (${selectedCount})`}
      </button>
    </div>
  );
}
