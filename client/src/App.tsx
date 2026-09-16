import { useState } from "react";
import { Flame, Image as ImageIcon, LogOut } from "lucide-react";
import { useWallet } from "./lib/wallet";
import { ClaimRentTab } from "./components/ClaimRentTab";
import { BurnTokensTab } from "./components/BurnTokensTab";
import { BurnNftsTab } from "./components/BurnNftsTab";
import { SolanaIcon } from "./components/ui";

type Tab = "claim" | "tokens" | "nfts";

const TABS: { id: Tab; label: string; headline: string; icon: JSX.Element }[] = [
  { id: "claim", label: "Claim Rent", headline: "Get your SOL back!", icon: <SolanaIcon className="h-5 w-5 shrink-0" /> },
  { id: "tokens", label: "Burn Tokens", headline: "Burn Unwanted Tokens.", icon: <Flame className="h-5 w-5 shrink-0" /> },
  { id: "nfts", label: "Burn NFTs", headline: "Burn Unwanted NFTs.", icon: <ImageIcon className="h-5 w-5 shrink-0" /> },
];

function WalletButton({ compact = false }: { compact?: boolean }) {
  const { publicKey, disconnect, open: openModal } = useWallet();
  const [open, setOpen] = useState(false);

  if (!publicKey) {
    return (
      <button
        onClick={openModal}
        className="bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-4 py-2 text-sm font-medium border border-purple-500/30"
      >
        {compact ? "Connect" : "Connect Wallet"}
      </button>
    );
  }
  const addr = publicKey.toBase58();
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="bg-purple-800/60 hover:bg-purple-700/60 backdrop-blur-sm rounded-lg px-3 md:px-4 py-2 text-white font-mono text-xs md:text-sm border border-purple-500/30"
      >
        {addr.slice(0, 4)}...{addr.slice(-4)}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-slate-800 border border-purple-500/30 rounded-md shadow-lg min-w-full overflow-hidden">
            <button
              onClick={() => {
                disconnect();
                setOpen(false);
              }}
              className="w-full px-3 py-2 text-white hover:bg-purple-600/40 text-sm flex items-center justify-center gap-2"
            >
              <LogOut className="h-3.5 w-3.5" /> Disconnect
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Home() {
  const { publicKey, open: openModal } = useWallet();
  const [tab, setTab] = useState<Tab>("claim");
  const active = TABS.find((t) => t.id === tab)!;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex flex-col">
      <div className="flex-1 container mx-auto max-w-6xl px-4 pb-8">
        <header className="flex items-center justify-between pt-1">
          <img src="/gfs-logo.png" alt="Get Free Sol" className="h-[70px] w-[70px] md:h-[100px] md:w-[100px]" />
          <WalletButton />
        </header>

        {!publicKey ? (
          <section className="text-center pt-10 md:pt-16 pb-10">
            <h1 className="text-4xl md:text-6xl font-bold text-white">
              Get your{" "}
              <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">SOL</span>{" "}
              back!
            </h1>
            <p className="text-purple-100/80 text-lg md:text-xl max-w-2xl mx-auto mt-4">
              Every empty token account in your wallet holds ~0.002 SOL of rent. Close them, burn the junk tokens and
              NFTs you don't want, and claim that SOL back in one click.
            </p>
            <button
              onClick={openModal}
              className="mt-8 bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white text-xl font-semibold rounded-full px-10 py-4 shadow-lg shadow-purple-900/50"
            >
              Connect Wallet
            </button>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl mx-auto mt-14">
              {TABS.map((t) => (
                <div key={t.id} className="bg-purple-900/40 border border-purple-500/30 rounded-2xl p-5 text-left">
                  <div className="flex items-center gap-2 text-white font-semibold text-lg">
                    {t.icon} {t.label}
                  </div>
                  <p className="text-purple-100/70 text-sm mt-2">
                    {t.id === "claim" && "Close empty token accounts and get their rent back."}
                    {t.id === "tokens" && "Burn scam and dust tokens, then reclaim the account rent."}
                    {t.id === "nfts" && "Burn spam NFTs and recover the SOL locked in them."}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <>
            <p className="text-center text-white text-2xl font-semibold py-2">{active.headline}</p>

            <nav className="hidden md:flex items-center justify-center gap-3 py-3">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`w-[215px] px-4 py-3 text-xl font-semibold rounded-full transition-all flex items-center justify-center gap-2 border whitespace-nowrap text-white ${
                    tab === t.id
                      ? "bg-purple-600 border-purple-500"
                      : "bg-purple-800/40 hover:bg-purple-600/60 border-purple-500/30"
                  }`}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </nav>
            <nav className="md:hidden flex bg-purple-900/40 rounded-xl p-1 gap-1 mb-3">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 ${
                    tab === t.id ? "bg-purple-600 text-white" : "text-gray-400 hover:text-white"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </nav>

            <main className="max-w-3xl mx-auto">
              {tab === "claim" && <ClaimRentTab />}
              {tab === "tokens" && <BurnTokensTab />}
              {tab === "nfts" && <BurnNftsTab />}
            </main>
          </>
        )}
      </div>

      <footer className="border-t border-purple-500/20 py-5 text-center text-sm text-purple-100/60">
        © {new Date().getFullYear()} Get Free Sol · Rent is returned to your wallet on-chain · Always check what you burn
      </footer>
    </div>
  );
}

export default function App() {
  return <Home />;
}
