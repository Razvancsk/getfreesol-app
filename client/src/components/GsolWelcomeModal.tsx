import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { X } from "lucide-react";

const STORAGE_KEY = "gsol_welcome_seen_v9";
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
      const btn = document.getElementById("staking-tab-btn");
      if (btn) {
        btn.click();
        btn.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 200);
  }

  function handleImgError() {
    if (imgIdx < GSOL_IMAGES.length - 1) setImgIdx(i => i + 1);
    else setImgFailed(true);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-sm p-0 overflow-hidden border-0 bg-transparent shadow-none [&>button]:hidden">

        {/* Purple site-style card */}
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-[#1a0533] via-[#2d0a5e] to-[#1a0533] border border-purple-500/30 shadow-2xl shadow-purple-900/50 px-7 py-8 text-center">

          {/* Header glow */}
          <div className="absolute inset-0 bg-gradient-to-b from-purple-600/20 via-transparent to-transparent pointer-events-none" />

          {/* Close */}
          <button onClick={handleClose} className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
            <X className="w-4 h-4 text-white/70" />
          </button>

          {/* Token image */}
          <div className="relative flex justify-center mb-3">
            <div className="absolute w-16 h-16 rounded-full bg-purple-500/40 blur-xl animate-pulse" />
            {!imgFailed ? (
              <img src={GSOL_IMAGES[imgIdx]} alt="GSOL" onError={handleImgError}
                className="relative w-16 h-16 rounded-full border-2 border-purple-400/50 shadow-lg" />
            ) : (
              <div className="relative w-16 h-16 rounded-full border-2 border-purple-400/50 bg-purple-700 flex items-center justify-center text-2xl font-black text-white">G</div>
            )}
          </div>

          {/* Title */}
          <h2 className="text-2xl font-extrabold text-white leading-tight mb-2 relative">
            Get Free Sol Liquid<br />Staking Token is Live!
          </h2>

          {/* Subtitle */}
          <p className="text-purple-300 font-semibold text-sm mb-5 relative">
            Stake SOL. Earn Yield. Stay Liquid.
          </p>

          {/* Bullet points */}
          <div className="space-y-3 mb-5 relative">
            <p className="text-white text-2xl font-black text-center">7.20% APY</p>
            <div className="flex items-center gap-2">
              <span className="text-lg">💧</span>
              <p className="text-white text-sm font-semibold">Stay Liquid — use GSOL in DeFi while earning</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg">🔒</span>
              <p className="text-white text-sm font-semibold">100% Secure — your SOL stays on-chain</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg">⚡</span>
              <p className="text-white text-sm font-semibold">Unstake Anytime via Jupiter</p>
            </div>
          </div>

          {/* Tagline */}
          <p className="text-yellow-400 font-semibold text-sm mb-5 relative">
            Your SOL works harder with GetFreeSol.
          </p>

          {/* CTA */}
          <button
            onClick={handleStake}
            className="relative w-full bg-gradient-to-r from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 text-white font-bold rounded-xl py-3 text-base shadow-lg shadow-purple-900/50 transition-all"
          >
            Start Staking GSOL
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
