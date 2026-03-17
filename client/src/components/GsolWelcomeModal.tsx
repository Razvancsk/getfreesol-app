import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Droplets, Shield, Zap, X } from "lucide-react";

const STORAGE_KEY = "gsol_welcome_seen_v2";
const GSOL_IMAGE = "https://arweave.net/bI_xaAYaRbiHmD7R39memuroXIfwypY1r6MgKJV8qaw";

export default function GsolWelcomeModal() {
  const [open, setOpen] = useState(false);
  const [apy, setApy] = useState<string | null>(null);

  useEffect(() => {
    const seen = localStorage.getItem(STORAGE_KEY);
    if (!seen) setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetch("/api/staking/info")
      .then(r => r.json())
      .then(d => { if (d.apy) setApy(parseFloat(d.apy).toFixed(2)); })
      .catch(() => {});
  }, [open]);

  function handleClose() {
    localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  }

  function handleStake() {
    handleClose();
    setTimeout(() => {
      const tabs = Array.from(document.querySelectorAll("button"));
      const stakingBtn = tabs.find(
        (b) => b.textContent?.toLowerCase().includes("staking") ||
               b.getAttribute("data-tab") === "staking"
      );
      if (stakingBtn) {
        stakingBtn.click();
        stakingBtn.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 200);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md p-0 overflow-hidden border-0 bg-transparent shadow-none [&>button]:hidden">
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-[#1a0533] via-[#2d0a5e] to-[#0d0820] border border-purple-500/30 shadow-2xl shadow-purple-900/50">

          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          >
            <X className="w-4 h-4 text-white/70" />
          </button>

          {/* Header glow */}
          <div className="absolute inset-0 bg-gradient-to-b from-purple-600/20 via-transparent to-transparent pointer-events-none" />

          {/* Top section */}
          <div className="px-6 pt-8 pb-4 text-center relative">
            <Badge className="mb-3 bg-purple-500/20 text-purple-300 border-purple-500/40 text-xs font-medium px-3 py-1">
              ✨ Liquid Staking Token
            </Badge>

            {/* GSOL token image */}
            <div className="relative mx-auto w-20 h-20 mb-4">
              <div className="absolute inset-0 rounded-full bg-purple-500/40 blur-xl animate-pulse" />
              <img
                src={GSOL_IMAGE}
                alt="GSOL token"
                className="relative w-20 h-20 rounded-full border-2 border-purple-400/50 shadow-lg shadow-purple-900/60"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%237c3aed'/%3E%3Ctext x='50' y='62' text-anchor='middle' font-size='36' font-family='Arial' font-weight='bold' fill='white'%3EG%3C/text%3E%3C/svg%3E";
                }}
              />
            </div>

            <h2 className="text-2xl font-bold text-white mb-1">
              Earn SOL While Staying Liquid
            </h2>
            <p className="text-purple-200/70 text-sm">
              Stake SOL and receive <span className="text-purple-300 font-semibold">GSOL</span> — a liquid token that earns staking rewards automatically.
            </p>
          </div>

          {/* APY highlight — pure purple, no blue */}
          <div className="mx-6 mb-4 rounded-xl bg-purple-900/40 border border-purple-500/25 p-4 text-center">
            <p className="text-purple-300/80 text-xs uppercase tracking-wider mb-1 font-medium">Current Staking APY</p>
            <p className="text-4xl font-black text-white">
              {apy ? `${apy}%` : <span className="text-2xl animate-pulse text-purple-300">Loading…</span>}
            </p>
            <p className="text-purple-400/60 text-xs mt-1">Live · Updated every visit</p>
          </div>

          {/* Feature bullets — all purple icons */}
          <div className="mx-6 mb-5 space-y-2.5">
            {[
              { icon: Droplets,   color: "text-purple-400", label: "Stay liquid — use GSOL in DeFi while earning" },
              { icon: TrendingUp, color: "text-violet-400",  label: "Rewards compound automatically, no claiming needed" },
              { icon: Shield,     color: "text-fuchsia-400", label: "Non-custodial — your SOL, your keys" },
              { icon: Zap,        color: "text-purple-300",  label: "Unstake anytime via instant Jupiter swap" },
            ].map(({ icon: Icon, color, label }) => (
              <div key={label} className="flex items-start gap-2.5">
                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${color}`} />
                <p className="text-white/75 text-sm leading-snug">{label}</p>
              </div>
            ))}
          </div>

          {/* CTA buttons — brand purple only */}
          <div className="px-6 pb-6 flex gap-3">
            <Button
              onClick={handleStake}
              className="flex-1 bg-gradient-to-r from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 text-white font-semibold rounded-xl py-5 shadow-lg shadow-purple-900/50 border-0"
            >
              Start Staking GSOL
            </Button>
            <Button
              onClick={handleClose}
              variant="outline"
              className="px-4 rounded-xl border-purple-500/30 text-purple-300/70 hover:text-white hover:bg-purple-800/30 bg-transparent"
            >
              Later
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
