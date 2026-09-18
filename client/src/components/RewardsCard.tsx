import { useEffect } from "react";
import { Gift } from "lucide-react";
import { api, fmtSol, type BuiltTx, type RewardInfo } from "@/lib/api";
import { useScan } from "./useScan";
import { Card, ListHeader, StatusBar, Summary, useFeeBps, useTxRunner } from "./ui";

/** Unclaimed pump.fun rewards: trading cashback and creator fees, claimed in one transaction. */
export function RewardsCard() {
  const scan = useScan<RewardInfo>(
    (o) => `/api/scan/rewards/${o}`,
    (d) => d.rewards,
    (r) => r.id,
  );
  const feeBps = useFeeBps();
  const { status, run, busy } = useTxRunner(scan.removeIds);

  const selectedItems = scan.items.filter((r) => scan.selected.has(r.id));
  const total = selectedItems.reduce((s, r) => s + r.lamports, 0);

  // Rewards are few and always worth taking, so they start selected
  useEffect(() => {
    if (scan.items.length > 0 && scan.selected.size === 0) scan.toggleAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan.items]);

  const claim = () =>
    run(
      () => api<{ transactions: BuiltTx[] }>("/api/build/claim-rewards", { owner: scan.owner, ids: Array.from(scan.selected) }),
      "Claimed",
    );

  // Nothing to show until the scan finds rewards; errors stay visible so they can be reported
  if (!scan.loading && !scan.error && scan.items.length === 0) return null;

  return (
    <Card className="mb-4">
      <ListHeader
        title="Pump.fun rewards"
        count={scan.items.length}
        allSelected={scan.allSelected}
        onToggleAll={scan.toggleAll}
        onRefresh={scan.load}
        loading={scan.loading}
      />
      {scan.error ? (
        <div className="py-4 text-center text-red-300 text-sm">{scan.error}</div>
      ) : scan.loading && scan.items.length === 0 ? (
        <div className="py-4 text-center text-purple-200 text-sm">Checking pump.fun rewards…</div>
      ) : (
        <ul className="divide-y divide-purple-500/20">
          {scan.items.map((r) => {
            const on = scan.selected.has(r.id);
            return (
              <li key={r.id}>
                <button onClick={() => scan.toggle(r.id)} className="w-full flex items-center gap-3 py-2.5 text-left">
                  <span
                    className={`h-5 w-5 shrink-0 rounded border flex items-center justify-center ${
                      on ? "bg-green-500 border-green-400" : "border-purple-400/60"
                    }`}
                  >
                    {on && <span className="text-slate-900 text-xs font-bold">✓</span>}
                  </span>
                  <Gift className="h-5 w-5 shrink-0 text-green-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-white truncate">{r.label}</span>
                    <span className="block text-purple-300/70 text-xs truncate">{r.description}</span>
                  </span>
                  <span className="text-green-400 text-sm font-medium whitespace-nowrap">+{fmtSol(r.lamports, 6)} SOL</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {scan.items.length > 0 && (
        <Summary
          label="Rewards claimed"
          grossLamports={total}
          feeBps={feeBps}
          selectedCount={scan.selected.size}
          actionLabel="Claim Rewards"
          txCount={1}
          busy={busy}
          onAction={claim}
        />
      )}
      <StatusBar status={status} />
    </Card>
  );
}
