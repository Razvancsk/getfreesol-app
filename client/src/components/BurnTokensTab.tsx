import { AlertTriangle, Coins, Flame } from "lucide-react";
import { api, fmtSol, type BuiltTx, type TokenAccountInfo } from "@/lib/api";
import { useScan } from "./useScan";
import { Card, EmptyState, InfoBox, InfoBoxes, ListHeader, StatusBar, Summary, TokenAvatar, useFeeBps, useTxRunner } from "./ui";

const fmtAmount = (n: number) =>
  n >= 1e9
    ? `${(n / 1e9).toFixed(2)}B`
    : n >= 1e6
      ? `${(n / 1e6).toFixed(2)}M`
      : n >= 1e3
        ? `${(n / 1e3).toFixed(2)}K`
        : n > 0 && n < 0.0001
          ? n.toPrecision(2) // dust amounts, e.g. 0.0000012
          : n.toLocaleString("en-US", { maximumFractionDigits: 4 });

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
    <>
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
          <ul className="space-y-2 max-h-[420px] overflow-y-auto p-1">
            {scan.items.map((a) => (
              <li key={a.address}>
                <button
                  type="button"
                  onClick={() => scan.toggle(a.address)}
                  className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-colors ${
                    scan.selected.has(a.address)
                      ? "border-red-500 bg-red-500/10"
                      : "border-transparent bg-purple-950/20 hover:bg-purple-800/30"
                  }`}
                >
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
                </button>
              </li>
            ))}
          </ul>
        )}
        <Summary
          label="Rent reclaimed"
          grossLamports={gross}
          feeBps={feeBps}
          selectedCount={scan.selected.size}
          actionLabel="Burn"
          txCount={Math.ceil(scan.selected.size / 8)}
          busy={busy}
          onAction={burn}
          danger
        />
        <StatusBar status={status} />
      </Card>

      <InfoBoxes>
        <InfoBox icon={<Flame className="h-4 w-4 text-red-400" />} title="What does burning do?">
          Burning destroys the tokens for good and closes the account they sat in. The tokens cannot be recovered
          afterwards, by you or anyone else, so only burn what you are sure is worthless or spam.
        </InfoBox>
        <InfoBox icon={<Coins className="h-4 w-4 text-purple-300" />} title="What do you get back?">
          You get back the account deposit, about 0.002 SOL per token, not the market value of the tokens themselves.
          Any token still worth something is marked with its dollar value so you can spot it before burning.
        </InfoBox>
      </InfoBoxes>
    </>
  );
}
