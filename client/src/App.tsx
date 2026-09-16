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

      <footer className="border-t border-purple-500/20 py-5 px-4 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 text-sm text-purple-100/60">
        <span>© {new Date().getFullYear()} Get Free Sol</span>
        <div className="flex items-center gap-3">
          <a
            href="https://x.com/getfreesol_xyz"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Get Free Sol on X"
            className="h-9 w-9 rounded-full bg-purple-800/50 border border-purple-500/30 flex items-center justify-center text-white hover:bg-purple-600/60 transition-colors"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
          <a
            href="https://discord.gg/Jp7Tu6shGe"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Get Free Sol on Discord"
            className="h-9 w-9 rounded-full bg-purple-800/50 border border-purple-500/30 flex items-center justify-center text-white hover:bg-purple-600/60 transition-colors"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
              <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
          </a>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return <Home />;
}
