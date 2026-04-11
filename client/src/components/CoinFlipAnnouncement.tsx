import { useState, useEffect } from "react";
import { useLocation } from "wouter";

const STORAGE_KEY = "coin_flip_announcement_seen";

export function CoinFlipAnnouncement() {
  const [visible, setVisible] = useState(false);
  const [, navigate] = useLocation();

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return;
    const timer = setTimeout(() => setVisible(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(STORAGE_KEY, "1");
  };

  const tryIt = () => {
    dismiss();
    navigate("/");
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("navigate-to-coinflip"));
    }, 100);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
      onClick={dismiss}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl border border-yellow-400/30"
        style={{
          background: "linear-gradient(135deg, #1a0840 0%, #0d0520 55%, #1e0b4a 100%)",
          animation: "slideUp 0.4s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow accent top */}
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-yellow-400 via-purple-400 to-yellow-400 opacity-80" />

        {/* Close */}
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 text-white/50 hover:text-white text-xl leading-none transition-colors"
          aria-label="Close"
        >
          ✕
        </button>

        <div className="p-6 pt-7 text-center">
          {/* Coin icon */}
          <div className="flex justify-center mb-3">
            <img
              src="/coin_icon.png"
              alt="Coin Flip"
              className="w-28 h-28 object-contain drop-shadow-lg"
            />
          </div>

          <div className="inline-block bg-yellow-400/20 text-yellow-300 text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-3 border border-yellow-400/30">
            New Feature
          </div>

          <h2 className="text-white text-2xl font-bold mb-2">Coin Flip is Live!</h2>
          <p className="text-white text-sm leading-relaxed mb-5">
            Feeling lucky? Bet SOL on a coin flip — 50/50 odds, choose Green or Red,
            pick your stake, and double your SOL in seconds. Powered on-chain with instant payouts.
          </p>

          <div className="flex flex-col gap-2">
            <button
              onClick={tryIt}
              className="w-full py-3 rounded-xl font-bold text-black text-sm transition-all"
              style={{ background: "linear-gradient(90deg, #facc15, #f59e0b)" }}
            >
              Try Coin Flip Now 🎰
            </button>
            <button
              onClick={dismiss}
              className="w-full py-2 rounded-xl text-purple-300 text-sm hover:text-white transition-colors"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(30px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
