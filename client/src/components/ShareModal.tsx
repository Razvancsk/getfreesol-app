import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import logoImage from "@assets/image_1757882056840.png";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  solClaimed: number;
  referralCode: string | null;
  accountsClosed?: number;
  claimType?: 'accounts' | 'tokens' | 'nfts';
}

export function ShareModal({ isOpen, onClose, solClaimed, referralCode, accountsClosed = 1, claimType = 'accounts' }: ShareModalProps) {
  const [tweetText, setTweetText] = useState("");
  
  const baseUrl = window.location.origin;
  const lamports = Math.floor(solClaimed * 1e9);
  const shareUrl = referralCode 
    ? `${baseUrl}?ref=${referralCode}&claimed=${lamports}&type=${claimType}&count=${accountsClosed}`
    : `${baseUrl}?claimed=${lamports}&type=${claimType}&count=${accountsClosed}`;
  
  const getClaimText = () => {
    if (claimType === 'tokens') return `by burning ${accountsClosed} tokens!`;
    if (claimType === 'nfts') return `by burning ${accountsClosed} NFTs!`;
    return `by closing ${accountsClosed} empty accounts!`;
  };
  
  useEffect(() => {
    if (isOpen) {
      const formattedSol = solClaimed.toFixed(4);
      const message = `I just reclaimed ${formattedSol} $SOL using @getfreesol_xyz\n\nReclaim your locked SOL 👇\n${shareUrl}`;
      setTweetText(message);
    }
  }, [isOpen, solClaimed, shareUrl]);
  
  const handleShareOnX = () => {
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    window.open(twitterUrl, '_blank', 'width=550,height=420');
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg bg-transparent border-0 p-0 [&>button]:hidden">
        <div className="space-y-4">
          {/* Style 2 Card Banner */}
          <div className="w-full aspect-[16/9] bg-gradient-to-r from-[#1a0a2e] via-[#2d1b4e] to-[#1a0a2e] rounded-xl shadow-2xl flex flex-col items-center justify-center text-center relative overflow-hidden">
            {/* Decorative diagonal */}
            <div className="absolute right-0 top-0 w-1/3 h-full bg-gradient-to-br from-purple-600/40 to-purple-800/60" style={{ clipPath: 'polygon(40% 0, 100% 0, 100% 100%, 0 100%)' }} />
            {/* Logo top left */}
            <div className="absolute top-4 left-4 flex items-center gap-3 z-10">
              <img src={logoImage} alt="GetFreeSol" className="w-12 h-12" />
              <span className="text-white font-bold text-xl">GET FREE SOL</span>
            </div>
            <p className="text-2xl md:text-3xl font-black text-green-400 tracking-wide z-10">
              CLAIMED
            </p>
            <p className="text-4xl md:text-5xl font-black text-white mt-2 z-10">
              + {solClaimed.toFixed(4)} SOL
            </p>
            <p className="text-green-400 text-base mt-3 z-10 font-mono">{getClaimText()}</p>
            {/* Tweet It button */}
            <button 
              onClick={handleShareOnX}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-green-400 hover:bg-green-300 border-2 border-green-300 rounded-lg px-6 py-2 transition-colors z-10"
            >
              <span className="text-black font-mono font-bold text-base">Tweet It</span>
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
