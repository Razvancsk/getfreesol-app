import { api, fmtSol, type BuiltTx, type TokenAccountInfo } from "@/lib/api";
import { useScan } from "./useScan";
import { Card, Checkbox, EmptyState, ListHeader, StatusBar, Summary, TokenAvatar, useFeeBps, useTxRunner } from "./ui";

export function ClaimRentTab() {
  const scan = useScan<TokenAccountInfo>(
    (o) => `/api/scan/tokens/${o}`,
    (d) => d.empty,
    (a) => a.address,
  );
  const feeBps = useFeeBps();
  const { status, run, busy } = useTxRunner(scan.removeIds);

  const selectedItems = scan.items.filter((a) => scan.selected.has(a.address));
  const gross = selectedItems.reduce((s, a) => s + a.lamports, 0);
  const totalAvailable = scan.items.reduce((s, a) => s + a.lamports, 0);

  return (
    <Card>
      {scan.items.length > 0 && (
        <div className="text-center mb-5">
          <div className="text-purple-200 text-sm">SOL waiting in empty accounts</div>
          <div className="text-4xl font-bold text-white mt-1">{fmtSol(totalAvailable)} SOL</div>
        </div>
      )}
      <ListHeader
        title="Empty token accounts"
        count={scan.items.length}
        allSelected={scan.allSelected}
        onToggleAll={scan.toggleAll}
        onRefresh={scan.load}
        loading={scan.loading}
      />
      {scan.items.length === 0 ? (
        <EmptyState loading={scan.loading} error={scan.error} text="No empty token accounts found. Your wallet is clean! 🎉" />
      ) : (
        <ul className="divide-y divide-purple-500/20 max-h-[420px] overflow-y-auto pr-1">
          {scan.items.map((a) => (
            <li key={a.address}>
              <label className="flex items-center gap-3 py-2.5 cursor-pointer">
                <Checkbox checked={scan.selected.has(a.address)} onChange={() => scan.toggle(a.address)} />
                <TokenAvatar src={a.image} label={a.symbol} />
                <div className="min-w-0 flex-1">
                  <div className="text-white truncate">{a.name}</div>
                  <div className="text-purple-300/70 text-xs font-mono truncate">{a.mint}</div>
                </div>
                <div className="text-green-400 text-sm font-medium whitespace-nowrap">+{fmtSol(a.lamports)} SOL</div>
              </label>
            </li>
          ))}
        </ul>
      )}
      <Summary
        label="Rent reclaimed"
        grossLamports={gross}
        feeBps={feeBps}
        selectedCount={scan.selected.size}
        actionLabel="Claim SOL"
        busy={busy}
        onAction={() =>
          run(
            () => api<{ transactions: BuiltTx[] }>("/api/build/claim", { owner: scan.owner, accounts: Array.from(scan.selected) }),
            "Closed",
          )
        }
      />
      <StatusBar status={status} />
    </Card>
  );
}
