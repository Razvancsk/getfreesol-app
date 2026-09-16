import { AlertTriangle } from "lucide-react";
import { api, fmtSol, type BuiltTx, type TokenAccountInfo } from "@/lib/api";
import { useScan } from "./useScan";
import { Card, Checkbox, EmptyState, ListHeader, StatusBar, Summary, TokenAvatar, useFeeBps, useTxRunner } from "./ui";

const fmtAmount = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(2)}K` : n.toLocaleString("en-US", { maximumFractionDigits: 4 });

export function BurnTokensTab() {
  const scan = useScan<TokenAccountInfo>(
    (o) => `/api/scan/tokens/${o}`,
    (d) => d.burnable,
    (a) => a.address,
  );
  const feeBps = useFeeBps();
  const { status, run, busy } = useTxRunner(scan.removeIds);

  const selectedItems = scan.items.filter((a) => scan.selected.has(a.address));
  const gross = selectedItems.reduce((s, a) => s + a.lamports, 0);

  const burn = () =>
    run(
      () => api<{ transactions: BuiltTx[] }>("/api/build/burn-tokens", { owner: scan.owner, accounts: Array.from(scan.selected) }),
      "Burned",
    );

  return (
    <Card>
      <div className="flex items-start gap-2 rounded-xl bg-orange-900/30 border border-orange-500/30 px-3 py-2 mb-4 text-orange-200 text-sm">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        Burning is permanent. Only burn tokens you are sure are worthless or spam.
      </div>
      <ListHeader
        title="Tokens"
        count={scan.items.length}
        allSelected={scan.allSelected}
        onToggleAll={scan.toggleAll}
        onRefresh={scan.load}
        loading={scan.loading}
      />
      {scan.items.length === 0 ? (
        <EmptyState loading={scan.loading} error={scan.error} text="No tokens to burn." />
      ) : (
        <ul className="divide-y divide-purple-500/20 max-h-[420px] overflow-y-auto pr-1">
          {scan.items.map((a) => (
            <li key={a.address}>
              <label className="flex items-center gap-3 py-2.5 cursor-pointer">
                <Checkbox checked={scan.selected.has(a.address)} onChange={() => scan.toggle(a.address)} />
                <TokenAvatar src={a.image} label={a.symbol} />
                <div className="min-w-0 flex-1">
                  <div className="text-white truncate">
                    {a.name} <span className="text-purple-300/70 text-sm">{a.symbol}</span>
                  </div>
                  <div className="text-purple-300/70 text-xs">
                    {fmtAmount(a.uiAmount)}
                    {a.usdValue != null && (
                      <span className={a.usdValue >= 1 ? "text-yellow-300 ml-2" : "ml-2"}>${a.usdValue.toFixed(2)}</span>
                    )}
                  </div>
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
        actionLabel="Burn & Claim"
        busy={busy}
        onAction={burn}
        danger
      />
      <StatusBar status={status} />
    </Card>
  );
}
