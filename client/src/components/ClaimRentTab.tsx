import { useEffect } from "react";
import { Coins, Gift, RefreshCw } from "lucide-react";
import { api, fmtSol, type BuiltTx, type RewardInfo, type TokenAccountInfo } from "@/lib/api";
import { useScan } from "./useScan";
import { Card, EmptyState, InfoBox, InfoBoxes, StatusBar, Summary, TokenAvatar, useFeeBps, useTxRunner } from "./ui";

// Max items per transaction (Solana 1232-byte limit); one wallet approval per batch
const BATCH_SIZE = 20;

function Checkbox({ on }: { on: boolean }) {
  return (
    <span
      className={`h-5 w-5 shrink-0 rounded border flex items-center justify-center ${
        on ? "bg-green-500 border-green-400" : "border-purple-400/60"
      }`}
    >
      {on && <span className="text-slate-900 text-xs font-bold">✓</span>}
    </span>
  );
}

/** Everything claimable in one list: pump.fun rewards first, then rent stuck in empty accounts. */
export function ClaimRentTab() {
  const rewards = useScan<RewardInfo>(
    (o) => `/api/scan/rewards/${o}`,
    (d) => d.rewards,
    (r) => r.id,
  );
  const accounts = useScan<TokenAccountInfo>(
    (o) => `/api/scan/tokens/${o}`,
    (d) => d.empty,
    (a) => a.address,
  );
  const feeBps = useFeeBps();
  const { status, runBatchedAll, busy } = useTxRunner((ids) => {
    rewards.removeIds(ids);
    accounts.removeIds(ids);
  });

  // A fresh scan starts fully selected - everything in this list is free money
  useEffect(() => rewards.setAll(true), [rewards.items]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => accounts.setAll(true), [accounts.items]); // eslint-disable-line react-hooks/exhaustive-deps

  const loading = rewards.loading || accounts.loading;
  const count = rewards.items.length + accounts.items.length;
  const selectedCount = rewards.selected.size + accounts.selected.size;
  const selectedLamports =
    rewards.items.reduce((s, r) => s + (rewards.selected.has(r.id) ? r.lamports : 0), 0) +
    accounts.items.reduce((s, a) => s + (accounts.selected.has(a.address) ? a.lamports : 0), 0);
  const waiting = rewards.items.reduce((s, r) => s + r.lamports, 0) + accounts.items.reduce((s, a) => s + a.lamports, 0);

  const allSelected = count > 0 && selectedCount === count;
  const toggleAll = () => {
    rewards.setAll(!allSelected);
    accounts.setAll(!allSelected);
  };
  const refresh = () => {
    rewards.load();
    accounts.load();
  };

  // Rewards are claimed in their own transaction, on top of the batches of empty accounts
  const txCount = Math.ceil(accounts.selected.size / BATCH_SIZE) + (rewards.selected.size > 0 ? 1 : 0);

  const claimAll = () =>
    runBatchedAll(
      [...rewards.selected, ...accounts.selected],
      BATCH_SIZE,
      (chunk) => api<{ transactions: BuiltTx[] }>("/api/build/claim", { owner: accounts.owner, accounts: chunk }),
      "Claimed",
    );

  return (
    <>
      <Card>
        <div className="text-center mb-5">
          <div className="text-purple-200 text-sm">SOL waiting for you</div>
          <div className="text-4xl font-bold text-white mt-1">{fmtSol(waiting)} SOL</div>
        </div>

        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="text-white font-semibold">
            Claimable <span className="text-purple-300 font-normal">({count})</span>
          </div>
          <div className="flex items-center gap-4">
            {count > 0 && (
              <button onClick={toggleAll} disabled={busy} className="text-purple-200 hover:text-white text-sm font-medium">
                {allSelected ? "Deselect all" : "Select all"}
              </button>
            )}
            <button
              onClick={refresh}
              disabled={loading || busy}
              className="text-purple-200 hover:text-white disabled:opacity-50 flex items-center gap-1 text-sm"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
        </div>

        {count === 0 ? (
          <EmptyState loading={loading} error={accounts.error || rewards.error} text="Nothing to claim. Your wallet is clean! 🎉" />
        ) : (
          // Exactly two rows: 60px each (py-2.5 around a 40px avatar) plus the 1px divider between them
          <ul className="divide-y divide-purple-500/20 max-h-[121px] overflow-y-auto no-scrollbar">
            {rewards.items.map((r) => (
              <li key={r.id}>
                <button onClick={() => rewards.toggle(r.id)} className="w-full flex items-center gap-3 py-2.5 text-left">
                  <Checkbox on={rewards.selected.has(r.id)} />
                  <span className="h-10 w-10 shrink-0 rounded-full bg-green-500/15 flex items-center justify-center">
                    <Gift className="h-5 w-5 text-green-400" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-white truncate">{r.label}</span>
                    <span className="block text-purple-300/70 text-xs truncate">{r.description}</span>
                  </span>
                  <span className="text-green-400 text-sm font-medium whitespace-nowrap">+{fmtSol(r.lamports, 6)} SOL</span>
                </button>
              </li>
            ))}
            {accounts.items.map((a) => (
              <li key={a.address}>
                <button onClick={() => accounts.toggle(a.address)} className="w-full flex items-center gap-3 py-2.5 text-left">
                  <Checkbox on={accounts.selected.has(a.address)} />
                  <TokenAvatar src={a.image} label={a.symbol} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-white truncate">{a.name}</span>
                    <span className="block text-purple-300/70 text-xs font-mono truncate">{a.mint}</span>
                  </span>
                  <span className="text-green-400 text-sm font-medium whitespace-nowrap">+{fmtSol(a.lamports)} SOL</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <Summary
          label="Rewards and rent claimed"
          grossLamports={selectedLamports}
          feeBps={feeBps}
          selectedCount={selectedCount}
          actionLabel="Claim All"
          txCount={Math.max(1, txCount)}
          busy={busy}
          onAction={claimAll}
        />
        <StatusBar status={status} />
      </Card>

      <InfoBoxes>
        <InfoBox icon={<Coins className="h-4 w-4 text-purple-300" />} title="Where does the rent come from?">
          Solana charges a deposit of about 0.002 SOL for every token account your wallet opens. Once a token is sold or
          transferred away the account sits empty, and closing it returns that deposit to you.
        </InfoBox>
        <InfoBox icon={<Gift className="h-4 w-4 text-green-400" />} title="What are pump.fun rewards?">
          Pump.fun pays cashback on trades of cashback coins, and pays creator fees to whoever created a coin. Both
          collect in vaults that only you can claim from - they stay there until someone claims them for you.
        </InfoBox>
      </InfoBoxes>
    </>
  );
}
