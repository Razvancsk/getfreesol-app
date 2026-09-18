import { AlertTriangle, Flame, ShieldCheck } from "lucide-react";
import { api, type BuiltTx, type NftInfo } from "@/lib/api";
import { useScan } from "./useScan";
import { Card, EmptyState, InfoBox, InfoBoxes, ListHeader, StatusBar, Summary, useFeeBps, useTxRunner } from "./ui";

// Typical rent held by one NFT (token account + metadata + edition); the exact amount is measured when building.
const EST_LAMPORTS: Record<NftInfo["kind"], number> = { nft: 7_300_000, pnft: 8_800_000, core: 2_900_000 };

// NFTs burned per wallet prompt. Wallets often fail on long lists of transactions at once.
const NFTS_PER_BATCH = 5;

export function BurnNftsTab() {
  const scan = useScan<NftInfo>(
    (o) => `/api/scan/nfts/${o}`,
    (d) => d.nfts,
    (n) => n.id,
  );
  const feeBps = useFeeBps();
  const { status, runBatchedAll, busy } = useTxRunner(scan.removeIds);

  const selectedItems = scan.items.filter((n) => scan.selected.has(n.id));
  const gross = selectedItems.reduce((s, n) => s + EST_LAMPORTS[n.kind], 0);

  const burn = () =>
    runBatchedAll(
      Array.from(scan.selected),
      NFTS_PER_BATCH,
      (chunk) => api<{ transactions: BuiltTx[] }>("/api/build/burn-nfts", { owner: scan.owner, ids: chunk }),
      "Burned",
    );

  return (
    <>
      <Card>
        <div className="flex items-start gap-2 rounded-xl bg-orange-900/30 border border-orange-500/30 px-3 py-2 mb-4 text-orange-200 text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          Burning is permanent. Nothing is hidden, so check anything marked with a warning before you burn it.
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
                  <div className="aspect-square bg-purple-900/60 relative">
                    {n.image && <img src={n.image} alt="" loading="lazy" className="h-full w-full object-cover" />}
                    {n.warning && (
                      <span
                        title={n.warning}
                        className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-semibold text-slate-900"
                      >
                        <AlertTriangle className="h-3 w-3" /> Careful
                      </span>
                    )}
                  </div>
                  <div className="p-2">
                    <div className="text-white text-sm truncate">{n.name}</div>
                    <div className={`text-xs truncate ${n.warning ? "text-orange-300" : "text-purple-300/70"}`}>
                      {n.warning || n.collection || (n.kind === "core" ? "Core asset" : n.kind === "pnft" ? "pNFT" : "NFT")}
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
          txCount={scan.selected.size}
          busy={busy}
          onAction={burn}
          danger
        />
        <StatusBar status={status} />
      </Card>

      <InfoBoxes>
        <InfoBox icon={<Flame className="h-4 w-4 text-red-400" />} title="What does burning an NFT return?">
          An NFT holds its rent in several accounts. Burning it destroys the NFT permanently and closes those accounts,
          which returns roughly 0.003 to 0.009 SOL depending on the type. The exact amount is measured before you sign.
        </InfoBox>
        <InfoBox icon={<ShieldCheck className="h-4 w-4 text-green-400" />} title="What is kept safe?">
          Every NFT in your wallet is listed, including staked, listed and LP-position ones. Those carry a Careful
          badge because burning them can destroy real value. Burning runs one NFT per transaction, so anything the
          network rejects is skipped without stopping the rest.
        </InfoBox>
      </InfoBoxes>
    </>
  );
}
