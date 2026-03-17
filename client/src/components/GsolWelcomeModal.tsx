import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { X } from "lucide-react";

const STORAGE_KEY = "gsol_welcome_seen_v4";
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
      <DialogContent className="max-w-sm p-0 overflow-hidden border-0 bg-transparent shadow-none [&>button]:hidden">
        <div className="relative rounded-2xl overflow-hidden bg-[#0f0a1e] border border-purple-800/40 shadow-2xl shadow-purple-900/60 px-7 py-8 text-center">

          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-3 right-3 p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          >
            <X className="w-4 h-4 text-white/70" />
          </button>

          {/* Token image or fallback emoji */}
          <div className="flex justify-center mb-3">
            {!imgFailed ? (
              <img
                src={GSOL_IMAGES[imgIdx]}
                alt="GSOL"
                className="w-16 h-16 rounded-full border-2 border-purple-500/50"
                onError={handleImgError}
              />
            ) : (
              <span className="text-5xl">🪙</span>
            )}
          </div>

          {/* Title */}
          <h2 className="text-2xl font-extrabold text-white leading-tight mb-2">
            GSOL Liquid Staking<br />is Live!
          </h2>

          {/* Subtitle */}
          <p className="text-purple-400 font-semibold text-sm mb-5">
            Stake SOL. Earn Yield. Stay Liquid.
          </p>

          {/* Bullet points */}
          <div className="text-left space-y-3 mb-5">
            <div className="flex items-start gap-2">
              <span className="text-base">💰</span>
              <p className="text-white text-sm"><span className="font-bold">7.20% APY</span> — earn real staking rewards automatically</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-base">💧</span>
              <p className="text-white text-sm"><span className="font-bold">Stay Liquid</span> — use GSOL in DeFi while earning</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-base">🔐</span>
              <p className="text-white text-sm"><span className="font-bold">Non-Custodial</span> — your SOL, your keys, always</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-base">⚡</span>
              <p className="text-white text-sm"><span className="font-bold">Unstake Anytime</span> — instant swap back to SOL via Jupiter</p>
            </div>
          </div>

          {/* Tagline */}
          <p className="text-yellow-400 font-semibold text-sm mb-5">
            Your SOL works harder with GetFreeSol.
          </p>

          {/* CTA */}
          <button
            onClick={handleStake}
            className="w-full bg-gradient-to-r from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 text-white font-bold rounded-xl py-3 text-base shadow-lg shadow-purple-900/50 transition-all"
          >
            Start Staking GSOL 🪙
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
