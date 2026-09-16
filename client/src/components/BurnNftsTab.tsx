import { AlertTriangle } from "lucide-react";
import { api, type BuiltTx, type NftInfo } from "@/lib/api";
import { useScan } from "./useScan";
import { Card, EmptyState, ListHeader, StatusBar, Summary, useFeeBps, useTxRunner } from "./ui";

// Typical rent held by one NFT (token account + metadata + edition); the exact amount is measured when building.
const EST_LAMPORTS: Record<NftInfo["kind"], number> = { nft: 7_300_000, pnft: 8_800_000, core: 2_900_000 };

export function BurnNftsTab() {
  const scan = useScan<NftInfo>(
    (o) => `/api/scan/nfts/${o}`,
    (d) => d.nfts,
    (n) => n.id,
  );
  const feeBps = useFeeBps();
  const { status, run, busy } = useTxRunner(scan.removeIds);

  const selectedItems = scan.items.filter((n) => scan.selected.has(n.id));
  const gross = selectedItems.reduce((s, n) => s + EST_LAMPORTS[n.kind], 0);

  const burn = () =>
    run(() => api<{ transactions: BuiltTx[] }>("/api/build/burn-nfts", { owner: scan.owner, ids: Array.from(scan.selected) }), "Burned");

  return (
    <Card>
      <div className="flex items-start gap-2 rounded-xl bg-orange-900/30 border border-orange-500/30 px-3 py-2 mb-4 text-orange-200 text-sm">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        Burning is permanent. Staked, listed and LP-position NFTs are hidden for safety.
      </div>
      <ListHeader
        title="NFTs"
        count={scan.items.length}
        allSelected={scan.allSelected}
        onToggleAll={scan.toggleAll}
        onRefresh={scan.load}
        loading={scan.loading}
      />
      {scan.items.length === 0 ? (
        <EmptyState loading={scan.loading} error={scan.error} text="No burnable NFTs found." />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[520px] overflow-y-auto p-1">
          {scan.items.map((n) => {
            const on = scan.selected.has(n.id);
            return (
              <button
                key={n.id}
                onClick={() => scan.toggle(n.id)}
                className={`text-left rounded-xl overflow-hidden border transition-all ${
                  on ? "border-red-500 ring-2 ring-red-500" : "border-purple-500/30 hover:border-purple-400/60"
                } bg-slate-900/50`}
              >
                <div className="aspect-square bg-purple-900/60">
                  {n.image && <img src={n.image} alt="" loading="lazy" className="h-full w-full object-cover" />}
                </div>
                <div className="p-2">
                  <div className="text-white text-sm truncate">{n.name}</div>
                  <div className="text-purple-300/70 text-xs truncate">
                    {n.collection || (n.kind === "core" ? "Core asset" : n.kind === "pnft" ? "pNFT" : "NFT")}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
      <Summary
        label="Estimated rent reclaimed"
        grossLamports={gross}
        feeBps={feeBps}
        selectedCount={scan.selected.size}
        actionLabel="Burn"
        busy={busy}
        onAction={burn}
        danger
      />
      <StatusBar status={status} />
    </Card>
  );
}
