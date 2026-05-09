import { useState, useEffect } from "react";
import { useLocation } from "wouter";

const VERSION = "terminal_v3";

export function triggerTerminalAnnouncement(walletAddress?: string) {
  const key = walletAddress ? `${VERSION}_${walletAddress}` : `${VERSION}_anon`;
  if (localStorage.getItem(key)) return;
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent("show-terminal-announcement", { detail: { key } }));
  }, 1200);
}

export function TerminalAnnouncement() {
  const [visible, setVisible] = useState(false);
  const [storageKey, setStorageKey] = useState(`${VERSION}_anon`);
  const [, navigate] = useLocation();

  useEffect(() => {
    const handler = (e: Event) => {
      const key = (e as CustomEvent).detail?.key || `${VERSION}_anon`;
      if (localStorage.getItem(key)) return;
      setStorageKey(key);
      setVisible(true);
    };
    window.addEventListener("show-terminal-announcement", handler);
    return () => window.removeEventListener("show-terminal-announcement", handler);
  }, []);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(storageKey, "1");
  };

  const tryIt = () => {
    dismiss();
    navigate("/?tab=terminal");
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
      onClick={dismiss}
      data-testid="terminal-announcement"
    >
      <div
        className="relative w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl border border-purple-400/30"
        style={{
          background: "linear-gradient(135deg, #1a0840 0%, #0d0520 55%, #2a0e5a 100%)",
          animation: "slideUp 0.4s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-purple-400 via-fuchsia-400 to-purple-400 opacity-80" />

        <button
          onClick={dismiss}
          className="absolute top-3 right-3 text-white/50 hover:text-white text-xl leading-none transition-colors"
          aria-label="Close"
          data-testid="button-dismiss-terminal-announcement"
        >
          ✕
        </button>

        <div className="p-6 pt-7 text-center">
          <div className="flex justify-center mb-3">
            <div
              className="w-24 h-24 rounded-2xl flex items-center justify-center shadow-lg"
              style={{
                background: "linear-gradient(135deg, #a855f7, #6d28d9)",
                boxShadow: "0 0 30px rgba(168,85,247,0.5)",
              }}
            >
              {/* Trenches green helmet */}
              <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <radialGradient id="helmGrad" cx="40%" cy="35%" r="70%">
                    <stop offset="0%" stopColor="#6fb86a" />
                    <stop offset="60%" stopColor="#3d8a4a" />
                    <stop offset="100%" stopColor="#1f5530" />
                  </radialGradient>
                </defs>
                {/* Dome */}
                <path d="M10 44 C10 22, 22 12, 36 12 C50 12, 62 22, 62 44 Z" fill="url(#helmGrad)" stroke="#0e2c1a" strokeWidth="2"/>
                {/* Brim */}
                <ellipse cx="36" cy="44" rx="28" ry="5" fill="#1f5530" stroke="#0e2c1a" strokeWidth="2"/>
                {/* Top highlight */}
                <ellipse cx="30" cy="22" rx="9" ry="4" fill="#a8e0a0" opacity="0.45"/>
              </svg>
            </div>
          </div>

          <div className="inline-block bg-purple-400/20 text-purple-200 text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-3 border border-purple-400/30">
            New Feature
          </div>

          <h2 className="text-white text-2xl font-bold mb-2">Terminal is Live!</h2>
          <p className="text-white text-sm leading-relaxed mb-5">
            Trade Solana memecoins from Pump.fun, LetsBonk, Meteora, Bags & Moonshot — live charts, instant buy/sell, your full portfolio in one place. Lowest fees on Solana.
          </p>

          <div className="flex flex-col gap-2">
            <button
              onClick={tryIt}
              className="w-full py-3 rounded-xl font-bold text-white text-sm transition-all hover:opacity-90"
              style={{ background: "linear-gradient(90deg, #a855f7, #7c3aed)" }}
              data-testid="button-try-terminal"
            >
              Open Terminal 🚀
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
