import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TrendingUp, Droplets, Shield, Zap, X } from "lucide-react";

const STORAGE_KEY = "gsol_welcome_seen_v5";
const GSOL_IMAGES = [
  "https://nsh7c2agdjc3rb4yh3i57wm6tlvoqxeh6dfjmnnpumqcrfl4vgwa.arweave.net/bI_xaAYaRbiHmD7R39memuroXIfwypY1r6MgKJV8qaw",
  "https://arweave.net/bI_xaAYaRbiHmD7R39memuroXIfwypY1r6MgKJV8qaw",
];

export default function GsolWelcomeModal() {
  const [open, setOpen] = useState(false);
  const [imgIdx, setImgIdx] = useState(0);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem(STORAGE_KEY);
    if (!seen) setOpen(true);
  }, []);

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

  function handleImgError() {
    if (imgIdx < GSOL_IMAGES.length - 1) {
      setImgIdx(i => i + 1);
    } else {
      setImgFailed(true);
    }
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

            {/* New Feature pill */}
            <span className="inline-flex items-center gap-1.5 mb-3 bg-green-500/20 text-green-400 border border-green-500/40 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              New Feature
            </span>

            {/* GSOL token image */}
            <div className="relative mx-auto w-20 h-20 mb-4">
              <div className="absolute inset-0 rounded-full bg-purple-500/40 blur-xl animate-pulse" />
              {!imgFailed ? (
                <img
                  src={GSOL_IMAGES[imgIdx]}
                  alt="GSOL token"
                  className="relative w-20 h-20 rounded-full border-2 border-purple-400/50 shadow-lg shadow-purple-900/60"
                  onError={handleImgError}
                />
              ) : (
                <div className="relative w-20 h-20 rounded-full border-2 border-purple-400/50 bg-purple-700 flex items-center justify-center text-3xl font-black text-white">
                  G
                </div>
              )}
            </div>

            <h2 className="text-2xl font-bold text-white mb-1">
              Earn SOL While Staying Liquid
            </h2>
            <p className="text-white/90 text-sm">
              Stake SOL and receive <span className="text-white font-semibold">GSOL</span> — a liquid token that earns staking rewards automatically.
            </p>
          </div>

          {/* APY highlight */}
          <div className="mx-6 mb-4 rounded-xl bg-purple-900/40 border border-purple-500/25 p-4 text-center">
            <p className="text-white/70 text-xs uppercase tracking-wider mb-1 font-medium">Current Staking APY</p>
            <p className="text-4xl font-black text-white">7.20%</p>
          </div>

          {/* Feature bullets */}
          <div className="mx-6 mb-5 space-y-2.5">
            {[
              { icon: Droplets,   color: "text-purple-400", label: "Stay liquid — use GSOL in DeFi while earning" },
              { icon: TrendingUp, color: "text-violet-400",  label: "Rewards compound automatically, no claiming needed" },
              { icon: Shield,     color: "text-fuchsia-400", label: "Non-custodial — your SOL, your keys" },
              { icon: Zap,        color: "text-purple-300",  label: "Unstake anytime via instant Jupiter swap" },
            ].map(({ icon: Icon, color, label }) => (
              <div key={label} className="flex items-start gap-2.5">
                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${color}`} />
                <p className="text-white text-sm leading-snug">{label}</p>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="px-6 pb-6">
            <Button
              onClick={handleStake}
              className="w-full bg-gradient-to-r from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 text-white font-semibold rounded-xl py-5 shadow-lg shadow-purple-900/50 border-0"
            >
              Start Staking GSOL
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
