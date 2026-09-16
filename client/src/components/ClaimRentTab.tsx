import { api, fmtSol, type BuiltTx, type TokenAccountInfo } from "@/lib/api";
import { useScan } from "./useScan";
import { Card, EmptyState, StatusBar, Summary, TokenAvatar, useFeeBps, useTxRunner } from "./ui";
import { RefreshCw } from "lucide-react";

// Max accounts closed per transaction (Solana 1232-byte limit); one wallet approval per batch
const BATCH_SIZE = 20;

export function ClaimRentTab() {
  const scan = useScan<TokenAccountInfo>(
    (o) => `/api/scan/tokens/${o}`,
    (d) => d.empty,
    (a) => a.address,
  );
  const feeBps = useFeeBps();
  const { status, runBatched, busy } = useTxRunner(scan.removeIds);

  const total = scan.items.reduce((s, a) => s + a.lamports, 0);
  const batches = Math.ceil(scan.items.length / BATCH_SIZE);

  const claimAll = () =>
    runBatched(
      scan.items.map((a) => a.address),
      BATCH_SIZE,
      (chunk) => api<{ transactions: BuiltTx[] }>("/api/build/claim", { owner: scan.owner, accounts: chunk }),
      "Closed",
    );

  return (
    <Card>
      <div className="text-center mb-5">
        <div className="text-purple-200 text-sm">SOL waiting in empty accounts</div>
        <div className="text-4xl font-bold text-white mt-1">{fmtSol(total)} SOL</div>
      </div>

      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-white font-semibold">
          Empty token accounts <span className="text-purple-300 font-normal">({scan.items.length})</span>
        </div>
        <button
          onClick={scan.load}
          disabled={scan.loading || busy}
          className="text-purple-200 hover:text-white disabled:opacity-50 flex items-center gap-1 text-sm"
        >
          <RefreshCw className={`h-4 w-4 ${scan.loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {scan.items.length === 0 ? (
        <EmptyState loading={scan.loading} error={scan.error} text="No empty token accounts found. Your wallet is clean! 🎉" />
      ) : (
        <ul className="divide-y divide-purple-500/20 max-h-[420px] overflow-y-auto pr-1">
          {scan.items.map((a) => (
            <li key={a.address} className="flex items-center gap-3 py-2.5">
              <TokenAvatar src={a.image} label={a.symbol} />
              <div className="min-w-0 flex-1">
                <div className="text-white truncate">{a.name}</div>
                <div className="text-purple-300/70 text-xs font-mono truncate">{a.mint}</div>
              </div>
              <div className="text-green-400 text-sm font-medium whitespace-nowrap">+{fmtSol(a.lamports)} SOL</div>
            </li>
          ))}
        </ul>
      )}

      <Summary
        label="Rent reclaimed"
        grossLamports={total}
        feeBps={feeBps}
        selectedCount={scan.items.length}
        actionLabel="Claim All"
        busy={busy}
        onAction={claimAll}
      />
      {batches > 1 && !busy && (
        <p className="text-center text-purple-300/80 text-xs mt-2">
          {scan.items.length} accounts → {batches} transactions ({BATCH_SIZE} accounts each). Approve each one in your wallet.
        </p>
      )}
      <StatusBar status={status} />
    </Card>
  );
}
